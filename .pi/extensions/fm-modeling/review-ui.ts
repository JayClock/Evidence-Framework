import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ExtensionContext } from '@earendil-works/pi-coding-agent';

import { PanelMutex, type ReviewResult } from './ui-contracts.js';

interface PreparedReceipt {
  preparationId: string;
  receiptDigest: string;
  status: string;
  candidate: { digest: string };
  target: { path: string; digest: string };
  difference: {
    added: string[];
    modified: string[];
    deleted: string[];
    patch: string;
  };
  validation: {
    valid: boolean;
    executedScenarioCount?: number;
    simulationPassed?: boolean | null;
    errors?: unknown[];
  };
}

function readPath(cwd: string, value: string): string {
  const normalized = value.startsWith('@') ? value.slice(1) : value;
  return resolve(cwd, normalized);
}

function parseReceipt(text: string): PreparedReceipt {
  let value: Partial<PreparedReceipt>;
  try {
    value = JSON.parse(text) as Partial<PreparedReceipt>;
  } catch (error) {
    throw new Error(`准备结果不是有效 JSON：${String(error)}`, {
      cause: error,
    });
  }
  if (
    !value.preparationId ||
    !value.receiptDigest ||
    !value.candidate?.digest ||
    !value.target?.path ||
    !value.difference ||
    !value.validation ||
    value.status !== 'prepared'
  ) {
    throw new Error('准备结果无效或尚未通过检查');
  }
  return value as PreparedReceipt;
}

function scenarioSummary(receipt: PreparedReceipt): string {
  const executed = receipt.validation.executedScenarioCount ?? 0;
  if (executed === 0) return '场景：未执行（不表示模拟通过）';
  if (receipt.validation.simulationPassed === true) {
    return `场景：实际执行 ${executed} 个，全部通过`;
  }
  if (receipt.validation.simulationPassed === false) {
    return `场景：实际执行 ${executed} 个，存在失败`;
  }
  return `场景：实际执行 ${executed} 个，结果未声明通过`;
}

function summary(receipt: PreparedReceipt): string {
  const difference = receipt.difference;
  return [
    `准备结果：${receipt.preparationId}`,
    `保存目标：${receipt.target.path}`,
    `候选摘要：${receipt.candidate.digest}`,
    `目标摘要：${receipt.target.digest}`,
    `文件：新增 ${difference.added.length}，修改 ${difference.modified.length}，删除 ${difference.deleted.length}`,
    `检查：${receipt.validation.valid ? '通过' : '失败'}`,
    scenarioSummary(receipt),
  ].join('\n');
}

export class ReviewUI {
  constructor(private readonly panels = new PanelMutex()) {}

  async open(
    receiptPath: string,
    ctx: ExtensionContext,
  ): Promise<ReviewResult> {
    if (!ctx.hasUI || !this.panels.acquire()) return { status: 'unavailable' };
    try {
      const receipt = parseReceipt(
        await readFile(readPath(ctx.cwd, receiptPath), 'utf8'),
      );
      while (true) {
        const action = await ctx.ui.select(summary(receipt), [
          '查看完整差异',
          '保存此候选',
          '返回修改',
          '暂不保存',
        ]);
        if (action === '查看完整差异') {
          await ctx.ui.editor(
            `完整差异 · ${receipt.preparationId}（编辑内容不会被采用）`,
            receipt.difference.patch || '无文件差异',
          );
          continue;
        }
        const binding = {
          preparationId: receipt.preparationId,
          receiptDigest: receipt.receiptDigest,
        };
        if (action === '保存此候选') return { status: 'save', ...binding };
        if (action === '返回修改') return { status: 'revise', ...binding };
        if (action === '暂不保存') return { status: 'deferred', ...binding };
        return { status: 'cancelled', ...binding };
      }
    } finally {
      this.panels.release();
    }
  }
}
