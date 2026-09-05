import { getPhaseDefinition } from './phases.ts';
import { readText } from './storage.ts';
import type {
  ActivePhase,
  ArtifactSpec,
  ArtifactValidation,
  CheckItem,
  CheckReport,
  EvidenceState,
  ValidationIssue,
} from './types.ts';

export function normalizeMarkdown(content: string): string {
  const trimmed = content.trim();
  const lines = trimmed.split(/\r?\n/);
  if (
    lines.length >= 3 &&
    /^```(?:markdown|md)?\s*$/i.test(lines[0] ?? '') &&
    /^```\s*$/.test(lines.at(-1) ?? '')
  ) {
    return `${lines.slice(1, -1).join('\n').trim()}\n`;
  }
  return `${trimmed}\n`;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  const source = haystack.toLocaleLowerCase();
  const target = needle.toLocaleLowerCase();
  let count = 0;
  let offset = 0;
  while (true) {
    const index = source.indexOf(target, offset);
    if (index < 0) return count;
    count += 1;
    offset = index + target.length;
  }
}

export function countMarkdownTableRows(content: string): number {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .filter((line) => !/^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(line)).length;
}

function hasHeading(content: string, fragment: string): boolean {
  const expected = fragment.toLocaleLowerCase();
  return content.split(/\r?\n/).some((line) => {
    const match = line.match(/^#{1,6}\s+(.+)$/);
    return Boolean(match?.[1]?.toLocaleLowerCase().includes(expected));
  });
}

export function validateArtifactContent(
  spec: ArtifactSpec,
  rawContent: string,
): ArtifactValidation {
  const content = normalizeMarkdown(rawContent);
  const issues: ValidationIssue[] = [];
  const chars = content.trim().length;
  const tableRows = countMarkdownTableRows(content);

  if (chars < spec.minChars) {
    issues.push({
      code: 'minimum_length',
      message: `内容长度 ${chars}，至少需要 ${spec.minChars} 个字符`,
    });
  }

  for (const section of spec.requiredSections) {
    if (!hasHeading(content, section)) {
      issues.push({
        code: 'missing_section',
        message: `缺少包含“${section}”的 Markdown 标题`,
      });
    }
  }

  if (spec.minTableRows !== undefined && tableRows < spec.minTableRows) {
    issues.push({
      code: 'minimum_table_rows',
      message: `Markdown 表格行数 ${tableRows}，至少需要 ${spec.minTableRows} 行（含表头）`,
    });
  }

  for (const rule of spec.occurrences ?? []) {
    const actual = countOccurrences(content, rule.needle);
    if (actual < rule.minimum) {
      issues.push({
        code: 'minimum_occurrences',
        message: `${rule.label}：找到 ${actual}，至少需要 ${rule.minimum}`,
      });
    }
  }

  if (spec.minUniqueStoryIds !== undefined) {
    const storyIds = new Set(content.match(/\bUS-\d{3}\b/g) ?? []);
    if (storyIds.size < spec.minUniqueStoryIds) {
      issues.push({
        code: 'minimum_unique_story_ids',
        message: `唯一用户故事 ID 数量 ${storyIds.size}，至少需要 ${spec.minUniqueStoryIds}`,
      });
    }
  }

  if (/<!--\s*(?:TODO|在此填写|待补充)/i.test(content)) {
    issues.push({
      code: 'unresolved_placeholder',
      message: '存在未完成的 TODO/待补充占位符',
    });
  }

  return {
    path: spec.output,
    passed: issues.length === 0,
    chars,
    tableRows,
    issues,
  };
}

export async function validateDocumentPhase(
  root: string,
  state: EvidenceState,
): Promise<CheckReport> {
  if (state.phase === 'complete' || state.phase === 'coding') {
    throw new Error(`Phase ${state.phase} is not a document phase`);
  }

  const definition = getPhaseDefinition(state.phase);
  const validations = await Promise.all(
    definition.artifacts.map(async (spec) => {
      const content = await readText(root, spec.output);
      if (!content) {
        return {
          path: spec.output,
          passed: false,
          chars: 0,
          tableRows: 0,
          issues: [{ code: 'missing_file', message: '工件文件不存在或为空' }],
        } satisfies ArtifactValidation;
      }
      return validateArtifactContent(spec, content);
    }),
  );

  const items: CheckItem[] = validations.map((validation) => ({
    name: validation.path,
    status: validation.passed ? 'pass' : 'fail',
    details: validation.passed
      ? `${validation.chars} 字符，${validation.tableRows} 个表格行`
      : validation.issues.map((issue) => issue.message).join('；'),
  }));

  return {
    phase: state.phase as ActivePhase,
    subject: definition.label,
    round: state.round,
    passed: items.every((item) => item.status !== 'fail'),
    warnings: 0,
    createdAt: new Date().toISOString(),
    items,
  };
}

export function formatCheckReport(report: CheckReport): string {
  const lines = [
    `# 质量检查：${report.subject}`,
    '',
    `- 阶段：\`${report.phase}\``,
    `- 轮次：${report.round}`,
    `- 结果：${report.passed ? '✅ 通过' : '❌ 未通过'}`,
    `- 时间：${report.createdAt}`,
    '',
    '## 检查项',
    '',
    '| 检查项 | 结果 | 说明 |',
    '|:---|:---:|:---|',
  ];

  for (const item of report.items) {
    let icon: string;
    switch (item.status) {
      case 'pass':
        icon = '✅';
        break;
      case 'warn':
        icon = '⚠️';
        break;
      case 'fail':
        icon = '❌';
        break;
      default: {
        const exhaustiveStatus: never = item.status;
        icon = exhaustiveStatus;
      }
    }
    lines.push(
      `| ${item.name.replaceAll('|', '\\|')} | ${icon} | ${item.details.replaceAll('|', '\\|').replaceAll('\n', '<br>')} |`,
    );
  }

  const commandItems = report.items.filter((item) => item.command);
  if (commandItems.length > 0) lines.push('', '## 命令输出', '');
  for (const item of commandItems) {
    lines.push(
      `### \`${item.command}\``,
      '',
      `- 退出码：${item.exitCode ?? '未知'}`,
      '',
      ...(item.output || '(no output)')
        .split('\n')
        .map((line) => `    ${line}`),
      '',
    );
  }

  return `${lines.join('\n')}\n`;
}
