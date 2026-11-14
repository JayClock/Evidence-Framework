import { useEffect, useRef } from 'react';

import {
  buildKeyDataLedger,
  decodeModelPatch,
  type DomainGraph,
  type ModelSession,
} from '@evidence-poc/evidence-model-core';
import type {
  DomainModelDocument,
  ValidationResult,
} from '@evidence-poc/evidence-schema';
import type { SensorReport } from '@evidence-poc/evidence-agent/browser';

import type { EvidenceProjectSummary } from '../../shared/projects';
import type {
  McpRendererRequest,
  McpRendererResponse,
} from '../../shared/mcpIpc';

import { resolveCaptureRect, type CaptureRect } from './mcpCapture';

const RULER_THICKNESS = 24;

export interface McpBridgeContext {
  project: EvidenceProjectSummary;
  session: ModelSession;
  graph: DomainGraph;
  document: DomainModelDocument;
  validation: ValidationResult;
  report: SensorReport | null;
  /** Bumped on every document change; agents use it to detect drift. */
  revision: number;
}

const rectOf = (element: Element | null): CaptureRect | null => {
  if (element === null) {
    return null;
  }

  const rect = element.getBoundingClientRect();

  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
};

const buildAppState = (context: McpBridgeContext) => ({
  isRunning: true,
  activeProject: {
    rootPath: context.project.rootPath,
    modelRoot: context.project.modelRoot,
    modelId: context.document.manifest.id,
    modelVersion: context.document.manifest.version,
    documentRevision: context.revision,
  },
  selection: context.session.getSelection(),
  sensorsSummary:
    context.report === null
      ? null
      : {
          blockCount: context.report.blockCount,
          warnCount: context.report.warnCount,
          decisionOwedCount: context.report.keyDataSummary.decisionOwedCount,
          isStageGateReady: context.report.isStageGateReady,
        },
  mcp: { connections: 1, calls: 0 },
});

const documentInContext = (
  document: DomainModelDocument,
  contextRef: string | undefined,
): DomainModelDocument => {
  if (contextRef === undefined) {
    return document;
  }

  const entities = document.entities.filter(
    (entity) =>
      entity.id === contextRef ||
      ('contextRef' in entity && entity.contextRef === contextRef) ||
      ('parentContextRef' in entity && entity.parentContextRef === contextRef),
  );
  const ids = new Set(entities.map((entity) => entity.id));

  return {
    ...document,
    entities,
    relationships: document.relationships.filter(
      (relationship) =>
        ids.has(relationship.sourceRef) && ids.has(relationship.targetRef),
    ),
    rules: document.rules.filter((rule) => rule.contextRef === contextRef),
  };
};

const summarize = (document: DomainModelDocument) => ({
  contracts: document.entities.filter(
    (entity) => entity.category === 'evidence' && entity.kind === 'contract',
  ).length,
  fulfillments: document.entities.filter(
    (entity) =>
      entity.category === 'evidence' &&
      (entity.kind === 'fulfillment_request' ||
        entity.kind === 'fulfillment_confirmation'),
  ).length,
  entities: document.entities.length,
  rules: document.rules.length,
});

const selectedEntityProjection = (context: McpBridgeContext) => {
  const { nodeId, attributeName } = context.session.getSelection();

  if (nodeId === null) {
    return null;
  }

  const entity = context.graph.getEntity(nodeId);

  if (entity === undefined) {
    return null;
  }

  const contextRef =
    'contextRef' in entity && entity.contextRef !== undefined
      ? entity.contextRef
      : undefined;
  const pair = context.graph.fulfillmentPair(entity.id);

  return {
    entity,
    attributeName,
    context:
      contextRef === undefined
        ? null
        : (context.graph.getEntity(contextRef) ?? null),
    incomingRelations: context.graph.incoming(nodeId),
    outgoingRelations: context.graph.outgoing(nodeId),
    derivationRules: context.graph
      .rulesReferencing(nodeId)
      .filter((rule) => rule.kind === 'derivation'),
    fulfillmentPair:
      pair === undefined
        ? null
        : {
            request: pair.request,
            confirmations: pair.confirmations,
            completionRules: pair.completionRules,
            breachRules: pair.breachRules,
          },
  };
};

