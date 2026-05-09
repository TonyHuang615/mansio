# Loci Terminal

[한국어](README.ko.md) | [中文](README.zh-CN.md) | **English**

Web-based multi-terminal server with persistent sessions. Access your server's terminal from any browser. Self-hostable via Docker or native installation.

## Features

- **Workspaces & Tabs** — Organize terminals into persistent workspace groups. Each workspace holds multiple tabs. Right-click to rename or delete.
- **Persistent Sessions (tmux)** — Close the browser, your processes keep running. Reconnect anytime with full scrollback restored. Sessions survive both browser disconnects and server restarts.
- **Single Binary** — ~10MB Go binary with React frontend embedded. No external dependencies except tmux.
- **Password Authentication** — bcrypt-hashed password with session cookies. Set a password on first launch.
- **CJK Support** — Full Unicode support including Korean, Chinese, Japanese characters and box-drawing glyphs.
- **Two Deployment Modes** — Native host install (full host access, like SSH) or Docker (isolated environment).

## Deployment

### Option 1: Native Host Install (Recommended for full host access)

Your web terminal will have the same access as logging into the server directly — same files, same tools, same environment.

**Prerequisites:** Go 1.22+, Node.js 20+, tmux

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
sudo bash deploy/install.sh
```

The install script builds from source, installs the binary, and sets up a systemd service.

```bash
# Management
systemctl status lociterm@$(whoami)
systemctl restart lociterm@$(whoami)
journalctl -u lociterm@$(whoami) -f

# Custom port
sudo bash deploy/install.sh --port 3000

# Uninstall
sudo bash deploy/uninstall.sh
```

**Cloudflare Tunnel:** Works out of the box. Point your tunnel to `http://localhost:8080` — Cloudflare handles HTTPS and WebSocket proxying automatically.

### Option 2: Docker (Isolated environment)

Runs in an isolated Ubuntu 24.04 container with Node.js 20, Python3, and build tools pre-installed. Home directory is persisted across container restarts via Docker volume.

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
docker compose up -d --build
# Open http://localhost:8080
```

**What persists across container restarts:**
- `/home/lociterm` — installed tools, project files, shell configs (Docker volume)
- `/data` — workspace/session metadata (Docker volume)

**What does NOT persist:**
- tmux sessions (running processes) — killed when container restarts
- System-level packages installed via `apt` — use Dockerfile to add permanently

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port` | Server port | `8080` |
| `--data-dir` | SQLite database directory | `./data` |

## Architecture

```
Browser                            Go Server (single binary)
┌─────────────────────┐           ┌──────────────────────────────────┐
│ React + xterm.js    │           │ net/http ServeMux                │
│                     │           │                                  │
│ Sidebar ──REST──────────────────> /api/v1/workspaces               │
│ TabBar  ──REST──────────────────> /api/v1/sessions                 │
│ xterm.js ═══WS══════════════════> /api/v1/ws/terminal/:id          │
│  binary frames (I/O) │          │   ├── tmux.Manager               │
│  JSON (control)      │          │   │   └── tmux sessions (persist)│
│                      │          │   └── store (SQLite)             │
└──────────────────────┘          └──────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, xterm.js, Zustand, Vite |
| Backend | Go (stdlib net/http), gorilla/websocket, creack/pty |
| Persistence | tmux (sessions), SQLite via modernc.org/sqlite (metadata) |
| Auth | bcrypt + session cookie |
| Deploy | systemd service or Docker multi-stage build (Ubuntu 24.04) |

### How tmux Persistence Works

```
1. Tab created    → tmux new-session -d -s lt_{id} -c $HOME
2. Browser opens  → creack/pty spawns "tmux attach -t lt_{id}"
                    PTY fd is bridged to WebSocket (binary frames)
3. Browser closes → PTY (attach process) terminates
                    tmux session keeps running in background
