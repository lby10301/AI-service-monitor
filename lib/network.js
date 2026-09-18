/**
 * 网络探测：找本机所有可绑定的 IP
 * - 优先 127.0.0.1
 * - 然后探测 Tailscale IP（通过 tailscale status 或 ipconfig）
 * - 失败降级到 0.0.0.0
 */
const { execSync } = require('child_process');
const os = require('os');

function run(cmd, timeoutMs = 5000) {
  try {
    return execSync(cmd, { timeout: timeoutMs, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    return '';
  }
}

function getWindowsTailscaleIp() {
  const out = run('tailscale ip -4');
  if (!out) return null;
  // 输出可能是单 IP 或多行
  const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^100\.\d+\.\d+\.\d+$/.test(line)) return line;
  }
  return null;
}

function getLinuxTailscaleIp(wslDistro = 'Ubuntu') {
  // 通过 WSL 探测
  const out = run(`wsl -d ${wslDistro} -- bash -c "tailscale ip -4 2>/dev/null"`, 8000);
  if (!out) return null;
  const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^100\.\d+\.\d+\.\d+$/.test(line)) return line;
  }
  return null;
}

/**
 * 探测所有要监听的 IP 地址
 * 返回: ['127.0.0.1', '100.77.0.16', ...] 至少包含 127.0.0.1
 * 注意：Linux Tailscale IP（WSL 的 IP）不在 Windows 网卡上，bind 会失败
 *       所以只把 Windows 能 bind 的 IP 加进来
 */
function detectListenIps() {
  const ips = new Set(['127.0.0.1']);

  const winTsIp = getWindowsTailscaleIp();
  if (winTsIp) {
    ips.add(winTsIp);
    console.log(`[network] Windows Tailscale IP: ${winTsIp}`);
  } else {
    console.log(`[network] Windows Tailscale IP: not detected`);
  }

  // Linux Tailscale IP 只记录，不尝试 bind（WSL 的 IP 不能直接在 Windows 上 bind）
  const linuxTsIp = getLinuxTailscaleIp();
  if (linuxTsIp) {
    console.log(`[network] Linux Tailscale IP: ${linuxTsIp} (will not bind, accessed via WSL NAT)`);
  } else {
    console.log(`[network] Linux Tailscale IP: not detected`);
  }

  // 如果 Tailscale 一个都没拿到，降级 0.0.0.0（兼容今天的情况）
  if (!winTsIp) {
    ips.add('0.0.0.0');
    console.log(`[network] FALLBACK: listening on 0.0.0.0 (no Windows Tailscale detected)`);
  }

  return Array.from(ips);
}

module.exports = { detectListenIps, getWindowsTailscaleIp, getLinuxTailscaleIp };