const captureRect = ({
  targetNodeId,
}: {
  targetNodeId?: string;
}): CaptureRect | null => {
  const viewport = rectOf(
    document.querySelector('[data-region="canvas-viewport"]'),
  );

  if (viewport === null) {
    return null;
  }

  const target =
    targetNodeId === undefined
      ? null
      : rectOf(
          document.querySelector(
            `[data-node-id="${targetNodeId.replaceAll('"', '')}"]`,
          ),
        );

  return resolveCaptureRect({
    target,
    stage: rectOf(document.querySelector('[data-region="canvas-stage"]')),
    viewport,
    rulerThickness: RULER_THICKNESS,
  });
};

/**
 * Answers MCP tool calls that need the live `ModelSession`.
 *
 * Every mutation goes through `session.dispatch`, so an external agent's edit is
 * one undo step the modeler can reverse with ⌘Z — exactly like a human edit.
 */
export const useMcpBridge = (context: McpBridgeContext): void => {
  const latest = useRef(context);

  latest.current = context;

  useEffect(() => {
    const answer = (
      request: McpRendererRequest,
    ): McpRendererResponse | null => {
      const current = latest.current;

      switch (request.method) {
        case 'get_app_state':
          return {
            requestId: request.requestId,
            success: true,
            result: buildAppState(current),
          };
        case 'get_domain_model': {
          const payload = request.payload as {
            contextRef?: string;
            includeRules?: boolean;
          } | null;
          const document = documentInContext(
            current.document,
            payload?.contextRef,
          );
          const projected =
            payload?.includeRules === false
              ? { ...document, rules: [] }
              : document;

          return {
            requestId: request.requestId,
            success: true,
            result: { document: projected, summary: summarize(projected) },
          };
        }
        case 'get_selected_entity': {
          const projection = selectedEntityProjection(current);

          return projection === null
            ? {
                requestId: request.requestId,
                success: false,
                error: {
                  code: 'NO_SELECTION',
                  message: '画布上没有选中的业务对象。',
                },
              }
            : {
                requestId: request.requestId,
                success: true,
                result: projection,
              };
        }
        case 'get_capture_rect':
          return {
            requestId: request.requestId,
            success: true,
            result: captureRect(
              (request.payload ?? {}) as { targetNodeId?: string },
            ),
          };
        case 'apply_model_patch':
          return {
            requestId: request.requestId,
            success: true,
            result: applyPatch(current, request.payload),
          };
        default:
          return null;
      }
    };

    return window.evidenceAPI.mcp.onRequest((request) => {
      const response = answer(request);

      if (response === null) {
        window.evidenceAPI.mcp.respond({
          requestId: request.requestId,
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: `未知的 MCP 方法：${request.method}`,
          },
        });
        return;
      }

      window.evidenceAPI.mcp.respond(response);
    });
  }, []);

  useEffect(
    () =>
      window.evidenceAPI.mcp.onCaptureMode((active) => {
        document.body.dataset.evidenceCapture = active ? 'true' : 'false';
      }),
    [],
  );
};

const applyPatch = (
  context: McpBridgeContext,
  payload: unknown,
): unknown => {
  const patch = payload as {
    rationale?: string;
    commands?: readonly unknown[];
  } | null;
  const commands = patch?.commands ?? [];

  try {
    const decoded = decodeModelPatch(commands);
    context.session.dispatchAll(decoded, 'mcp-patch');
    const validation = context.session.validate();

    return {
      success: true,
      appliedCommands: decoded.map((command) => command.type),
      revision: context.revision + 1,
      undoable: context.session.canUndo(),
      diagnostics: validation.valid
        ? []
        : validation.issues.map((issue) => ({
            severity: 'block' as const,
            code: String(issue.code),
            message: `${issue.path}: ${issue.message}`,
          })),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : '补丁被模型守卫拒绝。';

    return {
      success: false,
      appliedCommands: [],
      revision: context.revision,
      undoable: context.session.canUndo(),
      diagnostics: [
        {
          severity: 'block' as const,
          code:
            error !== null && typeof error === 'object' && 'code' in error
              ? String((error as { code: unknown }).code)
              : 'PATCH_REJECTED',
          message,
        },
      ],
      error: message,
    };
  }
};

/** Ledger summary reused by status surfaces outside the inspector. */
export const keyDataSummaryOf = (document: DomainModelDocument) => {
  const ledger = buildKeyDataLedger(document);

  return {
    total: ledger.entries.length,
    decisionOwed: ledger.decisionOwed.length,
  };
};
