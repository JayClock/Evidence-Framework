import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { createFlowStoryProjector } from '@evidence-poc/evidence-agent';
import {
  buildFmCheckReport,
  collectFlowScenarios,
} from '@evidence-poc/evidence-model-core';
import {
  compactCanonicalJson,
  prettyCanonicalJson,
} from '@evidence-poc/evidence-schema';
import {
  stringOption,
  type CommandContext,
  type CommandOptions,
} from '../context.js';
import { loadModel } from '../model.js';
import { renderStoryMarkdown, renderStoryText } from '../ui/storyReporter.js';

export async function storyCommand(
  modelInput: string | undefined,
  options: CommandOptions,
  context: CommandContext,
): Promise<number> {
  const format = stringOption(options.format) ?? 'markdown';
  if (!['text', 'markdown', 'json'].includes(format))
    throw new Error('--format must be text, markdown or json');
  const targetFlow = stringOption(options.flow);
  const exportPath = stringOption(options.export);
  const compact = options.compact === true;
  const model = await loadModel(
    path.resolve(context.cwd, modelInput ?? '.evidence/fm'),
  );
  // Completeness gaps inform the story; a draft is not a failed test run.
  const { report } = buildFmCheckReport({ model });
  let flows = collectFlowScenarios(model, report);
  if (targetFlow !== undefined) {
    flows = flows.filter((flow) => flow.flowId === targetFlow);
    if (flows.length === 0) {
      context.stderr(`未找到 ID 为 '${targetFlow}' 的业务流。`);
      return 1;
    }
  }

  // cac parses --no-ai as { ai: false }, not { noAi: true }.
  const projector = createFlowStoryProjector({
    skipAi: options.ai === false,
  });
  const projections = [];
  for (const flow of flows)
    projections.push(await projector.project(flow, model));

  const content =
    format === 'json'
      ? compact
        ? compactCanonicalJson(projections)
        : prettyCanonicalJson(projections)
      : format === 'text'
        ? renderStoryText(projections, {
            compact,
            color: context.color && exportPath === undefined,
          })
        : renderStoryMarkdown(projections, { compact });
  if (exportPath !== undefined) {
    const fullExportPath = path.resolve(context.cwd, exportPath);
    // Render every flow successfully before creating directories or files.
    await mkdir(path.dirname(fullExportPath), { recursive: true });
    await writeFile(fullExportPath, `${content.trimEnd()}\n`, 'utf8');
    context.stdout(`业务故事已成功导出至: ${fullExportPath}`);
  } else {
    context.stdout(content.trimEnd());
  }
  return 0;
}
