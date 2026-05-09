# LociTerm

[한국어](README.ko.md) | [中文](README.zh-CN.md) | **English**

Web-based multi-terminal server with persistent sessions. Access your machine's terminal from any browser — desktop or mobile. Self-hostable on Linux or macOS via native install or Docker.

## Features

- **Workspaces & Tabs** — Group terminals into workspaces, each holding multiple tabs. Right-click to rename or delete. The sidebar shows each workspace's last-active working directory at a glance.
- **Persistent Sessions (tmux)** — Close the browser; processes keep running. Reconnect anytime with full scrollback restored. Sessions survive both browser disconnects and server restarts.
- **Instant Workspace Switching** — Every open terminal stays mounted in the background (VS Code–style detach/attach), so switching workspaces is immediate, scrollback-preserving, and never re-fits a hidden terminal to 0×0.
- **Mouse Mode** — Scroll, select, and click work natively inside the terminal (tmux mouse mode is enabled by default).
- **Single Binary** — ~10MB Go binary with the React frontend embedded. Only external dependency is `tmux`.
- **Light / Dark / System Theme** — Auto-follows OS preference, or pin to light/dark. ANSI palettes are tuned for ≥4.5:1 contrast on either background.
- **Drag-and-Drop Upload** — Drop files onto the terminal to upload them; the path is pasted at the prompt, ready to use.
- **Shift+Enter for Newline** — Send a literal newline without submitting (helpful for multi-line input in REPLs and AI CLIs).
- **Mobile-Friendly** — Responsive sidebar that collapses on narrow screens; touch-sized hit targets throughout.
- **Password Auth** — bcrypt-hashed password with HttpOnly session cookies. Set on first launch.
- **CJK Support** — Full Unicode including Korean / Chinese / Japanese characters and box-drawing glyphs.
- **Two Deployment Modes** — Native install (full host access, like SSH) or Docker (isolated environment).

## Deployment

### Option 1: Native Install (Linux systemd or macOS launchd)

The web terminal will have the same access as logging into the machine directly — same files, same tools, same environment.

**Prerequisites:** Go 1.22+, Node.js 20+, tmux, git

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal

# Linux
sudo bash deploy/install.sh

# macOS (no sudo for the script itself; it will sudo for /usr/local/bin)
bash deploy/install.sh
```

The installer detects the OS, builds from source, installs the binary to `/usr/local/bin/lociterm`, and registers a service.

#### Linux (systemd)

```bash
systemctl status lociterm@$(whoami)
systemctl restart lociterm@$(whoami)
journalctl -u lociterm@$(whoami) -f

# Custom port
sudo bash deploy/install.sh --port 3000

# Uninstall
sudo bash deploy/uninstall.sh
```

Data dir: `/var/lib/lociterm`

#### macOS (launchd)

```bash
launchctl list | grep lociterm                       # status
launchctl stop  com.loci-terminal.lociterm           # stop
launchctl start com.loci-terminal.lociterm           # start
tail -f ~/Library/Logs/lociterm/stdout.log           # logs

# Uninstall
bash deploy/uninstall.sh
```

Data dir: `~/.local/share/lociterm` · Logs: `~/Library/Logs/lociterm/`

> **macOS Full Disk Access:** macOS sandboxes access to `~/Documents`, `~/Desktop`, etc. On first launch, LociTerm checks `/api/v1/health`, and if those directories are unreadable, the web UI shows a full-screen modal with step-by-step instructions: System Settings → Privacy & Security → Full Disk Access → add `/usr/local/bin/lociterm`. The installer also opens System Settings to the right pane automatically.

**Cloudflare Tunnel:** Works out of the box. Point your tunnel at `http://localhost:8080` — Cloudflare handles HTTPS and WebSocket proxying.

### Option 2: Docker (Isolated environment)

Runs in an isolated Ubuntu 24.04 container preloaded with Node.js 20, Python 3, and build tools. The home directory persists across container restarts via a Docker volume.

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
docker compose up -d --build
# Open http://localhost:8080
```

**Persists across container restarts:**
- `/home/lociterm` — installed tools, project files, shell configs (Docker volume)
- `/data` — workspace/session metadata (Docker volume)

**Does NOT persist:**
- tmux sessions (running processes) — killed when the container restarts
- System packages installed via `apt` — bake into the Dockerfile to make them permanent

### CLI Options

| Flag | Description | Default |
|------|-------------|---------|
| `--port` | Server port | `8080` |
| `--data-dir` | SQLite database directory | `./data` |

## Architecture

```
Browser                            Go server (single binary)
┌─────────────────────┐           ┌──────────────────────────────────┐
│ React + xterm.js    │           │ net/http ServeMux                │
│                     │           │                                  │
│ Sidebar ──REST──────────────────> /api/v1/workspaces               │
│ TabBar  ──REST──────────────────> /api/v1/sessions                 │
│ Drop    ──multipart─────────────> /api/v1/sessions/:id/upload      │
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
| Backend | Go (stdlib `net/http`), gorilla/websocket, creack/pty |
| Persistence | tmux (sessions), SQLite via `modernc.org/sqlite` (metadata) |
| Auth | bcrypt + HttpOnly session cookie (7-day expiry) |
| Deploy | systemd (Linux) · launchd (macOS) · Docker multi-stage build (Ubuntu 24.04) |

### How tmux Persistence Works

