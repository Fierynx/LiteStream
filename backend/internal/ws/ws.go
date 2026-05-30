package ws

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"litestream-backend/internal/models"
)

var userColors = []string{
	"#39ff14", "#00e5ff", "#bf5af2", "#ff2d78", "#00ff87", "#9146ff",
}

const (
	writeWait  = 10 * time.Second
	pingPeriod = 25 * time.Second
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Client struct {
	conn     *websocket.Conn
	send     chan []byte
	authUser string // empty if unauthenticated
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
	mu     sync.RWMutex
	rooms  map[string]*Room
	rdb    *redis.Client
	db     *gorm.DB
	logger *slog.Logger
}

func NewHub(rdb *redis.Client, db *gorm.DB, logger *slog.Logger) *Hub {
	return &Hub{
		rooms:  make(map[string]*Room),
		rdb:    rdb,
		db:     db,
		logger: logger,
	}
}

func (h *Hub) GetOrCreateRoom(streamKey string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()

	if r, ok := h.rooms[streamKey]; ok {
		return r
	}

	ctx, cancel := context.WithCancel(context.Background())
	r := &Room{
		streamKey: streamKey,
		clients:   make(map[*Client]struct{}),
		broadcast: make(chan []byte, 256),
		leave:     make(chan *Client, 32),
		cancel:    cancel,
	}
	h.rooms[streamKey] = r

	go h.runRoom(r)
	go h.subscribeRedis(ctx, r)

	h.logger.Info("Room created", "stream_key", streamKey)
	return r
}

func (h *Hub) subscribeRedis(ctx context.Context, r *Room) {
	channel := "chat:" + r.streamKey
	sub := h.rdb.Subscribe(ctx, channel)
	defer func() {
		sub.Close()
		h.logger.Info("Redis subscriber stopped", "channel", channel)
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

func (h *Hub) runRoom(r *Room) {
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
			if h.isRoomEmpty(r) {
				h.mu.Lock()
				r.cancel()
				delete(h.rooms, r.streamKey)
				h.mu.Unlock()
				h.logger.Info("Empty room destroyed", "stream_key", r.streamKey)
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

func (h *Hub) isRoomEmpty(r *Room) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients) == 0
}

func (h *Hub) HandleWebSocket(w http.ResponseWriter, req *http.Request, streamKey string, authUser string) {
	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		h.logger.Error("Failed to upgrade WebSocket", "error", err)
		return
	}

	client := &Client{
		conn:     conn,
		send:     make(chan []byte, 256),
		authUser: authUser,
	}

	room := h.GetOrCreateRoom(streamKey)
	room.mu.Lock()
	room.clients[client] = struct{}{}
	room.mu.Unlock()

	go h.writePump(client)
	go h.readPump(client, room, streamKey)
}

func (h *Hub) readPump(client *Client, room *Room, streamKey string) {
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
			return
		}

		var inbound struct {
			Text string `json:"text"`
		}
		if err := json.Unmarshal(rawMsg, &inbound); err != nil {
			continue
		}

		// Reject unauthenticated users from sending messages
		if client.authUser == "" {
			continue
		}

		color := userColors[len(client.authUser)%len(userColors)]
		msg := models.ChatMessage{
			StreamKey: streamKey,
			User:      client.authUser,
			Text:      inbound.Text,
			Color:     color,
		}

		payload, err := json.Marshal(msg)
		if err != nil {
			continue
		}

		var videoOffset float64
		var vodID string
		var streamRow models.Stream
		// Find the most recent active stream or latest stream for this key to attach the chat to
		if err := h.db.Where("stream_key = ?", streamKey).Order("created_at DESC").First(&streamRow).Error; err == nil {
			vodID = streamRow.VodID
			if streamRow.StartedAt != nil {
				videoOffset = time.Since(*streamRow.StartedAt).Seconds()
			}
		}

		if vodID != "" {
			record := models.ChatMessageDB{
				VodID:       vodID,
				StreamKey:   streamKey,
				User:        client.authUser,
				Text:        inbound.Text,
				Color:       color,
				VideoOffset: videoOffset,
			}
			h.db.Create(&record)
		}

		h.rdb.Publish(context.Background(), "chat:"+streamKey, string(payload))
	}
}

func (h *Hub) writePump(client *Client) {
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
