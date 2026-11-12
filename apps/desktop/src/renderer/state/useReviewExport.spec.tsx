import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { installDesktopApi } from '../test-support/desktopApi';

import { useReviewExport } from './useReviewExport';

const withApi = (
  result: Parameters<typeof installDesktopApi>[0],
): ReturnType<typeof installDesktopApi> => installDesktopApi(result);

describe('useReviewExport', () => {
  it('reports the page it wrote', async () => {
    const api = withApi({
      exportReviewResult: {
        status: 'saved',
        path: '/models/procurement/review.html',
        counts: {
          contracts: 2,
          entities: 28,
          rules: 8,
          scenarios: 1,
          capabilities: 13,
        },
      },
    });
    const { result } = renderHook(() => useReviewExport('/models/procurement'));

    await act(async () => {
      await result.current.exportPage();
    });

    expect(api.calls.exportReview).toEqual(['/models/procurement']);
    expect(result.current.notice).toEqual({
      tone: 'saved',
      message: '已导出审查页：/models/procurement/review.html',
    });
    expect(result.current.busy).toBe(false);
  });

  it('reports why the export failed', async () => {
    withApi({
      exportReviewResult: { status: 'failed', error: 'FM 未通过，不生成视图' },
    });
    const { result } = renderHook(() => useReviewExport('/models/procurement'));

    await act(async () => {
      await result.current.exportPage();
    });

    expect(result.current.notice).toEqual({
      tone: 'failed',
      message: '导出失败：FM 未通过，不生成视图',
    });
  });

  it('stays quiet when the user cancels the dialog', async () => {
    withApi({ exportReviewResult: { status: 'cancelled' } });
    const { result } = renderHook(() => useReviewExport('/models/procurement'));

    await act(async () => {
      await result.current.exportPage();
    });

    expect(result.current.notice).toBeNull();
  });

  it('dismisses the notice it was given', async () => {
    withApi({ exportReviewResult: { status: 'cancelled' } });
    const { result } = renderHook(() => useReviewExport('/models/procurement'));

    await act(async () => {
      await result.current.exportPage();
    });
    act(() => {
      result.current.dismissNotice();
    });

    expect(result.current.notice).toBeNull();
  });
});
