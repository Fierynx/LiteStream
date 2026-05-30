package models

import "gorm.io/gorm"

type ChatMessageDB struct {
	gorm.Model
	VodID       string  `json:"vod_id"       gorm:"index;not null;default:''"`
	StreamKey   string  `json:"stream_key"   gorm:"index;not null"` // Kept for backward compat/routing
	User        string  `json:"user"         gorm:"not null"`
	Text        string  `json:"text"         gorm:"not null"`
	Color       string  `json:"color"`
	VideoOffset float64 `json:"video_offset"`
}

type ChatMessage struct {
	StreamKey string `json:"stream_key"`
	User      string `json:"user"`
	Text      string `json:"text"`
	Color     string `json:"color,omitempty"`
}
