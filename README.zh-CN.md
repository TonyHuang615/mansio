# LociTerm

[English](README.md) | **中文** | [한국어](README.ko.md)

支持持久会话的基于 Web 的多终端服务器。在桌面或移动端浏览器中访问服务器终端。可在 Linux 或 macOS 上以原生安装或 Docker 方式自托管。

## 功能特性

- **工作区与标签页** — 将终端组织到工作区中，每个工作区可包含多个标签页。右键单击可重命名或删除。侧边栏会显示每个工作区最近活动终端的工作目录（CWD），一目了然。
- **持久会话 (tmux)** — 关闭浏览器，进程继续运行。重新连接时完整恢复滚动历史。会话在浏览器断开和服务器重启后均存活。
- **即时工作区切换** — 所有打开的终端都在后台保持挂载（VS Code 风格的 detach/attach），切换工作区即时完成、保留滚动历史，且不会把隐藏的终端 fit 到 0×0 而破坏布局。
- **鼠标模式** — 在终端内原生支持滚动、拖选与点击（默认启用 tmux mouse mode）。
- **单文件二进制** — 约 10MB 的 Go 二进制文件，内嵌 React 前端。除 `tmux` 外无其他外部依赖。
- **浅色 / 深色 / 系统主题** — 自动跟随系统偏好，或固定为浅色/深色。ANSI 调色板针对两种背景均经过 ≥4.5:1 对比度调优。
- **拖放上传** — 将文件拖入终端即可上传，结果路径会自动粘贴到提示符。
- **Shift+Enter 换行** — 输入字面换行而不提交命令（在 REPL 和 AI CLI 的多行输入中很有用）。
- **移动端友好** — 在窄屏上侧边栏自动折叠，并提供触摸友好的命中区域。
- **密码认证** — bcrypt 哈希 + HttpOnly 会话 Cookie。首次启动时设置。
- **CJK 支持** — 完整 Unicode 支持，包括中/韩/日字符与 Box-drawing 字符。
- **两种部署模式** — 原生安装（与 SSH 相同的主机访问）或 Docker（隔离环境）。

## 部署

### 方式一：原生安装（Linux systemd 或 macOS launchd）

Web 终端将拥有与直接登录主机相同的访问权限 — 相同的文件、工具与环境。

**前置条件：** Go 1.22+, Node.js 20+, tmux, git

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal

# Linux
sudo bash deploy/install.sh

# macOS（脚本本身无需 sudo，仅在写入 /usr/local/bin 时内部调用 sudo）
bash deploy/install.sh
```

安装脚本会自动检测操作系统、从源码构建、将二进制安装到 `/usr/local/bin/lociterm`，并注册系统服务。

#### Linux (systemd)

```bash
systemctl status lociterm@$(whoami)
systemctl restart lociterm@$(whoami)
journalctl -u lociterm@$(whoami) -f

# 自定义端口
sudo bash deploy/install.sh --port 3000

# 卸载
sudo bash deploy/uninstall.sh
```

数据目录：`/var/lib/lociterm`

#### macOS (launchd)

```bash
launchctl list | grep lociterm                       # 状态
launchctl stop  com.loci-terminal.lociterm           # 停止
launchctl start com.loci-terminal.lociterm           # 启动
tail -f ~/Library/Logs/lociterm/stdout.log           # 日志

# 卸载
bash deploy/uninstall.sh
```

数据目录：`~/.local/share/lociterm` · 日志：`~/Library/Logs/lociterm/`

> **macOS 完全磁盘访问权限：** macOS 会沙盒化对 `~/Documents`、`~/Desktop` 等目录的访问。LociTerm 在首次启动时会调用 `/api/v1/health` 检查权限，若被阻止则在 Web UI 中以全屏模态显示分步指引（系统设置 → 隐私与安全性 → 完全磁盘访问 → 添加 `/usr/local/bin/lociterm`）。安装脚本也会自动打开对应的系统设置面板。

**Cloudflare Tunnel：** 开箱即用。将隧道指向 `http://localhost:8080`，Cloudflare 自动处理 HTTPS 与 WebSocket 代理。

### 方式二：Docker（隔离环境）

在预装 Node.js 20、Python 3 与构建工具的 Ubuntu 24.04 容器中运行。主目录通过 Docker 卷在容器重启后持久化。

```bash
git clone https://github.com/Younkyum/Loci-Terminal.git
cd Loci-Terminal
docker compose up -d --build
# 访问 http://localhost:8080
```

**容器重启后保留的内容：**
- `/home/lociterm` — 已安装的工具、项目文件、Shell 配置（Docker 卷）
- `/data` — 工作区/会话元数据（Docker 卷）

**不保留的内容：**
- tmux 会话（运行中的进程）— 容器重启时终止
- 通过 `apt` 安装的系统包 — 需添加到 Dockerfile 中以永久保留

### CLI 选项

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
│ Drop  ──multipart─────────────> /api/v1/sessions/:id/upload      │
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
| 后端 | Go（stdlib `net/http`）, gorilla/websocket, creack/pty |
| 持久化 | tmux（会话）, SQLite via `modernc.org/sqlite`（元数据） |
| 认证 | bcrypt + HttpOnly 会话 Cookie（7 天过期） |
| 部署 | systemd（Linux）· launchd（macOS）· Docker 多阶段构建（Ubuntu 24.04） |

### tmux 持久化原理

