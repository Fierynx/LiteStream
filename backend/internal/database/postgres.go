package database

import (
	"fmt"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"litestream-backend/internal/models"
)

func InitPostgres() (*gorm.DB, error) {
	dsn := fmt.Sprintf("host=postgres user=%s password=%s dbname=%s port=5432 sslmode=disable",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))

	var db *gorm.DB
	var err error
	for i := 0; i < 10; i++ {
		db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
		if err == nil {
			break
		}
		fmt.Printf("Failed to connect to database, retrying in 2 seconds... (Attempt %d/10)\n", i+1)
		time.Sleep(2 * time.Second)
	}
	if err != nil {
		return nil, err
	}
	
	err = db.AutoMigrate(&models.User{}, &models.Stream{}, &models.ChatMessageDB{}, &models.Follow{}, &models.Setting{})
	if err != nil {
	    return nil, err
	}
	return db, nil
}
