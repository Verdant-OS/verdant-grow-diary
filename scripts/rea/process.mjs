import { spawn, execFile } from 'node:child_process';

export const spawnOwned = (command, args, options) => spawn(command, args, {
  ...options, detached: process.platform !== 'win32',
});

export async function terminateOwned(child) {
  if (!child?.pid) return;
  if (process.platform === 'win32') {
    await new Promise(resolve => execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'],
      { timeout: 5000 }, () => resolve()));
    return;
  }
  const signalGroup = signal => {
    try { process.kill(-child.pid, signal); }
    catch (error) { if (error.code !== 'ESRCH') throw error; }
  };
  signalGroup('SIGTERM');
  if (child.exitCode === null && !child.signalCode) await new Promise(resolve => {
    const timer = setTimeout(resolve, 3000);
    child.once('exit', () => { clearTimeout(timer); resolve(); });
  });
  // The direct child may exit before a renderer/analyzer that ignores SIGTERM.
  signalGroup('SIGKILL');
  if (child.exitCode === null && !child.signalCode) await new Promise(resolve => child.once('exit', resolve));
}
