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

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation"
	"github.com/aws/aws-sdk-go-v2/service/cloudformation/types"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"

	"litestream-backend/internal/config"
)

type AdminHandler struct {
	CFClient *cloudformation.Client
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

	adminUser := os.Getenv("ADMIN_USER")
	adminPass := os.Getenv("ADMIN_PASS")

	if adminUser == "" || adminPass == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "admin credentials not configured on server"})
		return
	}

	if input.Username == adminUser && input.Password == adminPass {
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
	stackName := "LiteStreamStack"
	out, err := h.CFClient.DescribeStacks(context.Background(), &cloudformation.DescribeStacksInput{
		StackName: aws.String(stackName),
	})

	if err != nil {
		c.JSON(http.StatusOK, gin.H{"status": "DOES_NOT_EXIST"})
		return
	}

	if len(out.Stacks) > 0 {
		c.JSON(http.StatusOK, gin.H{"status": string(out.Stacks[0].StackStatus)})
	} else {
		c.JSON(http.StatusOK, gin.H{"status": "DOES_NOT_EXIST"})
	}
}

func (h *AdminHandler) InfraProvision(c *gin.Context) {
	stackName := "LiteStreamStack"
	
	templateData, err := os.ReadFile("/app/template.yaml")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "template not found in container"})
		return
	}

	_, err = h.CFClient.CreateStack(context.Background(), &cloudformation.CreateStackInput{
		StackName:    aws.String(stackName),
		TemplateBody: aws.String(string(templateData)),
		Capabilities: []types.Capability{types.CapabilityCapabilityNamedIam},
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "provisioning started"})
}

func (h *AdminHandler) InfraDeprovision(c *gin.Context) {
	stackName := "LiteStreamStack"
	_, err := h.CFClient.DeleteStack(context.Background(), &cloudformation.DeleteStackInput{
		StackName: aws.String(stackName),
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deprovisioning started"})
}

func (h *AdminHandler) InfraEvents(c *gin.Context) {
	stackName := "LiteStreamStack"
	out, err := h.CFClient.DescribeStackEvents(context.Background(), &cloudformation.DescribeStackEventsInput{
		StackName: aws.String(stackName),
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
