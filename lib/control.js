/**
 * 服务启停控制 v2.2
 * - spawn 后台命令
 * - 支持端口级启停（port.startCmd / port.stopCmd）
 * - 支持子系统级启停（sub.startCmd / sub.stopCmd）
 */
const { spawn } = require('child_process');

function runDetached(cmd, timeoutMs = 30000) {
  return new Promise((resolve) => {
    const started = Date.now();
    try {
      const proc = spawn(cmd, {
        shell: true,
        windowsHide: true,
        detached: true,
        stdio: 'ignore',
      });
      proc.unref();
      setTimeout(() => {
        resolve({
          ok: true,
          note: 'dispatched',
          pid: proc.pid,
          elapsedMs: Date.now() - started,
        });
      }, 1500);
      proc.on('error', (err) => {
        resolve({ ok: false, error: err.message, elapsedMs: Date.now() - started });
      });
    } catch (e) {
      resolve({ ok: false, error: e.message, elapsedMs: Date.now() - started });
    }
  });
}

async function startService(svc) {
  if (!svc.startCmd) return { ok: false, error: 'no startCmd' };
  return await runDetached(svc.startCmd);
}

async function stopService(svc) {
  if (!svc.stopCmd) return { ok: false, error: 'no stopCmd' };
  return await runDetached(svc.stopCmd);
}

async function startPort(svc, portIdx) {
  const port = svc.ports && svc.ports[portIdx];
  if (!port) return { ok: false, error: 'port not found' };
  if (!port.startCmd) return { ok: false, error: 'no port startCmd (service-level only)' };
  return await runDetached(port.startCmd);
}

async function stopPort(svc, portIdx) {
  const port = svc.ports && svc.ports[portIdx];
  if (!port) return { ok: false, error: 'port not found' };
  if (!port.stopCmd) return { ok: false, error: 'no port stopCmd (service-level only)' };
  return await runDetached(port.stopCmd);
}

async function startSubsystem(svc, subIdx) {
  const sub = svc.subsystems && svc.subsystems[subIdx];
  if (!sub) return { ok: false, error: 'subsystem not found' };
  if (!sub.startCmd) return { ok: false, error: 'no sub startCmd' };
  return await runDetached(sub.startCmd);
}

async function stopSubsystem(svc, subIdx) {
  const sub = svc.subsystems && svc.subsystems[subIdx];
  if (!sub) return { ok: false, error: 'subsystem not found' };
  if (!sub.stopCmd) return { ok: false, error: 'no sub stopCmd' };
  return await runDetached(sub.stopCmd);
}

module.exports = {
  startService, stopService,
  startPort, stopPort,
  startSubsystem, stopSubsystem,
  runDetached,
};