import { readFileSync } from 'node:fs';
import { buildFmCheckReport } from './fmCheck.js';
import { parseModelBundleText } from '../adapters/modelBundle.js';
import { compileCelExpression } from '../cel/celEvaluator.js';

it('keeps the full-spectrum example schema-valid, traceable and CEL-compilable', () => {
  const parsed = parseModelBundleText(
    readFileSync(
      new URL(
        '../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  expect(parsed.issues).toEqual([]);
  const { report } = buildFmCheckReport({ model: parsed.document });
  expect(report.errors).toEqual([]);
  expect(report.valid).toBe(true);
  for (const rule of parsed.document.rules)
    expect(() => compileCelExpression(rule.expression)).not.toThrow();
});
