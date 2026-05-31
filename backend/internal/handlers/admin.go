package handlers

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation/types"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"litestream-backend/internal/config"
	"litestream-backend/internal/models"
	myaws "litestream-backend/internal/aws"

	"gorm.io/gorm"
)

type AdminHandler struct {
	AwsManager *myaws.Manager
	DB         *gorm.DB
}

func issueAdminJWT() (string, error) {
	claims := jwt.MapClaims{
		"role": "admin",
		"exp":  time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(config.JWTSecret())
}

func (h *AdminHandler) Login(c *gin.Context) {
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad request"})
		return
	}

	adminPass := os.Getenv("ADMIN_PASS")

	if adminPass == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "admin credentials not configured on server"})
		return
	}

	if input.Password == adminPass {
		token, err := issueAdminJWT()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to issue token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"token": token})
	} else {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
	}
}

// Simple middleware just for admin routes
func AdminMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		tokenString := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
		if tokenString == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			c.Abort()
			return
		}

		token, err := jwt.Parse(tokenString, func(t *jwt.Token) (interface{}, error) {
			return config.JWTSecret(), nil
		})

		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok || claims["role"] != "admin" {
			c.JSON(http.StatusForbidden, gin.H{"error": "not admin"})
			c.Abort()
			return
		}
		c.Next()
	}
}

func (h *AdminHandler) Logs(c *gin.Context) {
	containerName := c.Param("container_name")

	allowedContainers := map[string]bool{
		"litestream_nginx":      true,
		"litestream_backend":    true,
		"litestream_worker":     true,
		"litestream_db":         true,
		"litestream_localstack": true,
	}

	if !allowedContainers[containerName] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid container name"})
		return
	}

	httpc := http.Client{
		Transport: &http.Transport{
			DialContext: func(_ context.Context, _, _ string) (net.Conn, error) {
				return net.Dial("unix", "/var/run/docker.sock")
			},
		},
	}

	url := fmt.Sprintf("http://localhost/containers/%s/logs?stdout=1&stderr=1&tail=100", containerName)
	resp, err := httpc.Get(url)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to read logs"})
		return
	}

	cleanLogs := strings.Map(func(r rune) rune {
		if r >= 32 || r == '\n' || r == '\t' {
			return r
		}
		return -1
	}, string(body))

	c.String(http.StatusOK, cleanLogs)
}

func (h *AdminHandler) InfraStatus(c *gin.Context) {
	cfClient, err := h.AwsManager.GetCFClient(context.Background())
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "DOES_NOT_EXIST"})
		return
	}

	stackName := "LiteStreamStack"
	out, err := cfClient.DescribeStacks(context.Background(), &cloudformation.DescribeStacksInput{
		StackName: awssdk.String(stackName),
	})

	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "DOES_NOT_EXIST"})
		return
	}

	if len(out.Stacks) > 0 {
		status := string(out.Stacks[0].StackStatus)
		
		if status == "CREATE_COMPLETE" || status == "UPDATE_COMPLETE" {
			for _, o := range out.Stacks[0].Outputs {
				var key, val string
				if *o.OutputKey == "VodCDNDomainName" {
					key = "PUBLIC_VOD_BASE_URL"
					val = "https://" + *o.OutputValue + "/vod/"
				} else if *o.OutputKey == "VodStorageBucketName" {
					key = "S3_BUCKET_NAME"
					val = *o.OutputValue
				} else if *o.OutputKey == "VodIngestQueueUrl" {
					key = "SQS_QUEUE_URL"
					val = *o.OutputValue
				}

				if key != "" {
					h.DB.Save(&models.Setting{Key: key, Value: val, UpdatedAt: time.Now()})
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{"status": status})
	} else {
		c.JSON(http.StatusOK, gin.H{"status": "DOES_NOT_EXIST"})
	}
}

func (h *AdminHandler) InfraProvision(c *gin.Context) {
	cfClient, err := h.AwsManager.GetCFClient(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get AWS CF client"})
		return
	}

	stackName := "LiteStreamStack"
	
	templateData, err := os.ReadFile("/app/template.yaml")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "template not found in container"})
		return
	}

	_, err = cfClient.CreateStack(context.Background(), &cloudformation.CreateStackInput{
		StackName:    awssdk.String(stackName),
		TemplateBody: awssdk.String(string(templateData)),
		Capabilities: []types.Capability{types.CapabilityCapabilityNamedIam},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "provisioning started"})
}

