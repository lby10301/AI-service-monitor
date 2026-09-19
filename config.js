/**
 * Nio Service Monitor v2.0 - Configuration
 *
 * Service definitions for monitoring.
 * Each service has either ports[] (HTTP probes) or subsystems[] (multi-process).
 *
 * Paths use env vars where possible (NIO_OPENCLAW_HOME) so the monitor is
 * portable across machines without code changes.
 */
'use strict';

const path = require('path');
const os = require('os');

// ---- Paths (可被环境变量覆盖) ----
const OPENCLAW_HOME = process.env.NIO_OPENCLAW_HOME
  || path.join(os.homedir(), '.npm-global', 'node_modules', 'openclaw');

module.exports = {
  version: '2.0.0',
  port: 18888,
  probeIntervalSec: 5,
  cmdTimeoutMs: 30000,

  tokenFile: path.join(__dirname, 'monitor.token'),

  services: {
    // === OpenClaw: HTTP gateway + Feishu WebSocket subsystem ===
    openclaw: {
      label: 'OpenClaw',
      icon: 'robot',
      kind: 'local',
      ports: [
        {
          label: 'Gateway UI',
          port: 18789,
          url: 'http://127.0.0.1:18789/healthz',
          httpOkStatuses: [200],
        },
      ],
      subsystems: [
        {
          label: 'Feishu WebSocket',
          key: 'feishu-ws',
          probe: { type: 'feishu-ws' },
        },
      ],
      startCmd: 'node "' + OPENCLAW_HOME + '\\dist\\index.js" gateway --port 18789',
      stopCmd: 'powershell -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.MainModule.FileName -like \'*openclaw*\' } | Stop-Process -Force"',
    },

    // === Hermes (WSL, 三端口) ===
    hermes: {
      label: 'Hermes (WSL)',
      icon: 'bolt',
      kind: 'wsl',
      ports: [
        {
          label: 'Gateway API + WeChat',
          port: 9119,
          url: 'http://127.0.0.1:9119/',
          httpOkStatuses: [200, 301, 302, 401, 403, 404],
          startCmd: 'wsl -d Ubuntu -- bash -c "hermes serve --host 0.0.0.0 --port 9119"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes serve\' || true"',
        },
        {
          label: 'Dashboard',
          port: 9120,
          url: 'http://127.0.0.1:9120/',
          httpOkStatuses: [200, 301, 302, 401, 403, 404],
          startCmd: 'wsl -d Ubuntu -- bash -c "hermes dashboard --host 0.0.0.0 --port 9120"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes dashboard\' || true"',
        },
        {
          label: 'Feishu Integration',
          port: 8644,
          url: 'http://127.0.0.1:8644/',
          httpOkStatuses: [200, 301, 302, 401, 403, 404],
          startCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes gateway run\' 2>/dev/null; sleep 1; nohup hermes gateway run > /tmp/hermes-feishu.log 2>&1 &"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "pkill -f \'hermes gateway run\' || true"',
        },
      ],
    },

    // === Tailscale (Windows + WSL) ===
    tailscale: {
      label: 'Tailscale',
      icon: 'globe',
      kind: 'multi',
      subsystems: [
        {
          label: 'Windows',
          icon: 'windows',
          key: 'tailscale-windows',
          probe: { type: 'cli', cmd: 'tailscale status', timeoutMs: 5000 },
          startCmd: 'tailscale up --accept-routes',
          stopCmd: 'tailscale down',
        },
        {
          label: 'Linux/WSL',
          icon: 'linux',
          key: 'tailscale-wsl',
          probe: { type: 'wsl-cli', distro: 'Ubuntu', cmd: 'tailscale status', timeoutMs: 8000 },
          startCmd: 'wsl -d Ubuntu -- bash -c "tailscale up --accept-routes"',
          stopCmd: 'wsl -d Ubuntu -- bash -c "tailscale down"',
        },
      ],
    },
  },
};