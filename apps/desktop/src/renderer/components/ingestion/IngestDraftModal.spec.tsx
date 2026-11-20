import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { IngestDraftModal } from './IngestDraftModal';
import {
  installDesktopApi,
  projectSummary,
} from '@evidence-poc/desktop-testing/desktopApi';
import type { IngestionDraft } from '@evidence-poc/evidence-schema';
import { AiConfigurationProvider } from '../../state/AiConfiguration';

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
    {
      id: 'role.buyer',
      label: '买方',
      kind: 'party',
      contextRef: 'context.contract',
    },
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
  it('loads a selected OpenAPI file locally before asking the text reader to interpret it', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'text-model',
        issues: [],
      },
    });
    render(<IngestDraftModal onClose={vi.fn()} onCompiled={vi.fn()} />);
    const text = '{"openapi":"3.1.0"}';
    const input = screen.getByLabelText('选择业务文档');
    const clickPicker = vi.spyOn(input, 'click');
    fireEvent.click(screen.getByRole('button', { name: /选择文件或拖放/ }));
    expect(clickPicker).toHaveBeenCalledOnce();
    fireEvent.change(input, {
      target: { files: [new File([text], 'spec.JSON')] },
    });

    expect(await screen.findByText('已载入原文：spec.JSON')).toBeVisible();
    expect(screen.getByLabelText('业务原文')).toHaveValue(text);
    expect(api.calls.ingestDraft).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '读成草稿' }));
    await screen.findByRole('dialog', { name: '校对导入的草稿' });
    expect(api.calls.ingestDraft).toEqual([
      expect.objectContaining({ kind: 'text', content: text }),
    ]);
  });

  it('uses the blueprint reader for a dropped CSV file', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'blueprint',
        issues: [],
      },
    });
    render(<IngestDraftModal onClose={vi.fn()} onCompiled={vi.fn()} />);
    const text = '阶段,业务凭证\n履约,支付申请';
    const target = screen.getByRole('button', { name: /选择文件或拖放/ });
    const dataTransfer = {
      types: ['Files'],
      files: [new File([text], 'blueprint.csv')],
    };
    fireEvent.dragEnter(target, { dataTransfer });
    expect(target).toHaveAttribute('data-drag-active', 'true');
    fireEvent.drop(target, { dataTransfer });
    expect(target).not.toHaveAttribute('data-drag-active');

    expect(await screen.findByText('已载入原文：blueprint.csv')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '读成草稿' }));
    await screen.findByRole('dialog', { name: '校对导入的草稿' });
    expect(api.calls.ingestDraft).toEqual([
      expect.objectContaining({
        kind: 'blueprint',
        format: 'auto',
        content: text,
      }),
    ]);
  });

  it.each([
    { files: [new File(['raw'], 'draft.pdf')], error: /不支持此文件格式/ },
    { files: [new File(['  '], 'draft.md')], error: /没有可读取的文本/ },
    {
      files: [new File([new Uint8Array([0xff])], 'draft.txt')],
      error: /UTF-8/,
    },
    {
      files: [
        Object.defineProperty(new File(['raw'], 'large.md'), 'size', {
          value: 20_000_001,
        }),
      ],
      error: /超过 20 MB/,
    },
    {
      files: [new File(['1'], '1.md'), new File(['2'], '2.md')],
      error: /请选择一个文件/,
    },
  ])(
    'rejects invalid file drops without replacing the original text ($error)',
    async ({ files, error }) => {
      const api = installDesktopApi();
      render(<IngestDraftModal onClose={vi.fn()} onCompiled={vi.fn()} />);
      fireEvent.change(screen.getByLabelText('业务原文'), {
        target: { value: '保留原文' },
      });
      fireEvent.drop(screen.getByRole('button', { name: /选择文件或拖放/ }), {
        dataTransfer: { types: ['Files'], files },
      });
      expect(await screen.findByRole('alert')).toHaveTextContent(error);
      expect(screen.getByLabelText('业务原文')).toHaveValue('保留原文');
      expect(api.calls.ingestDraft).toEqual([]);
    },
  );

  it('returns focus and keeps the draft text after closing AI settings', async () => {
    const api = installDesktopApi();
    api.aiConfig.getStatus = async () => ({
      isConfigured: false,
      activeProviderId: null,
      activeModelId: null,
      activeModelName: null,
      agentDir: '/test/pi',
      thinkingLevel: 'off',
      availableModels: [],
    });
    render(
      <AiConfigurationProvider>
        <IngestDraftModal onClose={vi.fn()} onCompiled={vi.fn()} />
      </AiConfigurationProvider>,
    );
    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: { value: '本地原文' },
    });
    const trigger = screen.getByRole('button', { name: '配置 Pi 模型' });
    trigger.focus();
    fireEvent.click(trigger);
    const settings = screen.getByRole('dialog', { name: /AI Model Settings/ });
    expect(
      screen.queryByRole('dialog', { name: /Smart Ingestion/ }),
    ).toBeNull();
    fireEvent.keyDown(settings, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByLabelText('业务原文')).toHaveValue('本地原文');
  });
  it('sends the pasted text to the main process and says who read it', async () => {
    const api = await openReview();

    expect(api.calls.ingestDraft).toEqual([
      expect.objectContaining({
        kind: 'contract',
        content: '甲乙双方签订《企业级云服务采购协议》…',
      }),
    ]);
    expect(screen.getByText(/读自模型/)).toBeInTheDocument();
    expect(screen.getByText('凭证主体：支付申请、支付确认')).toBeVisible();
    expect(screen.getByText('权责角色：买方')).toBeVisible();
    expect(screen.getByText('1 组履约对')).toBeVisible();
    expect(api.calls.compileDraft).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: '返回编辑原文' }));
    expect(screen.getByLabelText('业务原文')).toHaveValue(
      '甲乙双方签订《企业级云服务采购协议》…',
    );
    expect(screen.getByLabelText('业务原文')).toHaveFocus();
  });

  it('shows the sentence each evidence came from', async () => {
    await openReview();
    fireEvent.click(screen.getByText('展开校对凭证与原文'));

    expect(
      screen.getByText(/甲方需在 5 个工作日内完成首期技术服务费支付/),
    ).toBeInTheDocument();
    expect(screen.getByText(/第 1 句/)).toBeInTheDocument();
  });

  it('shows the gaps the reader left instead of hiding them', async () => {
    await openReview(['「支付申请」在合约上下文中缺少履约确认。']);

    expect(screen.getByText('读法留下了这些缺口')).toBeInTheDocument();
    expect(screen.getByText(/缺少履约确认/)).toBeInTheDocument();
  });

  it('refuses to read an empty textarea', async () => {
    installDesktopApi({});

    render(
      <IngestDraftModal
        onClose={() => undefined}
        onCompiled={() => undefined}
      />,
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
      createDialogResult: {
        success: true,
        targetPath: '/models/new',
        kind: 'directory',
      },
      compileResult: {
        success: true,
        project: projectSummary({ rootPath: '/models/new' }),
        document: {
          manifest: {},
          entities: [],
          relationships: [],
          rules: [],
        } as never,
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

    fireEvent.click(screen.getByText('展开校对凭证与原文'));
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

  it('lets a document be renamed before it is written', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'text-model',
        issues: [],
      },
      createDialogResult: {
        success: true,
        targetPath: '/models/new',
        kind: 'directory',
      },
      compileResult: {
        success: true,
        project: projectSummary({ rootPath: '/models/new' }),
        document: {
          manifest: {},
          entities: [],
          relationships: [],
          rules: [],
        } as never,
        layout: {},
        issues: [],
      },
    });

    render(
      <IngestDraftModal
        onClose={() => undefined}
        onCompiled={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: { value: '文本' },
    });
    fireEvent.click(screen.getByText('读成草稿'));
    await screen.findByRole('dialog', { name: '校对导入的草稿' });
    fireEvent.click(screen.getByText('展开校对凭证与原文'));

    fireEvent.change(screen.getAllByLabelText('凭证名称')[0] as HTMLElement, {
      target: { value: '首期服务费支付申请' },
    });
    fireEvent.click(screen.getByText('选择位置并生成模型'));

    await waitFor(() => {
      expect(api.calls.compileDraft).toHaveLength(1);
    });

    expect(api.calls.compileDraft[0]?.draft.evidences[0]?.label).toBe(
      '首期服务费支付申请',
    );
  });

  it('drops an element the reader got wrong', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'text-rules',
        issues: [],
      },
      createDialogResult: {
        success: true,
        targetPath: '/models/new',
        kind: 'directory',
      },
      compileResult: {
        success: true,
        project: projectSummary({ rootPath: '/models/new' }),
        document: {
          manifest: {},
          entities: [],
          relationships: [],
          rules: [],
        } as never,
        layout: {},
        issues: [],
      },
    });

    render(
      <IngestDraftModal
        onClose={() => undefined}
        onCompiled={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: { value: '文本' },
    });
    fireEvent.click(screen.getByText('读成草稿'));
    await screen.findByRole('dialog', { name: '校对导入的草稿' });
    fireEvent.click(screen.getByText('展开校对凭证与原文'));

    fireEvent.click(screen.getAllByText('移除')[0] as HTMLElement);
    fireEvent.click(screen.getByText('选择位置并生成模型'));

    await waitFor(() => {
      expect(api.calls.compileDraft).toHaveLength(1);
    });

    expect(api.calls.compileDraft[0]?.draft.evidences).toHaveLength(1);
    // Removing one side excludes the pair from the summary.
    expect(screen.getByText('0 组履约对 · 1 组因删改断开')).toBeVisible();
  });

  it('reads a contract by its clauses, not as one more paragraph', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'contract',
        issues: [],
        annotations: [
          {
            index: 1,
            text: '甲乙双方签订《云服务采购协议》',
            category: 'business',
            reason: '约定了业务动作',
          },
          {
            index: 2,
            text: '因本协议产生的争议提交仲裁',
            category: 'boilerplate',
            reason: '争议解决',
          },
          {
            index: 3,
            text: '服务费按 30% 计算',
            category: 'domain',
            reason: '计算口径',
          },
        ],
      },
    });

    render(
      <IngestDraftModal
        onClose={() => undefined}
        onCompiled={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: { value: '甲乙双方签订《云服务采购协议》。' },
    });
    fireEvent.click(screen.getByText('读成草稿'));
    await screen.findByLabelText('校对导入的草稿');

    expect(api.calls.ingestDraft[0]?.kind).toBe('contract');
    expect(screen.getByText(/读自合同条款/)).toBeInTheDocument();

    fireEvent.click(screen.getByText('展开校对凭证与原文'));
    const split = screen.getByLabelText('条款分类');

    expect(split).toHaveTextContent('业务逻辑 1');
    expect(split).toHaveTextContent('领域逻辑 1');
    expect(split).toHaveTextContent('纯法务条款 1');
    // The filtered clause stays readable: a silent drop is the failure mode.
    expect(split).toHaveTextContent('因本协议产生的争议提交仲裁');
  });

  it('sends a blueprint table as a blueprint, however the tab was reached', async () => {
    const api = installDesktopApi({
      ingestResult: {
        success: true,
        draft: draft(),
        reader: 'blueprint',
        issues: [],
      },
    });

    render(
      <IngestDraftModal
        onClose={() => undefined}
        onCompiled={() => undefined}
      />,
    );

    // The tab comes before the preset of the same name in the DOM.
    fireEvent.click(screen.getAllByText('服务蓝图表格')[0] as HTMLElement);
    fireEvent.change(screen.getByLabelText('业务原文'), {
      target: {
        value: '| 阶段 | 业务凭证 |\n| --- | --- |\n| 履约 | 支付申请 |',
      },
    });
    fireEvent.click(screen.getByText('读成草稿'));
    await screen.findByLabelText('校对导入的草稿');

    expect(api.calls.ingestDraft[0]).toEqual(
      expect.objectContaining({ kind: 'blueprint' }),
    );
  });
});
