package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────
//  DATABASE MODEL
// ─────────────────────────────────────────────

type Stream struct {
	gorm.Model
	StreamKey string `json:"stream_key" gorm:"unique;not null"`
	Title     string `json:"title"`
}

// ChatMessageDB is the persistent record of every chat message.
type ChatMessageDB struct {
	gorm.Model
	StreamKey string `json:"stream_key" gorm:"index;not null"`
	User      string `json:"user"      gorm:"not null"`
	Text      string `json:"text"      gorm:"not null"`
	Color     string `json:"color"`
}

// ─────────────────────────────────────────────
//  CHAT TYPES
// ─────────────────────────────────────────────

// ChatMessage is the wire format used for both WS and Redis Pub/Sub.
type ChatMessage struct {
	StreamKey string `json:"stream_key"`
	User      string `json:"user"`
	Text      string `json:"text"`
	Color     string `json:"color,omitempty"` // assigned server-side
}

// Client represents a single WebSocket connection inside a Room.
type Client struct {
	conn *websocket.Conn
	send chan []byte // buffered outbound channel
}

// Room manages all clients subscribed to one stream_key and its Redis sub.
type Room struct {
	streamKey string
	clients   map[*Client]struct{}
	mu        sync.RWMutex
	broadcast chan []byte
	leave     chan *Client
	cancel    context.CancelFunc // stops the Redis subscriber goroutine
}

// Hub owns all active rooms.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
	rdb   *redis.Client
}

// ─────────────────────────────────────────────
//  GLOBALS
// ─────────────────────────────────────────────

var (
	db      *gorm.DB
	rdb     *redis.Client
	hub     *Hub
	logger  = slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	rootCtx = context.Background()
)

// userColors are cycled to give each username a persistent colour in chat.
var userColors = []string{
	"#39ff14", "#00e5ff", "#bf5af2", "#ff2d78", "#00ff87", "#9146ff",
}

// ─────────────────────────────────────────────
//  WEBSOCKET UPGRADER
// ─────────────────────────────────────────────

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	// Allow all origins in development — tighten this in production.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// ─────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────

func initDB() {
	dsn := fmt.Sprintf("host=postgres user=%s password=%s dbname=%s port=5432 sslmode=disable",
		os.Getenv("DB_USER"), os.Getenv("DB_PASSWORD"), os.Getenv("DB_NAME"))

	var err error
	db, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	db.AutoMigrate(&Stream{}, &ChatMessageDB{})
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

// getOrCreateRoom returns an existing Room or creates a new one with a
// dedicated Redis Pub/Sub subscriber goroutine.
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

// subscribeRedis blocks, listening on the Redis channel for this stream.
// Every message received is forwarded to the Room's broadcast channel.
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

// run is the single goroutine that mutates r.clients, preventing data races.
func (r *Room) run() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {

		// Outbound: broadcast a Redis message to all connected WebSocket clients.
		case payload := <-r.broadcast:
			r.mu.RLock()
			for client := range r.clients {
				select {
				case client.send <- payload:
				default:
					// Client's send buffer is full — treat as disconnected.
					close(client.send)
					delete(r.clients, client)
				}
			}
			r.mu.RUnlock()

		// Cleanup: remove a client that has disconnected.
		case client := <-r.leave:
			r.mu.Lock()
			if _, ok := r.clients[client]; ok {
				delete(r.clients, client)
				close(client.send)
			}
			r.mu.Unlock()

			logger.Debug("Client left room", "stream_key", r.streamKey)

			// Tear down the room if it is now empty.
			if r.isEmpty() {
				hub.mu.Lock()
				r.cancel()
				delete(hub.rooms, r.streamKey)
				hub.mu.Unlock()
				logger.Info("Empty room destroyed", "stream_key", r.streamKey)
				return
			}

		// Heartbeat: send a Ping frame to detect stale connections.
		case <-ticker.C:
			r.mu.RLock()
			for client := range r.clients {
				client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					client.send <- nil // signal writePump to close
				}
			}
			r.mu.RUnlock()
		}
	}
}

func (r *Room) isEmpty() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0
}

func (r *Room) addClient(c *Client) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.clients[c] = struct{}{}
}

