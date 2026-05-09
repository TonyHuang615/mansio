# Loci Terminal

[English](README.md) | [中文](README.zh-CN.md) | **한국어**

웹 기반 멀티 터미널 서버. 브라우저에서 서버 터미널에 접속할 수 있습니다. Docker 또는 호스트 직접 설치로 셀프 호스팅 가능합니다.

## 주요 기능

- **워크스페이스와 탭** — 터미널을 워크스페이스로 그룹화합니다. 각 워크스페이스에 여러 탭을 생성할 수 있습니다. 우클릭으로 이름 변경 및 삭제가 가능합니다.
- **영구 세션 (tmux)** — 브라우저를 닫아도 프로세스가 계속 실행됩니다. 재접속하면 스크롤백을 포함하여 이전 상태 그대로 복원됩니다. 서버 재시작 후에도 세션이 유지됩니다.
- **단일 바이너리** — React 프론트엔드가 내장된 ~10MB Go 바이너리. tmux 외에 외부 의존성이 없습니다.
- **비밀번호 인증** — bcrypt 해시 비밀번호와 세션 쿠키. 첫 실행 시 비밀번호를 설정합니다.
- **CJK 지원** — 한국어, 중국어, 일본어 및 Box-drawing 문자를 포함한 전체 유니코드 지원.
- **두 가지 배포 모드** — 호스트 직접 설치 (SSH와 동일한 접근 수준) 또는 Docker (격리된 환경).

## 배포

### 방법 1: 호스트 직접 설치 (전체 호스트 접근이 필요한 경우 권장)

웹 터미널에서 서버에 직접 로그인한 것과 동일한 환경을 제공합니다 — 동일한 파일, 도구, 환경.

**사전 요구사항:** Go 1.22+, Node.js 20+, tmux

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
sudo bash deploy/install.sh
```

설치 스크립트가 소스에서 빌드하고, 바이너리를 설치하고, systemd 서비스를 설정합니다.

```bash
# 관리
systemctl status ghostterm@$(whoami)
systemctl restart ghostterm@$(whoami)
journalctl -u ghostterm@$(whoami) -f

# 포트 변경
sudo bash deploy/install.sh --port 3000

# 제거
sudo bash deploy/uninstall.sh
```

**Cloudflare Tunnel:** 바로 사용 가능합니다. 터널을 `http://localhost:8080`으로 연결하면 Cloudflare가 HTTPS와 WebSocket 프록시를 자동으로 처리합니다.

### 방법 2: Docker (격리된 환경)

Ubuntu 24.04 컨테이너에서 Node.js 20, Python3, 빌드 도구가 미리 설치된 격리된 환경으로 실행됩니다. 홈 디렉토리는 Docker 볼륨으로 컨테이너 재시작 시에도 유지됩니다.

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
docker compose up -d --build
# http://localhost:8080 접속
```

**컨테이너 재시작 시 유지되는 것:**
- `/home/ghostterm` — 설치한 도구, 프로젝트 파일, 셸 설정 (Docker 볼륨)
- `/data` — 워크스페이스/세션 메타데이터 (Docker 볼륨)

**유지되지 않는 것:**
- tmux 세션 (실행 중인 프로세스) — 컨테이너 재시작 시 종료
- `apt`로 설치한 시스템 패키지 — Dockerfile에 추가해야 영구 반영

### 옵션

| 플래그 | 설명 | 기본값 |
|--------|------|--------|
| `--port` | 서버 포트 | `8080` |
| `--data-dir` | SQLite 데이터베이스 디렉토리 | `./data` |

## 아키텍처

```
브라우저                             Go 서버 (단일 바이너리)
┌─────────────────────┐           ┌──────────────────────────────────┐
│ React + xterm.js    │           │ net/http ServeMux                │
│                     │           │                                  │
│ 사이드바 ──REST─────────────────> /api/v1/workspaces               │
│ 탭바    ──REST─────────────────> /api/v1/sessions                  │
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
| 백엔드 | Go (stdlib net/http), gorilla/websocket, creack/pty |
| 영속성 | tmux (세션), SQLite via modernc.org/sqlite (메타데이터) |
| 인증 | bcrypt + 세션 쿠키 |
| 배포 | systemd 서비스 또는 Docker 멀티 스테이지 빌드 (Ubuntu 24.04) |

### tmux 영속성 동작 방식

