package worker

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"

	myaws "litestream-worker/internal/aws"
	"litestream-worker/internal/processor"
)

type Poller struct {
	Logger    *slog.Logger
	SQSClient *sqs.Client
	Processor *processor.Processor
	QueueURL  string
	mu        sync.RWMutex

	lastAwsKey    string
	lastAwsSecret string
	lastAwsRegion string
	lastEndpoint  string
}

func NewPoller(logger *slog.Logger, sqsClient *sqs.Client, processor *processor.Processor, queueURL string) *Poller {
	return &Poller{
		Logger:    logger,
		SQSClient: sqsClient,
		Processor: processor,
		QueueURL:  queueURL,
	}
}

func (p *Poller) updateConfigLoop(ctx context.Context) {
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()

	// Initial fetch
	p.fetchConfig()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			p.fetchConfig()
		}
	}
}

func (p *Poller) fetchConfig() {
	req, err := http.NewRequest("GET", "http://litestream_backend:8000/internal/config", nil)
	if err != nil {
		p.Logger.Error("Failed to create fetchConfig request", "error", err)
		return
	}
	req.Header.Set("X-Internal-Token", "litestream-internal-secret-token")
	
	client := &http.Client{}
	resp, err := client.Do(req)
	if err == nil && resp.StatusCode == 200 {
		var config map[string]string
		if err := json.NewDecoder(resp.Body).Decode(&config); err == nil {
			p.mu.Lock()
			
			if url, ok := config["SQS_QUEUE_URL"]; ok && url != "" {
				p.QueueURL = url
			}
			if bucket, ok := config["S3_BUCKET_NAME"]; ok && bucket != "" && p.Processor != nil {
				p.Processor.S3Bucket = bucket
			}

			// Check if AWS credentials changed
			ak := config["AWS_ACCESS_KEY_ID"]
			sk := config["AWS_SECRET_ACCESS_KEY"]
			reg := config["AWS_REGION"]
			endp := config["AWS_ENDPOINT"]

			if ak != "" && sk != "" && reg != "" {
				if ak != p.lastAwsKey || sk != p.lastAwsSecret || reg != p.lastAwsRegion || endp != p.lastEndpoint {
					p.Logger.Info("AWS credentials changed. Rebuilding clients...")
					ctx := context.Background()
					cfg, err := myaws.NewAWSConfig(ctx, reg, ak, sk)
					if err == nil {
						sqsOpts := []func(*sqs.Options){}
						s3Opts := []func(*s3.Options){}
						if endp != "" {
							sqsOpts = append(sqsOpts, func(o *sqs.Options) { o.BaseEndpoint = aws.String(endp) })
							s3Opts = append(s3Opts, func(o *s3.Options) { 
								o.BaseEndpoint = aws.String(endp)
								o.UsePathStyle = true
							})
						}

						newSQS := sqs.NewFromConfig(cfg, sqsOpts...)
						newS3 := s3.NewFromConfig(cfg, s3Opts...)
						
						bucket := "vod-bucket"
						if b, ok := config["S3_BUCKET_NAME"]; ok && b != "" {
							bucket = b
						}
						
						p.SQSClient = newSQS
						p.Processor = processor.NewProcessor(p.Logger, newSQS, newS3, p.QueueURL, bucket)

						p.lastAwsKey = ak
						p.lastAwsSecret = sk
						p.lastAwsRegion = reg
						p.lastEndpoint = endp
						p.Logger.Info("Successfully rebuilt AWS clients.")
					} else {
						p.Logger.Error("Failed to build AWS config", "error", err)
					}
				}
			}

			p.mu.Unlock()
		}
	}
	if resp != nil && resp.Body != nil {
		resp.Body.Close()
	}
}

func (p *Poller) Start(ctx context.Context) {
	p.Logger.Info("VOD worker started. Polling SQS for messages...", "queueURL", p.QueueURL)

	go p.updateConfigLoop(ctx)

	for {
		select {
		case <-ctx.Done():
			p.Logger.Info("Context cancelled, shutting down worker.")
			return
		default:
		}

		p.mu.RLock()
		qUrl := p.QueueURL
		sqsCli := p.SQSClient
		proc := p.Processor
		p.mu.RUnlock()

		if qUrl == "" || sqsCli == nil || proc == nil {
			p.Logger.Debug("QueueURL, SQSClient, or Processor is missing. Waiting for config...")
			time.Sleep(5 * time.Second)
			continue
		}

		resp, err := sqsCli.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(qUrl),
			MaxNumberOfMessages: 10,
			WaitTimeSeconds:     20,
			VisibilityTimeout:   60,
		})
		if err != nil {
			p.Logger.Error("SQS ReceiveMessage failed", "error", err)
			time.Sleep(5 * time.Second)
			continue
		}

		if len(resp.Messages) == 0 {
			p.Logger.Debug("No messages in queue. Continuing long-poll...")
			continue
		}

		for _, msg := range resp.Messages {
			if err := proc.ProcessMessage(ctx, msg); err != nil {
				p.Logger.Error("Failed to process message, leaving in queue for retry",
					"messageId", *msg.MessageId, "error", err)
			}
		}
	}
}
