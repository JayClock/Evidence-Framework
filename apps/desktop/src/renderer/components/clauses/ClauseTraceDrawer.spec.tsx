import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { ClauseTraceDrawer } from './ClauseTraceDrawer';

const sourceModel = () => {
  const model = createDesktopFixture();
  model.manifest.sourceDocument = {
    text: '甲方支付。法院管辖。',
    clauses: [
      {
        index: 1,
        text: '甲方支付',
        category: 'business',
        reason: '',
        charStart: 0,
        charEnd: 4,
      },
      {
        index: 2,
        text: '法院管辖',
        category: 'boilerplate',
        reason: '',
        charStart: 5,
        charEnd: 9,
      },
    ],
  };
  model.entities.find(
    (entity) => entity.id === 'evidence.contract',
  )!.sourceSnippet = {
    text: '甲方支付',
    source: 'contract',
    clauseIndex: 1,
    charStart: 0,
    charEnd: 4,
  };
  return model;
};

describe('clause trace drawer', () => {
  it('highlights the selected entity clause and focuses a chosen linked object', () => {
    const model = sourceModel();
    const onFocusEntity = vi.fn();
    const { container, rerender } = render(
      <ClauseTraceDrawer
        model={model}
        selectedNodeId={null}
        onFocusEntity={onFocusEntity}
      />,
    );
    expect(screen.queryByText('法院管辖')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /定位 采购协议/ }));
    expect(onFocusEntity).toHaveBeenCalledWith('evidence.contract');
    rerender(
      <ClauseTraceDrawer
        model={model}
        selectedNodeId="evidence.contract"
        onFocusEntity={onFocusEntity}
      />,
    );
    expect(
      container.querySelector('[data-clause-id="clause-1"]'),
    ).toHaveAttribute('data-clause-selected', 'true');
    fireEvent.click(screen.getByRole('checkbox', { name: '显示纯法务条款' }));
    expect(screen.getByText('法院管辖')).toBeInTheDocument();
    expect(screen.getByText('未关联模型对象')).toBeInTheDocument();
  });
  it('honestly distinguishes legacy snippets, missing sources and unsafe matches', () => {
    const model = createDesktopFixture();
    const { rerender } = render(
      <ClauseTraceDrawer
        model={model}
        selectedNodeId={null}
        onFocusEntity={vi.fn()}
      />,
    );
    expect(screen.getByText(/暂无来源条款/)).toBeInTheDocument();
    model.entities[0]!.sourceSnippet = { text: '<script>秘密条款</script>' };
    rerender(
      <ClauseTraceDrawer
        model={{ ...model }}
        selectedNodeId={null}
        onFocusEntity={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent('仅保存来源片段');
    expect(screen.getByText('<script>秘密条款</script>')).toBeInTheDocument();
    const changed = sourceModel();
    changed.entities.find(
      (entity) => entity.id === 'evidence.contract',
    )!.sourceSnippet!.text = '条款已经更改';
    rerender(
      <ClauseTraceDrawer
        model={changed}
        selectedNodeId="evidence.contract"
        onFocusEntity={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('无法唯一定位');
  });
});
