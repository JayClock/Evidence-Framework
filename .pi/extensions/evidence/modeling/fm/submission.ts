import type { ModelingProgress } from '../../types.ts';
import type {
  FmModelFile,
  FmValidationResult,
  RuntimeOptions,
} from './contracts.ts';
import { modelingStatusMarkdown } from './status.ts';

export interface FmSubmission {
  applicable: boolean;
  rationale: string;
  files: FmModelFile[];
}

export interface FmPublication {
  replaceFmModel(
    options: RuntimeOptions & { files: FmModelFile[] },
  ): Promise<FmValidationResult & { files: string[] }>;
  removeFmModel(root: string): Promise<void>;
  writeFmStatus(root: string, content: string): Promise<void>;
  listFmModelFiles(root: string): Promise<string[]>;
}

export function assertFmSubmission(input: FmSubmission): void {
  if (!input.applicable && input.files.length > 0)
    throw new Error('FM 不适用时不得提交模型文件。');
  if (input.applicable && input.files.length === 0)
    throw new Error('FM 适用时必须提交模型文件。');
}

export function createFmSubmission(publication: FmPublication) {
  // Returns model evidence only. Artifact advancement, state saving and human
  // decisions remain with the caller, outside modeling.
  return async function submitFmModel(
    input: FmSubmission,
    options: RuntimeOptions,
  ): Promise<ModelingProgress> {
    assertFmSubmission(input);
    let files: string[];
    let machineValidated = false;
    let simulationPassed: boolean | null = null;
    if (input.applicable) {
      const validation = await publication.replaceFmModel({
        ...options,
        files: input.files,
      });
      if (!validation.passed) {
        throw new Error(
          `统一 FM 模型校验失败：\n${validation.items
            .filter((item) => item.status === 'fail')
            .map((item) => `- ${item.name}: ${item.details}`)
            .join('\n')}`,
        );
      }
      files = validation.files;
      machineValidated = validation.machineValidated;
      simulationPassed = validation.simulationPassed;
    } else {
      await publication.removeFmModel(options.root);
      files = [];
    }
    await publication.writeFmStatus(
      options.root,
      modelingStatusMarkdown({
        applicable: input.applicable,
        rationale: input.rationale,
        machineValidated,
        simulationPassed,
        files,
      }),
    );
    files = await publication.listFmModelFiles(options.root);
    return {
      applicable: input.applicable,
      rationale: input.rationale.trim(),
      files,
      machineValidated,
      simulationPassed,
    };
  };
}
