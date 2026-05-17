package main

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
)

// App holds the initialized AWS service clients and configuration.
type App struct {
	logger      *slog.Logger
	sqsClient   *sqs.Client
	s3Client    *s3.Client
	sqsQueueURL string
	s3Bucket    string
}

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}

// newAWSConfig builds a base AWS config with region and static credentials.
func newAWSConfig(ctx context.Context, region string) (aws.Config, error) {
	cfg, err := config.LoadDefaultConfig(ctx,
		config.WithRegion(region),
		config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(
				os.Getenv("AWS_ACCESS_KEY_ID"),
				os.Getenv("AWS_SECRET_ACCESS_KEY"),
				"",
			),
		),
	)
	if err != nil {
		return aws.Config{}, fmt.Errorf("failed to load AWS config: %w", err)
	}

	return cfg, nil
}

// initResources ensures the S3 bucket and SQS queue exist in LocalStack.
// This is idempotent and safe to call on every startup.
func (a *App) initResources(ctx context.Context) error {
	// --- Create S3 Bucket ---
	_, err := a.s3Client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(a.s3Bucket),
	})
	if err != nil {
		// Bucket already exists — that's fine
		a.logger.Warn("S3 bucket may already exist", "bucket", a.s3Bucket, "detail", err.Error())
	} else {
		a.logger.Info("S3 bucket created", "bucket", a.s3Bucket)
	}

	_, err = a.s3Client.PutBucketCors(ctx, &s3.PutBucketCorsInput{
		Bucket: aws.String(a.s3Bucket),
		CORSConfiguration: &s3types.CORSConfiguration{
			CORSRules: []s3types.CORSRule{
				{
					AllowedOrigins: []string{"*"},
					AllowedMethods: []string{"GET", "HEAD"},
					AllowedHeaders: []string{"*"},
					ExposeHeaders:  []string{"Content-Length", "Content-Range", "Content-Type"},
					MaxAgeSeconds:  aws.Int32(3600),
				},
			},
		},
	})
	if err != nil {
		a.logger.Error("Failed to set CORS on S3 bucket", "error", err)
	} else {
		a.logger.Info("S3 bucket CORS policy applied")
	}

	// --- Create SQS Queue ---
	queueName := mustGetEnv("SQS_QUEUE_NAME")
	createResp, err := a.sqsClient.CreateQueue(ctx, &sqs.CreateQueueInput{
		QueueName: aws.String(queueName),
	})
	if err != nil {
		return fmt.Errorf("failed to create SQS queue %q: %w", queueName, err)
	}
	a.sqsQueueURL = *createResp.QueueUrl
	a.logger.Info("SQS queue ready", "url", a.sqsQueueURL)

	return nil
}

// hlsDir is the shared Docker volume where NGINX writes HLS segments.
const hlsDir = "/tmp/hls"

// contentTypeFor returns the correct MIME type for HLS files.
func contentTypeFor(filename string) string {
	switch strings.ToLower(filepath.Ext(filename)) {
	case ".m3u8":
		return "application/vnd.apple.mpegurl"
	case ".ts":
		return "video/mp2t"
	default:
		return "application/octet-stream"
	}
}

// uploadFile reads a single file from hlsDir and uploads it to S3.
func (a *App) uploadFile(ctx context.Context, filename string) error {
	filePath := filepath.Join(hlsDir, filename)

	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open %q: %w", filePath, err)
	}
	defer f.Close()

	// Read the entire file into memory so we can supply ContentLength.
	// HLS segments are short-lived and bounded in size (typically <1 MB each).
	data, err := io.ReadAll(f)
	if err != nil {
		return fmt.Errorf("read %q: %w", filePath, err)
	}

	s3Key := "vod/" + filename
	_, err = a.s3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(a.s3Bucket),
		Key:           aws.String(s3Key),
		Body:          bytes.NewReader(data),
		ContentType:   aws.String(contentTypeFor(filename)),
		ContentLength: aws.Int64(int64(len(data))),
	})
	if err != nil {
		return fmt.Errorf("S3 PutObject %q: %w", s3Key, err)
	}

	a.logger.Info("Uploaded to S3", "key", s3Key, "bytes", len(data))
	return nil
}

// parseSegments scans an m3u8 playlist and returns every .ts segment filename.
// It handles both absolute URIs and bare filenames.
func parseSegments(m3u8Data []byte) []string {
	var segments []string
	scanner := bufio.NewScanner(bytes.NewReader(m3u8Data))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		// Skip directives and blank lines; segment lines end in .ts
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasSuffix(strings.ToLower(line), ".ts") {
			// Strip any leading path components — we only want the bare filename.
			segments = append(segments, filepath.Base(line))
		}
	}
	return segments
}

