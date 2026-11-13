export { projectWorkbenchDiff, type WorkbenchDiffSummary, type WorkbenchEntityDiff } from './projection/workbenchDiff.js';
export { deliveryViewOf } from './projection/deliveryView.js';

export { workbenchLayoutOf, type SerializableGraphLayout } from './projection/workbenchLayout.js';

export {
  projectWorkbenchData,
  type CompiledModel,
  type WorkbenchApiInput,
  type WorkbenchCheckInput,
  type WorkbenchCounts,
  type WorkbenchData,
  type WorkbenchDelivery,
  type WorkbenchDeliveryLink,
  type WorkbenchService,
  type WorkbenchEdge,
  type WorkbenchNode,
  type WorkbenchProjectionInput,
  type WorkbenchValidation,
} from './projection/workbenchProjection.js';

export {
  ASSETS_DIRECTORY,
  builtinAssetsDirectory,
  WorkbenchAssetError,
  loadWorkbenchAssets,
  resolveAssetsDirectory,
  type ResolveAssetsDirectoryInput,
  type WorkbenchAssets,
} from './render/workbenchAssets.js';

export {
  WORKBENCH_MARKER,
  WorkbenchRenderError,
  embeddedJson,
  renderWorkbenchHtml,
  scriptHashCsp,
} from './render/workbenchRenderer.js';

export {
  WorkbenchPublishError,
  publishRefusal,
  publishWorkbench,
} from './publish/workbenchPublisher.js';

export {
  API_DESIGN_PATH,
  MODEL_TREE,
  WorkbenchInputError,
  collectWorkbench,
  workbenchFingerprint,
  type CollectWorkbenchInput,
  type CollectedWorkbench,
} from './generate/collectWorkbench.js';

export {
  generateWorkbench,
  reviewPagePath,
  type GenerateWorkbenchInput,
  type GenerateWorkbenchResult,
} from './generate/generateWorkbench.js';

export { runCli, type CliResult } from './cli.js';
