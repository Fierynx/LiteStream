package worker

import (
	"context"
	"log/slog"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"

	"litestream-worker/internal/processor"
)

type Poller struct {
	Logger    *slog.Logger
	SQSClient *sqs.Client
	Processor *processor.Processor
	QueueURL  string
}

func NewPoller(logger *slog.Logger, sqsClient *sqs.Client, processor *processor.Processor, queueURL string) *Poller {
	return &Poller{
		Logger:    logger,
		SQSClient: sqsClient,
		Processor: processor,
		QueueURL:  queueURL,
	}
}

func (p *Poller) Start(ctx context.Context) {
	p.Logger.Info("VOD worker started. Polling SQS for messages...", "queueURL", p.QueueURL)

	for {
		select {
		case <-ctx.Done():
			p.Logger.Info("Context cancelled, shutting down worker.")
			return
		default:
		}

		resp, err := p.SQSClient.ReceiveMessage(ctx, &sqs.ReceiveMessageInput{
			QueueUrl:            aws.String(p.QueueURL),
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
			if err := p.Processor.ProcessMessage(ctx, msg); err != nil {
				p.Logger.Error("Failed to process message, leaving in queue for retry",
					"messageId", *msg.MessageId, "error", err)
			}
		}
	}
}
