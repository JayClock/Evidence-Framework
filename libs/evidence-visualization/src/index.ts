export {
  projectWorkbenchData,
  type CompiledModel,
  type WorkbenchApiInput,
  type WorkbenchCheckInput,
  type WorkbenchCounts,
  type WorkbenchData,
  type WorkbenchEdge,
  type WorkbenchNode,
  type WorkbenchProjectionInput,
  type WorkbenchValidation,
} from './projection/workbenchProjection.js';

export {
  ASSETS_DIRECTORY,
  BUILTIN_ASSETS_DIRECTORY,
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
  TRACE_PATH,
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
