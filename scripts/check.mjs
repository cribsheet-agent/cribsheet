// Repo checks run in CI: spec JSON parses, relative markdown links resolve,
// and the public site ships no mockup text or sample values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = [];
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
  e.name.startsWith('.') || e.name === 'node_modules' ? [] : e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(root);
const rel = f => path.relative(root, f);

for (const f of files.filter(f => f.endsWith('.json'))) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { fail.push(`${rel(f)}: invalid JSON (${e.message})`); }
}

for (const f of files.filter(f => f.endsWith('.md'))) {
  const text = fs.readFileSync(f, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const p = path.resolve(path.dirname(f), target.split('#')[0]);
    if (!fs.existsSync(p)) fail.push(`${rel(f)}: broken link ${target}`);
  }
}

const site = path.join(root, 'site/public/index.html');
if (!fs.existsSync(site)) fail.push('site/public/index.html missing');
else {
  const html = fs.readFileSync(site, 'utf8');
  for (const bad of ['Design mockup', 'data-state="sample"', '[domain]']) if (html.includes(bad)) fail.push(`site: ships "${bad}"`);
}

if (fail.length) { console.error(fail.join('\n')); process.exit(1); }
console.log(`ok: ${files.length} files checked`);
