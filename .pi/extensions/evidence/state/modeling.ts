import { createDraftChecker } from '../modeling/draft.ts';
import { fileDiscoveryRepository } from './discovery/repository.ts';
import { replaceFmModel } from './fm/index.ts';

export const checkModelDraft = createDraftChecker({
  discovery: fileDiscoveryRepository,
  checkFiles: replaceFmModel,
});
