package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
	"litestream-backend/internal/models"
)

type ConfigHandler struct {
	DB *gorm.DB
}

// GetPublicConfig returns safe public settings for the frontend.
func (h *ConfigHandler) GetPublicConfig(c *gin.Context) {
	var settings []models.Setting
	if err := h.DB.Where("key IN ?", []string{"PUBLIC_VOD_BASE_URL", "RTMP_INGEST_URL"}).Find(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	configMap := make(map[string]string)
	for _, s := range settings {
		configMap[s.Key] = s.Value
	}
	c.JSON(http.StatusOK, configMap)
}

// GetInternalConfig returns ALL system configuration from the database.
// This is strictly for internal services like the worker.
func (h *ConfigHandler) GetInternalConfig(c *gin.Context) {
	var settings []models.Setting
	if err := h.DB.Find(&settings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch settings"})
		return
	}

	configMap := make(map[string]string)
	for _, s := range settings {
		configMap[s.Key] = s.Value
	}
	c.JSON(http.StatusOK, configMap)
}
