package models

import "gorm.io/gorm"

type Follow struct {
	gorm.Model
	FollowerID  uint `gorm:"uniqueIndex:idx_follow;not null"`
	FollowingID uint `gorm:"uniqueIndex:idx_follow;not null"`
}
