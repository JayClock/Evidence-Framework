import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { createGraphLayout } from '@evidence-poc/evidence-canvas-interaction';

import { LeftSidebar } from './LeftSidebar';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const setup = () => {
  const graph = createDomainGraph(createDesktopFixture());
  const layout = createGraphLayout(graph);
  const onFocusNode = vi.fn();
  const onSearchTermChange = vi.fn();

  const view = render(
    <LeftSidebar
      graph={graph}
      layout={layout}
      selectedNodeId={null}
      searchTerm=""
      onSearchTermChange={onSearchTermChange}
      searchInputRef={{ current: null }}
      onFocusNode={onFocusNode}
    />,
  );

  return { ...view, graph, layout, onFocusNode, onSearchTermChange };
};

describe('LeftSidebar', () => {
  it('lists contexts as groups and their objects as entries', () => {
    setup();

    expect(screen.getByText('商品采购（Procurement）')).toBeInTheDocument();
    expect(screen.getByText('商品目录（Catalog）')).toBeInTheDocument();
    expect(
      screen.getByText('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(screen.getByText('采购方企业（Buyer Org）')).toBeInTheDocument();
  });

  it('collapses a context group without dropping other groups', () => {
    const { graph, layout } = setup();
    const toggle = screen.getByRole('button', {
      name: /商品采购（Procurement）/,
    });

    expect(layout.contextGroups).toHaveLength(2);
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByText('采购协议（Procurement Contract）'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('库存（Inventory）')).toBeInTheDocument();
    expect(graph.getEntity('evidence.contract')).toBeDefined();
  });

  it('focuses a node when its entry is clicked', () => {
    const { onFocusNode } = setup();

    fireEvent.click(screen.getByText('交付请求（Delivery Request）'));

    expect(onFocusNode).toHaveBeenCalledWith('evidence.request');
  });

  it('filters by label and reports empty results', () => {
    const graph = createDomainGraph(createDesktopFixture());
    const layout = createGraphLayout(graph);
    const onSearchTermChange = vi.fn();

    const { rerender } = render(
      <LeftSidebar
        graph={graph}
        layout={layout}
        selectedNodeId={null}
        searchTerm=""
        onSearchTermChange={onSearchTermChange}
        searchInputRef={{ current: null }}
        onFocusNode={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText('搜索业务对象'), {
      target: { value: '请求' },
    });

    expect(onSearchTermChange).toHaveBeenCalledWith('请求');

    rerender(
      <LeftSidebar
        graph={graph}
        layout={layout}
        selectedNodeId={null}
        searchTerm="请求"
        onSearchTermChange={onSearchTermChange}
        searchInputRef={{ current: null }}
        onFocusNode={vi.fn()}
      />,
    );

    expect(screen.getByText('搜索结果 1')).toBeInTheDocument();
    expect(
      screen.getByText('交付请求（Delivery Request）'),
    ).toBeInTheDocument();
    expect(screen.queryByText('商品目录（Catalog）')).not.toBeInTheDocument();

    rerender(
      <LeftSidebar
        graph={graph}
        layout={layout}
        selectedNodeId={null}
        searchTerm="不存在的对象"
        onSearchTermChange={onSearchTermChange}
        searchInputRef={{ current: null }}
        onFocusNode={vi.fn()}
      />,
    );

    expect(screen.getByText('没有匹配的业务对象。')).toBeInTheDocument();
  });

  it('keeps verification scenarios empty until scenarios are modeled', () => {
    setup();

    expect(screen.getByText('验证场景')).toBeInTheDocument();
    expect(screen.getByText('尚无验证场景。')).toBeInTheDocument();
  });
});
