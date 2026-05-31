package aws

import (
	"context"
	"fmt"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
	"gorm.io/gorm"

	"litestream-backend/internal/models"
)

type Manager struct {
	DB *gorm.DB
}

func NewManager(db *gorm.DB) *Manager {
	return &Manager{DB: db}
}

func (m *Manager) getConfig(ctx context.Context) (awssdk.Config, string, error) {
	endpoint := models.GetSetting(m.DB, "AWS_ENDPOINT", "")
	region := models.GetSetting(m.DB, "AWS_REGION", "us-east-1")
	accessKey := models.GetSetting(m.DB, "AWS_ACCESS_KEY_ID", "")
	secretKey := models.GetSetting(m.DB, "AWS_SECRET_ACCESS_KEY", "")

	if accessKey == "" || secretKey == "" {
		return awssdk.Config{}, "", fmt.Errorf("AWS credentials are not configured in the database")
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(accessKey, secretKey, ""),
		),
	)
	return cfg, endpoint, err
}

func (m *Manager) GetS3Client(ctx context.Context) (*s3.Client, error) {
	cfg, endpoint, err := m.getConfig(ctx)
	if err != nil {
		return nil, err
	}
	opts := []func(*s3.Options){}
	if endpoint != "" {
		opts = append(opts, func(o *s3.Options) {
			o.BaseEndpoint = awssdk.String(endpoint)
			o.UsePathStyle = true
		})
	}
	return s3.NewFromConfig(cfg, opts...), nil
}

func (m *Manager) GetSQSClient(ctx context.Context) (*sqs.Client, error) {
	cfg, endpoint, err := m.getConfig(ctx)
	if err != nil {
		return nil, err
	}
	opts := []func(*sqs.Options){}
	if endpoint != "" {
		opts = append(opts, func(o *sqs.Options) {
			o.BaseEndpoint = awssdk.String(endpoint)
		})
	}
	return sqs.NewFromConfig(cfg, opts...), nil
}

func (m *Manager) GetCFClient(ctx context.Context) (*cloudformation.Client, error) {
	cfg, endpoint, err := m.getConfig(ctx)
	if err != nil {
		return nil, err
	}
	opts := []func(*cloudformation.Options){}
	if endpoint != "" {
		opts = append(opts, func(o *cloudformation.Options) {
			o.BaseEndpoint = awssdk.String(endpoint)
		})
	}
	return cloudformation.NewFromConfig(cfg, opts...), nil
}