// processMessage handles a single SQS message: uploads the m3u8 playlist and
// all referenced .ts segments to S3, then deletes the message from SQS.
func (a *App) processMessage(ctx context.Context, msg sqstypes.Message) error {
	playlistFile := strings.TrimSpace(aws.ToString(msg.Body))
	a.logger.Info("Processing VOD message", "playlist", playlistFile, "messageId", *msg.MessageId)

	// ── Step 1: Read the m3u8 playlist from the shared HLS volume ───────────
	playlistPath := filepath.Join(hlsDir, playlistFile)
	playlistData, err := os.ReadFile(playlistPath)
	if err != nil {
		return fmt.Errorf("read playlist %q: %w", playlistPath, err)
	}

	// ── Step 2: Upload the playlist itself ──────────────────────────────────
	if err := a.uploadFile(ctx, playlistFile); err != nil {
		return fmt.Errorf("upload playlist: %w", err)
	}

	// ── Step 3: Parse .ts segment filenames from the playlist ───────────────
	segments := parseSegments(playlistData)
	a.logger.Info("Parsed HLS playlist", "playlist", playlistFile, "segments", len(segments))

	// ── Step 4: Upload every .ts segment ────────────────────────────────────
	var uploadErrors []string
	for _, seg := range segments {
		if err := a.uploadFile(ctx, seg); err != nil {
			// Log but continue — partial uploads are better than none.
			a.logger.Error("Failed to upload segment", "segment", seg, "error", err)
			uploadErrors = append(uploadErrors, seg)
		}
	}

	if len(uploadErrors) > 0 {
		a.logger.Warn("Some segments failed to upload",
			"failed", uploadErrors,
			"succeeded", len(segments)-len(uploadErrors))
	}

	// ── Step 5: Delete the SQS message regardless of partial failures ────────
	_, err = a.sqsClient.DeleteMessage(ctx, &sqs.DeleteMessageInput{
		QueueUrl:      aws.String(a.sqsQueueURL),
		ReceiptHandle: msg.ReceiptHandle,
	})
	if err != nil {
		return fmt.Errorf("delete SQS message %q: %w", *msg.MessageId, err)
	}
	a.logger.Info("SQS message deleted",
		"messageId", *msg.MessageId,
		"playlist", playlistFile,
		"segments_uploaded", len(segments)-len(uploadErrors))

	return nil
}

// poll runs an infinite loop that long-polls SQS for new messages.
func (a *App) poll(ctx context.Context) {
	a.logger.Info("VOD worker started. Polling SQS for messages...", "queueURL", a.sqsQueueURL)

	for {
		select {
		case <-ctx.Done():
			a.logger.Info("Context cancelled, shutting down worker.")
			return
		default:
		}

		resp, err := a.sqsClient.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(a.sqsQueueURL),
			MaxNumberOfMessages: 10,
			WaitTimeSeconds:     20, // Long-poll: reduces empty responses and costs
			VisibilityTimeout:   60, // Give 60s for processing before the message becomes visible again
		})
		if err != nil {
			a.logger.Error("SQS ReceiveMessage failed", "error", err)
			time.Sleep(5 * time.Second) // Back-off on error to avoid a tight crash loop
			continue
		}

		if len(resp.Messages) == 0 {
			a.logger.Debug("No messages in queue. Continuing long-poll...")
			continue
		}

		for _, msg := range resp.Messages {
			if err := a.processMessage(ctx, msg); err != nil {
				a.logger.Error("Failed to process message, leaving in queue for retry",
					"messageId", *msg.MessageId, "error", err)
			}
		}
	}
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	ctx := context.Background()

	endpoint := mustGetEnv("AWS_ENDPOINT")
	region := mustGetEnv("AWS_REGION")
	bucket := mustGetEnv("S3_BUCKET_NAME")

	cfg, err := newAWSConfig(ctx, region)
	if err != nil {
		logger.Error("Failed to initialize AWS config", "error", err)
		os.Exit(1)
	}

	app := &App{
		logger:   logger,
		s3Bucket: bucket,
		// CRITICAL: BaseEndpoint and UsePathStyle are MANDATORY for LocalStack S3.
		s3Client: s3.NewFromConfig(cfg, func(o *s3.Options) {
			o.BaseEndpoint = aws.String(endpoint)
			o.UsePathStyle = true
		}),
		sqsClient: sqs.NewFromConfig(cfg, func(o *sqs.Options) {
			o.BaseEndpoint = aws.String(endpoint)
		}),
	}

	// Allow LocalStack services to fully initialize before proceeding
	logger.Info("Waiting for LocalStack to be ready...", "endpoint", endpoint)
	time.Sleep(3 * time.Second)

	if err := app.initResources(ctx); err != nil {
		logger.Error("Failed to initialize AWS resources", "error", err)
		os.Exit(1)
	}

	app.poll(ctx)
}
