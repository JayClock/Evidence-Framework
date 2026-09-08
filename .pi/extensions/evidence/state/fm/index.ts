import { runProcess } from '../../environment/commands.ts';
import { fmValidationFiles } from '../../environment/fm-files.ts';
import { ensureRuntime } from '../../environment/python.ts';
import { createFmValidator } from '../../modeling/fm/pipeline.ts';
import { createFmSubmission } from '../../modeling/fm/submission.ts';
import { createFmRepository } from './repository.ts';

export const validateFmModel = createFmValidator({
  ensurePython: ensureRuntime,
  runProcess,
  files: fmValidationFiles,
});
const repository = createFmRepository(validateFmModel);
export const { replaceFmModel, listFmModelFiles } = repository;
export const submitFmModel = createFmSubmission(repository);
