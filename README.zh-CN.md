# Loci Terminal

[English](README.md) | **中文** | [한국어](README.ko.md)

基于 Web 的多终端服务器。通过浏览器访问服务器终端。支持 Docker 或主机原生安装自托管。

## 功能特性

- **工作区与标签页** — 将终端组织到工作区中。每个工作区包含多个标签页。右键单击可重命名或删除。
- **持久会话 (tmux)** — 关闭浏览器，进程继续运行。随时重新连接，包括完整的滚动历史记录。会话在服务器重启后依然存活。
- **单文件二进制** — 约 10MB 的 Go 二进制文件，内嵌 React 前端。除 tmux 外无其他外部依赖。
- **密码认证** — bcrypt 哈希密码与会话 Cookie。首次启动时设置密码。
- **CJK 支持** — 完整的 Unicode 支持，包括中文、韩文、日文字符和 Box-drawing 字符。
- **两种部署模式** — 主机原生安装（完全主机访问，类似 SSH）或 Docker（隔离环境）。

## 部署

### 方式一：主机原生安装（需要完全主机访问时推荐）

Web 终端将拥有与直接登录服务器相同的访问权限 — 相同的文件、工具和环境。

**前置条件：** Go 1.22+, Node.js 20+, tmux

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
sudo bash deploy/install.sh
```

安装脚本从源码构建、安装二进制文件，并设置 systemd 服务。

```bash
# 管理
systemctl status ghostterm@$(whoami)
systemctl restart ghostterm@$(whoami)
journalctl -u ghostterm@$(whoami) -f

# 自定义端口
sudo bash deploy/install.sh --port 3000

# 卸载
sudo bash deploy/uninstall.sh
```

**Cloudflare Tunnel：** 开箱即用。将隧道指向 `http://localhost:8080`，Cloudflare 自动处理 HTTPS 和 WebSocket 代理。

### 方式二：Docker（隔离环境）

在隔离的 Ubuntu 24.04 容器中运行，预装 Node.js 20、Python3 和构建工具。主目录通过 Docker 卷在容器重启后持久化。

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
docker compose up -d --build
# 访问 http://localhost:8080
```

**容器重启后保留的内容：**
- `/home/ghostterm` — 已安装的工具、项目文件、Shell 配置（Docker 卷）
- `/data` — 工作区/会话元数据（Docker 卷）

**不保留的内容：**
- tmux 会话（运行中的进程）— 容器重启时终止
- 通过 `apt` 安装的系统包 — 需添加到 Dockerfile 中永久保留

### 配置选项

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port` | 服务器端口 | `8080` |
| `--data-dir` | SQLite 数据库目录 | `./data` |

## 架构

```
浏览器                              Go 服务器（单文件二进制）
┌─────────────────────┐           ┌──────────────────────────────────┐
│ React + xterm.js    │           │ net/http ServeMux                │
│                     │           │                                  │
│ 侧边栏 ──REST──────────────────> /api/v1/workspaces               │
│ 标签栏 ──REST──────────────────> /api/v1/sessions                  │
│ xterm.js ═══WS═════════════════> /api/v1/ws/terminal/:id           │
│  二进制帧（I/O）      │          │   ├── tmux.Manager               │
│  JSON（控制）         │          │   │   └── tmux 会话（持久）       │
│                      │          │   └── store（SQLite）             │
└──────────────────────┘          └──────────────────────────────────┘
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19, TypeScript, xterm.js, Zustand, Vite |
| 后端 | Go（stdlib net/http）, gorilla/websocket, creack/pty |
| 持久化 | tmux（会话）, SQLite via modernc.org/sqlite（元数据） |
| 认证 | bcrypt + 会话 Cookie |
| 部署 | systemd 服务或 Docker 多阶段构建（Ubuntu 24.04） |

### tmux 持久化原理

```
1. 创建标签页  → tmux new-session -d -s gt_{id} -c $HOME
2. 浏览器连接  → creack/pty 启动 "tmux attach -t gt_{id}"
                PTY fd 桥接到 WebSocket（二进制帧）
3. 浏览器关闭  → PTY（attach 进程）终止
                tmux 会话在后台继续运行
