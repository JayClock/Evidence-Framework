import { render, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createModelSession } from '@evidence-poc/evidence-model-core';
import type { McpRendererRequest } from '../../shared/mcpIpc';

import { useMcpBridge } from './useMcpBridge';
import {
  healthyReport,
  installDesktopApi,
  projectSummary,
} from '../test-support/desktopApi';
import { createDesktopFixture } from '@evidence-poc/desktop-testing';

const BridgeHarness = ({
  session,
  report = null,
}: {
  session: ReturnType<typeof createModelSession>;
  report?: ReturnType<typeof healthyReport> | null;
}) => {
  useMcpBridge({
    project: projectSummary(),
    session,
    graph: session.getGraph(),
    document: session.getDocument(),
    validation: session.validate(),
    report,
    revision: 4,
  });

  return <p>bridge</p>;
};

const request = (
  method: McpRendererRequest['method'],
  payload: unknown = null,
): McpRendererRequest => ({ requestId: `req-${method}`, method, payload });

const answerFor = async (
  api: ReturnType<typeof installDesktopApi>,
  req: McpRendererRequest,
) => {
  api.mcpMock.request(req);

  await waitFor(() => {
    expect(api.mcpMock.responses).toHaveLength(1);
  });

  const [response] = api.mcpMock.responses;

  api.mcpMock.responses.length = 0;

  return response!;
};

describe('useMcpBridge', () => {
  it('projects the app state with the document revision', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} report={healthyReport()} />);

    const response = await answerFor(api, request('get_app_state'));

    expect(response).toMatchObject({
      success: true,
      result: {
        isRunning: true,
        activeProject: {
          rootPath: '/models/procurement',
          modelId: 'desktop-fixture',
          documentRevision: 4,
        },
        sensorsSummary: { blockCount: 0, decisionOwedCount: 0 },
      },
    });
  });

  it('filters the domain model by context', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);

    const response = await answerFor(
      api,
      request('get_domain_model', { contextRef: 'context.catalog' }),
    );

    expect(response).toMatchObject({ success: true });
    const result = (
      response as { result: { document: { entities: { id: string }[] } } }
    ).result;

    expect(result.document.entities.map((entity) => entity.id)).toEqual([
      'context.catalog',
      'role.inventory',
    ]);
  });

  it('refuses a selection question when nothing is selected', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);

    const response = await answerFor(api, request('get_selected_entity'));

    expect(response).toMatchObject({
      success: false,
      error: { code: 'NO_SELECTION' },
    });
  });

  it('returns the selected entity with its fulfillment pair', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    session.select('evidence.request');
    render(<BridgeHarness session={session} />);

    const response = await answerFor(api, request('get_selected_entity'));
    const result = (
      response as {
        result: {
          entity: { id: string };
          context: { id: string };
          fulfillmentPair: { confirmations: unknown[] } | null;
        };
      }
    ).result;

    expect(result.entity.id).toBe('evidence.request');
    expect(result.context.id).toBe('context.procurement');
    expect(result.fulfillmentPair?.confirmations).toHaveLength(1);
  });

  it('applies a patch through the session so undo still works', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const before = session.getDocument();

    render(<BridgeHarness session={session} />);

    const response = await answerFor(
      api,
      request('apply_model_patch', {
        rationale: '标注请求开始时间',
        patches: [
          {
            op: 'replace',
            path: '/entities/8/attributes/0/keyData',
            value: false,
          },
        ],
      }),
    );

    expect(response).toMatchObject({
      success: true,
      result: { success: true, appliedCommands: ['replace'] },
    });
    expect(
      session.getGraph().attribute('evidence.request', 'started_at')?.keyData,
    ).toBe(false);

    session.undo();
    expect(session.getDocument()).toEqual(before);
  });

  it('reports a rejected patch instead of throwing', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);

    const response = await answerFor(
      api,
      request('apply_model_patch', {
        rationale: '删除被引用的实体',
        patches: [{ op: 'remove', path: '/entities/9999' }],
      }),
    );

    expect(response).toMatchObject({
      success: true,
      result: { success: false, appliedCommands: [] },
    });
    expect(JSON.stringify(response)).toContain('out-of-bounds array index');
  });

  it('answers rapid calls from the live session and advances revisions without waiting for React to render', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    render(<BridgeHarness session={session} />);

    for (const [offset, label] of ['first', 'second'].entries()) {
      const response = await answerFor(
        api,
        request('apply_model_patch', {
          rationale: label,
          patches: [{ op: 'replace', path: '/entities/0/label', value: label }],
        }),
      );
      expect(response).toMatchObject({
        result: { success: true, revision: 5 + offset },
      });
    }
    expect(await answerFor(api, request('get_domain_model'))).toMatchObject({
      result: {
        document: {
          entities: [
            expect.objectContaining({ label: 'second' }),
            ...session.getDocument().entities.slice(1),
          ],
        },
      },
    });
    expect(await answerFor(api, request('get_app_state'))).toMatchObject({
      result: { activeProject: { documentRevision: 6 } },
    });

    const tested = await answerFor(
      api,
      request('apply_model_patch', {
        rationale: 'assert current identity',
        patches: [{ op: 'test', path: '/entities/0/label', value: 'second' }],
      }),
    );
    expect(tested).toMatchObject({ result: { success: true, revision: 6 } });
    const rejected = await answerFor(
      api,
      request('apply_model_patch', {
        rationale: 'stale snapshot',
        patches: [
          { op: 'replace', path: '/entities/0/label', value: 'must roll back' },
          { op: 'test', path: '/entities/0/id', value: 'stale-id' },
        ],
      }),
    );
    expect(rejected).toMatchObject({ result: { success: false, revision: 6 } });
    expect(session.getDocument().entities[0].label).toBe('second');
  });

  it('rejects the legacy command envelope at the renderer boundary', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });
    const before = session.getDocument();
    render(<BridgeHarness session={session} />);
    const response = await answerFor(
      api,
      request('apply_model_patch', {
        rationale: 'legacy',
        commands: [{ type: 'delete-entity', entityId: 'evidence.request' }],
      }),
    );
    expect(response).toMatchObject({ result: { success: false, revision: 4 } });
    expect(session.getDocument()).toBe(before);
    expect(session.canUndo()).toBe(false);
  });

  it('returns null when the canvas is not laid out', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);

    const response = await answerFor(api, request('get_capture_rect'));

    expect(response).toMatchObject({ success: true, result: null });
  });

  it('rejects an unknown method without hanging the caller', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);

    api.mcpMock.request({
      requestId: 'req-unknown',
      method: 'run_stage_gate' as never,
      payload: null,
    });

    await waitFor(() => {
      expect(api.mcpMock.responses).toHaveLength(1);
    });
    expect(api.mcpMock.responses[0]).toMatchObject({
      success: false,
      error: { code: 'INTERNAL_ERROR' },
    });
  });

  it('toggles screenshot mode on the body element', async () => {
    const api = installDesktopApi();
    const session = createModelSession({ document: createDesktopFixture() });

    render(<BridgeHarness session={session} />);

    api.mcpMock.setCaptureMode(true);

    await waitFor(() => {
      expect(document.body.dataset.evidenceCapture).toBe('true');
    });

    api.mcpMock.setCaptureMode(false);

    await waitFor(() => {
      expect(document.body.dataset.evidenceCapture).toBe('false');
    });
  });
});
