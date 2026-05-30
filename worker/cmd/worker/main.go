package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"

	myaws "litestream-worker/internal/aws"
	"litestream-worker/internal/processor"
	"litestream-worker/internal/worker"
)

func mustGetEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("required environment variable %q is not set", key))
	}
	return v
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	ctx := context.Background()

	endpoint := mustGetEnv("AWS_ENDPOINT")
	region := mustGetEnv("AWS_REGION")
	bucket := mustGetEnv("S3_BUCKET_NAME")
	queueName := mustGetEnv("SQS_QUEUE_NAME")

	cfg, err := myaws.NewAWSConfig(ctx, region)
	if err != nil {
		logger.Error("Failed to initialize AWS config", "error", err)
		os.Exit(1)
	}

	s3Client := s3.NewFromConfig(cfg, func(o *s3.Options) {
		o.BaseEndpoint = aws.String(endpoint)
		o.UsePathStyle = true
	})

	sqsClient := sqs.NewFromConfig(cfg, func(o *sqs.Options) {
		o.BaseEndpoint = aws.String(endpoint)
	})

	proc := processor.NewProcessor(logger, sqsClient, s3Client, "", bucket)

	logger.Info("Waiting for LocalStack to be ready...", "endpoint", endpoint)
	time.Sleep(3 * time.Second)

	if err := proc.InitResources(ctx); err != nil {
		logger.Error("Failed to initialize AWS resources", "error", err)
		os.Exit(1)
	}

	if err := proc.InitSQS(ctx, queueName); err != nil {
		logger.Error("Failed to initialize SQS", "error", err)
		os.Exit(1)
	}

	poller := worker.NewPoller(logger, sqsClient, proc, proc.SQSQueueURL)
	poller.Start(ctx)
}
