import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CodePreviewPane } from './CodePreviewPane';

afterEach(() => vi.unstubAllGlobals());

it('bounds the rendered excerpt while copying the whole file', async () => {
  const writeText = vi.fn(async () => undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  const content = `${'section\n'.repeat(15_000)}last section\n`;
  render(
    <CodePreviewPane
      actions={null}
      stale={false}
      artifact={{ path: 'api-changes.md', content }}
    />,
  );
  expect(
    screen.getByLabelText('api-changes.md 文件内容').textContent,
  ).not.toContain('last section');
  expect(screen.getByRole('status')).toHaveTextContent('仅预览文件开头');
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  expect(writeText).toHaveBeenCalledWith(content);
  expect(await screen.findByText('已复制文件内容')).toBeVisible();
});

it('announces clipboard failures', async () => {
  vi.stubGlobal('navigator', {
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  });
  render(
    <CodePreviewPane
      actions={null}
      stale={false}
      artifact={{ path: 'openapi.json', content: '{}' }}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: '复制代码' }));
  expect(await screen.findByRole('status')).toHaveTextContent('复制失败');
});
