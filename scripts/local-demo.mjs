import process from 'node:process';
import { spawnSync } from 'node:child_process';
const build = process.argv.includes('--build');
process.env.VITE_LOCAL_MODE = 'true';
const result = spawnSync(process.execPath, build ? ['node_modules/typescript/bin/tsc', '--noEmit'] : ['node_modules/vite/bin/vite.js', '--configLoader', 'runner', '--host', '127.0.0.1', '--open'], { stdio: 'inherit', env: process.env });
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
if (build) {
  const built = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--configLoader', 'runner'], { stdio: 'inherit', env: process.env });
  if (built.error) throw built.error;
  process.exit(built.status ?? 1);
}
