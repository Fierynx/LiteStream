package handlers

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
)

type MediaHandler struct {
	S3Client *s3.Client
	Logger   *slog.Logger
}

func (h *MediaHandler) ThumbnailUpload(c *gin.Context) {
	bucket := os.Getenv("S3_BUCKET_NAME")
	if bucket == "" {
		bucket = "vod-bucket"
	}

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
	s3Key := "thumbnails/" + hex.EncodeToString(b) + ext

	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = "image/jpeg"
	}

	_, err = h.S3Client.PutObject(context.Background(), &s3.PutObjectInput{
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

	vodBaseURL := os.Getenv("PUBLIC_VOD_BASE_URL")
	if vodBaseURL == "" {
		// Fallback for local
		vodBaseURL = fmt.Sprintf("http://localhost:4566/%s", bucket)
	}
	publicURL := fmt.Sprintf("%s/%s", vodBaseURL, s3Key)

	h.Logger.Info("Thumbnail uploaded", "key", s3Key, "url", publicURL)
	c.JSON(http.StatusOK, gin.H{"url": publicURL})
}
