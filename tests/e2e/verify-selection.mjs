import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';

// Offline selection assertions for the demo/real Playwright split. Runs
// `playwright test --list` (no browsers launched, no network) in both modes
// and asserts each mode selects exactly its own spec file and test count.

const here = dirname(fileURLToPath(import.meta.url));

function listTests(env) {
  const result = spawnSync('npx', ['playwright', 'test', '--list'], {
    cwd: here,
    env: {...process.env, ...env},
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`playwright --list failed (${env ?? 'default'}): ${result.stderr}`);
  }
  const output = result.stdout;
  const files = [...new Set([...output.matchAll(/([a-z-]+)\.spec\.mjs/g)].map(match => match[1]))];
  const total = output.match(/Total: (\d+) tests/);
  if (!total) throw new Error(`No total line in --list output (${env ?? 'default'})`);
  return {files, count: Number(total[1])};
}

// Each assertion controls its own mode, even when the caller opted into real tests.
const demo = listTests({HX_E2E_REAL: '0'});
const real = listTests({HX_E2E_REAL: '1'});

const failures = [];
if (demo.count !== 6 || demo.files.join(',') !== 'delivery') {
  failures.push(`default mode must select only the 6 demo tests, got ${demo.count}: [${demo.files}]`);
}
if (real.count !== 3 || real.files.join(',') !== 'real-signin') {
  failures.push(`HX_E2E_REAL=1 must select only the 3 real tests, got ${real.count}: [${real.files}]`);
}
if (failures.length) {
  for (const failure of failures) console.error('SELECTION FAIL: ' + failure);
  process.exit(1);
}
console.log(`SELECTION OK: default=${demo.count} demo tests (${demo.files}); real=${real.count} tests (${real.files}); no overlap`);