```
1. 탭 생성     → tmux new-session -d -s gt_{id} -c $HOME
2. 브라우저 접속 → creack/pty가 "tmux attach -t gt_{id}" 실행
                  PTY fd를 WebSocket에 브릿지 (binary 프레임)
3. 브라우저 종료 → PTY (attach 프로세스)만 종료
                  tmux 세션은 백그라운드에서 계속 실행
4. 재접속       → 새로운 "tmux attach" → 스크롤백 + 프로세스 복원
5. 탭 삭제     → tmux kill-session -t gt_{id}
```

tmux 서버는 Go 프로세스와 독립적으로 동작합니다. Go 서버가 크래시하거나 재시작해도 tmux 세션은 유지됩니다 (호스트 직접 설치에만 해당 — Docker는 컨테이너 재시작 시 tmux 세션 소멸).

### WebSocket 프로토콜

하나의 연결에서 두 종류의 프레임을 사용합니다:

| 방향 | 타입 | 내용 |
|------|------|------|
| 클라이언트 → 서버 | Binary | 터미널 stdin (키 입력) |
| 서버 → 클라이언트 | Binary | 터미널 stdout (출력) |
| 클라이언트 → 서버 | Text (JSON) | `{ type: "resize", cols, rows }` |
| 서버 → 클라이언트 | Text (JSON) | `{ type: "attached" }`, `{ type: "pong" }` |

Binary 프레임은 인코딩 오버헤드 없이 터미널 I/O를 직접 전달합니다.

### REST API

```
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

GET    /api/v1/ws/terminal/:sessionId     # WebSocket 터미널
```

## 프로젝트 구조

```
loci-terminal/
├── cmd/ghostterm/main.go              # 진입점, embed.FS, graceful shutdown
├── internal/
│   ├── server/                        # HTTP 라우팅, 인증 미들웨어
│   ├── api/                           # REST 핸들러 (workspace, session, auth)
│   ├── ws/                            # WebSocket 업그레이드 + PTY 브릿지
│   ├── tmux/                          # tmux 세션 라이프사이클 관리
│   ├── store/                         # SQLite 영속성 + 마이그레이션
│   └── model/                         # 데이터 구조체
├── frontend/src/
│   ├── components/
│   │   ├── Auth/LoginForm.tsx         # 로그인/설정 폼
│   │   ├── Sidebar/Sidebar.tsx        # 워크스페이스 목록 + 컨텍스트 메뉴
│   │   └── Terminal/                  # TabBar, TerminalPanel, TerminalView
│   ├── hooks/useTerminal.ts           # xterm.js + WebSocket 라이프사이클
│   ├── stores/appStore.ts             # Zustand 상태 관리
│   └── lib/theme.ts                   # Ghostty 스타일 다크 테마
├── deploy/
│   ├── install.sh                     # 호스트 설치 스크립트 (빌드 + systemd)
│   ├── uninstall.sh                   # 제거 스크립트
│   └── ghostterm.service              # systemd 유닛 템플릿
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
```

## 설계 결정

| 결정 | 이유 |
|------|------|
| **Go stdlib net/http** | 12개 수준의 API. Go 1.22+ ServeMux가 메서드 라우팅을 기본 지원. |
| **modernc.org/sqlite** | 순수 Go 구현, CGo 불필요. 정적 바이너리 및 크로스 컴파일 가능. |
| **tmux 기반 영속성** | 브라우저 종료 + 서버 재시작에도 세션 생존. 독립 프로세스. |
| **Binary WebSocket 프레임** | 인코딩 오버헤드 제로. 고출력 터미널에 필수. |
| **세션 쿠키 (JWT 아님)** | 싱글유저 셀프호스팅에 더 간단하고 취소 가능. |
| **Ubuntu 24.04 (Docker)** | glibc 기반으로 도구 호환성 확보 (Node.js, Claude Code 등). |

## 보안 참고사항

- 호스트 직접 설치는 SSH와 동일한 접근 수준 — 강한 비밀번호 사용
- 프로덕션에서는 반드시 HTTPS 사용 (Cloudflare Tunnel 권장)
- 방화벽 또는 VPN으로 포트 접근 제한
- Docker 모드는 격리 제공 — 호스트 파일 접근 불가

## 로드맵

- [ ] 코드 리뷰 패널 (git diff 뷰어)
- [ ] 멀티유저 지원
- [ ] 탭 드래그 정렬
- [ ] 터미널 검색
- [ ] 커스텀 테마
- [ ] HTTPS/TLS 내장 지원

## 라이선스

MIT
