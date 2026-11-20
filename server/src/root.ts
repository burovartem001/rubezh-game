import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Корень проекта (папка с package.json) — не зависит от текущего каталога и от того, запущена сборка или исходники. */
export const APP_ROOT = (() => {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!fs.existsSync(path.join(dir, 'package.json'))) {
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
  return dir;
})();
