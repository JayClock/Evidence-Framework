import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { createModelSession } from '@evidence-poc/evidence-model-core';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';
import { WorkshopWizardDrawer } from './WorkshopWizardDrawer';

describe('WorkshopWizardDrawer', () => {
  it('guides a new contract and an atomic pair without calling AI', () => {
    const session = createModelSession({ document: createDesktopFixture() });
    const onFocus = vi.fn();
    const onReview = vi.fn();
    const view = render(
      <WorkshopWizardDrawer
        session={session}
        onFocus={onFocus}
        onReview={onReview}
      />,
    );
    fireEvent.change(screen.getByLabelText('合约名称'), {
      target: { value: '专栏订阅' },
    });
    fireEvent.change(screen.getByLabelText('一方角色'), {
      target: { value: '读者' },
    });
    fireEvent.change(screen.getByLabelText('另一方角色'), {
      target: { value: '平台' },
    });
    fireEvent.click(screen.getByRole('button', { name: '建立合约与双方' }));
    expect(onFocus).toHaveBeenCalled();
    view.rerender(
      <WorkshopWizardDrawer
        session={session}
        onFocus={onFocus}
        onReview={onReview}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /2. 成对挖掘履约项/ }));
    fireEvent.change(screen.getByLabelText('履约要求'), {
      target: { value: '访问内容' },
    });
    fireEvent.change(screen.getByLabelText('完成凭证'), {
      target: { value: '访问记录' },
    });
    fireEvent.change(screen.getByLabelText('截止依据'), {
      target: { value: '合同访问期限' },
    });
    fireEvent.click(screen.getByRole('button', { name: '成对添加履约项' }));
    expect(
      session.getDocument().entities.some((e) => e.label === '访问记录'),
    ).toBe(true);
    expect(onReview).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: /5. 给违约一条补偿路径/ }),
    );
    expect(screen.getByText(/请逐项核对超时/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /带着当前问题/ }));
    expect(onReview).toHaveBeenCalledWith(expect.stringContaining('补偿'));
  });
});
