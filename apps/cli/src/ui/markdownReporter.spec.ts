import { expect, it } from 'vitest';
import { markdownReport, junitReport } from './markdownReporter.js';
import {
  trafficLightReport,
  type AcceptanceReport,
} from './trafficLightReporter.js';
it('escapes report data and preserves pending failures and drift in machine reports', () => {
  const report: AcceptanceReport = {
    passed: false,
    pending: true,
    gate: 'dod',
    targetUrl: 'http://localhost',
    totalDurationMs: 10,
    suites: [
      {
        passed: false,
        suitePath: 'suite',
        targetUrl: 'http://localhost',
        totalDurationMs: 10,
        steps: [
          {
            id: 'id',
            flow: '<flow|>',
            name: '"step"',
            method: 'GET',
            url: 'http://localhost',
            passed: false,
            skipped: false,
            durationMs: 10,
            assertions: [],
            driftIssues: [
              {
                type: 'missing_required',
                path: '/amount',
                keyword: 'required',
                message: 'missing',
              },
            ],
          },
        ],
      },
    ],
  };
  const markdown = markdownReport(report);
  expect(markdown).toContain('PENDING — WIP');
  expect(markdown).toContain('&lt;flow&#124;&gt;');
  expect(markdown).toContain('- [ ]');
  expect(junitReport(report)).toContain('failures="1"');
  expect(junitReport(report)).toContain('name="&quot;step&quot;"');
  const terminal = trafficLightReport(report, { color: false, verbose: false });
  expect(terminal).toContain('DRIFT: missing_required /amount');
  expect(terminal).toContain('PENDING (DoD WIP; not passed)');
  expect(terminal).toContain('Completion: 0%');
  expect(terminal).not.toContain('\u001b');
});
