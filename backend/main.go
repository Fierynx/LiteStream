package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	awssdk "github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────
//  DATABASE MODELS
// ─────────────────────────────────────────────

// User holds creator credentials and their permanent RTMP stream key.
type User struct {
	gorm.Model
	Username     string `json:"username"   gorm:"unique;not null"`
	PasswordHash string `json:"-"          gorm:"not null"`           // never sent to client
	StreamKey    string `json:"stream_key" gorm:"unique;not null"`    // e.g. live_a1b2c3…
}

// Stream is a single broadcast session owned by a User.
type Stream struct {
	gorm.Model
	UserID       uint       `json:"user_id"       gorm:"not null;index"`
	StreamKey    string     `json:"stream_key"    gorm:"unique;not null"`
	Username     string     `json:"username"      gorm:"not null;index"` // denormalised for fast lookups
	Title        string     `json:"title"`
	ThumbnailURL string     `json:"thumbnail_url"`
	Status       string     `json:"status"        gorm:"default:'offline';not null"` // "offline" | "live" | "vod"
	StartedAt    *time.Time `json:"started_at"`
}

// ChatMessageDB is the persistent record of every chat message.
type ChatMessageDB struct {
	gorm.Model
	StreamKey   string  `json:"stream_key"   gorm:"index;not null"`
	User        string  `json:"user"         gorm:"not null"`
	Text        string  `json:"text"         gorm:"not null"`
	Color       string  `json:"color"`
	VideoOffset float64 `json:"video_offset"`
}

// ─────────────────────────────────────────────
//  CHAT WIRE TYPES
// ─────────────────────────────────────────────

type ChatMessage struct {
	StreamKey string `json:"stream_key"`
	User      string `json:"user"`
	Text      string `json:"text"`
	Color     string `json:"color,omitempty"`
}

// ─────────────────────────────────────────────
//  WEBSOCKET / HUB TYPES
// ─────────────────────────────────────────────

type Client struct {
	conn *websocket.Conn
	send chan []byte
}

type Room struct {
	streamKey string
	clients   map[*Client]struct{}
	mu        sync.RWMutex
	broadcast chan []byte
	leave     chan *Client
	cancel    context.CancelFunc
}

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	rdb   *redis.Client
}

// ─────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────

var (
	db       *gorm.DB
	rdb      *redis.Client
	hub      *Hub
	s3Client *s3.Client
	logger   = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	rootCtx  = context.Background()
)

// jwtSecret is read from JWT_SECRET env var; falls back to a dev default.
func jwtSecret() []byte {
	if s := os.Getenv("JWT_SECRET"); s != "" {
		return []byte(s)
	}
	return []byte("litestream-dev-secret-change-in-prod")
}

var userColors = []string{
	"#39ff14", "#00e5ff", "#bf5af2", "#ff2d78", "#00ff87", "#9146ff",
}

// ─────────────────────────────────────────────
//  WEBSOCKET UPGRADER
// ─────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// WebSocket timing constants.
const (
	writeWait  = 10 * time.Second
	pingPeriod = 25 * time.Second
)

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

// generateStreamKey creates a random hex string prefixed with "live_".
func generateStreamKey() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "live_" + hex.EncodeToString(b), nil
}

// issueJWT creates a signed token carrying the user's ID and username.
func issueJWT(userID uint, username string) (string, error) {
	claims := jwt.MapClaims{
		"sub":      userID,
		"username": username,
		"exp":      time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret())
}

// authMiddleware validates the Bearer JWT and injects "userID" / "username" into context.
func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return jwtSecret(), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		claims, _ := token.Claims.(jwt.MapClaims)
		c.Set("userID", uint(claims["sub"].(float64)))
		c.Set("username", claims["username"].(string))
		c.Next()
	}
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

func initS3() {
	endpoint := os.Getenv("AWS_ENDPOINT")
	region := os.Getenv("AWS_REGION")
	if region == "" {
		region = "us-east-1"
	}

	cfg, err := awsconfig.LoadDefaultConfig(rootCtx,
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
		log.Fatalf("Failed to load AWS config: %v", err)
	}

	opts := []func(*s3.Options){}
	if endpoint != "" {
		opts = append(opts, func(o *s3.Options) {
			o.BaseEndpoint = awssdk.String(endpoint)
			o.UsePathStyle = true // LocalStack requires path-style
		})
	}

	s3Client = s3.NewFromConfig(cfg, opts...)
	logger.Info("S3 client initialised", "endpoint", endpoint, "region", region)
}

