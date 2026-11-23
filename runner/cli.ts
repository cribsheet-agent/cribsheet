// Local runner: node runner/cli.ts [--dir data] [--model @cf/openai/gpt-oss-120b] [--hours 1]
// Needs CF_ACCOUNT_ID and CF_API_TOKEN for Workers AI.
import { parseArgs } from 'node:util';
import { workersAi } from '../lib/model.ts';
import { runHour } from './hour.ts';

const { values } = parseArgs({ options: {
  dir: { type: 'string', default: 'data' },
  model: { type: 'string', default: '@cf/openai/gpt-oss-120b' },
  hours: { type: 'string', default: '1' },
} });

const cfg = workersAi(values.model!);
for (let i = 0; i < Number(values.hours); i++) {
  if (i > 0) {
    // wait for the next full hour plus a minute, so the window has closed
    const wait = 3600_000 - (Date.now() % 3600_000) + 60_000;
    console.log(`waiting ${Math.round(wait / 60000)} min for the next hour`);
    await new Promise(r => setTimeout(r, wait));
  }
  const { result, root, check } = await runHour({ dir: values.dir!, cfg, log: s => console.log(s) });
  const cracked = check.filter(c => c.mark === 'cracked').length;
  console.log(`hour ${result.hour} score`, result.score, `cost $${result.cost.usd} (${Math.round(result.cost.neurons)} neurons)`, 'seal', root,
    check.length ? `check: ${cracked} cracked of ${check.length}` : '');
}
