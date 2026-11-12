import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { IngestDraftModal } from './IngestDraftModal';
import { installDesktopApi, projectSummary } from '../../test-support/desktopApi';
import type { IngestionDraft } from '@evidence-poc/evidence-schema';

const draft = (): IngestionDraft => ({
  modelName: '云服务采购',
  source: 'contract',
  contexts: [
    {
      id: 'context.contract',
      label: '采购协议上下文',
      kind: 'contract',
      rootRefs: ['contract.cloud'],
    },
  ],
  participants: [{ id: 'party.buyer', label: '甲方采购方', kind: 'party' }],
  roles: [
    { id: 'role.buyer', label: '买方', kind: 'party', contextRef: 'context.contract' },
  ],
  things: [],
  evidences: [
    {
      id: 'request.payment',
      label: '支付申请',
      kind: 'fulfillment_request',
      contextRef: 'context.contract',
      responsibleRoleRef: 'role.buyer',
      provenance: {
        text: '甲方需在 5 个工作日内完成首期技术服务费支付',
        locator: '第 1 句',
        source: 'contract',
      },
    },
    {
      id: 'confirmation.payment',
      label: '支付确认',
      kind: 'fulfillment_confirmation',
      contextRef: 'context.contract',
      responsibleRoleRef: 'role.buyer',
    },
  ],
  fulfillmentPairs: [
    {
      id: 'pair.payment',
      label: '支付申请 → 支付确认',
      requestRef: 'request.payment',
      confirmationRef: 'confirmation.payment',
    },
  ],
  breachCompensations: [],
  relationships: [],
});

const openReview = async (issues: readonly string[] = []) => {
  const api = installDesktopApi({
    ingestResult: {
      success: true,
      draft: draft(),
      reader: 'text-model',
      issues,
    },
  });

  render(
    <IngestDraftModal onClose={() => undefined} onCompiled={() => undefined} />,
  );

  fireEvent.change(screen.getByLabelText('业务原文'), {
    target: { value: '甲乙双方签订《企业级云服务采购协议》…' },
  });
  fireEvent.click(screen.getByText('读成草稿'));

  await screen.findByLabelText('校对导入的草稿');

  return api;
};

describe('IngestDraftModal', () => {
  it('sends the pasted text to the main process and says who read it', async () => {
    const api = await openReview();

    expect(api.calls.ingestDraft).toEqual([
      expect.objectContaining({
        kind: 'text',
        content: '甲乙双方签订《企业级云服务采购协议》…',
      }),
    ]);
    expect(screen.getByText(/读自模型/)).toBeInTheDocument();
  });

  it('shows the sentence each evidence came from', async () => {
    await openReview();

    expect(
      screen.getByText(/甲方需在 5 个工作日内完成首期技术服务费支付/),
    ).toBeInTheDocument();
    expect(screen.getByText(/第 1 句/)).toBeInTheDocument();
  });

  it('shows the gaps the reader left instead of hiding them', async () => {
    await openReview(['「支付申请」在合约上下文中缺少履约确认。']);

    expect(screen.getByText('读法留下了这些缺口')).toBeInTheDocument();
    expect(
      screen.getByText(/缺少履约确认/),
    ).toBeInTheDocument();
  });

  it('refuses to read an empty textarea', async () => {
    installDesktopApi({});

    render(
      <IngestDraftModal onClose={() => undefined} onCompiled={() => undefined} />,
    );

    fireEvent.click(screen.getByText('读成草稿'));

    expect(
      await screen.findByText('请先粘贴一段业务文本或蓝图表格。'),
    ).toBeInTheDocument();
  });

  it('compiles the reviewed draft with the kind the person corrected', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'text-rules',
        issues: [],
      },
      createDialogResult: { success: true, targetPath: '/models/new', kind: 'directory' },
      compileResult: {
        success: true,
        project: projectSummary({ rootPath: '/models/new' }),
        document: { manifest: {}, entities: [], relationships: [], rules: [] } as never,
        layout: {},
        issues: [],
      },
    });

    const compiled: string[] = [];

    render(
      <IngestDraftModal
        onClose={() => undefined}
        onCompiled={(project) => compiled.push(project.rootPath)}
      />,
    );

    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: { value: '甲乙双方签订采购协议。' },
    });
    fireEvent.click(screen.getByText('读成草稿'));
    await screen.findByLabelText('校对导入的草稿');

    // One select per evidence row, in the order the reader produced them.
    fireEvent.change(screen.getAllByLabelText('凭证类型')[0] as HTMLElement, {
      target: { value: 'other_evidence' },
    });
    fireEvent.click(screen.getByText('选择位置并生成模型'));

    await waitFor(() => {
      expect(compiled).toEqual(['/models/new']);
    });

    expect(api.calls.compileDraft).toHaveLength(1);
    expect(
      api.calls.compileDraft[0]?.draft.evidences.find(
        (evidence) => evidence.id === 'request.payment',
      )?.kind,
    ).toBe('other_evidence');
  });

  it('drops an element the reader got wrong', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'text-rules',
        issues: [],
      },
      createDialogResult: { success: true, targetPath: '/models/new', kind: 'directory' },
      compileResult: {
        success: true,
        project: projectSummary({ rootPath: '/models/new' }),
        document: { manifest: {}, entities: [], relationships: [], rules: [] } as never,
        layout: {},
        issues: [],
      },
    });

    render(
      <IngestDraftModal onClose={() => undefined} onCompiled={() => undefined} />,
    );

    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: { value: '文本' },
    });
    fireEvent.click(screen.getByText('读成草稿'));
    await screen.findByLabelText('校对导入的草稿');

    fireEvent.click(screen.getAllByText('移除')[0] as HTMLElement);
    fireEvent.click(screen.getByText('选择位置并生成模型'));

    await waitFor(() => {
      expect(api.calls.compileDraft).toHaveLength(1);
    });

    expect(api.calls.compileDraft[0]?.draft.evidences).toHaveLength(1);
    // Both sides of the pair are no longer there, so the panel stops counting it.
    expect(screen.queryByText(/组履约对/)).toBeInTheDocument();
  });
});
