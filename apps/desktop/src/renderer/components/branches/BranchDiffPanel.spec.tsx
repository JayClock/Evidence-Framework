import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ModelDiff } from '@evidence-poc/evidence-model-core/browser';
import type { VerdictDiff } from '@evidence-poc/evidence-modeling-orchestrator/browser';

import { BranchDiffPanel } from './BranchDiffPanel';
import { branchSummary } from '../../test-support/desktopApi';

const branches = [
  branchSummary(),
  branchSummary({
    id: 'monthly',
    name: '月度对账',
    parentBranchId: 'main',
    isActive: false,
    lastVerdict: {
      timestamp: '2026-11-11T09:30:00.000Z',
      passed: true,
      blockCount: 0,
      warnCount: 1,
      infoCount: 0,
      decisionOwedCount: 1,
      isStageGateReady: false,
    },
  }),
];

const modelDiff = (overrides: Partial<ModelDiff> = {}): ModelDiff => ({
  baseModelId: 'procurement',
  targetModelId: 'procurement',
  summary: {
    addedCount: 1,
    removedCount: 0,
    modifiedCount: 1,
    keyDataChangedCount: 1,
    hasKeyDataDrift: true,
    decisionOwedBase: 0,
    decisionOwedTarget: 1,
  },
  contexts: [],
  entities: [
    {
      id: 'evidence.statement',
      label: '月度对账单',
      category: 'evidence',
      kind: 'fulfillment_confirmation',
      changeType: 'added',
      attributeDiffs: [
        { name: 'settled_minor_units', label: '结算金额', changeType: 'added' },
        { name: 'confirmed_at', label: '确认时间', changeType: 'unchanged' },
      ],
    },
    {
      id: 'request.payment',
      label: '付款请求',
      category: 'evidence',
      kind: 'fulfillment_request',
      changeType: 'modified',
      fields: ['attributes'],
      attributeDiffs: [
        {
          name: 'requested_minor_units',
          label: '请求金额',
          changeType: 'modified',
          fields: ['derivedByRuleRef'],
        },
      ],
    },
  ],
  relationships: [],
  rules: [],
  keyData: [
    {
      entityRef: 'evidence.statement',
      attribute: 'settled_minor_units',
      label: '结算金额',
      changeType: 'added',
      targetSource: 'needs-decision',
      targetDecisionOwed: true,
    },
  ],
  ...overrides,
});

const comparableVerdict = (overrides: Partial<VerdictDiff> = {}): VerdictDiff => ({
  comparable: true,
  base: {
    timestamp: '2026-11-11T08:00:00.000Z',
    passed: true,
    blockCount: 0,
    warnCount: 0,
    infoCount: 0,
    decisionOwedCount: 0,
    isStageGateReady: true,
  },
  target: {
    timestamp: '2026-11-11T09:30:00.000Z',
    passed: true,
    blockCount: 0,
    warnCount: 1,
    infoCount: 0,
    decisionOwedCount: 1,
    isStageGateReady: false,
  },
  fixedIssueIds: [],
  introducedIssueIds: [],
  fixedIssues: [],
  introducedIssues: [],
  sharedIssueCount: 0,
  gateImproved: false,
  gateRegressed: true,
  ...overrides,
});

const renderPanel = (overrides: {
  diff?: ModelDiff;
  verdict?: VerdictDiff;
} = {}) => {
  const onMerge = vi.fn();
  const onClose = vi.fn();
  const onFocusNode = vi.fn();

  render(
    <BranchDiffPanel
      branches={branches}
      activeBranchId="main"
      compareBranchId="monthly"
      diff={overrides.diff ?? modelDiff()}
      verdict={overrides.verdict ?? comparableVerdict()}
      busy={false}
      onClose={onClose}
      onMerge={onMerge}
      onFocusNode={onFocusNode}
    />,
  );

  return { onMerge, onClose, onFocusNode };
};

describe('BranchDiffPanel', () => {
  it('names both branches and counts the movement', () => {
    renderPanel();

    expect(screen.getByText('主干（main） ↔ 月度对账')).toBeInTheDocument();
    expect(screen.getByText('新增 1 · 删除 0 · 修改 1')).toBeInTheDocument();
    expect(screen.getByText('关键数据变动 1 · 待决 0 → 1')).toBeInTheDocument();
  });

  it('lists changed objects with their changed attributes', () => {
    renderPanel();

    expect(screen.getByText('月度对账单')).toBeInTheDocument();
    expect(screen.getByText('新增settled_minor_units')).toBeInTheDocument();
    expect(screen.getByText('修改requested_minor_units')).toBeInTheDocument();
  });

  it('shows the provider that a branch traded away', () => {
    renderPanel();

    expect(screen.getByText('未建模 → 待决')).toBeInTheDocument();
  });

  it('reports a gate a branch closed', () => {
    renderPanel();

    expect(
      screen.getByText('对比分支关闭了阶段门禁。'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('主干：阻塞 0 · 警告 0 · 待决 0'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('对比分支：阻塞 0 · 警告 1 · 待决 1'),
    ).toBeInTheDocument();
  });

  it('says a verdict is not comparable instead of guessing', () => {
    renderPanel({
      verdict: comparableVerdict({
        comparable: false,
        base: null,
        target: null,
      }),
    });

    expect(
      screen.getByText(/两边尚未逐一运行检查/),
    ).toBeInTheDocument();
  });

  it('jumps to a changed object and merges the branch', () => {
    const { onFocusNode, onMerge } = renderPanel();

    fireEvent.click(screen.getByText('月度对账单'));

    expect(onFocusNode).toHaveBeenCalledWith('evidence.statement');

    fireEvent.click(screen.getByText('采纳并合入主干'));

    expect(onMerge).toHaveBeenCalledWith('monthly');
  });

  it('keeps the merge disabled while a mutation is in flight', () => {
    render(
      <BranchDiffPanel
        branches={branches}
        activeBranchId="main"
        compareBranchId="monthly"
        diff={modelDiff()}
        verdict={comparableVerdict()}
        busy
        onClose={vi.fn()}
        onMerge={vi.fn()}
        onFocusNode={vi.fn()}
      />,
    );

    expect(screen.getByText('采纳并合入主干')).toBeDisabled();
  });
});
