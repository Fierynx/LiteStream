package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	myaws "litestream-backend/internal/aws"
	"litestream-backend/internal/models"
)

type StreamHandler struct {
	DB         *gorm.DB
	RDB        *redis.Client
	AwsManager *myaws.Manager
	Logger     *slog.Logger
}

func (h *StreamHandler) PublishAuth(c *gin.Context) {
	streamKey := c.PostForm("name")
	if streamKey == "" {
		c.Status(http.StatusUnauthorized)
		return
	}

	var user models.User
	if err := h.DB.Where("stream_key = ?", streamKey).First(&user).Error; err != nil {
		h.Logger.Warn("on_publish: unknown stream key", "key", streamKey)
		c.Status(http.StatusUnauthorized)
		return
	}

	now := time.Now()
	
	// Create a new unique Stream session
	vodID := uuid.New().String()
	
	// Ensure we end any previously "live" streams for this user just in case
	h.DB.Model(&models.Stream{}).Where("user_id = ? AND status = ?", user.ID, "live").Updates(map[string]interface{}{
		"status":   "vod",
		"ended_at": now,
	})

	// Get latest title/thumbnail from their channel settings
	title := user.ChannelTitle
	if title == "" {
		title = user.Username + "'s Live Stream"
	}
	thumbnailURL := user.ChannelThumb

	newStream := models.Stream{
		VodID:        vodID,
		UserID:       user.ID,
		StreamKey:    user.StreamKey,
		Username:     user.Username,
		Title:        title,
		ThumbnailURL: thumbnailURL,
		Status:       "live",
		StartedAt:    &now,
	}

	if err := h.DB.Create(&newStream).Error; err != nil {
		h.Logger.Error("failed to create stream session", "error", err)
		c.Status(http.StatusInternalServerError)
		return
	}

	sysMsg := models.ChatMessage{
		StreamKey: streamKey,
		User:      "System",
		Text:      "🎬 Stream is officially LIVE!",
		Color:     "#00ff87",
	}
	if payload, err := json.Marshal(sysMsg); err == nil {
		h.RDB.Publish(context.Background(), "chat:"+streamKey, string(payload))
	}

	h.Logger.Info("on_publish: stream authorised", "username", user.Username, "vod_id", vodID)
	c.Status(http.StatusOK)
}

func (h *StreamHandler) EndStream(c *gin.Context) {
	var input struct {
		StreamKey string `json:"stream_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	now := time.Now()
	var stream models.Stream
	
	// Find the currently active stream for this key
	if err := h.DB.Where("stream_key = ? AND status = ?", input.StreamKey, "live").First(&stream).Error; err != nil {
		h.Logger.Warn("stream end: no live stream found", "key", input.StreamKey)
		c.JSON(http.StatusNotFound, gin.H{"error": "no active stream found"})
		return
	}

	stream.Status = "vod"
	stream.EndedAt = &now
	h.DB.Save(&stream)

	// Send SQS message to worker to process VOD
	queueUrl := models.GetSetting(h.DB, "SQS_QUEUE_URL", "")
	if queueUrl == "" {
		h.Logger.Error("stream end: SQS_QUEUE_URL is not set in database, skipping SQS message")
	} else {
		sqsClient, err := h.AwsManager.GetSQSClient(context.Background())
		if err != nil {
			h.Logger.Error("stream end: failed to initialize SQS client dynamically", "error", err)
		} else {
			msgBody := fmt.Sprintf(`{"stream_key":"%s","vod_id":"%s"}`, stream.StreamKey, stream.VodID)
			_, err = sqsClient.SendMessage(context.Background(), &sqs.SendMessageInput{
				QueueUrl:    awssdk.String(queueUrl),
				MessageBody: awssdk.String(msgBody),
			})
			if err != nil {
				h.Logger.Error("stream end: failed to send sqs message", "error", err)
			} else {
				h.Logger.Info("stream end: sqs message sent", "vod_id", stream.VodID)
			}
		}
	}

	h.Logger.Info("Stream ended", "vod_id", stream.VodID)
	c.JSON(http.StatusOK, gin.H{"message": "stream ended", "vod_id": stream.VodID})
}

func (h *StreamHandler) ListStreams(c *gin.Context) {
	var streams []models.Stream
	// Fetch only the latest stream per user (or all live/vods). For the discovery page, we probably want live streams first, then recent VODs.
	if err := h.DB.Order("status ASC, created_at DESC").Find(&streams).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch streams"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": streams})
}

func (h *StreamHandler) Channel(c *gin.Context) {
	username := c.Param("username")
	
	// Fetch user first to get their latest stream details and their full VOD list
	var user models.User
	if err := h.DB.Where("username = ?", username).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}

	var latestStream models.Stream
	if err := h.DB.Where("user_id = ?", user.ID).Order("created_at desc").First(&latestStream).Error; err != nil {
		// No streams yet
		latestStream = models.Stream{
			Username: user.Username,
			Status:   "offline",
			Title:    user.ChannelTitle,
			ThumbnailURL: user.ChannelThumb,
		}
	}

	if latestStream.Status != "live" {
		// If they are not live, show their latest updated channel settings, not the settings of the old VOD
		latestStream.Title = user.ChannelTitle
		latestStream.ThumbnailURL = user.ChannelThumb
	}

	if latestStream.Title == "" {
		latestStream.Title = user.Username + "'s Channel"
	}

	var vods []models.Stream
	h.DB.Where("user_id = ? AND status = ?", user.ID, "vod").Order("created_at desc").Find(&vods)

	c.JSON(http.StatusOK, gin.H{
		"data": latestStream,
		"vods": vods,
	})
}

func (h *StreamHandler) UpdateSettings(c *gin.Context) {
	userID := c.GetUint("userID")
	var input struct {
		Title        string `json:"title"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["channel_title"] = input.Title
	}
	updates["channel_thumb"] = input.ThumbnailURL

	if err := h.DB.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update settings"})
		return
	}
	
	// Also update the title/thumbnail of the currently live stream, if any
	h.DB.Model(&models.Stream{}).Where("user_id = ? AND status = ?", userID, "live").Updates(map[string]interface{}{
	    "title": input.Title,
	    "thumbnail_url": input.ThumbnailURL,
	})
	
	c.JSON(http.StatusOK, gin.H{"message": "settings updated"})
}

