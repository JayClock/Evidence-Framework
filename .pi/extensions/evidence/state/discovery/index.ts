import { createDiscoveryService } from '../../modeling/discovery/service.ts';
import { fileDiscoveryRepository } from './repository.ts';

// Single production binding. This is not another ledger or a second state writer.
export const {
  controlDiscoveryInteraction,
  askQuestions,
  answerQuestion,
  appendDiscoveryRecords,
  assertDiscoveryReady,
  finalizeDiscovery,
  completeModelUpdate,
  requireFinalizing,
  readFinalizedDiscovery,
} = createDiscoveryService(fileDiscoveryRepository);
export {
  appendDiscoveryEvent,
  discoveryEvidencePaths,
  discoveryPath,
  discoveryViewPath,
  loadDiscovery,
  loadDiscoveryEntries,
  nextDiscoveryEntry,
  refreshDiscoveryView,
  withModelingLock,
} from './repository.ts';
