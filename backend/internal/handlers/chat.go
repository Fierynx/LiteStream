package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"litestream-backend/internal/models"
	"litestream-backend/internal/ws"
	"litestream-backend/internal/middleware"
)

type ChatHandler struct {
	DB  *gorm.DB
	Hub *ws.Hub
}

func (h *ChatHandler) History(c *gin.Context) {
	vodId := c.Param("vod_id")
	var records []models.ChatMessageDB
	if err := h.DB.Where("vod_id = ?", vodId).Order("created_at ASC").Limit(1000).Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": records})
}

func (h *ChatHandler) WebSocket(c *gin.Context) {
	streamKey := c.Param("stream_key")
	token := c.Query("token")
	var authUser string
	if token != "" {
		if u, err := middleware.ValidateToken(token); err == nil {
			authUser = u
		}
	}
	h.Hub.HandleWebSocket(c.Writer, c.Request, streamKey, authUser)
}
