import { describe, expect, it } from 'vitest';
import { PHASE_DEFINITIONS } from './phases.ts';
import {
  countMarkdownTableRows,
  normalizeMarkdown,
  validateArtifactContent,
} from './validation.ts';

const minimalValidArtifact = `# 用户画像与需求

## 用户画像

### 角色 A
痛点：慢。目标：快。

### 角色 B
痛点：乱。目标：清晰。

### 角色 C
痛点：不可追溯。目标：可审计。

## 需求列表

| 角色 | 需求类型 | 需求描述 | 优先级 | 成功指标 |
|:---|:---|:---|:---:|:---|
| A | 功能 | 一 | P0 | 一 |
| A | 非功能 | 二 | P1 | 二 |
| B | 功能 | 三 | P0 | 三 |
| B | 非功能 | 四 | P1 | 四 |
| C | 功能 | 五 | P0 | 五 |
| C | 非功能 | 六 | P1 | 六 |
| A | 功能 | 七 | P2 | 七 |
| B | 功能 | 八 | P2 | 八 |
| C | 功能 | 九 | P2 | 九 |

## 假设与待确认问题

${'已确认信息。'.repeat(100)}
`;

describe('normalizeMarkdown', () => {
  it('removes a single outer markdown fence', () => {
    expect(normalizeMarkdown(`\`\`\`markdown\n# Title\n\nBody\n\`\`\``)).toBe(
      '# Title\n\nBody\n',
    );
  });

  it('keeps inner code fences', () => {
    const value = '# Title\n\n```ts\nconst value = 1;\n```';
    expect(normalizeMarkdown(value)).toBe(`${value}\n`);
  });
});

describe('artifact validation', () => {
  const spec = PHASE_DEFINITIONS.requirements.artifacts[0];

  it('accepts a document that satisfies structural rules', () => {
    const result = validateArtifactContent(spec, minimalValidArtifact);
    expect(result.passed).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('reports missing structure and placeholders', () => {
    const result = validateArtifactContent(spec, '# 用户画像\n\n<!-- TODO -->');
    expect(result.passed).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'minimum_length',
        'missing_section',
        'minimum_table_rows',
        'minimum_occurrences',
        'unresolved_placeholder',
      ]),
    );
  });

  it('requires distinct story IDs instead of repeated mentions', () => {
    const result = validateArtifactContent(
      {
        ...spec,
        minChars: 0,
        minTableRows: undefined,
        requiredSections: [],
        occurrences: [],
        minUniqueStoryIds: 2,
      },
      '# Stories\n\nUS-001 US-001 US-001',
    );
    expect(result.issues.map((issue) => issue.code)).toContain(
      'minimum_unique_story_ids',
    );
  });

  it('counts table headers and data but not separator rows', () => {
    expect(countMarkdownTableRows('| A | B |\n|:---|:---|\n| 1 | 2 |\n')).toBe(
      2,
    );
  });
});
