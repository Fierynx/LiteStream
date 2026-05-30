package models

import (
	"time"

	"gorm.io/gorm"
)

type Stream struct {
	gorm.Model
	VodID        string     `json:"vod_id"        gorm:"unique;not null"`
	UserID       uint       `json:"user_id"       gorm:"not null;index"`
	StreamKey    string     `json:"stream_key"    gorm:"not null;index"`
	Username     string     `json:"username"      gorm:"not null;index"`
	Title        string     `json:"title"`
	ThumbnailURL string     `json:"thumbnail_url"`
	Status       string     `json:"status"        gorm:"default:'offline';not null"`
	StartedAt    *time.Time `json:"started_at"`
	EndedAt      *time.Time `json:"ended_at"`
	Views        int        `json:"views"         gorm:"default:0"`
}
