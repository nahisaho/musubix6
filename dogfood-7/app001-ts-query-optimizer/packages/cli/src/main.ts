import { readFileSync } from 'node:fs';
import { explainJSON, optimize, parseRequest, printPlan } from './index.ts';

/** @id CODE-PLAN-006 @implements REQ-PLAN-006 */
function main(args: string[]): void {
  if (args.filter(a => a === '--json').length > 1 || args.some(a => a.startsWith('-') && a !== '--json')) throw new Error('usage: main.ts [--json] [query.json]');
  const files = args.filter(a => a !== '--json');
  if (files.length > 1) throw new Error('only one input file is supported');
  const request = parseRequest(readFileSync(files[0] ?? 0, 'utf8'));
  const result = optimize(request.plan, request.stats);
  console.log(args.includes('--json') ? JSON.stringify(explainJSON(result), null, 2) : printPlan(result));
}
try { main(process.argv.slice(2)); }
catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
