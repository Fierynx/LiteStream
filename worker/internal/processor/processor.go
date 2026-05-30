package processor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	s3types "github.com/aws/aws-sdk-go-v2/service/s3/types"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	sqstypes "github.com/aws/aws-sdk-go-v2/service/sqs/types"
	
	"litestream-worker/internal/hls"
)

const hlsDir = "/tmp/hls"

type Processor struct {
	Logger      *slog.Logger
	SQSClient   *sqs.Client
	S3Client    *s3.Client
	SQSQueueURL string
	S3Bucket    string
}

func NewProcessor(logger *slog.Logger, sqsClient *sqs.Client, s3Client *s3.Client, queueURL string, bucket string) *Processor {
	return &Processor{
		Logger:      logger,
		SQSClient:   sqsClient,
		S3Client:    s3Client,
		SQSQueueURL: queueURL,
		S3Bucket:    bucket,
	}
}

func (p *Processor) InitResources(ctx context.Context) error {
	_, err := p.S3Client.CreateBucket(ctx, &s3.CreateBucketInput{
		Bucket: aws.String(p.S3Bucket),
	})
	if err != nil {
		p.Logger.Warn("S3 bucket may already exist", "bucket", p.S3Bucket, "detail", err.Error())
	} else {
		p.Logger.Info("S3 bucket created", "bucket", p.S3Bucket)
	}

	_, err = p.S3Client.PutBucketCors(ctx, &s3.PutBucketCorsInput{
		Bucket: aws.String(p.S3Bucket),
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
		p.Logger.Error("Failed to set CORS on S3 bucket", "error", err)
	} else {
		p.Logger.Info("S3 bucket CORS policy applied")
	}

	return nil
}

func (p *Processor) InitSQS(ctx context.Context, queueName string) error {
    createResp, err := p.SQSClient.CreateQueue(ctx, &sqs.CreateQueueInput{
		QueueName: aws.String(queueName),
	})
	if err != nil {
		return fmt.Errorf("failed to create SQS queue %q: %w", queueName, err)
	}
	p.SQSQueueURL = *createResp.QueueUrl
	p.Logger.Info("SQS queue ready", "url", p.SQSQueueURL)
	return nil
}

func (p *Processor) UploadFile(ctx context.Context, filename string, vodID string) error {
	filePath := filepath.Join(hlsDir, filename)

	f, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("open %q: %w", filePath, err)
	}
	defer f.Close()

	data, err := io.ReadAll(f)
	if err != nil {
		return fmt.Errorf("read %q: %w", filePath, err)
	}

	s3Key := "vod/" + vodID + "/" + filename
	_, err = p.S3Client.PutObject(ctx, &s3.PutObjectInput{
		Bucket:        aws.String(p.S3Bucket),
		Key:           aws.String(s3Key),
		Body:          bytes.NewReader(data),
		ContentType:   aws.String(hls.ContentTypeFor(filename)),
		ContentLength: aws.Int64(int64(len(data))),
	})
	if err != nil {
		return fmt.Errorf("S3 PutObject %q: %w", s3Key, err)
	}

	p.Logger.Info("Uploaded to S3", "key", s3Key, "bytes", len(data))
	return nil
}

type SQSMessageBody struct {
	StreamKey string `json:"stream_key"`
	VodID     string `json:"vod_id"`
}

func (p *Processor) ProcessMessage(ctx context.Context, msg sqstypes.Message) error {
	rawBody := strings.TrimSpace(aws.ToString(msg.Body))
	var msgBody SQSMessageBody
	
	// Support fallback for old plain-text stream_key messages
	if !strings.HasPrefix(rawBody, "{") {
		streamKey := strings.TrimSuffix(rawBody, ".m3u8")
		msgBody = SQSMessageBody{
			StreamKey: streamKey,
			VodID:     streamKey, // fallback to old behavior
		}
	} else {
		importJson := json.Unmarshal([]byte(rawBody), &msgBody)
		if importJson != nil {
			return fmt.Errorf("failed to parse SQS JSON message: %w", importJson)
		}
	}

	playlistFile := msgBody.StreamKey + ".m3u8"
	p.Logger.Info("Processing VOD message", "playlist", playlistFile, "vod_id", msgBody.VodID, "messageId", *msg.MessageId)

	playlistPath := filepath.Join(hlsDir, playlistFile)
	playlistData, err := os.ReadFile(playlistPath)
	if err != nil {
		return fmt.Errorf("read playlist %q: %w", playlistPath, err)
	}

	if err := p.UploadFile(ctx, playlistFile, msgBody.VodID); err != nil {
		return fmt.Errorf("upload playlist: %w", err)
	}

	segments := hls.ParseSegments(playlistData)
	p.Logger.Info("Parsed HLS playlist", "playlist", playlistFile, "segments", len(segments))

	if len(segments) > 0 {
		midSegment := segments[len(segments)/2]
		midSegPath := filepath.Join(hlsDir, midSegment)
		thumbFilename := msgBody.VodID + "_thumb.jpg"
		thumbPath := filepath.Join(hlsDir, thumbFilename)

		cmd := exec.CommandContext(ctx, "ffmpeg", "-y", "-i", midSegPath, "-ss", "00:00:01.000", "-vframes", "1", thumbPath)
		if out, err := cmd.CombinedOutput(); err != nil {
			p.Logger.Warn("Failed to extract thumbnail", "error", err, "output", string(out))
		} else {
			if err := p.UploadFile(ctx, thumbFilename, msgBody.VodID); err == nil {
				os.Remove(thumbPath)
				s3Key := "vod/" + msgBody.VodID + "/" + thumbFilename
				
				payload := map[string]string{"s3_key": s3Key}
				payloadBytes, _ := json.Marshal(payload)
				backendURL := fmt.Sprintf("http://litestream_backend:8000/internal/vod/%s/auto-thumbnail", msgBody.VodID)
				
				if resp, err := http.Post(backendURL, "application/json", bytes.NewBuffer(payloadBytes)); err != nil {
					p.Logger.Warn("Failed to notify backend of auto thumbnail", "error", err)
				} else {
					resp.Body.Close()
					p.Logger.Info("Notified backend of auto thumbnail", "s3_key", s3Key)
				}
			}
		}
	}

	var uploadErrors []string
	for _, seg := range segments {
		if err := p.UploadFile(ctx, seg, msgBody.VodID); err != nil {
			p.Logger.Error("Failed to upload segment", "segment", seg, "error", err)
			uploadErrors = append(uploadErrors, seg)
		} else {
			// Clean up successfully uploaded segments to prevent disk filling and appending next time
			os.Remove(filepath.Join(hlsDir, seg))
		}
	}

	if len(uploadErrors) > 0 {
		p.Logger.Warn("Some segments failed to upload",
			"failed", uploadErrors,
			"succeeded", len(segments)-len(uploadErrors))
	} else {
		// Only delete playlist if all segments uploaded
		os.Remove(playlistPath)
	}

	_, err = p.SQSClient.DeleteMessage(ctx, &sqs.DeleteMessageInput{
		QueueUrl:      aws.String(p.SQSQueueURL),
		ReceiptHandle: msg.ReceiptHandle,
	})
	if err != nil {
		return fmt.Errorf("delete SQS message %q: %w", *msg.MessageId, err)
	}
	p.Logger.Info("SQS message deleted and local files cleaned up",
		"messageId", *msg.MessageId,
		"playlist", playlistFile,
		"segments_uploaded", len(segments)-len(uploadErrors))

	return nil
}