```
1. Tab created    → tmux new-session -d -s lt_{id} -c $HOME
2. Browser opens  → creack/pty spawns "tmux attach -t lt_{id}"
                    PTY fd is bridged to WebSocket (binary frames)
3. Browser closes → PTY (attach process) terminates
                    tmux session keeps running in the background
4. Reconnect      → new "tmux attach" → scrollback + processes restored
5. Tab deleted    → tmux kill-session -t lt_{id}
```

The tmux server runs independently from the Go process. Even if the Go server crashes or restarts, tmux sessions survive (native install only — Docker containers lose tmux sessions on restart).

### WebSocket Protocol

Two frame types over a single connection:

| Direction | Type | Content |
|-----------|------|---------|
| Client → Server | Binary | Terminal stdin (keystrokes) |
| Server → Client | Binary | Terminal stdout (output) |
| Client → Server | Text (JSON) | `{ type: "resize", cols, rows }` |
| Server → Client | Text (JSON) | `{ type: "attached" }`, `{ type: "pong" }` |

Binary frames carry raw terminal I/O with zero encoding overhead.

### File Upload

Drag a file onto the terminal pane → it's POSTed as `multipart/form-data` to `/api/v1/sessions/:id/upload`, saved under `~/uploads/` (with name collision avoidance), and the resulting absolute path is pasted into the terminal so you can chain it into the next command. Default cap: **100 MiB per upload**.

### REST API

```
GET    /api/v1/health                # Liveness + macOS permission status

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

POST   /api/v1/sessions/:id/upload        # multipart/form-data file upload
GET    /api/v1/ws/terminal/:sessionId     # WebSocket terminal
```

## Project Structure

```
loci-terminal/
├── cmd/lociterm/main.go              # Entrypoint, embed.FS, graceful shutdown
├── internal/
│   ├── server/                        # HTTP routing, auth middleware, /health
│   ├── api/                           # REST handlers (workspace, session, auth, upload)
│   ├── ws/                            # WebSocket upgrade + PTY bridge
│   ├── tmux/                          # tmux session lifecycle management
│   ├── store/                         # SQLite persistence + migrations
│   └── model/                         # Data structs
├── frontend/src/
│   ├── components/
│   │   ├── Auth/LoginForm.tsx         # Login / setup form
│   │   ├── Sidebar/Sidebar.tsx        # Workspace list + theme toggle + context menu
│   │   └── Terminal/                  # TabBar, TerminalPanel, TerminalView (drop zone)
│   ├── hooks/
│   │   ├── useTerminal.ts             # xterm.js + WebSocket lifecycle
│   │   ├── useEffectiveTheme.ts       # system/light/dark resolver
│   │   ├── useMediaQuery.ts           # Mobile breakpoint detector
│   │   └── shiftEnter.ts              # Shift+Enter → literal newline
│   ├── stores/
│   │   ├── appStore.ts                # Zustand: workspaces/sessions/active
│   │   └── themeStore.ts              # Persisted theme mode
│   ├── api/upload.ts                  # Multipart upload client
│   └── lib/
│       ├── theme.ts                   # Light + dark UI palettes & xterm themes
│       └── contrast.ts                # WCAG contrast helper (used by tests)
├── deploy/
│   ├── install.sh                    # Cross-platform installer (Linux+macOS)
│   ├── uninstall.sh                  # Cross-platform uninstaller
│   └── lociterm.service              # systemd unit template (Linux)
├── Dockerfile                         # Multi-stage build (Ubuntu 24.04 runtime)
├── docker-compose.yml                 # Docker deployment with persistent volumes
└── Makefile
```

## Development

```bash
make test              # Run all tests (Go + frontend)
make test-go           # Go tests only
make test-frontend     # Frontend tests only

# Dev mode (two terminals)
make dev-backend       # Terminal 1: Go server on :8080
make dev-frontend      # Terminal 2: Vite dev server with proxy

# Build a single self-contained binary
make build             # → ./lociterm
```

## Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Go stdlib `net/http`** | ~14 endpoints. Go 1.22+ ServeMux handles method+path routing natively. |
| **modernc.org/sqlite** | Pure Go, no CGo. Static binary, easy cross-compilation. |
| **tmux for persistence** | Sessions survive browser close AND server restart. Independent process. |
| **Binary WebSocket frames** | Zero encoding overhead. Critical for high-throughput terminal output. |
| **HttpOnly session cookie (not JWT)** | Simpler and revocable for single-user self-hosting. |
| **Per-effective-theme xterm palette** | Light/dark themes verified against ≥4.5:1 contrast in `theme.test.ts`. |
| **Ubuntu 24.04 (Docker)** | glibc-based for tool compatibility (Node.js, AI CLIs, etc.). |

## Security Notes

- Native install grants the same access level as SSH — use a strong password.
- Always front the server with HTTPS in production (Cloudflare Tunnel recommended).
- Restrict port access via firewall or VPN.
- Docker mode provides isolation — host files outside the volume are not accessible.
- Uploads are sanitized (no path traversal, no NUL bytes) and capped at 100 MiB.
- Sessions expire after 7 days; logout invalidates immediately.

## Roadmap

- [ ] Code Review panel (git diff viewer)
- [ ] Multi-user support
- [ ] Tab drag-to-reorder
- [ ] Terminal scrollback search
- [ ] Custom theme presets
- [ ] HTTPS/TLS built-in support

See [TODO.md](TODO.md) for the full backlog.

## License

MIT
