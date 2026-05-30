package database

import (
	"fmt"
	"os"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"litestream-backend/internal/models"
)

func InitPostgres() (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=postgres user=%s password=%s dbname=%s port=5432 sslmode=disable",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		return nil, err
	}
	
	err = db.AutoMigrate(&models.User{}, &models.Stream{}, &models.ChatMessageDB{}, &models.Follow{})
	if err != nil {
	    return nil, err
	}
	return db, nil
}
