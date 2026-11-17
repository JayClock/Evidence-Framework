import type { BusinessStoryProjection } from '@evidence-poc/evidence-agent';
import { describe, expect, it } from 'vitest';
import { renderStoryMarkdown, renderStoryText } from './storyReporter.js';

const stories: readonly BusinessStoryProjection[] = [
  {
    flowId: 'payment',
    storyTitle: '采购付款',
    storySummary: '付款的业务摘要',
    businessGoal: '核对履约依据',
    scenes: [
      {
        stepIndex: 1,
        stepHash: 'hash',
        phaseTitle: '卖方提出付款申请',
        narrative: '供应商发出申请的详细旁白。',
        actingRoleLabel: '供应商',
        targetEntityLabel: '付款申请单',
        documentCard: {
          title: '付款申请单',
          fields: [
            {
              name: 'amount',
              label: '金额',
              value: '9007199254740993',
              keyData: true,
              sourceOrigin: '采购合同',
            },
          ],
          basisNotes: '采购合同签约示例',
        },
        ruleEvaluations: [
          { ruleName: '金额一致', explanation: '与依据吻合', satisfied: true },
          { ruleName: '未超时', explanation: '已逾期', satisfied: false },
        ],
        stateTransitionNotice: '等待确认',
        pendingSuspense: '请问由谁完成付款确认？',
      },
    ],
  },
];

describe('business story reporters', () => {
  it('renders Markdown headings, document fields, provenance and gap questions without ANSI codes', () => {
    const result = renderStoryMarkdown(stories);
    for (const expected of [
      '# 业务故事',
      '## 采购付款',
      '业务流：payment',
      '### 1. 卖方提出付款申请',
      '#### 付款申请单',
      '| 金额 \\(amount\\) | 9007199254740993 | 是 | 采购合同 |',
      '采购合同签约示例',
      '✓ 金额一致',
      '✗ 未超时',
      '状态：等待确认',
      '> 请问由谁完成付款确认？',
      '不代表已执行验收或规则判定',
    ])
      expect(result).toContain(expected);
    expect(result).not.toContain('\u001b');
  });

  it('escapes Markdown syntax, multiline table cells and HTML in user data', () => {
    const hostile = structuredClone(stories);
    Object.assign(hostile[0]!.scenes[0]!.documentCard.fields[0]!, {
      value: 'a|b\n<script>*x*</script>\\`code`',
    });
    const result = renderStoryMarkdown(hostile);
    expect(result).toContain(
      'a\\|b<br>&lt;script&gt;\\*x\\*&lt;/script&gt;\\\\\\`code\\`',
    );
    expect(result).not.toContain('<script>');
  });

  it.each([false, true])('renders text cards with color=%s', (color) => {
    const result = renderStoryText(stories, { color });
    expect(result.includes('\u001b[')).toBe(color);
    for (const expected of [
      '┌─ 付款申请单',
      '│ 金额: 9007199254740993',
      '来源：采购合同',
      '请问由谁完成付款确认？',
    ])
      expect(result).toContain(expected);
  });

  it('compacts prose and borders without losing fields, basis, rules or suspense', () => {
    for (const render of [
      () => renderStoryMarkdown(stories, { compact: true }),
      () => renderStoryText(stories, { compact: true, color: false }),
    ]) {
      const result = render();
      expect(result).not.toContain(stories[0]!.storySummary);
      expect(result).not.toContain(stories[0]!.scenes[0]!.narrative);
      expect(result).not.toContain('┌');
      expect(result).toContain('9007199254740993');
      expect(result).toContain('采购合同签约示例');
      expect(result).toContain('金额一致');
      expect(result).toContain('请问由谁完成付款确认？');
    }
  });

  it('explains empty models', () => {
    expect(renderStoryMarkdown([])).toContain('未检测到');
    expect(renderStoryText([], { color: false })).toContain('未检测到');
  });
});
