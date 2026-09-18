/**
 * 服务监控器配置 v2.2
 * 服务按"系统"分组，每系统内含多个端口
 * 每个端口独立启停（如果支持），整体也有"启动/停止全部"
 */
const path = require('path');

module.exports = {
  port: 18888,
  probeIntervalSec: 5,
  cmdTimeoutMs: 30000,

  tokenFile: path.join(__dirname, 'monitor.token'),

  services: {
    // === OpenClaw (Windows, 双端口) ===
    openclaw: {
      label: 'OpenClaw',
      icon: '🤖',
      kind: 'local',
      ports: [
        { label: 'Gateway UI', port: 18789, url: 'http://127.0.0.1:18789/healthz', httpOkStatuses: [200] },
        { label: '飞书集成', port: 18799, url: 'http://127.0.0.1:18799/', httpOkStatuses: [401, 403, 200, 301, 302] },
      ],
      startCmd: 'node C:\\home\\lby10\\.npm-global\\node_modules\\openclaw\\dist\\index.js gateway --port 18789',
      stopCmd: 'powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.MainModule.FileName -like \'*openclaw*\' } | Stop-Process -Force"',
    },

    // === Hermes (WSL, 三端口) ===
    // 注意：9119 是 Gateway API + 微信集成 共用端口
    hermes: {
      label: 'Hermes (WSL)',
      icon: '⚡',
      kind: 'wsl',
      ports: [
        { label: 'Gateway API + 微信集成', port: 9119, url: 'http://127.0.0.1:9119/', httpOkStatuses: [200, 301, 302, 401, 403, 404],
          startCmd: 'wsl -d Ubuntu -- bash -c "hermes serve --host 0.0.0.0 --port 9119"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes serve\' || true"' },
        { label: 'Dashboard', port: 9120, url: 'http://127.0.0.1:9120/', httpOkStatuses: [200, 301, 302, 401, 403, 404],
          startCmd: 'wsl -d Ubuntu -- bash -c "hermes dashboard --host 0.0.0.0 --port 9120"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes dashboard\' || true"' },
        { label: '飞书集成', port: 8644, url: 'http://127.0.0.1:8644/', httpOkStatuses: [200, 301, 302, 401, 403, 404],
          startCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes gateway run\' 2>/dev/null; sleep 1; nohup hermes gateway run > /tmp/hermes-feishu.log 2>&1 &"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes gateway run\' || true"' },
      ],
    },

    // === Tailscale (双系统：Windows + Linux/WSL) ===
    tailscale: {
      label: 'Tailscale',
      icon: '🌐',
      kind: 'multi',
      subsystems: [
        { label: 'Windows', icon: '🪟', key: 'tailscale-windows',
          probe: { type: 'cli', cmd: 'tailscale status', timeoutMs: 5000 },
          startCmd: 'tailscale up --accept-routes',
          stopCmd: 'tailscale down',
        },
        { label: 'Linux/WSL', icon: '🐧', key: 'tailscale-wsl',
          probe: { type: 'wsl-cli', distro: 'Ubuntu', cmd: 'tailscale status', timeoutMs: 8000 },
          startCmd: 'wsl -d Ubuntu -- bash -c "tailscale up --accept-routes"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "tailscale down"',
        },
      ],
    },
  },
};