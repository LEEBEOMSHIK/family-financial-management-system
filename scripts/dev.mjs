import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const python = path.join(root, process.platform === 'win32' ? 'apps/api/.venv-pg/Scripts/python.exe' : 'apps/api/.venv/bin/python');
const next = path.join(root, 'apps/web/node_modules/next/dist/bin/next');
if (!existsSync(python) || !existsSync(next)) throw Error('Install API and web dependencies first; see docs/engineering/local-development.md');
for (const port of [3000, 8000]) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', () => reject(Error(`Port ${port} is in use. Stop that service or use its existing session.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
const children = [];
const connectionFile = path.join(root, 'var/postgres/connection.json');
if (!existsSync(connectionFile)) throw Error('Run scripts/setup_postgres.py and scripts/initialize_database.py first.');
const database = JSON.parse(readFileSync(connectionFile, 'utf8'));
const dbStart = spawnSync(python, ['scripts/setup_postgres.py'], { cwd: root, windowsHide: true, stdio: 'inherit' });
if (dbStart.status !== 0) throw Error('Local PostgreSQL startup failed.');
const testAccounts = path.join(root, 'var/postgres/development-accounts.json');
const financialKeyFile = path.join(root, 'var/secrets/financial-data.key');
if (!existsSync(financialKeyFile)) throw Error('Run scripts/setup_financial_key.py before applying migration 004; restore original key if it was lost.');
const env = { ...process.env, APP_ENV: 'development', AUTH_PROVIDER: 'local_password', DATABASE_URL: database.app_dsn,
  ENABLE_DEV_LOGIN: process.env.ENABLE_DEV_LOGIN ?? (existsSync(testAccounts) ? '1' : '0'), DEV_ACCOUNTS_FILE: testAccounts,
  API_INTERNAL_URL: 'http://127.0.0.1:8000', WEB_ORIGIN: 'http://127.0.0.1:3000', NEXT_TELEMETRY_DISABLED: '1', PYTHONUTF8: '1' };
delete env.FINANCIAL_DATA_KEY;
let stopping = false;
function stop(code = 0) {
  if (stopping) return; stopping = true;
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
function start(command, args, cwd, privateEnv = {}) {
  const child = spawn(command, args, { cwd, env: { ...env, ...privateEnv }, stdio: 'inherit', windowsHide: true });
  children.push(child);
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', code => { if (!stopping) stop(code ?? 1); });
}
start(python, ['-m', 'uvicorn', 'family_ledger.main:create_app', '--factory', '--app-dir', 'apps/api/src', '--host', '127.0.0.1', '--port', '8000', '--no-access-log'], root, { FINANCIAL_DATA_KEY: readFileSync(financialKeyFile, 'utf8').trim() });
start(process.execPath, [next, process.argv.includes('--production-build') ? 'start' : 'dev', '--hostname', '127.0.0.1', '--port', '3000'], path.join(root, 'apps/web'));
mkdirSync(path.join(root, 'var'), { recursive: true });
writeFileSync(path.join(root, 'var/service-processes.json'), JSON.stringify({ supervisor: process.pid, startedAt: new Date().toISOString(), children: children.map(c => c.pid) }));
process.on('SIGINT', () => stop()); process.on('SIGTERM', () => stop());
console.log('Family Ledger: http://127.0.0.1:3000 (individual accounts, PostgreSQL; financial records are synthetic). Ctrl+C stops web/API; database remains running.');