4. 重新连接    → 新的 "tmux attach" → 滚动历史 + 进程恢复
5. 删除标签页  → tmux kill-session -t gt_{id}
```

tmux 服务器独立于 Go 进程运行。即使 Go 服务器崩溃或重启，tmux 会话也不会丢失（仅限主机原生安装 — Docker 容器重启时 tmux 会话会丢失）。

### WebSocket 协议

同一连接上使用两种帧类型：

| 方向 | 类型 | 内容 |
|------|------|------|
| 客户端 → 服务器 | Binary | 终端 stdin（键盘输入） |
| 服务器 → 客户端 | Binary | 终端 stdout（输出） |
| 客户端 → 服务器 | Text（JSON） | `{ type: "resize", cols, rows }` |
| 服务器 → 客户端 | Text（JSON） | `{ type: "attached" }`, `{ type: "pong" }` |

二进制帧传输原始终端 I/O，零编码开销。

### REST API

```
POST   /api/v1/auth/setup            # 首次密码设置
POST   /api/v1/auth/login            # 登录
POST   /api/v1/auth/logout           # 登出
GET    /api/v1/auth/check            # 检查认证状态

GET    /api/v1/workspaces            # 列出工作区
POST   /api/v1/workspaces            # 创建工作区
PATCH  /api/v1/workspaces/:id        # 重命名工作区
DELETE /api/v1/workspaces/:id        # 删除工作区（级联删除会话 + tmux）

GET    /api/v1/workspaces/:wid/sessions   # 列出会话
POST   /api/v1/workspaces/:wid/sessions   # 创建会话
PATCH  /api/v1/sessions/:id               # 重命名会话
DELETE /api/v1/sessions/:id               # 删除会话（终止 tmux）

GET    /api/v1/ws/terminal/:sessionId     # WebSocket 终端
```

## 项目结构

```
loci-terminal/
├── cmd/ghostterm/main.go              # 入口点、embed.FS、优雅关闭
├── internal/
│   ├── server/                        # HTTP 路由、认证中间件
│   ├── api/                           # REST 处理器（workspace, session, auth）
│   ├── ws/                            # WebSocket 升级 + PTY 桥接
│   ├── tmux/                          # tmux 会话生命周期管理
│   ├── store/                         # SQLite 持久化 + 迁移
│   └── model/                         # 数据结构体
├── frontend/src/
│   ├── components/
│   │   ├── Auth/LoginForm.tsx         # 登录/设置表单
│   │   ├── Sidebar/Sidebar.tsx        # 工作区列表 + 上下文菜单
│   │   └── Terminal/                  # TabBar, TerminalPanel, TerminalView
│   ├── hooks/useTerminal.ts           # xterm.js + WebSocket 生命周期
│   ├── stores/appStore.ts             # Zustand 状态管理
│   └── lib/theme.ts                   # Ghostty 风格暗色主题
├── deploy/
│   ├── install.sh                     # 主机安装脚本（构建 + systemd）
│   ├── uninstall.sh                   # 清洁卸载脚本
│   └── ghostterm.service              # systemd 单元模板
├── Dockerfile                         # 多阶段构建（Ubuntu 24.04 运行时）
├── docker-compose.yml                 # Docker 部署（含持久卷）
└── Makefile
```

## 开发

```bash
make test              # 运行所有测试（Go + 前端）
make test-go           # 仅 Go 测试
make test-frontend     # 仅前端测试

# 开发模式（两个终端）
make dev-backend       # 终端 1：Go 服务器（:8080）
make dev-frontend      # 终端 2：Vite 开发服务器（代理）
```

## 设计决策

| 决策 | 理由 |
|------|------|
| **Go stdlib net/http** | 约 12 个端点。Go 1.22+ ServeMux 原生支持方法路由。 |
| **modernc.org/sqlite** | 纯 Go 实现，无需 CGo。支持静态二进制和交叉编译。 |
| **tmux 持久化** | 会话在浏览器关闭和服务器重启后均存活。独立进程。 |
| **二进制 WebSocket 帧** | 零编码开销。高吞吐量终端输出必需。 |
| **会话 Cookie（非 JWT）** | 单用户自托管场景更简单且可撤销。 |
| **Ubuntu 24.04（Docker）** | 基于 glibc，工具兼容性更好（Node.js、Claude Code 等）。 |

## 安全注意事项

- 主机原生安装与 SSH 具有相同的访问级别 — 请使用强密码
- 生产环境务必使用 HTTPS（推荐 Cloudflare Tunnel）
- 通过防火墙或 VPN 限制端口访问
- Docker 模式提供隔离 — 无法访问主机文件

## 路线图

- [ ] 代码审查面板（git diff 查看器）
- [ ] 多用户支持
- [ ] 标签页拖拽排序
- [ ] 终端搜索
- [ ] 自定义主题
- [ ] HTTPS/TLS 内置支持

## 许可证

MIT
