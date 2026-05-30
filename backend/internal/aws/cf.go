package aws

import (
	"context"
	"os"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation"
)

func InitCloudFormation(ctx context.Context) (*cloudformation.Client, error) {
	endpoint := os.Getenv("AWS_ENDPOINT")
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "us-east-1"
	}

	cfg, err := awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(
				os.Getenv("AWS_ACCESS_KEY_ID"),
				os.Getenv("AWS_SECRET_ACCESS_KEY"),
				"",
			),
		),
	)
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