// thumbnailUploadHandler accepts a multipart image, uploads it to S3 under
// thumbnails/<uuid>.<ext>, and returns the public LocalStack URL.
// POST /upload/thumbnail  (JWT required)
func thumbnailUploadHandler(c *gin.Context) {
	bucket := os.Getenv("S3_BUCKET_NAME")
	if bucket == "" {
		bucket = "vod-bucket"
	}

	// Parse the multipart upload — limit to 10 MB.
	if err := c.Request.ParseMultipartForm(10 << 20); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file too large or bad form"})
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "file field is required"})
		return
	}
	defer file.Close()

	// Build a unique S3 key: thumbnails/<uuid><.ext>
	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".jpg"
	}
	b := make([]byte, 8)
	rand.Read(b)
	s3Key := "thumbnails/" + hex.EncodeToString(b) + ext

	// Determine content type.
	contentType := mime.TypeByExtension(ext)
	if contentType == "" {
		contentType = "image/jpeg"
	}

	_, err = s3Client.PutObject(rootCtx, &s3.PutObjectInput{
		Bucket:      awssdk.String(bucket),
		Key:         awssdk.String(s3Key),
		Body:        file,
		ContentType: awssdk.String(contentType),
	})
	if err != nil {
		logger.Error("S3 thumbnail upload failed", "error", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "upload failed"})
		return
	}

	// Construct the public URL that the browser / player can reach.
	// Outside Docker the host is localhost:4566; inside it's localstack:4566.
	// We always return the localhost URL so the frontend can display it.
	publicURL := fmt.Sprintf("http://localhost:4566/%s/%s", bucket, s3Key)

	logger.Info("Thumbnail uploaded", "key", s3Key, "url", publicURL)
	c.JSON(http.StatusOK, gin.H{"url": publicURL})
}


func initDB() {
	dsn := fmt.Sprintf("host=postgres user=%s password=%s dbname=%s port=5432 sslmode=disable",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))

	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.AutoMigrate(&User{}, &Stream{}, &ChatMessageDB{})
}

func initRedis() {
	rdb = redis.NewClient(&redis.Options{Addr: "redis:6379"})
	if err := rdb.Ping(rootCtx).Err(); err != nil {
		log.Fatalf("Failed to connect to Redis: %v", err)
	}
}

func initHub() {
	hub = &Hub{
		rooms: make(map[string]*Room),
		rdb:   rdb,
	}
}

// ─────────────────────────────────────────────
//  HUB — ROOM MANAGEMENT
// ─────────────────────────────────────────────

func (h *Hub) getOrCreateRoom(streamKey string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if r, ok := h.rooms[streamKey]; ok {
		return r
	}

	ctx, cancel := context.WithCancel(rootCtx)
	r := &Room{
		streamKey: streamKey,
		clients:   make(map[*Client]struct{}),
		broadcast: make(chan []byte, 256),
		leave:     make(chan *Client, 32),
		cancel:    cancel,
	}
	h.rooms[streamKey] = r

	go r.run()
	go h.subscribeRedis(ctx, r)

	logger.Info("Room created", "stream_key", streamKey)
	return r
}

func (h *Hub) subscribeRedis(ctx context.Context, r *Room) {
	channel := "chat:" + r.streamKey
	sub := h.rdb.Subscribe(ctx, channel)
	defer func() {
		sub.Close()
		logger.Info("Redis subscriber stopped", "channel", channel)
	}()

	ch := sub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			r.broadcast <- []byte(msg.Payload)
		}
	}
}

// ─────────────────────────────────────────────
//  ROOM — EVENT LOOP
// ─────────────────────────────────────────────

func (r *Room) run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case payload := <-r.broadcast:
			r.mu.RLock()
			for client := range r.clients {
				select {
				case client.send <- payload:
				default:
					close(client.send)
					delete(r.clients, client)
				}
			}
			r.mu.RUnlock()

		case client := <-r.leave:
			r.mu.Lock()
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				close(client.send)
			}
			r.mu.Unlock()
			logger.Debug("Client left room", "stream_key", r.streamKey)
			if r.isEmpty() {
				hub.mu.Lock()
				r.cancel()
				delete(hub.rooms, r.streamKey)
				hub.mu.Unlock()
				logger.Info("Empty room destroyed", "stream_key", r.streamKey)
				return
			}

		case <-ticker.C:
			r.mu.RLock()
			for client := range r.clients {
				client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					client.send <- nil
				}
			}
			r.mu.RUnlock()
		}
	}
}

func (r *Room) addClient(c *Client) {
	r.mu.Lock()
	r.clients[c] = struct{}{}
	r.mu.Unlock()
}

func (r *Room) isEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0
}

// ─────────────────────────────────────────────
//  WEBSOCKET PUMPS
// ─────────────────────────────────────────────

