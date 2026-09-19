# Nio Service Monitor v2.0

独立的服务监控平台，**不依赖任何特定应用**。

## 特性

- 多服务监控（HTTP 端口 + 子系统）
- 实时状态面板（Web UI）
- 通过 Web API 启停服务/端口/子系统
- Token 鉴权
- Tailscale IP 自动监听
- 注册为 Windows Service（开机自启 + 自动恢复）

## 目录结构

```
C:\Nio\service-monitor\
├── package.json          # npm 清单
├── package-lock.json     # 锁定依赖
├── server.js             # 主入口（HTTP server + 探活循环）
├── config.js             # 服务配置
├── monitor.token         # 鉴权 token（首次启动自动生成）
├── lib/
│   ├── probe.js          # 探活逻辑（HTTP/CLI/WSL/Feishu）
│   ├── control.js        # 启停服务（spawn detached）
│   └── network.js        # 检测 Tailscale IP
├── public/
│   └── index.html        # Web UI（单文件）
└── scripts/
    ├── check-feishu-ws.ps1  # 探活飞书 WebSocket 连接
    └── auto-push.ps1        # GitHub 自动 push（读 GITHUB_PAT env）
```

## 安装

```powershell
cd C:\Nio\service-monitor
npm install
```

## 运行

### 方式 1：Windows Service（推荐）

```powershell
# 注册（需要管理员）
powershell -ExecutionPolicy Bypass -File C:\Nio\watchdog\register-monitor.ps1

# 启停
sc start NioServiceMonitor
sc stop NioServiceMonitor

# 查状态
sc query NioServiceMonitor
```

### 方式 2：直接启动（开发用）

```powershell
cd C:\Nio\service-monitor
node server.js
```

## 访问

- 本机：http://127.0.0.1:18888/
- Tailscale：http://100.77.0.16:18888/（自动检测）
- Token：见 `monitor.token` 文件

## API

所有 API 需要 token（query param `?token=...` 或 `Authorization: Bearer <token>` header）。

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/status` | 全部服务状态 |
| GET | `/healthz` | 存活检查（无需鉴权）|
| POST | `/api/:service/start` | 启动整个服务 |
| POST | `/api/:service/stop` | 停止整个服务 |
| POST | `/api/:service/port/:idx/start` | 启动指定端口 |
| POST | `/api/:service/port/:idx/stop` | 停止指定端口 |
| POST | `/api/:service/sub/:idx/start` | 启动子系统 |
| POST | `/api/:service/sub/:idx/stop` | 停止子系统 |

## 配置

编辑 `config.js`，每个 service 可以有：

- `ports[]`：HTTP 探活端口
- `subsystems[]`：多进程子系统
- `startCmd` / `stopCmd`：服务级启停命令

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NIO_OPENCLAW_HOME` | `~/.npm-global/node_modules/openclaw` | OpenClaw 安装路径 |

## 探活类型

| 类型 | 配置 | 说明 |
|------|------|------|
| `http` | 自动 | 探活 port.url |
| `cli` | `{ cmd, timeoutMs }` | 运行命令，exit 0 = OK |
| `wsl-cli` | `{ distro, cmd, timeoutMs }` | 在 WSL 里运行命令 |
| `feishu-ws` | `{}` | 查 OpenClaw 进程的 443 TCP 连接（30s 缓存）|

## 故障排查

- 端口 18888 起不来：检查 `netsh http show urlacl` 或换端口
- Feishu WS 一直 down：检查 OpenClaw 是否在飞书服务器建立了 WebSocket
- 进程残留：探活脚本有进程树清理（`taskkill /F /T`）

## License

MIT