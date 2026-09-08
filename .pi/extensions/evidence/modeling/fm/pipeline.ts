import { join, resolve } from 'node:path';
import { FM_SKILL_ROOT } from '../../contracts/paths.ts';
import type { CheckItem } from '../../types.ts';
import type {
  CommandResult,
  FmRuntime,
  FmValidationResult,
  ValidationOptions,
} from './contracts.ts';
import { combinedOutput } from './output.ts';

export function createFmValidator(runtime: FmRuntime) {
  async function hasScenarios(modelDir: string): Promise<boolean> {
    try {
      const entries = await runtime.files.listNames(
        join(modelDir, 'validation', 'scenarios'),
      );
      return entries.some((entry) => entry.endsWith('.yaml'));
    } catch {
      return false;
    }
  }

  function commandItem(name: string, result: CommandResult): CheckItem {
    return {
      name,
      status: result.code === 0 && !result.killed ? 'pass' : 'fail',
      details:
        `退出码 ${result.code}${result.killed ? '（被终止）' : ''}\n${combinedOutput(result)}`.trim(),
    };
  }

  async function validateFmModel(
    options: ValidationOptions,
  ): Promise<FmValidationResult> {
    const items: CheckItem[] = [];
    let python: string;
    try {
      python = await runtime.ensurePython(options);
    } catch (error) {
      return {
        passed: false,
        machineValidated: false,
        simulationPassed: null,
        items: [
          {
            name: 'FM runtime',
            status: 'fail',
            details: (error as Error).message,
          },
        ],
      };
    }

    const scriptRoot = resolve(options.root, FM_SKILL_ROOT, 'scripts');
    const modelDir = resolve(options.modelDir);
    const generated = join(modelDir, 'generated');
    await runtime.files.ensureDirectory(generated);
    const commands: Array<{ name: string; script: string; args: string[] }> = [
      {
        name: 'FM schema validation',
        script: 'validate_fm_model.py',
        args: [modelDir, '--json', '--model-only'],
      },
      {
        name: 'FM attribute lineage',
        script: 'build_fm_lineage.py',
        args: [modelDir, '--output', join(generated, 'traceability.json')],
      },
    ];
    const scenariosExist = await hasScenarios(modelDir);
    // Any submitted validation inputs must be checked; orphan instances cannot be skipped.
    const validationExists = await runtime.files.exists(
      join(modelDir, 'validation'),
    );
    const patternsExist = await runtime.files.exists(
      join(modelDir, 'business-patterns'),
    );
    if (!validationExists)
      await runtime.files.removeFile(join(generated, 'simulation.json'));
    if (!patternsExist)
      await runtime.files.removeFile(join(modelDir, '02-business-patterns.md'));
    if (validationExists) {
      commands.push({
        name: 'FM scenario simulation',
        script: 'simulate_fm_model.py',
        args: [modelDir, '--output', join(generated, 'simulation.json')],
      });
    }
    if (patternsExist) {
      commands.push({
        name: 'FM business pattern projection',
        script: 'build_fm_business_patterns.py',
        args: [modelDir, '--output', join(modelDir, '02-business-patterns.md')],
      });
    }
    commands.push({
      name: 'FM deterministic compilation',
      script: 'compile_fm_model.py',
      args: [modelDir, '--output', join(generated, 'model.json')],
    });

    let machineValidated = false;
    let simulationPassed: boolean | null = validationExists ? false : null;
    let hasFulfillments = false;
    for (const command of commands) {
      options.onProgress?.(`执行 ${command.name}`);
      const result = await runtime.runProcess(options, python, [
        '-B',
        join(scriptRoot, command.script),
        ...command.args,
      ]);
      const item = commandItem(command.name, result);
      items.push(item);
      if (item.status === 'fail') break;
      if (command.name === 'FM schema validation') {
        try {
          const parsed = JSON.parse(result.stdout ?? '') as {
            valid?: boolean;
            machineValidated?: boolean;
            counts?: { fulfillments?: number };
          } | null;
          if (parsed?.valid !== true || parsed.machineValidated !== true) {
            throw new Error('缺少明确通过的机器校验结果');
          }
          hasFulfillments = (parsed.counts?.fulfillments ?? 0) > 0;
        } catch (error) {
          item.status = 'fail';
          item.details += `\nFM 结果无效：${error instanceof Error ? error.message : String(error)}`;
          break;
        }
      }
      if (command.name === 'FM attribute lineage') machineValidated = true;
      if (command.name === 'FM scenario simulation') simulationPassed = true;
    }
    if (!scenariosExist) {
      items.push({
        name: 'FM validation scenarios',
        status: hasFulfillments ? 'warn' : 'pass',
        details: hasFulfillments
          ? '存在履约但未提交场景；未执行单据模拟，需人工审查覆盖缺口'
          : '无适用单据场景；未执行模拟。纯领域结构与 lineage 不证明领域实例或状态机行为，需下游 Q1/Q2 验证',
      });
    }
    const passed =
      machineValidated && items.every((item) => item.status !== 'fail');
    return { passed, machineValidated, simulationPassed, items };
  }
  return validateFmModel;
}
