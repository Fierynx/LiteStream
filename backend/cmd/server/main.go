package main

import (
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

	awsManager := aws.NewManager(db)

	hub := ws.NewHub(rdb, db, logger)

	authHandler := &handlers.AuthHandler{DB: db, Logger: logger}
	streamHandler := &handlers.StreamHandler{DB: db, RDB: rdb, AwsManager: awsManager, Logger: logger}
	chatHandler := &handlers.ChatHandler{DB: db, Hub: hub}
	mediaHandler := &handlers.MediaHandler{DB: db, AwsManager: awsManager, Logger: logger}
	userHandler := &handlers.UserHandler{DB: db}
	adminHandler := &handlers.AdminHandler{AwsManager: awsManager, DB: db}
	configHandler := &handlers.ConfigHandler{DB: db}

	r := router.SetupRouter(authHandler, streamHandler, chatHandler, mediaHandler, userHandler, adminHandler, configHandler, logger)

	logger.Info("Starting backend server on :8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
