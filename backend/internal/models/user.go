package models

import "gorm.io/gorm"

type User struct {
	gorm.Model
	Username     string `json:"username"   gorm:"unique;not null"`
	PasswordHash string `json:"-"          gorm:"not null"`
	StreamKey    string `json:"stream_key" gorm:"unique;not null"`
	ChannelTitle string `json:"channel_title"`
	ChannelThumb string `json:"channel_thumb"`
}
