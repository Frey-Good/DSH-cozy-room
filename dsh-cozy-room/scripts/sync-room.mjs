// Sync the standalone room (../anime-room) into the plugin's room/ folder.
// Usage: node scripts/sync-room.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(here, '..');
const src = path.resolve(pluginRoot, '..', 'anime-room');
const dst = path.join(pluginRoot, 'room');

const FILES = ['index.html', 'styles.css', 'cmd.json', 'CREDITS.md', 'LICENSE'];
const DIRS = ['js', 'assets'];

if (!fs.existsSync(path.join(src, 'index.html'))) {
  console.error(`room source not found: ${src}`);
  process.exit(1);
}

fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(dst, { recursive: true });

for (const name of FILES) {
  const from = path.join(src, name);
  if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dst, name));
}

for (const name of DIRS) {
  const from = path.join(src, name);
  if (fs.existsSync(from)) fs.cpSync(from, path.join(dst, name), { recursive: true });
}

console.log(`synced room -> ${dst}`);
