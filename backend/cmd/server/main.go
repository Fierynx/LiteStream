package main

import (
	"context"
	"log"
	"log/slog"
	"os"

	"litestream-backend/internal/aws"
	"litestream-backend/internal/database"
	"litestream-backend/internal/handlers"
	"litestream-backend/internal/router"
	"litestream-backend/internal/ws"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))

	db, err := database.InitPostgres()
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	logger.Info("Database initialized")

	rdb, err := database.InitRedis()
	if err != nil {
		log.Fatalf("Failed to initialize redis: %v", err)
	}
	logger.Info("Redis initialized")

	ctx := context.Background()
	s3Client, err := aws.InitS3(ctx)
	if err != nil {
		log.Fatalf("Failed to initialize S3: %v", err)
	}
	logger.Info("S3 client initialized")

	cfClient, err := aws.InitCloudFormation(ctx)
	if err != nil {
		log.Fatalf("Failed to initialize CloudFormation: %v", err)
	}
	logger.Info("CloudFormation client initialized")

	sqsClient, err := aws.InitSQS(ctx)
	if err != nil {
		log.Fatalf("Failed to initialize SQS: %v", err)
	}
	logger.Info("SQS client initialized")

	hub := ws.NewHub(rdb, db, logger)

	authHandler := &handlers.AuthHandler{DB: db, Logger: logger}
	streamHandler := &handlers.StreamHandler{DB: db, RDB: rdb, SQSClient: sqsClient, Logger: logger}
	chatHandler := &handlers.ChatHandler{DB: db, Hub: hub}
	mediaHandler := &handlers.MediaHandler{S3Client: s3Client, Logger: logger}
	userHandler := &handlers.UserHandler{DB: db}
	adminHandler := &handlers.AdminHandler{CFClient: cfClient}

	r := router.SetupRouter(authHandler, streamHandler, chatHandler, mediaHandler, userHandler, adminHandler, logger)

	logger.Info("Starting backend server on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
