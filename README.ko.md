# LociTerm

[English](README.md) | [中文](README.zh-CN.md) | **한국어**

영구 세션을 지원하는 웹 기반 멀티 터미널 서버. 데스크톱/모바일 어떤 브라우저에서도 서버 터미널에 접속할 수 있습니다. Linux, macOS에서 네이티브 설치 또는 Docker로 셀프 호스팅이 가능합니다.

## 주요 기능

- **워크스페이스와 탭** — 터미널을 워크스페이스로 그룹화하고, 각 워크스페이스에 여러 탭을 둘 수 있습니다. 우클릭으로 이름 변경/삭제.
- **영구 세션 (tmux)** — 브라우저를 닫아도 프로세스는 계속 실행됩니다. 재접속 시 스크롤백 그대로 복원되며, 서버 재시작 후에도 세션이 살아 있습니다.
- **단일 바이너리** — React 프론트엔드를 임베드한 ~10MB Go 바이너리. 외부 의존성은 `tmux` 뿐입니다.
- **라이트 / 다크 / 시스템 테마** — OS 설정을 자동으로 따라가거나 라이트/다크에 고정. ANSI 팔레트는 양쪽 배경에서 모두 ≥4.5:1 대비를 만족하도록 튜닝되어 있습니다.
- **드래그 앤 드롭 업로드** — 파일을 터미널에 드롭하면 업로드되고, 결과 경로가 프롬프트에 자동으로 붙여 넣어집니다.
- **Shift+Enter 줄바꿈** — 명령을 실행하지 않고 리터럴 개행만 입력합니다 (REPL, AI CLI에서 멀티라인 입력에 유용).
- **모바일 친화적 UI** — 좁은 화면에서는 사이드바가 접히고, 터치에 적합한 히트 영역을 제공합니다.
- **비밀번호 인증** — bcrypt 해시 + HttpOnly 세션 쿠키. 첫 실행 시 설정합니다.
- **CJK 지원** — 한국어/중국어/일본어와 Box-drawing 문자를 포함한 전체 유니코드 지원.
- **두 가지 배포 모드** — 네이티브 설치 (SSH 수준의 호스트 접근) 또는 Docker (격리 환경).

## 배포

### 방법 1: 네이티브 설치 (Linux systemd 또는 macOS launchd)

웹 터미널이 직접 로그인한 것과 동일한 환경을 가집니다 — 같은 파일, 같은 도구, 같은 환경.

**사전 요구사항:** Go 1.22+, Node.js 20+, tmux, git

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal

# Linux
sudo bash deploy/install.sh

# macOS (스크립트 자체에는 sudo 불필요. /usr/local/bin 설치 시 내부적으로 sudo 호출)
bash deploy/install.sh
```

설치 스크립트는 OS를 감지하고, 소스에서 빌드하고, 바이너리를 `/usr/local/bin/lociterm`에 설치한 뒤 서비스를 등록합니다.

#### Linux (systemd)

```bash
systemctl status lociterm@$(whoami)
systemctl restart lociterm@$(whoami)
journalctl -u lociterm@$(whoami) -f

# 포트 변경
sudo bash deploy/install.sh --port 3000

# 제거
sudo bash deploy/uninstall.sh
```

데이터 디렉토리: `/var/lib/lociterm`

#### macOS (launchd)

```bash
launchctl list | grep lociterm                       # 상태
launchctl stop  com.loci-terminal.lociterm           # 중지
launchctl start com.loci-terminal.lociterm           # 시작
tail -f ~/Library/Logs/lociterm/stdout.log           # 로그

# 제거
bash deploy/uninstall.sh
```

데이터 디렉토리: `~/.local/share/lociterm` · 로그: `~/Library/Logs/lociterm/`

> **macOS Full Disk Access:** macOS는 `~/Documents`, `~/Desktop` 등에 대한 접근을 샌드박싱합니다. LociTerm은 첫 실행 시 `/api/v1/health`를 호출해 권한을 확인하고, 접근이 막혀 있으면 웹 UI에 전체 화면 모달로 단계별 안내를 표시합니다 (System Settings → Privacy & Security → Full Disk Access → `/usr/local/bin/lociterm` 추가). 설치 스크립트도 해당 시스템 설정 화면을 자동으로 열어줍니다.

**Cloudflare Tunnel:** 별도 설정 없이 동작합니다. 터널을 `http://localhost:8080`에 연결하면 Cloudflare가 HTTPS와 WebSocket 프록시를 자동 처리합니다.

### 방법 2: Docker (격리 환경)

