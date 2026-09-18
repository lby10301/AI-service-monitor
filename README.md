# Nio Service Monitor

Lightweight web-based monitor and controller for OpenClaw / Hermes / Tailscale services running on the same machine.

## Features

- Real-time status check via HTTP probes
- Per-port and per-subsystem start/stop controls
- Tooltip with probe URL, status meaning, latency, and timestamp
- Multi-address binding (localhost + Tailscale IP)
- Bearer token authentication

## Quick Start

```bash
cd scripts/service-monitor
npm install
node server.js
```

Open browser:
- Local: http://127.0.0.1:18888
- Tailscale: http://<your-tailscale-ip>:18888

Default token is auto-generated to `monitor.token` (gitignored).

## Configuration

Edit `config.js` to:
- Add new services
- Adjust probe intervals
- Change listen port

## Architecture

```
Browser  →  http://<host>:18888
              |
        Nio Monitor (Express)
              |
   +----------+----------+----------+
   |          |          |          |
OpenClaw   Hermes    Tailscale   ...
(Windows)   (WSL)    (CLI probe)
```

## Auto-Start on Boot

Run `install-autostart.ps1` as Administrator to register Task Scheduler entries:

| Task | Delay | Purpose |
|------|-------|---------|
| NioTailscaleBoot | 0s | Tailscale fallback |
| NioOpenClawBoot | 30s | OpenClaw gateway |
| NioHermesBoot | 60s | Hermes services |
| NioMonitorBoot | 90s | This monitor |

## Push to GitHub

Use `scripts/git-push.cmd` (requires PAT stored in OpenClaw secrets store).

## License

Personal project - use at your own risk.