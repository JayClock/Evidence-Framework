import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dispatch } from './router.js';
import type { CommandContext } from './context.js';

const cwd = fileURLToPath(new URL('../../../', import.meta.url));
export function captureContext(root = cwd) {
  const output: string[] = [],
    errors: string[] = [];
  const context: CommandContext = {
    cwd: root,
    stdout: (text) => output.push(text),
    stderr: (text) => errors.push(text),
    color: false,
  };
  return { context, output, errors };
}

describe('unified CLI dispatch', () => {
  it('shows help and reports unknown commands and options', async () => {
    const { context, output, errors } = captureContext();
    expect(await dispatch(['--help'], context)).toBe(0);
    expect(output.join('')).toContain('evidence diff api');
    expect(await dispatch(['nope'], context)).toBe(1);
    expect(errors.join('')).toContain('Unknown command');
    expect(await dispatch(['check', '--bad'], context)).toBe(1);
    expect(errors.join('')).toContain('Unknown option');
  });
  it('rejects incompatible API flags and mixed legacy aliases', async () => {
    for (const args of [
      ['api', 'unknown'],
      ['api', 'diff', '--model', 'model.evidence.json'],
      ['api', 'inspect', '--format', 'json'],
      ['api', 'inspect', '--fm', 'a', '--model', 'b'],
      ['pack', 'missing', '--out', 'a', '-o', 'b'],
    ]) {
      const { context, errors } = captureContext();
      expect(await dispatch(args, context), args.join(' ')).toBe(1);
      expect(errors).not.toEqual([]);
    }
  });

  it('checks bundle models through the static engine', async () => {
    const { context, output } = captureContext();
    expect(
      await dispatch(
        [
          'check',
          'libs/evidence-model-core/tests/fixtures/acceptance/procurement.evidence.json',
          '--json',
        ],
        context,
      ),
    ).toBe(0);
    expect(JSON.parse(output[0]!)).toMatchObject({
      valid: true,
      humanConfirmation: 'not-asserted-by-machine',
    });
  });
  it('returns machine-readable errors and rejects duplicate arguments', async () => {
    const { context, output, errors } = captureContext();
    expect(
      await dispatch(['check', 'absent.evidence.json', '--json'], context),
    ).toBe(1);
    expect(JSON.parse(output[0]!)).toMatchObject({ passed: false });
    expect(errors).toEqual([]);
    expect(await dispatch(['check', '--json', '--json'], context)).toBe(1);
    expect(JSON.parse(output[1]!).error).toContain('Duplicate');
  });
});
