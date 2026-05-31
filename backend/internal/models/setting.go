package models

import (
	"time"
	"gorm.io/gorm"
)

type Setting struct {
	Key       string `gorm:"primaryKey;column:key"`
	Value     string `gorm:"column:value"`
	UpdatedAt time.Time
}

func GetSetting(db *gorm.DB, key string, fallback string) string {
	var s Setting
	if err := db.Where("key = ?", key).First(&s).Error; err != nil {
		return fallback
	}
	if s.Value == "" {
		return fallback
	}
	return s.Value
}
