import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryHubController } from '../../state/useDeliveryHub';
import { liveDeliveryPreview } from '@evidence-poc/desktop-testing/liveDelivery';
import { DeliveryHub } from './DeliveryHub';

const openapi = {
  path: 'openapi.json',
  content: '{\n  "openapi": "3.1.0"\n}\n',
};
const topology = {
  path: 'topology.json',
  content: '{"name": "<script>literal text</script>"}',
};
const analysis = { ...liveDeliveryPreview(), artifacts: [openapi, topology] };
const controller = (
  overrides: Partial<DeliveryHubController> = {},
): DeliveryHubController => ({
  loading: false,
  stale: false,
  error: null,
  busy: false,
  notice: null,
  analysis,
  preview: { ...analysis.preview, limitations: ['尚无确认。'] },
  exportDelivery: vi.fn(async () => undefined),
  dismissNotice: vi.fn(),
  ...overrides,
});
const show = (hub = controller(), dirty = false, externalChange = false) => {
  const onClose = vi.fn();
  const view = render(
    <DeliveryHub
      hub={hub}
      projectName="商品采购"
      dirty={dirty}
      externalChange={externalChange}
      onClose={onClose}
      onRestoreFocus={() => undefined}
    />,
  );
  return { ...view, onClose };
};

afterEach(() => vi.unstubAllGlobals());

describe('DeliveryHub', () => {
  it('starts with the actual OpenAPI file, switches files, and copies exact text', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    show();
    expect(
      screen.getByRole('dialog', { name: '交付与导出中枢' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: /OpenAPI 契约/ }),
    ).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('openapi.json 文件内容').textContent).toBe(
      openapi.content,
    );
    fireEvent.click(screen.getByRole('button', { name: /服务拓扑/ }));
    const code = screen.getByLabelText('topology.json 文件内容');
    expect(code.textContent).toBe(topology.content);
    expect(code.querySelector('script')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
    expect(writeText).toHaveBeenCalledWith(topology.content);
    expect(await screen.findByText('已复制文件内容')).toBeVisible();
  });

  it('keeps the contract overview, incremental diff and session baseline available', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: '契约全览' }));
    expect(screen.getByText('尚无确认。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '本次增量变更' }));
    expect(screen.getByText('无契约兼容性变更')).toBeInTheDocument();
    expect(screen.getByText(/保存不会重置差异/)).toBeInTheDocument();
  });

  it('exports only a current accepted draft and reports unsaved edits', () => {
    const hub = controller();
    show(hub, true);
    expect(screen.getByText('基于未保存的模型草稿')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '导出当前草稿' }));
    expect(hub.exportDelivery).toHaveBeenCalledOnce();
  });

  it('keeps export disabled while the native picker or write is pending', () => {
    show(controller({ busy: true }));
    expect(screen.getByRole('button', { name: '导出中…' })).toBeDisabled();
  });

  it('disables copy and export for stale snapshots', () => {
    show(controller({ stale: true, loading: true }));
    expect(screen.getByText(/上一次投影/)).toBeVisible();
    expect(screen.getByRole('button', { name: '复制代码' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '导出当前草稿' })).toBeDisabled();
    expect(screen.queryByText('无 API 阻断')).not.toBeInTheDocument();
  });

  it('shows live API blockers and breaking changes without treating them as production drift', () => {
    const hub = controller({
      analysis: {
        ...analysis,
        canExportDraft: false,
        apiSummary: {
          ...analysis.apiSummary,
          hasBaseline: true,
          breakingChangeCount: 2,
        },
        issues: [
          {
            issueId: 'api-invalid',
            source: 'audit_api',
            severity: 'block',
            code: 'API_INVALID',
            message: 'Cannot project',
          },
        ],
      },
    });
    show(hub, false, true);
    expect(screen.getByText('1 项阻断')).toBeVisible();
    expect(screen.getByText('2 项')).toBeVisible();
    expect(screen.getByText(/检测到磁盘变更/)).toBeVisible();
    expect(screen.getByRole('button', { name: '导出当前草稿' })).toBeDisabled();
  });

  it('shows preview errors and allows returning without exporting', async () => {
    const { onClose } = show(
      controller({ stale: true, error: '预览失败', analysis: null }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('预览失败');
    expect(screen.getByRole('button', { name: '导出当前草稿' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '返回工作台' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