func readPump(client *Client, room *Room, streamKey string) {
	defer func() {
		room.leave <- client
	}()

	client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, rawMsg, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Warn("WebSocket read error", "error", err)
			}
			return
		}

		var inbound struct {
			User string `json:"user"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(rawMsg, &inbound); err != nil {
			logger.Warn("Invalid chat message payload", "error", err)
			continue
		}

		color := userColors[len(inbound.User)%len(userColors)]

		msg := ChatMessage{
			StreamKey: streamKey,
			User:      inbound.User,
			Text:      inbound.Text,
			Color:     color,
		}

		payload, err := json.Marshal(msg)
		if err != nil {
			logger.Error("Failed to marshal chat message", "error", err)
			continue
		}

		// Compute video offset from the stream's StartedAt.
		var videoOffset float64
		var streamRow Stream
		if err := db.Where("stream_key = ?", streamKey).First(&streamRow).Error; err == nil {
			if streamRow.StartedAt != nil {
				videoOffset = time.Since(*streamRow.StartedAt).Seconds()
			}
		}

		record := ChatMessageDB{
			StreamKey:   streamKey,
			User:        inbound.User,
			Text:        inbound.Text,
			Color:       color,
			VideoOffset: videoOffset,
		}
		if err := db.Create(&record).Error; err != nil {
			logger.Error("Failed to persist chat message", "error", err)
		}

		channel := "chat:" + streamKey
		if err := rdb.Publish(rootCtx, channel, string(payload)).Err(); err != nil {
			logger.Error("Redis Publish failed", "channel", channel, "error", err)
		}
	}
}

func writePump(client *Client) {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case payload, ok := <-client.send:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok || payload == nil {
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			w, err := client.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(payload)
			n := len(client.send)
			for i := 0; i < n; i++ {
				w.Write([]byte("\n"))
				w.Write(<-client.send)
			}
			if err := w.Close(); err != nil {
				return
			}
		case <-ticker.C:
			client.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// ─────────────────────────────────────────────
//  AUTH HANDLERS
// ─────────────────────────────────────────────

// POST /auth/register
func registerHandler(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required,min=3,max=32"`
		Password string `json:"password" binding:"required,min=6"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Check uniqueness
	var existing User
	if err := db.Where("username = ?", input.Username).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already taken"})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(input.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not hash password"})
		return
	}

	streamKey, err := generateStreamKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate stream key"})
		return
	}

	user := User{
		Username:     input.Username,
		PasswordHash: string(hash),
		StreamKey:    streamKey,
	}
	if err := db.Create(&user).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not create user"})
		return
	}

	// Seed a Stream record (status = "offline") so the channel page exists immediately.
	stream := Stream{
		UserID:    user.ID,
		StreamKey: user.StreamKey,
		Username:  user.Username,
		Title:     user.Username + "'s Channel",
		Status:    "offline",
	}
	db.Create(&stream)

	token, err := issueJWT(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not issue token"})
		return
	}

	logger.Info("User registered", "username", user.Username)
	c.JSON(http.StatusCreated, gin.H{
		"token":      token,
		"username":   user.Username,
		"stream_key": user.StreamKey,
	})
}

// POST /auth/login
func loginHandler(c *gin.Context) {
	var input struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var user User
	if err := db.Where("username = ?", input.Username).First(&user).Error; err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(input.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token, err := issueJWT(user.ID, user.Username)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not issue token"})
		return
	}

	logger.Info("User logged in", "username", user.Username)
	c.JSON(http.StatusOK, gin.H{
		"token":      token,
		"username":   user.Username,
		"stream_key": user.StreamKey,
	})
}

// GET /auth/me  — returns the current user's profile (requires JWT).
func meHandler(c *gin.Context) {
	userID := c.GetUint("userID")
	var user User
	if err := db.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":         user.ID,
		"username":   user.Username,
		"stream_key": user.StreamKey,
	})
}

// ─────────────────────────────────────────────
//  NGINX on_publish GATEKEEPER
// ─────────────────────────────────────────────

// POST /auth/publish  — called by NGINX on_publish.
// NGINX sends form-encoded data; "name" is the RTMP stream key.
// Return 200 to allow, 401 to drop the OBS connection.
func publishAuthHandler(c *gin.Context) {
	streamKey := c.PostForm("name")
	if streamKey == "" {
		c.Status(http.StatusUnauthorized)
		return
	}

	var user User
	if err := db.Where("stream_key = ?", streamKey).First(&user).Error; err != nil {
		logger.Warn("on_publish: unknown stream key", "key", streamKey)
		c.Status(http.StatusUnauthorized)
		return
	}

	// Key is valid — set stream live and stamp StartedAt.
	now := time.Now()
	title := user.Username + "'s Live Stream"

	db.Where(Stream{StreamKey: streamKey}).
		Assign(Stream{
			UserID:    user.ID,
			Username:  user.Username,
			Title:     title,
			Status:    "live",
			StartedAt: &now,
		}).
		FirstOrCreate(&Stream{})

	// Broadcast system message to any waiting viewers.
	sysMsg := ChatMessage{
		StreamKey: streamKey,
		User:      "System",
		Text:      "🎬 Stream is officially LIVE!",
		Color:     "#00ff87",
	}
	if payload, err := json.Marshal(sysMsg); err == nil {
		rdb.Publish(rootCtx, "chat:"+streamKey, string(payload))
	}

	logger.Info("on_publish: stream authorised", "username", user.Username, "key", streamKey)
	c.Status(http.StatusOK)
}

// ─────────────────────────────────────────────
//  STREAM HANDLERS
// ─────────────────────────────────────────────

// GET /channel/:username  — look up a channel by the streamer's public username.
func channelHandler(c *gin.Context) {
	username := c.Param("username")
	var stream Stream
	if err := db.Where("username = ?", username).First(&stream).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "channel not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": stream})
}

// POST /stream/end  (called by notify_vod.sh via NGINX exec_publish_done)
func endStreamHandler(c *gin.Context) {
	var input struct {
		StreamKey string `json:"stream_key" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	result := db.Model(&Stream{}).Where("stream_key = ?", input.StreamKey).Update("status", "vod")
	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not end stream"})
		return
	}
	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "stream not found"})
		return
	}

	logger.Info("Stream ended", "stream_key", input.StreamKey)
	c.JSON(http.StatusOK, gin.H{"message": "stream ended", "stream_key": input.StreamKey})
}

