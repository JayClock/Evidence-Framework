import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LifecycleSwimlaneOverlay } from './LifecycleSwimlaneOverlay.js';

describe('LifecycleSwimlaneOverlay', () => {
  it('应当渲染全部四个生命周期阶段标签', () => {
    render(<LifecycleSwimlaneOverlay width={1200} height={800} />);

    expect(screen.getByText('邀请投标')).toBeInTheDocument();
    expect(screen.getByText('投标')).toBeInTheDocument();
    expect(screen.getByText('合同')).toBeInTheDocument();
    expect(screen.getByText('履约')).toBeInTheDocument();
  });

  it('应当渲染生命周期时间箭头指示线', () => {
    render(<LifecycleSwimlaneOverlay width={1200} height={800} />);
    expect(
      screen.getByText(/Business Life Cycle Time Horizon/i),
    ).toBeInTheDocument();
  });
});
