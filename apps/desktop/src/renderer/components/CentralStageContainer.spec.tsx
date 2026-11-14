import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CentralStageContainer } from './CentralStageContainer';

const stage = (mode: 'graph' | 'table' | 'split') =>
  render(
    <CentralStageContainer
      mode={mode}
      graph={<p>拓扑画布</p>}
      table={<p>领域台账</p>}
    />,
  );

describe('CentralStageContainer', () => {
  it('gives the graph the whole stage when that is the chosen surface', () => {
    const { container } = stage('graph');

    expect(screen.getByText('拓扑画布')).toBeInTheDocument();
    expect(screen.queryByText('领域台账')).toBeNull();
    expect(container.querySelector('[data-mode="graph"]')).not.toBeNull();
  });

  it('gives the ledger the whole stage when that is the chosen surface', () => {
    const { container } = stage('table');

    expect(screen.getByText('领域台账')).toBeInTheDocument();
    expect(screen.queryByText('拓扑画布')).toBeNull();
    expect(container.querySelector('[data-mode="table"]')).not.toBeNull();
  });

  it('mounts both surfaces and the draggable gutter in split mode', () => {
    const { container } = stage('split');

    expect(screen.getByText('拓扑画布')).toBeInTheDocument();
    expect(screen.getByText('领域台账')).toBeInTheDocument();
    expect(
      container.querySelectorAll('[data-panel-resize-handle-id]'),
    ).toHaveLength(1);
    expect(container.querySelector('[data-mode="split"]')).not.toBeNull();
  });
});