4. Reconnect      → new "tmux attach" → scrollback + processes restored
5. Tab deleted    → tmux kill-session -t lt_{id}
```

The tmux server runs independently from the Go process. Even if the Go server crashes or restarts, tmux sessions survive (native install only — Docker containers lose tmux sessions on restart).

### WebSocket Protocol

Two frame types on the same connection:

| Direction | Type | Content |
|-----------|------|---------|
| Client → Server | Binary | Terminal stdin (keystrokes) |
| Server → Client | Binary | Terminal stdout (output) |
| Client → Server | Text (JSON) | `{ type: "resize", cols, rows }` |
| Server → Client | Text (JSON) | `{ type: "attached" }`, `{ type: "pong" }` |

Binary frames carry raw terminal I/O with zero encoding overhead.

### REST API

```
POST   /api/v1/auth/setup            # First-run password setup
POST   /api/v1/auth/login            # Login
POST   /api/v1/auth/logout           # Logout
GET    /api/v1/auth/check            # Check auth state

GET    /api/v1/workspaces            # List workspaces
POST   /api/v1/workspaces            # Create workspace
PATCH  /api/v1/workspaces/:id        # Rename workspace
DELETE /api/v1/workspaces/:id        # Delete workspace (cascades sessions + tmux)

GET    /api/v1/workspaces/:wid/sessions   # List sessions
POST   /api/v1/workspaces/:wid/sessions   # Create session
PATCH  /api/v1/sessions/:id               # Rename session
DELETE /api/v1/sessions/:id               # Delete session (kills tmux)

GET    /api/v1/ws/terminal/:sessionId     # WebSocket terminal
```

## Project Structure

```
loci-terminal/
├── cmd/lociterm/main.go              # Entrypoint, embed.FS, graceful shutdown
├── internal/
│   ├── server/                        # HTTP routing, auth middleware
│   ├── api/                           # REST handlers (workspace, session, auth)
│   ├── ws/                            # WebSocket upgrade + PTY bridge
│   ├── tmux/                          # tmux session lifecycle management
│   ├── store/                         # SQLite persistence + migrations
│   └── model/                         # Data structs
├── frontend/src/
│   ├── components/
│   │   ├── Auth/LoginForm.tsx         # Login / setup form
│   │   ├── Sidebar/Sidebar.tsx        # Workspace list + context menu
│   │   └── Terminal/                  # TabBar, TerminalPanel, TerminalView
│   ├── hooks/useTerminal.ts           # xterm.js + WebSocket lifecycle
│   ├── stores/appStore.ts             # Zustand state management
│   └── lib/theme.ts                   # Ghostty-inspired dark theme
├── deploy/
│   ├── install.sh                     # Host install script (build + systemd)
│   ├── uninstall.sh                   # Clean removal script
│   └── lociterm.service              # systemd unit template
├── Dockerfile                         # Multi-stage build (Ubuntu 24.04 runtime)
├── docker-compose.yml                 # Docker deployment with persistent volumes
└── Makefile
```

## Development

```bash
make test              # Run all tests (Go + Frontend)
make test-go           # Go tests only
make test-frontend     # Frontend tests only

# Dev mode (two terminals)
make dev-backend       # Terminal 1: Go server on :8080
make dev-frontend      # Terminal 2: Vite dev server with proxy
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Go stdlib net/http** | ~12 endpoints. Go 1.22+ ServeMux handles method routing natively. |
| **modernc.org/sqlite** | Pure Go, no CGo. Static binary, cross-compilation. |
| **tmux for persistence** | Sessions survive browser close AND server restart. Independent process. |
| **Binary WebSocket frames** | Zero encoding overhead. Critical for high-throughput terminal output. |
| **Session cookie (not JWT)** | Simpler and revocable for single-user self-hosting. |
| **Ubuntu 24.04 (Docker)** | glibc-based for tool compatibility (Node.js, Claude Code, etc.). |

## Security Notes

- Native install exposes the same access level as SSH — use strong passwords
- Always use HTTPS in production (Cloudflare Tunnel recommended)
- Restrict port access via firewall or VPN
- Docker mode provides isolation — host files are not accessible

## Roadmap

- [ ] Code Review panel (git diff viewer)
- [ ] Multi-user support
- [ ] Tab drag-to-reorder
- [ ] Terminal search
- [ ] Custom themes
- [ ] HTTPS/TLS built-in support

## License

MIT
