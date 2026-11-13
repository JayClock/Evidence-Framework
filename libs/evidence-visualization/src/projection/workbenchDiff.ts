import { createHash } from 'node:crypto';
import {
  compiledDocument,
  diffDomainModels,
} from '@evidence-poc/evidence-model-core';
import type { DomainModelDocument } from '@evidence-poc/evidence-schema';

import { workbenchLayoutOf } from './workbenchLayout.js';
import {
  projectWorkbenchData,
  type CompiledModel,
  type WorkbenchData,
  type WorkbenchNode,
} from './workbenchProjection.js';

export interface WorkbenchEntityDiff {
  id: string;
  label: string;
  category: string;
  changeType: 'added' | 'removed' | 'modified';
  /** Only fields already allowed in a workbench projection may cross this boundary. */
  fields: readonly { name: string; before?: unknown; after?: unknown }[];
  attributeChanges: readonly {
    name: string;
    changeType: string;
    before?: WorkbenchNode;
    after?: WorkbenchNode;
  }[];
}

export interface WorkbenchDiffSummary {
  baselineFingerprint: string;
  counts: { added: number; removed: number; modified: number };
  changes: readonly WorkbenchEntityDiff[];
  /** Separate drawing: removed objects keep their baseline coordinates, never current ones. */
  baseline: Pick<WorkbenchData, 'nodes' | 'layout'>;
}

/** Diff the model, but export only the same business fields the normal page exposes. */
export const projectWorkbenchDiff = (
  before: DomainModelDocument,
  after: DomainModelDocument,
  current: WorkbenchData,
): WorkbenchDiffSummary => {
  if (before.manifest.id !== after.manifest.id) {
    throw new Error('基线与当前模型 ID 不一致，不能进行差异审查');
  }
  const baseline = projectWorkbenchData({
    model: compiledDocument(before) as unknown as CompiledModel,
    layout: workbenchLayoutOf(before),
    check: {},
  });
  const oldNodes = new Map(baseline.nodes.map((node) => [node.id, node]));
  const newNodes = new Map(current.nodes.map((node) => [node.id, node]));
  const diff = diffDomainModels(before, after);
  const changes: WorkbenchEntityDiff[] = [];
  for (const item of [
    ...diff.contexts,
    ...diff.entities,
    ...diff.relationships,
    ...diff.rules,
  ]) {
    if (item.changeType === 'unchanged') continue;
    const base = oldNodes.get(item.id);
    const target = newNodes.get(item.id);
    const fields = [
      ...new Set([...Object.keys(base ?? {}), ...Object.keys(target ?? {})]),
    ]
      .sort()
      .filter(
        (name) =>
          JSON.stringify(base?.[name]) !== JSON.stringify(target?.[name]),
      )
      .map((name) => ({
        name,
        ...(base?.[name] === undefined ? {} : { before: base[name] }),
        ...(target?.[name] === undefined ? {} : { after: target[name] }),
      }));
    const attributeChanges = (
      'attributeDiffs' in item ? (item.attributeDiffs ?? []) : []
    )
      .filter((attribute) => attribute.changeType !== 'unchanged')
      .map((attribute) => {
        const id = `${item.id}#${attribute.name}`;
        return {
          name: attribute.name,
          changeType: attribute.changeType,
          ...(oldNodes.has(id) ? { before: oldNodes.get(id)! } : {}),
          ...(newNodes.has(id) ? { after: newNodes.get(id)! } : {}),
        };
      });
    changes.push({
      id: item.id,
      label: item.label,
      category: target?.group ?? base?.group ?? 'object',
      changeType: item.changeType,
      fields,
      attributeChanges,
    });
  }
  return {
    baselineFingerprint: createHash('sha256')
      .update(JSON.stringify(compiledDocument(before)))
      .digest('hex'),
    counts: {
      added: changes.filter((item) => item.changeType === 'added').length,
      removed: changes.filter((item) => item.changeType === 'removed').length,
      modified: changes.filter((item) => item.changeType === 'modified').length,
    },
    changes,
    baseline: { nodes: baseline.nodes, layout: baseline.layout },
  };
};
