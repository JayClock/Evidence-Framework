import { createHash } from 'node:crypto';

import type { WorkbenchAssets } from './workbenchAssets.js';
import type { WorkbenchData } from '../projection/workbenchProjection.js';

/**
 * Turns the projected data into the one page the review reads.
 *
 * The page is self-contained and read-only: one inline script, one inline style,
 * and a Content-Security-Policy that forbids every request. The policy is
 * computed from the script the page actually ships, so a tampered build cannot
 * keep the hash and a rewritten one cannot silently widen the policy.
 */

/** First line of every generated page, so a publisher knows what it may replace. */
export const WORKBENCH_MARKER = '<!-- evidence-object-workbench -->';

/** Placeholders the page template carries. */
const PLACEHOLDER = /@@(APP|STYLE|DATA|CSP)@@/g;

export class WorkbenchRenderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkbenchRenderError';
  }
}

/**
 * JSON that cannot end the script element it is embedded in.
 *
 * `<` and `>` would let a label close the tag, `&` would start an entity, and the
 * two line separators terminate a JavaScript string literal even though they are
 * valid JSON. Escaping them keeps the payload inert without changing its value.
 */
export const embeddedJson = (value: unknown): string =>
  JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029');

/** The single inline script a page ships, or an error naming the count. */
const inlineScriptOf = (html: string): string => {
  const scripts = [...html.matchAll(/<script>(.*?)<\/script>/gs)].map(
    (match) => match[1] ?? '',
  );

  if (scripts.length !== 1) {
    throw new WorkbenchRenderError('工作台只允许一个内联脚本');
  }

  return scripts[0] as string;
};

/** `default-src 'none'` plus the one hash the page's own script earns. */
export const scriptHashCsp = (script: string): string => {
  const digest = createHash('sha256').update(script, 'utf8').digest('base64');

  return [
    "default-src 'none'",
    `script-src 'sha256-${digest}'`,
    "style-src 'unsafe-inline'",
    'img-src data:',
    "connect-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
};

/**
 * Renders the page from the assets and the projected data.
 *
 * The policy is filled in last because it hashes the finished script, which only
 * exists once the data is embedded. `replace` does not rescan its own output, so
 * a placeholder inside the data stays data.
 */
export const renderWorkbenchHtml = (
  data: WorkbenchData,
  assets: WorkbenchAssets,
): string => {
  if (assets.app.toLowerCase().includes('</script')) {
    throw new WorkbenchRenderError('资源含有非法结束标签');
  }
  if (assets.style.toLowerCase().includes('</style')) {
    throw new WorkbenchRenderError('资源含有非法结束标签');
  }

  const parts: Record<string, string> = {
    APP: assets.app,
    STYLE: assets.style,
    DATA: embeddedJson(data),
    CSP: '',
  };
  const expand = (): string =>
    assets.template.replace(PLACEHOLDER, (_match, key: string) => parts[key] ?? '');

  parts['CSP'] = scriptHashCsp(inlineScriptOf(expand()));

  return `${WORKBENCH_MARKER}\n${expand()}`;
};