// ─────────────────────────────────────────────
//  CLIENT — PUMPS
// ─────────────────────────────────────────────

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 512
)

// readPump pumps inbound messages from the WebSocket to Redis Pub/Sub.
// It runs in its own goroutine per client and owns the read side of the conn.
func readPump(client *Client, room *Room, streamKey string) {
	defer func() {
		room.leave <- client
		client.conn.Close()
	}()

	client.conn.SetReadLimit(maxMessageSize)
	client.conn.SetReadDeadline(time.Now().Add(pongWait))
	// Reset the read deadline each time a Pong is received.
	client.conn.SetPongHandler(func(string) error {
		client.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, rawMsg, err := client.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Warn("WebSocket read error", "error", err)
			}
			return
		}

		// Parse the inbound JSON from the browser.
		var inbound struct {
			User string `json:"user"`
			Text string `json:"text"`
		}
		if err := json.Unmarshal(rawMsg, &inbound); err != nil {
			logger.Warn("Invalid chat message payload", "error", err)
			continue
		}

		// Assign a deterministic colour based on username.
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

		// Persist to PostgreSQL — only the originating server writes to DB,
		// preventing duplicate inserts across horizontally scaled instances.
		record := ChatMessageDB{
			StreamKey: streamKey,
			User:      inbound.User,
			Text:      inbound.Text,
			Color:     color,
		}
		if err := db.Create(&record).Error; err != nil {
			logger.Error("Failed to persist chat message", "error", err)
			// Non-fatal: continue to broadcast even if DB write fails.
		}

		// Publish to Redis — all server instances (current and future) will receive it.
		channel := "chat:" + streamKey
		if err := rdb.Publish(rootCtx, channel, string(payload)).Err(); err != nil {
			logger.Error("Redis Publish failed", "channel", channel, "error", err)
		}
	}
}

// writePump pumps outbound messages from the client's send channel to the WebSocket.
// It owns the write side of the conn and is the only goroutine that calls WriteMessage.
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

			// A nil payload or closed channel means disconnect.
			if !ok || payload == nil {
				client.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := client.conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(payload)

			// Flush any queued messages in the same write frame.
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
//  HTTP HANDLERS
// ─────────────────────────────────────────────

// wsHandler upgrades an HTTP request to a WebSocket connection and registers
// the client in the appropriate room.
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

	client := &Client{
		conn: conn,
		send: make(chan []byte, 256),
	}

	room := hub.getOrCreateRoom(streamKey)
	room.addClient(client)

	logger.Info("Client connected", "stream_key", streamKey)

	// Each client gets exactly two goroutines: one for reading, one for writing.
	go writePump(client)
	go readPump(client, room, streamKey)
}

// startStreamHandler persists stream metadata to Postgres.
func startStreamHandler(c *gin.Context) {
	var input struct {
		StreamKey string `json:"stream_key" binding:"required"`
		Title     string `json:"title" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	stream := Stream{StreamKey: input.StreamKey, Title: input.Title}
	if err := db.Create(&stream).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create stream"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Stream started", "data": stream})
}

// chatHistoryHandler returns the last 50 messages for a stream, chronologically.
// GET /chat/:stream_key
func chatHistoryHandler(c *gin.Context) {
	streamKey := c.Param("stream_key")
	if streamKey == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "stream_key is required"})
		return
	}

	var records []ChatMessageDB
	result := db.
		Where("stream_key = ?", streamKey).
		Order("created_at ASC").
		Limit(50).
		Find(&records)

	if result.Error != nil {
		logger.Error("Failed to fetch chat history", "stream_key", streamKey, "error", result.Error)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Could not fetch chat history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": records})
}

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type")

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

	r := gin.Default()
	// Apply CORS middleware to all routes
	r.Use(corsMiddleware())

	// REST endpoints
	r.POST("/stream/start", startStreamHandler)
	r.GET("/chat/:stream_key", chatHistoryHandler)

	// WebSocket endpoint — ws://localhost:8000/ws/chat/:stream_key
	r.GET("/ws/chat/:stream_key", wsHandler)

	logger.Info("Backend starting", "addr", ":8000")
	if err := r.Run(":8000"); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
