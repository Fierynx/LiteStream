package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"litestream-backend/internal/models"
)

type UserHandler struct {
	DB *gorm.DB
}

// POST /user/follow/:username
func (h *UserHandler) Follow(c *gin.Context) {
	followerID := c.MustGet("userID").(uint)
	targetUsername := c.Param("username")

	var targetUser models.User
	if err := h.DB.Where("username = ?", targetUsername).First(&targetUser).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if targetUser.ID == followerID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot follow yourself"})
		return
	}

	follow := models.Follow{
		FollowerID:  followerID,
		FollowingID: targetUser.ID,
	}

	// Ignore if already follows
	if err := h.DB.Create(&follow).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "already following"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "followed"})
}

// DELETE /user/unfollow/:username
func (h *UserHandler) Unfollow(c *gin.Context) {
	followerID := c.MustGet("userID").(uint)
	targetUsername := c.Param("username")

	var targetUser models.User
	if err := h.DB.Where("username = ?", targetUsername).First(&targetUser).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	h.DB.Where("follower_id = ? AND following_id = ?", followerID, targetUser.ID).Delete(&models.Follow{})

	c.JSON(http.StatusOK, gin.H{"status": "unfollowed"})
}

// GET /user/isfollowing/:username
func (h *UserHandler) IsFollowing(c *gin.Context) {
	followerID := c.MustGet("userID").(uint)
	targetUsername := c.Param("username")

	var targetUser models.User
	if err := h.DB.Where("username = ?", targetUsername).First(&targetUser).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	var count int64
	h.DB.Model(&models.Follow{}).Where("follower_id = ? AND following_id = ?", followerID, targetUser.ID).Count(&count)

	c.JSON(http.StatusOK, gin.H{"following": count > 0})
}
