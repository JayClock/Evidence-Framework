import { readFileSync } from 'node:fs';
import { parseModelBundleText } from '@evidence-poc/evidence-model-core';

/** The shipped model is the golden input, not a separately maintained copy. */
export const fullSpectrumModel = () => {
  const result = parseModelBundleText(
    readFileSync(
      new URL(
        '../../../../examples/full-spectrum-procurement/model/full-spectrum-procurement.evidence.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  if (result.issues.length) throw new Error(JSON.stringify(result.issues));
  return result.document;
};
