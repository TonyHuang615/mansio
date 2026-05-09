package ws

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	"github.com/younkyumjin/lociterm/internal/tmux"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  32 * 1024,
	WriteBufferSize: 32 * 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type Handler struct {
	tmuxMgr *tmux.Manager
}

func NewHandler(tmuxMgr *tmux.Manager) *Handler {
	return &Handler{tmuxMgr: tmuxMgr}
}

func (h *Handler) HandleTerminal(w http.ResponseWriter, r *http.Request) {
	sessionID := r.PathValue("sessionId")
	if sessionID == "" {
		http.Error(w, "session id required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("websocket upgrade error: %v", err)
		return
	}
	defer conn.Close()

	var cols, rows uint16 = 120, 40

	sess, err := h.tmuxMgr.Attach(sessionID, cols, rows)
	if err != nil {
		log.Printf("tmux attach error for %s: %v", sessionID, err)
		conn.WriteJSON(ControlMessage{Type: "error", Message: err.Error()})
		return
	}
	defer h.tmuxMgr.Detach(sessionID)

	conn.WriteJSON(ControlMessage{Type: "attached", Shell: "tmux"})

	done := make(chan struct{})

	// PTY stdout -> WebSocket (binary frames)
	go func() {
		defer close(done)
		buf := make([]byte, 32*1024)
		for {
			n, err := sess.Read(buf)
			if err != nil {
				return
			}
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				return
			}
		}
	}()

	// WebSocket -> PTY stdin or control handler
	go func() {
		for {
			msgType, data, err := conn.ReadMessage()
			if err != nil {
				return
			}

			switch msgType {
			case websocket.BinaryMessage:
				sess.Write(data)
			case websocket.TextMessage:
				var ctrl ControlMessage
				if err := json.Unmarshal(data, &ctrl); err != nil {
					continue
				}
				switch ctrl.Type {
				case "resize":
					if ctrl.Cols > 0 && ctrl.Rows > 0 {
						sess.Resize(ctrl.Cols, ctrl.Rows)
						h.tmuxMgr.Resize(sessionID, ctrl.Cols, ctrl.Rows)
					}
				case "ping":
					conn.WriteJSON(ControlMessage{Type: "pong"})
				}
			}
		}
	}()

	<-done
}
