package main

import (
	"context"
	"log/slog"
	"os"

	"litestream-worker/internal/processor"
	"litestream-worker/internal/worker"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelDebug,
	}))

	ctx := context.Background()

	// We initialize the processor with nil AWS clients.
	// The poller will dynamically fetch credentials from the backend, 
	// rebuild the clients, and inject them into the processor.
	proc := processor.NewProcessor(logger, nil, nil, "", "vod-bucket")

	logger.Info("Starting worker in dynamic config mode...")

	// The poller will immediately do a synchronous fetchConfig()
	// to grab the real AWS clients before it starts polling SQS.
	poller := worker.NewPoller(logger, nil, proc, "")
	poller.Start(ctx)
}


