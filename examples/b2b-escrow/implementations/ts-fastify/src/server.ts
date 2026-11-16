import { parseArgs } from 'node:util';
import { createApp, faults, type Fault } from './app.js';

async function main() {
  const { values } = parseArgs({
    options: {
      port: { type: 'string', default: '8085' },
      mode: { type: 'string', default: 'v2' },
      fault: { type: 'string', default: 'none' },
      'test-mode': { type: 'boolean', default: false },
    },
    strict: true,
    allowPositionals: false,
  });
  const port = Number(values.port);
  if (
    !/^\d+$/.test(values.port!) ||
    !Number.isInteger(port) ||
    port < 0 ||
    port > 65535
  )
    throw new Error('Invalid --port');
  if (!['v1', 'v2'].includes(values.mode!)) throw new Error('Invalid --mode');
  if (!faults.includes(values.fault as Fault))
    throw new Error('Invalid --fault');
  if (!values['test-mode'])
    throw new Error(
      'Reference backend requires --test-mode; client role/clock headers are not production authentication',
    );
  const app = createApp({
    testMode: true,
    mode: values.mode as 'v1' | 'v2',
    fault: values.fault as Fault,
  });
  const host = await app.listen({ host: '127.0.0.1', port });
  process.stdout.write(`${JSON.stringify({ host })}\n`);
  for (const signal of ['SIGTERM', 'SIGINT'] as const)
    process.once(signal, () => {
      void app
        .close()
        .then(() => {
          process.exitCode = 0;
        })
        .catch((error: unknown) => {
          process.stderr.write(`${String(error)}\n`);
          process.exitCode = 1;
        });
    });
}
main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
