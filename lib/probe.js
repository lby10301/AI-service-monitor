/**
 * 探活模块 v2.3
 * - HTTP 探活 / CLI 探活 / WSL CLI 探活 / Feishu WS 探活 / 多子系统
 * - 每个端口或子系统返回 tooltip 4 字段
 */
const http = require('http');
const path = require('path');
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
  return STATUS_MEANINGS[code] || 'HTTP ' + code;
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
        meaning: ok ? 'connected' : (timedOut ? 'timeout' : 'exit ' + code),
        stdout: stdout.trim().slice(0, 500),
        stderr: stderr.trim().slice(0, 500),
        error: timedOut ? 'timeout' : (ok ? null : 'exit ' + code),
      });
    });
  });
}

function probeWslCli(distro, cmd, timeoutMs = 8000) {
  const wrapped = 'wsl -d ' + distro + ' -- bash -c "' + cmd.replace(/"/g, '\\"') + '"';
  return probeCli(wrapped, timeoutMs);
}

/**
 * 飞书 WebSocket 探活 - 通过查 OpenClaw 进程到 443 端口的活跃连接
 */
async function probeFeishuWs(timeoutMs = 8000) {
  const scriptPath = path.join(__dirname, '..', 'scripts', 'check-feishu-ws.ps1');
  const cmd = 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + scriptPath + '"';
  const result = await probeCli(cmd, timeoutMs);

  const lines = (result.stdout || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let count = 0, ips = '', status = 'unknown';
  for (const line of lines) {
    if (line.startsWith('COUNT:')) count = parseInt(line.substring(6), 10) || 0;
    else if (line.startsWith('IPS:')) ips = line.substring(4);
    else if (line.startsWith('STATUS:')) status = line.substring(7);
  }

  const ok = count > 0;
  const ipShort = ips.length > 30 ? ips.substring(0, 30) + '...' : ips;
  return {
    ok,
    latencyMs: result.latencyMs,
    ip: ips,
    detail: ok ? (count + ' conn (' + ipShort + ')') : status,
    meaning: ok ? 'WebSocket connected' : 'No outbound 443',
    tooltip: {
      probeUrl: 'Get-NetTCPConnection (OpenClaw process, port 443)',
      meaning: ok ? 'Feishu WebSocket connected' : 'No outbound 443 connections from OpenClaw',
      latencyMs: result.latencyMs,
      timestamp: new Date().toISOString(),
    },
  };
}

async function probeSubsystem(sub) {
  const probeType = sub.probe && sub.probe.type;
  if (probeType === 'cli') {
    return await probeCli(sub.probe.cmd, sub.probe.timeoutMs);
  } else if (probeType === 'wsl-cli') {
    return await probeWslCli(sub.probe.distro, sub.probe.cmd, sub.probe.timeoutMs);
  } else if (probeType === 'feishu-ws') {
    return await probeFeishuWs(sub.probe.timeoutMs);
  } else {
    return { ok: false, error: 'unsupported probe type: ' + probeType };
  }
}

async function probeService(svc) {
  const started = Date.now();

  try {
    // === 探活子系统 (任意 service 有 subsystems 字段都支持) ===
    let subResults = [];
    if (svc.subsystems && svc.subsystems.length > 0) {
      subResults = await Promise.all(svc.subsystems.map(async (sub) => {
        const r = await probeSubsystem(sub);
        return {
          label: sub.label,
          icon: sub.icon,
          key: sub.key,
          ok: r.ok,
          latencyMs: r.latencyMs,
          ip: r.ip,
          detail: r.error || r.detail || r.meaning || 'ok',
          tooltip: r.tooltip || {
            probeUrl: (sub.probe && (sub.probe.cmd || sub.probe.type)) || '-',
            meaning: r.meaning || '-',
            latencyMs: r.latencyMs,
            timestamp: new Date().toISOString(),
          },
        };
      }));
    }

    // === HTTP 探活（多端口）===
    let portResults = [];
    if (svc.ports && svc.ports.length > 0) {
      portResults = await Promise.all(svc.ports.map(async (p) => {
        const r = await probeHttp(p.url, 3000, p.httpOkStatuses || [200, 301, 302]);
        return {
          label: p.label,
          port: p.port,
          startCmd: p.startCmd,
          stopCmd: p.stopCmd,
          ok: r.ok,
          statusCode: r.statusCode,
          detail: r.error ? r.error : 'HTTP ' + r.statusCode,
          latencyMs: r.latencyMs,
          tooltip: {
            probeUrl: p.url,
            meaning: r.meaning,
            latencyMs: r.latencyMs,
            timestamp: new Date().toISOString(),
          },
        };
      }));
    }

    // === 没有 ports 也没有 subsystems：独立 CLI/wsl-cli 服务 ===
    if (portResults.length === 0 && subResults.length === 0) {
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
      return { ok: false, error: 'no probe configured' };
    }

    // === 合并 ports + subsystems 结果 ===
    const allPortsOk = portResults.length === 0 || portResults.every(p => p.ok);
    const allSubsOk = subResults.length === 0 || subResults.every(s => s.ok);
    const ok = allPortsOk && allSubsOk;

    const result = {
      ok,
      latencyMs: Date.now() - started,
      detail: ok ? 'all up' : 'partial',
    };
    if (portResults.length > 0) result.ports = portResults;
    if (subResults.length > 0) result.subsystems = subResults;
    return result;
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - started, error: e.message };
  }
}

module.exports = { probeService, probeHttp, probeCli, probeWslCli, probeFeishuWs, probeSubsystem, explainStatus };