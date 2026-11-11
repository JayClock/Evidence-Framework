import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EditorScreen } from './EditorScreen';
import {
  branchSummary,
  installDesktopApi,
  projectSummary,
} from '../test-support/desktopApi';
import { createDesktopFixture } from '../test-support/modelFixture';

const readyProject = (
  branches = [branchSummary()],
): ReturnType<typeof installDesktopApi> =>
  installDesktopApi({
    branches,
    openResult: {
      success: true,
      project: projectSummary({ name: '桌面端夹具（Desktop Fixture）' }),
      document: createDesktopFixture(),
      issues: [],
    },
  });

const monthly = branchSummary({
  id: 'monthly',
  name: '月度对账',
  parentBranchId: 'main',
  isActive: false,
});

describe('BranchSelector in the editor header', () => {
  it('lists the lineages and checks one out', async () => {
    const api = readyProject([branchSummary(), monthly]);

    render(<EditorScreen rootPath="/models/procurement" />);

    const select = await screen.findByLabelText('当前分支');

    await waitFor(() => {
      expect(select).toHaveValue('main');
    });
    expect(
      screen.getByRole('option', { name: '月度对账' }),
    ).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'monthly' } });

    await waitFor(() => {
      expect(api.branchMock.switched).toEqual([
        { rootPath: '/models/procurement', branchId: 'monthly' },
      ]);
    });
    await waitFor(() => {
      expect(screen.getByLabelText('当前分支')).toHaveValue('monthly');
    });
  });

  it('forks a named branch from the current assumption', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);

    fireEvent.click(await screen.findByText('分叉'));
    fireEvent.change(screen.getByLabelText('新分支名称'), {
      target: { value: '月结对账' },
    });
    fireEvent.change(screen.getByLabelText('新分支说明'), {
      target: { value: '假设 B：按月集中对账' },
    });
    fireEvent.click(screen.getByText('建立'));

    await waitFor(() => {
      expect(api.branchMock.created).toEqual([
        {
          rootPath: '/models/procurement',
          name: '月结对账',
          description: '假设 B：按月集中对账',
          sourceBranchId: 'main',
        },
      ]);
    });
  });

  it('does not submit a fork without a name', async () => {
    const api = readyProject();

    render(<EditorScreen rootPath="/models/procurement" />);

    fireEvent.click(await screen.findByText('分叉'));
    fireEvent.click(screen.getByText('建立'));

    expect(api.branchMock.created).toEqual([]);
  });

  it('compares against another branch and drops the comparison on request', async () => {
    const api = readyProject([branchSummary(), monthly]);

    api.branchMock.setComparison({
      success: true,
      comparison: {
        baseBranchId: 'main',
        targetBranchId: 'monthly',
        diff: {
          baseModelId: 'desktop-fixture',
          targetModelId: 'desktop-fixture',
          summary: {
            addedCount: 1,
            removedCount: 0,
            modifiedCount: 2,
            keyDataChangedCount: 0,
            hasKeyDataDrift: false,
            decisionOwedBase: 0,
            decisionOwedTarget: 0,
          },
          contexts: [],
          entities: [],
          relationships: [],
          rules: [],
          keyData: [],
        },
        baseDocument: createDesktopFixture(),
        targetDocument: createDesktopFixture(),
      },
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    const compare = await screen.findByLabelText('对比分支');

    fireEvent.change(compare, { target: { value: 'monthly' } });

    await waitFor(() => {
      expect(api.branchMock.compared).toEqual([
        {
          rootPath: '/models/procurement',
          baseBranchId: 'main',
          targetBranchId: 'monthly',
        },
      ]);
    });

    fireEvent.change(screen.getByLabelText('对比分支'), {
      target: { value: '' },
    });

    expect(screen.getByLabelText('对比分支')).toHaveValue('');
  });

  it('opens the diff panel for a chosen comparison and merges from it', async () => {
    const api = readyProject([branchSummary(), monthly]);

    api.branchMock.setComparison({
      success: true,
      comparison: {
        baseBranchId: 'main',
        targetBranchId: 'monthly',
        diff: {
          baseModelId: 'desktop-fixture',
          targetModelId: 'desktop-fixture',
          summary: {
            addedCount: 1,
            removedCount: 0,
            modifiedCount: 0,
            keyDataChangedCount: 0,
            hasKeyDataDrift: false,
            decisionOwedBase: 0,
            decisionOwedTarget: 0,
          },
          contexts: [],
          entities: [
            {
              id: 'evidence.statement',
              label: '月度对账单',
              category: 'evidence',
              kind: 'fulfillment_confirmation',
              changeType: 'added',
            },
          ],
          relationships: [],
          rules: [],
          keyData: [],
        },
        baseDocument: createDesktopFixture(),
        targetDocument: createDesktopFixture(),
      },
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    fireEvent.change(await screen.findByLabelText('对比分支'), {
      target: { value: 'monthly' },
    });

    expect(await screen.findByLabelText('分支对比')).toBeInTheDocument();
    expect(screen.getByText('月度对账单')).toBeInTheDocument();

    fireEvent.click(screen.getByText('采纳并合入主干'));

    await waitFor(() => {
      expect(api.branchMock.merged).toEqual([
        { rootPath: '/models/procurement', sourceBranchId: 'monthly' },
      ]);
    });
  });

  it('explains a rejected checkout instead of pretending it happened', async () => {
    const api = readyProject([branchSummary(), monthly]);

    api.branchMock.setSwitchResult({
      success: false,
      error: '当前检出的分支不能删除，请先切回主干。',
    });

    render(<EditorScreen rootPath="/models/procurement" />);

    fireEvent.change(await screen.findByLabelText('当前分支'), {
      target: { value: 'monthly' },
    });

    expect(
      await screen.findByText('当前检出的分支不能删除，请先切回主干。'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('当前分支')).toHaveValue('main');
  });
});
