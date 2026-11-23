// Writes the text files the exam reads at run time into .ts modules, so the same code runs
// in Node and in a Worker (no file system there). `node scripts/embed.mjs --check` fails if
// a generated file is out of date; CI runs it.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const files = [
  { from: 'arms/manual.md', to: 'arms/manual.gen.ts', name: 'MANUAL', read: s => s },
  { from: 'checker/factory-abi.json', to: 'checker/factory-abi.gen.ts', name: 'FACTORY_ABI_ITEMS', read: s => JSON.parse(s).items },
];
const check = process.argv.includes('--check');
let stale = 0;
for (const f of files) {
  const value = f.read(readFileSync(root + f.from, 'utf8'));
  const out = `// Generated from ${f.from} by scripts/embed.mjs. Do not edit.\nexport const ${f.name} = ${JSON.stringify(value, null, 1)} as const;\n`;
  if (check) {
    let cur = '';
    try { cur = readFileSync(root + f.to, 'utf8'); } catch { /* missing */ }
    if (cur !== out) { console.error(`${f.to} is out of date: run node scripts/embed.mjs`); stale++; }
  } else writeFileSync(root + f.to, out);
}
if (stale) process.exit(1);
console.log(check ? 'ok: embedded files up to date' : 'embedded files written');
