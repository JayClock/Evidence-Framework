import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type {
  SensorReport,
  SensorIssue,
} from '@evidence-poc/evidence-agent/browser';
import { createDomainGraph } from '@evidence-poc/evidence-model-core/browser';
import { createGraphLayout } from '@evidence-poc/evidence-canvas-interaction';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { createDiagnosticIndex } from './diagnosticIndex';
import { DiagnosticMarkers } from './DiagnosticMarkers';

const issue = (
  id: string,
  severity: SensorIssue['severity'],
  targetNodeId?: string,
): SensorIssue => ({
  issueId: id,
  severity,
  source: 'check_fm',
  code: 'TEST',
  message: id,
  ...(targetNodeId ? { targetNodeId } : {}),
});
const report = (issues: SensorIssue[]): SensorReport => ({
  issues,
  timestamp: new Date().toISOString(),
  passed: true,
  blockCount: 0,
  warnCount: 0,
  infoCount: 0,
  keyDataSummary: {
    totalItems: 0,
    resolvedCount: 0,
    decisionOwedCount: 0,
    unresolvedItems: [],
  },
  isStageGateReady: false,
  unavailableSensors: [],
});

describe('diagnostic projection', () => {
  it('deduplicates, ranks severities and does not invent references from messages', () => {
    const document = createDesktopFixture();
    const id = document.entities.find(
      (item) => item.category !== 'context',
    )!.id;
    const first = issue('a', 'info', `${id}#amount`);
    const index = createDiagnosticIndex(
      report([
        first,
        first,
        issue('b', 'block', id),
        issue('unknown', 'warn', 'missing'),
        issue(id, 'warn'),
      ]),
      document,
    );
    expect(index.size).toBe(1);
    expect(index.get(id)?.severity).toBe('block');
    expect(index.get(id)?.issues).toHaveLength(2);
    expect(createDiagnosticIndex(null, document).size).toBe(0);
  });
  it('locates context and edge findings and activates sibling controls without selecting cards', () => {
    const document = createDesktopFixture();
    const layout = createGraphLayout(createDomainGraph(document));
    const edge = layout.edges[0]!;
    const context = layout.contextGroups[0]!;
    const items = [
      issue('edge', 'warn', edge.relationshipId),
      { ...issue('context', 'info'), contextRef: context.contextId },
    ];
    const index = createDiagnosticIndex(report(items), document);
    const open = vi.fn();
    const { container } = render(
      <DiagnosticMarkers
        index={index}
        layout={layout}
        scope={null}
        onOpen={open}
      />,
    );
    expect(container.querySelectorAll('[data-diagnostic-for]')).toHaveLength(2);
    fireEvent.click(
      screen.getByRole('button', { name: `${edge.relationshipId}：警告 1 项` }),
    );
    expect(open).toHaveBeenCalledWith([items[0]]);
  });
});
