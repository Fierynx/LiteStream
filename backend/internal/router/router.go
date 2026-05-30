package router

import (
	"log/slog"

	"github.com/gin-gonic/gin"
	
	"litestream-backend/internal/handlers"
	"litestream-backend/internal/middleware"
)

func SetupRouter(
	authHandler *handlers.AuthHandler,
	streamHandler *handlers.StreamHandler,
	chatHandler *handlers.ChatHandler,
	mediaHandler *handlers.MediaHandler,
	userHandler *handlers.UserHandler,
	adminHandler *handlers.AdminHandler,
	logger *slog.Logger,
) *gin.Engine {
	r := gin.New()
	
	r.Use(gin.Logger())
	r.Use(gin.Recovery())
	r.Use(middleware.CORSMiddleware())

	// Public routes
	r.POST("/auth/register", authHandler.Register)
	r.POST("/auth/login", authHandler.Login)
	r.POST("/auth/publish", streamHandler.PublishAuth)
	r.POST("/stream/end", streamHandler.EndStream)
	r.GET("/streams", streamHandler.ListStreams)
	r.POST("/streams/:vod_id/view", streamHandler.IncrementView)
	r.GET("/channel/:username", streamHandler.Channel)
	r.GET("/chat/:vod_id", chatHandler.History)
	r.GET("/ws/:stream_key", chatHandler.WebSocket)

	// Internal routes
	r.POST("/internal/vod/:vod_id/auto-thumbnail", streamHandler.SetAutoThumbnail)

	// Admin routes
	admin := r.Group("/admin")
	admin.POST("/login", adminHandler.Login)
	admin.Use(handlers.AdminMiddleware())
	{
		admin.GET("/logs/:container_name", adminHandler.Logs)
		admin.GET("/infra/status", adminHandler.InfraStatus)
		admin.POST("/infra/provision", adminHandler.InfraProvision)
		admin.POST("/infra/deprovision", adminHandler.InfraDeprovision)
	}

	// Protected routes
	protected := r.Group("/")
	protected.Use(middleware.AuthMiddleware())
	{
		protected.GET("/auth/me", authHandler.Me)
		protected.PATCH("/stream/settings", streamHandler.UpdateSettings)
		protected.PATCH("/stream/vod/:vod_id", streamHandler.UpdateVOD)
		protected.DELETE("/stream/vod/:vod_id", streamHandler.DeleteVOD)
		protected.POST("/upload/thumbnail", mediaHandler.ThumbnailUpload)
		
		protected.POST("/user/follow/:username", userHandler.Follow)
		protected.DELETE("/user/unfollow/:username", userHandler.Unfollow)
		protected.GET("/user/isfollowing/:username", userHandler.IsFollowing)
	}

	return r
}
