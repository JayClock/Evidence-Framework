import type { BusinessStoryProjection } from '@evidence-poc/evidence-agent';

const emptyMessage =
  '当前模型中未检测到带有 examples[].test.flow 的业务流场景。';
const disclaimer = '仅投影模型声明的业务事实，不代表已执行验收或规则判定。';
const markdown = (value: string): string =>
  value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/\\/gu, '\\\\')
    .replace(/([`*_{}[\]()#+.!|])/gu, '\\$1')
    .replace(/\r\n?|\n/gu, '<br>');

export function renderStoryMarkdown(
  stories: readonly BusinessStoryProjection[],
  options: { readonly compact?: boolean } = {},
): string {
  if (stories.length === 0) return emptyMessage;
  const lines = ['# 业务故事', '', `> ${disclaimer}`, ''];
  for (const story of stories) {
    lines.push(
      `## ${markdown(story.storyTitle)}`,
      '',
      `业务流：${markdown(story.flowId)}`,
      '',
    );
    if (!options.compact)
      lines.push(
        markdown(story.storySummary),
        '',
        `**业务目标**：${markdown(story.businessGoal)}`,
        '',
      );
    for (const scene of story.scenes) {
      lines.push(
        `### ${scene.stepIndex}. ${markdown(scene.phaseTitle)}`,
        '',
        `**经办方**：${markdown(scene.actingRoleLabel)} · **单据**：${markdown(scene.targetEntityLabel)}`,
        '',
      );
      if (!options.compact) lines.push(markdown(scene.narrative), '');
      lines.push(
        `#### ${markdown(scene.documentCard.title)}`,
        '',
        '| 字段 | 值 | 关键数据 | 来源 |',
        '| --- | --- | --- | --- |',
        ...scene.documentCard.fields.map(
          (field) =>
            `| ${markdown(field.label === field.name ? field.label : `${field.label} (${field.name})`)} | ${markdown(field.value)} | ${field.keyData ? '是' : '—'} | ${markdown(field.sourceOrigin ?? '—')} |`,
        ),
        '',
      );
      if (scene.documentCard.basisNotes)
        lines.push(`依据：${markdown(scene.documentCard.basisNotes)}`, '');
      for (const rule of scene.ruleEvaluations)
        lines.push(
          `- ${rule.satisfied ? '✓' : '✗'} ${markdown(rule.ruleName)}：${markdown(rule.explanation)}`,
        );
      if (scene.stateTransitionNotice)
        lines.push('', `状态：${markdown(scene.stateTransitionNotice)}`, '');
      if (scene.pendingSuspense)
        lines.push(`> ${markdown(scene.pendingSuspense)}`, '');
    }
  }
  return lines.join('\n').trimEnd();
}

/** Color is only enabled for interactive text, never Markdown/JSON or files. */
export function renderStoryText(
  stories: readonly BusinessStoryProjection[],
  options: { readonly compact?: boolean; readonly color: boolean },
): string {
  if (stories.length === 0) return emptyMessage;
  const paint = (code: number, value: string): string =>
    options.color ? `\u001b[${code}m${value}\u001b[0m` : value;
  const inline = (value: string): string => value.replace(/\r\n?|\n/gu, ' / ');
  const lines = ['业务故事', disclaimer, ''];
  for (const story of stories) {
    lines.push(
      paint(36, `${inline(story.storyTitle)} [${inline(story.flowId)}]`),
    );
    if (!options.compact)
      lines.push(
        inline(story.storySummary),
        `业务目标：${inline(story.businessGoal)}`,
      );
    for (const scene of story.scenes) {
      lines.push(
        '',
        paint(1, `${scene.stepIndex}. ${inline(scene.phaseTitle)}`),
        `经办方：${inline(scene.actingRoleLabel)} · 单据：${inline(scene.targetEntityLabel)}`,
      );
      if (!options.compact) lines.push(inline(scene.narrative));
      const prefix = options.compact ? '  ' : '│ ';
      lines.push(
        options.compact
          ? `  ${inline(scene.documentCard.title)}`
          : `┌─ ${inline(scene.documentCard.title)} ─`,
        ...scene.documentCard.fields.map(
          (field) =>
            `${prefix}${inline(field.label)}: ${inline(field.value)}${field.keyData ? paint(33, ' ★') : ''}${field.sourceOrigin ? ` （来源：${inline(field.sourceOrigin)}）` : ''}`,
        ),
      );
      if (scene.documentCard.basisNotes)
        lines.push(`${prefix}依据：${inline(scene.documentCard.basisNotes)}`);
      if (!options.compact) lines.push('└────────────────────');
      for (const rule of scene.ruleEvaluations)
        lines.push(
          paint(
            rule.satisfied ? 32 : 31,
            `${rule.satisfied ? '✓' : '✗'} ${inline(rule.ruleName)}：${inline(rule.explanation)}`,
          ),
        );
      if (scene.stateTransitionNotice)
        lines.push(`状态：${inline(scene.stateTransitionNotice)}`);
      if (scene.pendingSuspense)
        lines.push(paint(33, inline(scene.pendingSuspense)));
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
