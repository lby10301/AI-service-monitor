/**
 * Nio Service Monitor v2.0
 * - 多地址监听（127.0.0.1 + Tailscale IP）
 * - 每端口/子系统独立启停
 * - 鉴权：Bearer Token（query param 或 header）
 * - Windows Service 友好（graceful shutdown）
 */
'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const config = require('./config');
const { probeService } = require('./lib/probe');
const {
  startService, stopService,
  startPort, stopPort,
  startSubsystem, stopSubsystem,
} = require('./lib/control');
const { detectListenIps } = require('./lib/network');

const VERSION = '2.0.0';

// ---- Token ----
function loadOrCreateToken() {
  if (fs.existsSync(config.tokenFile)) {
    return fs.readFileSync(config.tokenFile, 'utf8').trim();
  }
  const token = crypto.randomBytes(16).toString('hex');
  fs.writeFileSync(config.tokenFile, token, { mode: 0o600 });
  return token;
}
const TOKEN = loadOrCreateToken();

// ---- State ----
const state = {
  startedAt: new Date().toISOString(),
  version: VERSION,
  listenIps: [],
  services: {},
  history: [],
};
for (const key of Object.keys(config.services)) {
  state.services[key] = { ok: null, lastCheck: null };
}

function logEvent(msg) {
  const entry = { ts: new Date().toISOString(), msg };
  state.history.unshift(entry);
  if (state.history.length > 50) state.history.pop();
  console.log('[' + entry.ts + '] ' + msg);
}

// ---- Auth ----
function auth(req, res, next) {
  const token =
    (req.query.token || '').toString() ||
    (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token !== TOKEN) {
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }
  next();
}

// ---- 探活循环 ----
async function probeAll() {
  for (const [key, svc] of Object.entries(config.services)) {
    try {
      const result = await probeService(svc);
      const prev = state.services[key].ok;
      state.services[key] = {
        ok: result.ok,
        lastCheck: new Date().toISOString(),
        ...result,
      };
      if (prev !== null && prev !== result.ok) {
        const arrow = result.ok ? 'up' : 'down';
        const was = prev ? 'up' : 'down';
        logEvent(svc.label + ': ' + was + ' -> ' + arrow);
      }
    } catch (e) {
      state.services[key] = {
        ok: false,
        lastCheck: new Date().toISOString(),
        error: e.message,
      };
    }
  }
}

// ---- Routes ----
const app = express();
app.use(express.json());

app.get('/', (req, res) => {
  const filePath = path.join(__dirname, 'public', 'index.html');
  let html = fs.readFileSync(filePath, 'utf8');
  html = html.replace('__TOKEN__', TOKEN);
  res.send(html);
});

app.get('/api/status', auth, (req, res) => {
  res.json({
    ok: true,
    version: VERSION,
    startedAt: state.startedAt,
    listenIps: state.listenIps,
    services: state.services,
    history: state.history.slice(0, 20),
  });
});

app.get('/healthz', (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), version: VERSION });
});

// === 服务级启停 ===
app.post('/api/:service/start', auth, async (req, res) => {
  const svc = config.services[req.params.service];
  if (!svc) return res.status(404).json({ ok: false, error: 'service not found' });
  logEvent('START ' + svc.label);
  const r = await startService(svc);
  logEvent('START ' + svc.label + ' -> ' + (r.ok ? 'OK' : 'FAIL') + (r.error ? ' ' + r.error : ''));
  res.json(r);
});

app.post('/api/:service/stop', auth, async (req, res) => {
  const svc = config.services[req.params.service];
  if (!svc) return res.status(404).json({ ok: false, error: 'service not found' });
  logEvent('STOP ' + svc.label);
  const r = await stopService(svc);
  logEvent('STOP ' + svc.label + ' -> ' + (r.ok ? 'OK' : 'FAIL') + (r.error ? ' ' + r.error : ''));
  res.json(r);
});

// === 端口级启停 ===
app.post('/api/:service/port/:idx/start', auth, async (req, res) => {
  const svc = config.services[req.params.service];
  if (!svc) return res.status(404).json({ ok: false, error: 'service not found' });
  const idx = parseInt(req.params.idx, 10);
  const port = svc.ports && svc.ports[idx];
  if (!port) return res.status(404).json({ ok: false, error: 'port not found' });
  logEvent('START ' + svc.label + ' :' + port.port + ' (' + port.label + ')');
  const r = await startPort(svc, idx);
  logEvent('START :' + port.port + ' -> ' + (r.ok ? 'OK' : 'FAIL'));
  res.json(r);
});

app.post('/api/:service/port/:idx/stop', auth, async (req, res) => {
  const svc = config.services[req.params.service];
  if (!svc) return res.status(404).json({ ok: false, error: 'service not found' });
  const idx = parseInt(req.params.idx, 10);
  const port = svc.ports && svc.ports[idx];
  if (!port) return res.status(404).json({ ok: false, error: 'port not found' });
  logEvent('STOP ' + svc.label + ' :' + port.port + ' (' + port.label + ')');
  const r = await stopPort(svc, idx);
  logEvent('STOP :' + port.port + ' -> ' + (r.ok ? 'OK' : 'FAIL'));
  res.json(r);
});

// === 子系统级启停 ===
app.post('/api/:service/sub/:idx/start', auth, async (req, res) => {
  const svc = config.services[req.params.service];
  if (!svc) return res.status(404).json({ ok: false, error: 'service not found' });
  const idx = parseInt(req.params.idx, 10);
  const sub = svc.subsystems && svc.subsystems[idx];
  if (!sub) return res.status(404).json({ ok: false, error: 'subsystem not found' });
  logEvent('START ' + svc.label + ' [' + sub.label + ']');
  const r = await startSubsystem(svc, idx);
  logEvent('START [' + sub.label + '] -> ' + (r.ok ? 'OK' : 'FAIL'));
  res.json(r);
});

app.post('/api/:service/sub/:idx/stop', auth, async (req, res) => {
  const svc = config.services[req.params.service];
  if (!svc) return res.status(404).json({ ok: false, error: 'service not found' });
  const idx = parseInt(req.params.idx, 10);
  const sub = svc.subsystems && svc.subsystems[idx];
  if (!sub) return res.status(404).json({ ok: false, error: 'subsystem not found' });
  logEvent('STOP ' + svc.label + ' [' + sub.label + ']');
  const r = await stopSubsystem(svc, idx);
  logEvent('STOP [' + sub.label + '] -> ' + (r.ok ? 'OK' : 'FAIL'));
  res.json(r);
});

// ---- 启动 ----
async function main() {
  state.listenIps = detectListenIps();
  console.log('[start] Listen IPs: ' + state.listenIps.join(', '));

  for (const ip of state.listenIps) {
    app.listen(config.port, ip, () => {
      console.log('[start] Listening on http://' + ip + ':' + config.port);
    });
  }

  setInterval(probeAll, config.probeIntervalSec * 1000);
  await probeAll();

  console.log('');
  console.log('='.repeat(60));
  console.log('  Nio Service Monitor v' + VERSION + ' 启动');
  console.log('  Token: ' + TOKEN);
  console.log('  监听地址:');
  for (const ip of state.listenIps) {
    console.log('    http://' + ip + ':' + config.port + '/');
  }
  console.log('='.repeat(60));
  console.log('');
  logEvent('Monitor v' + VERSION + ' 启动');
}

// ---- Graceful shutdown ----
function shutdown(signal) {
  logEvent('Received ' + signal + ', shutting down...');
  setTimeout(() => process.exit(0), 1000);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});