func (h *StreamHandler) UpdateVOD(c *gin.Context) {
	userID := c.GetUint("userID")
	vodID := c.Param("vod_id")
	var input struct {
		Title        string `json:"title"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var stream models.Stream
	if err := h.DB.Where("vod_id = ? AND user_id = ?", vodID, userID).First(&stream).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vod not found or unauthorized"})
		return
	}

	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	updates["thumbnail_url"] = input.ThumbnailURL

	h.DB.Model(&stream).Updates(updates)
	c.JSON(http.StatusOK, gin.H{"message": "vod updated"})
}

func (h *StreamHandler) DeleteVOD(c *gin.Context) {
	userID := c.GetUint("userID")
	vodID := c.Param("vod_id")

	var stream models.Stream
	if err := h.DB.Where("vod_id = ? AND user_id = ?", vodID, userID).First(&stream).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vod not found or unauthorized"})
		return
	}

	h.DB.Delete(&stream)
	// Delete associated chat history
	h.DB.Where("vod_id = ?", vodID).Delete(&models.ChatMessageDB{})
	
	c.JSON(http.StatusOK, gin.H{"message": "vod deleted"})
}

func (h *StreamHandler) IncrementView(c *gin.Context) {
	vodID := c.Param("vod_id")
	if vodID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing vod_id"})
		return
	}

	if err := h.DB.Model(&models.Stream{}).Where("vod_id = ?", vodID).UpdateColumn("views", gorm.Expr("views + ?", 1)).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not increment views"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "view incremented"})
}

func (h *StreamHandler) SetAutoThumbnail(c *gin.Context) {
	vodID := c.Param("vod_id")
	var input struct {
		S3Key string `json:"s3_key"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var stream models.Stream
	if err := h.DB.Where("vod_id = ?", vodID).First(&stream).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "vod not found"})
		return
	}

	// Only set if current thumbnail is empty
	if stream.ThumbnailURL == "" && input.S3Key != "" {
		bucket := models.GetSetting(h.DB, "S3_BUCKET_NAME", "vod-bucket")
		vodBaseURL := models.GetSetting(h.DB, "PUBLIC_VOD_BASE_URL", fmt.Sprintf("http://localhost:4566/%s", bucket))
		if !strings.HasSuffix(vodBaseURL, "/") {
			vodBaseURL += "/"
		}
		publicURL := fmt.Sprintf("%s%s", vodBaseURL, input.S3Key)

		h.DB.Model(&stream).UpdateColumn("thumbnail_url", publicURL)
		c.JSON(http.StatusOK, gin.H{"message": "auto thumbnail set", "url": publicURL})
	} else {
		c.JSON(http.StatusOK, gin.H{"message": "custom thumbnail already exists or empty key, skipped"})
	}
}
