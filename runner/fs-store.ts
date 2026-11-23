// Store on the local file system, for runs on a developer machine.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Store } from './hour.ts';

export function fsStore(dir: string): Store {
  return {
    async get(path) {
      try { return await readFile(join(dir, path), 'utf8'); } catch { return null; }
    },
    async put(path, text) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), text);
    },
  };
}