```
1. 创建标签页  → tmux new-session -d -s lt_{id} -c $HOME
2. 浏览器连接  → creack/pty 启动 "tmux attach -t lt_{id}"
                PTY fd 桥接到 WebSocket（二进制帧）
3. 浏览器关闭  → PTY（attach 进程）终止
                tmux 会话在后台继续运行
4. 重新连接    → 新的 "tmux attach" → 滚动历史 + 进程恢复
5. 删除标签页  → tmux kill-session -t lt_{id}
```

tmux 服务器独立于 Go 进程运行。即使 Go 服务器崩溃或重启，tmux 会话也不会丢失（仅限原生安装 — Docker 容器重启时 tmux 会话会丢失）。

### WebSocket 协议

同一连接上使用两种帧类型：

| 方向 | 类型 | 内容 |
|------|------|------|
| 客户端 → 服务器 | Binary | 终端 stdin（键盘输入） |
| 服务器 → 客户端 | Binary | 终端 stdout（输出） |
| 客户端 → 服务器 | Text（JSON） | `{ type: "resize", cols, rows }` |
| 服务器 → 客户端 | Text（JSON） | `{ type: "attached" }`, `{ type: "pong" }` |

二进制帧传输原始终端 I/O，零编码开销。

### 文件上传

将文件拖到终端面板上 → 通过 `multipart/form-data` POST 至 `/api/v1/sessions/:id/upload`，保存到 `~/uploads/` 下（自动避免文件名冲突），生成的绝对路径会粘贴到终端，便于直接用于下一条命令。默认上限：**每次上传 100 MiB**。

### REST API

```
GET    /api/v1/health                # 健康检查 + macOS 权限状态

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

POST   /api/v1/sessions/:id/upload        # multipart/form-data 文件上传
GET    /api/v1/ws/terminal/:sessionId     # WebSocket 终端
```

## 项目结构

```
loci-terminal/
├── cmd/lociterm/main.go              # 入口点、embed.FS、优雅关闭
├── internal/
│   ├── server/                        # HTTP 路由、认证中间件、/health
│   ├── api/                           # REST 处理器（workspace, session, auth, upload）
│   ├── ws/                            # WebSocket 升级 + PTY 桥接
│   ├── tmux/                          # tmux 会话生命周期管理
│   ├── store/                         # SQLite 持久化 + 迁移
│   └── model/                         # 数据结构体
├── frontend/src/
│   ├── components/
│   │   ├── Auth/LoginForm.tsx         # 登录/设置表单
│   │   ├── Sidebar/Sidebar.tsx        # 工作区列表 + 主题切换 + 上下文菜单
│   │   └── Terminal/                  # TabBar, TerminalPanel, TerminalView（拖放区）
│   ├── hooks/
│   │   ├── useTerminal.ts             # xterm.js + WebSocket 生命周期
│   │   ├── useEffectiveTheme.ts       # system/light/dark 解析器
│   │   ├── useMediaQuery.ts           # 移动端断点检测
│   │   └── shiftEnter.ts              # Shift+Enter → 字面换行
│   ├── stores/
│   │   ├── appStore.ts                # Zustand：工作区/会话/活动状态
│   │   └── themeStore.ts              # 持久化的主题模式
│   ├── api/upload.ts                  # 多部分上传客户端
│   └── lib/
│       ├── theme.ts                   # 浅色/深色 UI 调色板与 xterm 主题
│       └── contrast.ts                # WCAG 对比度工具（测试中使用）
├── deploy/
│   ├── install.sh                    # 跨平台安装脚本（Linux+macOS）
│   ├── uninstall.sh                  # 跨平台卸载脚本
│   └── lociterm.service              # systemd 单元模板（Linux）
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

# 构建单文件自包含二进制
make build             # → ./lociterm
```

## 设计决策

| 决策 | 理由 |
|------|------|
| **Go stdlib `net/http`** | 约 14 个端点。Go 1.22+ ServeMux 原生支持方法+路径路由。 |
| **modernc.org/sqlite** | 纯 Go 实现，无需 CGo。支持静态二进制和交叉编译。 |
| **tmux 持久化** | 会话在浏览器关闭和服务器重启后均存活。独立进程。 |
| **二进制 WebSocket 帧** | 零编码开销。高吞吐量终端输出必需。 |
| **HttpOnly 会话 Cookie（非 JWT）** | 单用户自托管场景更简单且可撤销。 |
| **按生效主题分别配色** | 浅色/深色主题在 `theme.test.ts` 中均经 ≥4.5:1 对比度验证。 |
| **Ubuntu 24.04（Docker）** | 基于 glibc，工具兼容性更好（Node.js、AI CLI 等）。 |

## 安全注意事项

- 原生安装与 SSH 具有相同的访问级别 — 请使用强密码
- 生产环境务必使用 HTTPS（推荐 Cloudflare Tunnel）
- 通过防火墙或 VPN 限制端口访问
- Docker 模式提供隔离 — 无法访问卷之外的主机文件
- 上传经过 sanitize（防路径穿越、NUL 字节）并限制为 100 MiB
- 会话 7 天后过期；登出立即失效

## 路线图

- [ ] 代码审查面板（git diff 查看器）
- [ ] 多用户支持
- [ ] 标签页拖拽排序
- [ ] 终端滚动历史搜索
- [ ] 自定义主题预设
- [ ] HTTPS/TLS 内置支持

完整待办见 [TODO.md](TODO.md)。

## 许可证

MIT