// GET /streams  — list all streams ordered by most recent.
func listStreamsHandler(c *gin.Context) {
	var streams []Stream
	if err := db.Order("created_at DESC").Find(&streams).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch streams"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": streams})
}

// PATCH /stream/settings — creator updates title and/or thumbnail URL (JWT required).
func updateSettingsHandler(c *gin.Context) {
	userID := c.GetUint("userID")
	var input struct {
		Title        string `json:"title"`
		ThumbnailURL string `json:"thumbnail_url"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if input.Title != "" {
		updates["title"] = input.Title
	}
	updates["thumbnail_url"] = input.ThumbnailURL // allow clearing

	if err := db.Model(&Stream{}).Where("user_id = ?", userID).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not update settings"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "settings updated"})
}

// ─────────────────────────────────────────────
//  CHAT HANDLERS
// ─────────────────────────────────────────────

// GET /chat/:stream_key
func chatHistoryHandler(c *gin.Context) {
	streamKey := c.Param("stream_key")
	var records []ChatMessageDB
	if err := db.Where("stream_key = ?", streamKey).Order("created_at ASC").Limit(50).Find(&records).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not fetch history"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": records})
}

// ─────────────────────────────────────────────
//  WEBSOCKET HANDLER
// ─────────────────────────────────────────────

func wsHandler(c *gin.Context) {
	streamKey := c.Param("stream_key")
	if streamKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stream_key is required"})
		return
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		logger.Error("WebSocket upgrade failed", "error", err)
		return
	}

	client := &Client{conn: conn, send: make(chan []byte, 256)}
	room := hub.getOrCreateRoom(streamKey)
	room.addClient(client)

	logger.Info("Client connected", "stream_key", streamKey)
	go writePump(client)
	go readPump(client, room, streamKey)
}

// ─────────────────────────────────────────────
//  CORS MIDDLEWARE
// ─────────────────────────────────────────────

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}

// ─────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────

func main() {
	initDB()
	initRedis()
	initHub()
	initS3()

	r := gin.Default()
	r.Use(corsMiddleware())

	// ── Public auth endpoints ──
	r.POST("/auth/register", registerHandler)
	r.POST("/auth/login", loginHandler)
	r.POST("/auth/publish", publishAuthHandler) // NGINX on_publish hook (form data)

	// ── Protected endpoints (JWT required) ──
	auth := r.Group("/")
	auth.Use(authMiddleware())
	auth.GET("/auth/me", meHandler)
	auth.PATCH("/stream/settings", updateSettingsHandler)
	auth.POST("/upload/thumbnail", thumbnailUploadHandler)

	// ── Public stream/chat endpoints ──
	r.GET("/streams", listStreamsHandler)
	r.GET("/channel/:username", channelHandler)
	r.POST("/stream/end", endStreamHandler) // called by notify_vod.sh (internal)
	r.GET("/chat/:stream_key", chatHistoryHandler)

	// ── WebSocket ──
	r.GET("/ws/chat/:stream_key", wsHandler)

	logger.Info("Backend starting", "addr", ":8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
