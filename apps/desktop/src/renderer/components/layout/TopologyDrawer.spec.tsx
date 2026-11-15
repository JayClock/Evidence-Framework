import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createDomainGraph } from '@evidence-poc/evidence-model-core';
import { computeGraphLayout } from '@evidence-poc/evidence-canvas-interaction';

import { TopologyDrawer } from './TopologyDrawer';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const setup = async (document = createDesktopFixture()) => {
  const graph = createDomainGraph(document);
  const layout = await computeGraphLayout(graph);
  const onFocusNode = vi.fn();
  const onSearchTermChange = vi.fn();

  const view = render(
    <TopologyDrawer
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

describe('TopologyDrawer', () => {
  it('lists contexts as groups and their objects as entries', async () => {
    await setup();

    expect(screen.getByText('商品采购（Procurement）')).toBeInTheDocument();
    expect(screen.getByText('商品目录（Catalog）')).toBeInTheDocument();
    expect(
      screen.getByText('采购协议（Procurement Contract）'),
    ).toBeInTheDocument();
    expect(screen.getByText('采购方企业（Buyer Org）')).toBeInTheDocument();
  });

  it('collapses a context group without dropping other groups', async () => {
    const { graph, layout } = await setup();
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

  it('focuses a node when its entry is clicked', async () => {
    const { onFocusNode } = await setup();

    fireEvent.click(screen.getByText('交付请求（Delivery Request）'));

    expect(onFocusNode).toHaveBeenCalledWith('evidence.request');
  });

  it('filters by label and reports empty results', async () => {
    const graph = createDomainGraph(createDesktopFixture());
    const layout = await computeGraphLayout(graph);
    const onSearchTermChange = vi.fn();

    const { rerender } = render(
      <TopologyDrawer
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
      <TopologyDrawer
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
      <TopologyDrawer
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

  it('does not advertise retired scenarios or claim to execute backend acceptance', async () => {
    await setup();
    expect(screen.getByText('验收样例 · 0')).toBeInTheDocument();
    expect(
      screen.getByText('在实体 examples[].test 中声明验收样例。'),
    ).toBeInTheDocument();
    expect(screen.queryByText('验证场景')).toBeNull();
  });
  it('lists executable inline examples and focuses their owning entity', async () => {
    const document = createDesktopFixture();
    const entity = document.entities.find(
      (entity) => entity.id === 'evidence.request',
    )!;
    entity.examples = [
      {
        label: '正常交付',
        value: {},
        test: {
          flow: 'delivery',
          actingRoleRef: 'role.buyer',
          asOf: '2026-03-31T10:00:00Z',
        },
      },
      { label: '只作文档', value: {} },
    ];
    const { onFocusNode } = await setup(document);
    expect(screen.getByText('验收样例 · 1')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: '交付请求（Delivery Request） · 正常交付',
      }),
    );
    expect(onFocusNode).toHaveBeenCalledWith('evidence.request');
    expect(screen.queryByText(/只作文档/)).toBeNull();
    expect(screen.getByText(/此处不执行 HTTP 验收/)).toBeInTheDocument();
  });
});
