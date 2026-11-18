import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('..', import.meta.url));
const run = (...args) =>
  execFileSync(process.execPath, ['apps/cli/dist/cli.js', ...args], {
    cwd,
    stdio: 'inherit',
  });

const examples = [
  ['digital-advertising', 'context.advertising-order'],
  ['agile-sprint', 'context.sprint'],
  ['shared-settlement', 'context.performance'],
];

for (const [name, scope] of examples) {
  const root = `examples/${name}`;
  const model = `${root}/model/${name}.evidence.json`;
  run('check', model, '--scope', scope);
  run('export', '--model', model, '--out', `${root}/generated`, '--verify');
}