func (h *AdminHandler) InfraDeprovision(c *gin.Context) {
	cfClient, err := h.AwsManager.GetCFClient(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get AWS CF client"})
		return
	}

	stackName := "LiteStreamStack"
	_, err = cfClient.DeleteStack(context.Background(), &cloudformation.DeleteStackInput{
		StackName: awssdk.String(stackName),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	h.DB.Where("key IN ?", []string{"PUBLIC_VOD_BASE_URL", "S3_BUCKET_NAME", "SQS_QUEUE_URL"}).Delete(&models.Setting{})

	c.JSON(http.StatusOK, gin.H{"message": "deprovisioning started"})
}

func (h *AdminHandler) InfraEvents(c *gin.Context) {
	cfClient, err := h.AwsManager.GetCFClient(context.Background())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get AWS CF client"})
		return
	}

	stackName := "LiteStreamStack"
	out, err := cfClient.DescribeStackEvents(context.Background(), &cloudformation.DescribeStackEventsInput{
		StackName: awssdk.String(stackName),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	type Event struct {
		Timestamp          time.Time `json:"timestamp"`
		LogicalResourceId  string    `json:"logical_resource_id"`
		ResourceType       string    `json:"resource_type"`
		ResourceStatus     string    `json:"resource_status"`
		ResourceStatusReason string  `json:"resource_status_reason"`
	}

	events := []Event{}
	for _, e := range out.StackEvents {
		reason := ""
		if e.ResourceStatusReason != nil {
			reason = *e.ResourceStatusReason
		}
		events = append(events, Event{
			Timestamp:            *e.Timestamp,
			LogicalResourceId:    *e.LogicalResourceId,
			ResourceType:         *e.ResourceType,
			ResourceStatus:       string(e.ResourceStatus),
			ResourceStatusReason: reason,
		})
	}
	c.JSON(http.StatusOK, events)
}

func (h *AdminHandler) GetAWSCredentials(c *gin.Context) {
	accessKey := models.GetSetting(h.DB, "AWS_ACCESS_KEY_ID", "")
	secretKey := models.GetSetting(h.DB, "AWS_SECRET_ACCESS_KEY", "")
	region := models.GetSetting(h.DB, "AWS_REGION", "us-east-1")
	endpoint := models.GetSetting(h.DB, "AWS_ENDPOINT", "")

	publicVod := models.GetSetting(h.DB, "PUBLIC_VOD_BASE_URL", "")
	s3Bucket := models.GetSetting(h.DB, "S3_BUCKET_NAME", "")
	sqsQueue := models.GetSetting(h.DB, "SQS_QUEUE_URL", "")
	rtmpIngest := models.GetSetting(h.DB, "RTMP_INGEST_URL", "")

	c.JSON(http.StatusOK, gin.H{
		"aws_access_key_id":     accessKey,
		"aws_secret_access_key": secretKey,
		"aws_region":            region,
		"aws_endpoint":          endpoint,
		"public_vod_base_url":   publicVod,
		"s3_bucket_name":        s3Bucket,
		"sqs_queue_url":         sqsQueue,
		"rtmp_ingest_url":       rtmpIngest,
	})
}

func (h *AdminHandler) SaveAWSCredentials(c *gin.Context) {
	var req struct {
		AccessKey string `json:"aws_access_key_id"`
		SecretKey string `json:"aws_secret_access_key"`
		Region    string `json:"aws_region"`
		Endpoint  string `json:"aws_endpoint"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	h.DB.Save(&models.Setting{Key: "AWS_ACCESS_KEY_ID", Value: req.AccessKey, UpdatedAt: time.Now()})
	
	// Only update secret key if a new one is provided.
	if req.SecretKey != "" {
		h.DB.Save(&models.Setting{Key: "AWS_SECRET_ACCESS_KEY", Value: req.SecretKey, UpdatedAt: time.Now()})
	}
	
	h.DB.Save(&models.Setting{Key: "AWS_REGION", Value: req.Region, UpdatedAt: time.Now()})
	h.DB.Save(&models.Setting{Key: "AWS_ENDPOINT", Value: req.Endpoint, UpdatedAt: time.Now()})

	c.JSON(http.StatusOK, gin.H{"message": "AWS credentials saved"})
}
