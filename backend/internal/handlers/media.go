package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"litestream-backend/internal/models"
	myaws "litestream-backend/internal/aws"
)

type MediaHandler struct {
	DB         *gorm.DB
	AwsManager *myaws.Manager
	Logger     *slog.Logger
}

func (h *MediaHandler) ThumbnailUpload(c *gin.Context) {
	bucket := models.GetSetting(h.DB, "S3_BUCKET_NAME", "vod-bucket")

	if err := c.Request.ParseMultipartForm(10 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large or bad form"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file field is required"})
		return
	}
	defer file.Close()

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	b := make([]byte, 8)
	rand.Read(b)
	
	// Upload to vod/thumbnails/ so it aligns with PUBLIC_VOD_BASE_URL which is .../vod
	s3Key := "vod/thumbnails/" + hex.EncodeToString(b) + ext
	urlPath := "thumbnails/" + hex.EncodeToString(b) + ext

	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = "image/jpeg"
	}

	s3Client, err := h.AwsManager.GetS3Client(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to initialize AWS S3 Client"})
		return
	}

	_, err = s3Client.PutObject(context.Background(), &s3.PutObjectInput{
		Bucket:      awssdk.String(bucket),
		Key:         awssdk.String(s3Key),
		Body:        file,
		ContentType: awssdk.String(contentType),
	})
	if err != nil {
		h.Logger.Error("S3 thumbnail upload failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed"})
		return
	}

	vodBaseURL := models.GetSetting(h.DB, "PUBLIC_VOD_BASE_URL", fmt.Sprintf("http://localhost:4566/%s", bucket))
	if !strings.HasSuffix(vodBaseURL, "/") {
		vodBaseURL += "/"
	}
	publicURL := fmt.Sprintf("%s%s", vodBaseURL, urlPath)

	h.Logger.Info("Thumbnail uploaded", "key", s3Key, "url", publicURL)
	c.JSON(http.StatusOK, gin.H{"url": publicURL})
}