Node.js 20, Python 3, 빌드 도구가 미리 설치된 Ubuntu 24.04 컨테이너에서 실행됩니다. 홈 디렉토리는 Docker 볼륨으로 컨테이너 재시작 시에도 유지됩니다.

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
docker compose up -d --build
# http://localhost:8080 접속
```

**컨테이너 재시작 시 유지되는 것:**
- `/home/lociterm` — 설치한 도구, 프로젝트 파일, 셸 설정 (Docker 볼륨)
- `/data` — 워크스페이스/세션 메타데이터 (Docker 볼륨)

**유지되지 않는 것:**
- tmux 세션 (실행 중 프로세스) — 컨테이너 재시작 시 종료
- `apt`로 설치한 시스템 패키지 — Dockerfile에 추가해야 영구 반영

### CLI 옵션

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--port` | 서버 포트 | `8080` |
| `--data-dir` | SQLite 데이터베이스 디렉토리 | `./data` |

## 아키텍처

```
브라우저                            Go 서버 (단일 바이너리)
┌─────────────────────┐           ┌──────────────────────────────────┐
│ React + xterm.js    │           │ net/http ServeMux                │
│                     │           │                                  │
│ 사이드바 ──REST──────────────────> /api/v1/workspaces               │
│ 탭바    ──REST──────────────────> /api/v1/sessions                  │
│ Drop    ──multipart─────────────> /api/v1/sessions/:id/upload      │
│ xterm.js ═══WS═════════════════> /api/v1/ws/terminal/:id           │
│  binary 프레임 (I/O)  │         │   ├── tmux.Manager               │
│  JSON (제어)          │         │   │   └── tmux 세션 (영구)        │
│                      │          │   └── store (SQLite)             │
└──────────────────────┘          └──────────────────────────────────┘
```

### 기술 스택

| 계층 | 기술 |
|------|------|
| 프론트엔드 | React 19, TypeScript, xterm.js, Zustand, Vite |
| 백엔드 | Go (stdlib `net/http`), gorilla/websocket, creack/pty |
| 영속성 | tmux (세션), SQLite via `modernc.org/sqlite` (메타데이터) |
| 인증 | bcrypt + HttpOnly 세션 쿠키 (7일 만료) |
| 배포 | systemd (Linux) · launchd (macOS) · Docker 멀티스테이지 빌드 (Ubuntu 24.04) |

### tmux 영속성 동작 방식

```
1. 탭 생성     → tmux new-session -d -s lt_{id} -c $HOME
2. 브라우저 접속 → creack/pty가 "tmux attach -t lt_{id}" 실행
                  PTY fd를 WebSocket에 브릿지 (binary 프레임)
3. 브라우저 종료 → PTY (attach 프로세스)만 종료
                  tmux 세션은 백그라운드에서 계속 실행
4. 재접속      → 새로운 "tmux attach" → 스크롤백 + 프로세스 복원
5. 탭 삭제     → tmux kill-session -t lt_{id}
```

tmux 서버는 Go 프로세스와 독립적으로 동작합니다. Go 서버가 크래시하거나 재시작해도 tmux 세션은 유지됩니다 (네이티브 설치에만 해당 — Docker는 컨테이너 재시작 시 tmux 세션 소멸).

### WebSocket 프로토콜

하나의 연결에서 두 종류의 프레임을 사용합니다:

| 방향 | 타입 | 내용 |
|------|------|------|
| 클라이언트 → 서버 | Binary | 터미널 stdin (키 입력) |
| 서버 → 클라이언트 | Binary | 터미널 stdout (출력) |
| 클라이언트 → 서버 | Text (JSON) | `{ type: "resize", cols, rows }` |
| 서버 → 클라이언트 | Text (JSON) | `{ type: "attached" }`, `{ type: "pong" }` |

Binary 프레임은 인코딩 오버헤드 없이 터미널 I/O를 직접 전달합니다.

### 파일 업로드

터미널 패널에 파일을 드롭하면 `multipart/form-data`로 `/api/v1/sessions/:id/upload`에 POST 되고, `~/uploads/` 아래에 저장됩니다 (이름 충돌 시 자동 회피). 저장된 절대 경로가 터미널에 붙여 넣어져 바로 다음 명령에 활용할 수 있습니다. 기본 한도: **업로드당 100 MiB**.

### REST API

```
GET    /api/v1/health                # 헬스체크 + macOS 권한 상태

POST   /api/v1/auth/setup            # 초기 비밀번호 설정
POST   /api/v1/auth/login            # 로그인
POST   /api/v1/auth/logout           # 로그아웃
GET    /api/v1/auth/check            # 인증 상태 확인

GET    /api/v1/workspaces            # 워크스페이스 목록
POST   /api/v1/workspaces            # 워크스페이스 생성
PATCH  /api/v1/workspaces/:id        # 워크스페이스 이름 변경
DELETE /api/v1/workspaces/:id        # 워크스페이스 삭제 (세션 + tmux 함께 삭제)

GET    /api/v1/workspaces/:wid/sessions   # 세션 목록
POST   /api/v1/workspaces/:wid/sessions   # 세션 생성
PATCH  /api/v1/sessions/:id               # 세션 이름 변경
DELETE /api/v1/sessions/:id               # 세션 삭제 (tmux 종료)

POST   /api/v1/sessions/:id/upload        # multipart/form-data 파일 업로드
GET    /api/v1/ws/terminal/:sessionId     # WebSocket 터미널
```

