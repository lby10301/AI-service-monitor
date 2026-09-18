/**
 * 探活模块 v2.2
 * - HTTP 探活 / CLI 探活 / WSL CLI 探活 / 多子系统（multi）
 * - 每个端口或子系统返回 tooltip 4 字段
 */
const http = require('http');
const { spawn } = require('child_process');

const STATUS_MEANINGS = {
  200: '200 OK - 正常',
  301: '301 Moved Permanently - 永久重定向',
  302: '302 Found - 临时重定向（服务正常）',
  304: '304 Not Modified - 缓存命中',
  400: '400 Bad Request - 请求错误',
  401: '401 Unauthorized - 需要认证（服务正常）',
  403: '403 Forbidden - 拒绝访问（服务正常）',
  404: '404 Not Found - 路径不存在（端口在听）',
  500: '500 Internal Server Error - 服务异常',
  502: '502 Bad Gateway - 上游故障',
  503: '503 Service Unavailable - 服务不可用',
};

function explainStatus(code) {
  return STATUS_MEANINGS[code] || `HTTP ${code}`;
}

function probeHttp(url, timeoutMs = 3000, okStatuses = [200, 301, 302]) {
  return new Promise((resolve) => {
    const started = Date.now();
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const latencyMs = Date.now() - started;
      const code = res.statusCode;
      const ok = okStatuses.includes(code);
      res.resume();
      resolve({
        ok,
        statusCode: code,
        latencyMs,
        probeUrl: url,
        meaning: explainStatus(code),
        error: null,
      });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, latencyMs: Date.now() - started, probeUrl: url, error: 'timeout' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, latencyMs: Date.now() - started, probeUrl: url, error: err.code || err.message });
    });
  });
}

function probeCli(cmd, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const proc = spawn(cmd, { shell: true, windowsHide: true });
    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill();
    }, timeoutMs);
    proc.on('close', (code) => {
      clearTimeout(timer);
      const latencyMs = Date.now() - started;
      const ok = code === 0 && !timedOut;
      let ip = null;
      const m = (stdout || stderr).match(/100\.\d+\.\d+\.\d+/);
      if (m) ip = m[0];
      resolve({
        ok,
        exitCode: code,
        latencyMs,
        probeUrl: cmd,
        ip,
        meaning: ok ? 'connected' : (timedOut ? 'timeout' : `exit ${code}`),
        stdout: stdout.trim().slice(0, 200),
        stderr: stderr.trim().slice(0, 200),
        error: timedOut ? 'timeout' : (ok ? null : `exit ${code}`),
      });
    });
  });
}

function probeWslCli(distro, cmd, timeoutMs = 8000) {
  const wrapped = `wsl -d ${distro} -- bash -c "${cmd.replace(/"/g, '\\"')}"`;
  return probeCli(wrapped, timeoutMs);
}

/**
 * 探测一个服务
 * @returns Promise<{ ok, ports?, subsystems?, ip?, latencyMs, error? }>
 */
async function probeService(svc) {
  const started = Date.now();

  try {
    // === Multi subsystems (e.g. Tailscale Windows + WSL) ===
    if (svc.kind === 'multi' && svc.subsystems) {
      const results = await Promise.all(svc.subsystems.map(async (sub) => {
        let r;
        if (sub.probe.type === 'cli') {
          r = await probeCli(sub.probe.cmd, sub.probe.timeoutMs);
        } else if (sub.probe.type === 'wsl-cli') {
          r = await probeWslCli(sub.probe.distro, sub.probe.cmd, sub.probe.timeoutMs);
        } else {
          r = { ok: false, error: 'unsupported probe type' };
        }
        return {
          label: sub.label,
          icon: sub.icon,
          key: sub.key,
          ok: r.ok,
          latencyMs: r.latencyMs,
          ip: r.ip,
          detail: r.error || r.meaning || 'ok',
          tooltip: {
            probeUrl: r.probeUrl,
            meaning: r.meaning,
            latencyMs: r.latencyMs,
            timestamp: new Date().toISOString(),
          },
        };
      }));
      const allOk = results.every((r) => r.ok);
      return {
        ok: allOk,
        subsystems: results,
        latencyMs: Date.now() - started,
        detail: allOk ? 'all connected' : `${results.filter(r => !r.ok).length} down`,
      };
    }

    // === CLI 探活 ===
    if (svc.probe && svc.probe.type === 'cli') {
      const r = await probeCli(svc.probe.cmd, svc.probe.timeoutMs);
      return {
        ok: r.ok,
        latencyMs: r.latencyMs,
        ip: r.ip,
        detail: r.error || r.meaning || 'ok',
        tooltip: {
          probeUrl: r.probeUrl,
          meaning: r.meaning,
          latencyMs: r.latencyMs,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // === WSL CLI 探活 ===
    if (svc.probe && svc.probe.type === 'wsl-cli') {
      const r = await probeWslCli(svc.probe.distro, svc.probe.cmd, svc.probe.timeoutMs);
      return {
        ok: r.ok,
        latencyMs: r.latencyMs,
        ip: r.ip,
        detail: r.error || r.meaning || 'ok',
        tooltip: {
          probeUrl: r.probeUrl,
          meaning: r.meaning,
          latencyMs: r.latencyMs,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // === HTTP 探活（多端口）===
    if (svc.ports && svc.ports.length > 0) {
      const results = await Promise.all(svc.ports.map(async (p) => {
        const r = await probeHttp(p.url, 3000, p.httpOkStatuses || [200, 301, 302]);
        return {
          label: p.label,
          port: p.port,
          startCmd: p.startCmd,
          stopCmd: p.stopCmd,
          ok: r.ok,
          statusCode: r.statusCode,
          detail: r.error ? `${r.error}` : `HTTP ${r.statusCode}`,
          latencyMs: r.latencyMs,
          tooltip: {
            probeUrl: p.url,
            meaning: r.meaning,
            latencyMs: r.latencyMs,
            timestamp: new Date().toISOString(),
          },
        };
      }));

      const allOk = results.every((r) => r.ok);
      return {
        ok: allOk,
        ports: results,
        latencyMs: Date.now() - started,
        detail: allOk ? 'all ports up' : `${results.filter(r => !r.ok).length} down`,
      };
    }

    return { ok: false, error: 'no probe configured' };
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: e.message };
  }
}

module.exports = { probeService, probeHttp, probeCli, probeWslCli, explainStatus };