## 프로젝트 구조

```
loci-terminal/
├── cmd/lociterm/main.go              # 진입점, embed.FS, graceful shutdown
├── internal/
│   ├── server/                        # HTTP 라우팅, 인증 미들웨어, /health
│   ├── api/                           # REST 핸들러 (workspace, session, auth, upload)
│   ├── ws/                            # WebSocket 업그레이드 + PTY 브릿지
│   ├── tmux/                          # tmux 세션 라이프사이클 관리
│   ├── store/                         # SQLite 영속성 + 마이그레이션
│   └── model/                         # 데이터 구조체
├── frontend/src/
│   ├── components/
│   │   ├── Auth/LoginForm.tsx         # 로그인/설정 폼
│   │   ├── Sidebar/Sidebar.tsx        # 워크스페이스 목록 + 테마 토글 + 컨텍스트 메뉴
│   │   └── Terminal/                  # TabBar, TerminalPanel, TerminalView (드롭 영역)
│   ├── hooks/
│   │   ├── useTerminal.ts             # xterm.js + WebSocket 라이프사이클
│   │   ├── useEffectiveTheme.ts       # system/light/dark 해석기
│   │   ├── useMediaQuery.ts           # 모바일 브레이크포인트 감지
│   │   └── shiftEnter.ts              # Shift+Enter → 리터럴 개행
│   ├── stores/
│   │   ├── appStore.ts                # Zustand: 워크스페이스/세션/활성 상태
│   │   └── themeStore.ts              # 영속화된 테마 모드
│   ├── api/upload.ts                  # 멀티파트 업로드 클라이언트
│   └── lib/
│       ├── theme.ts                   # 라이트/다크 UI 팔레트와 xterm 테마
│       └── contrast.ts                # WCAG 대비 헬퍼 (테스트에서 사용)
├── deploy/
│   ├── install.sh                    # 크로스 플랫폼 설치 스크립트 (Linux+macOS)
│   ├── uninstall.sh                  # 크로스 플랫폼 제거 스크립트
│   └── lociterm.service              # systemd 유닛 템플릿 (Linux)
├── Dockerfile                         # 멀티 스테이지 빌드 (Ubuntu 24.04 런타임)
├── docker-compose.yml                 # Docker 배포 (영구 볼륨 포함)
└── Makefile
```

## 개발

```bash
make test              # 전체 테스트 (Go + 프론트엔드)
make test-go           # Go 테스트만
make test-frontend     # 프론트엔드 테스트만

# 개발 모드 (터미널 두 개)
make dev-backend       # 터미널 1: Go 서버 (:8080)
make dev-frontend      # 터미널 2: Vite 개발 서버 (프록시)

# 단일 자체 포함 바이너리 빌드
make build             # → ./lociterm
```

## 설계 결정

| 결정 | 이유 |
|------|------|
| **Go stdlib `net/http`** | 약 14개 엔드포인트. Go 1.22+ ServeMux가 메서드+경로 라우팅을 기본 지원. |
| **modernc.org/sqlite** | 순수 Go 구현, CGo 불필요. 정적 바이너리, 손쉬운 크로스 컴파일. |
| **tmux 기반 영속성** | 브라우저 종료 + 서버 재시작에도 세션 생존. 독립 프로세스. |
| **Binary WebSocket 프레임** | 인코딩 오버헤드 제로. 고출력 터미널에 필수. |
| **HttpOnly 세션 쿠키 (JWT 아님)** | 싱글유저 셀프호스팅에 더 간단하고 취소 가능. |
| **이펙티브 테마별 xterm 팔레트** | 라이트/다크 테마 모두 `theme.test.ts`에서 ≥4.5:1 대비 검증. |
| **Ubuntu 24.04 (Docker)** | glibc 기반으로 도구 호환성 확보 (Node.js, AI CLI 등). |

## 보안 참고사항

- 네이티브 설치는 SSH와 동일한 접근 수준 — 강한 비밀번호 사용
- 프로덕션에서는 반드시 HTTPS 사용 (Cloudflare Tunnel 권장)
- 방화벽 또는 VPN으로 포트 접근 제한
- Docker 모드는 격리 제공 — 볼륨 외부 호스트 파일 접근 불가
- 업로드는 sanitize 처리됨 (경로 탈출, NUL 바이트 차단)되며 100 MiB 한도
- 세션은 7일 후 만료. 로그아웃 시 즉시 무효화

## 로드맵

- [ ] 코드 리뷰 패널 (git diff 뷰어)
- [ ] 멀티유저 지원
- [ ] 탭 드래그 정렬
- [ ] 터미널 스크롤백 검색
- [ ] 커스텀 테마 프리셋
- [ ] HTTPS/TLS 내장 지원

전체 백로그는 [TODO.md](TODO.md) 참조.

## 라이선스

MIT
