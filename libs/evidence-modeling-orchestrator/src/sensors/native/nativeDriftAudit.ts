import { auditProductionDrift } from './driftSensor.js';
import { loadModelSources } from './modelSources.js';
import { readProductionTrace } from '../../telemetry/productionTrace.js';

/**
 * Compares one exported trace with the model on disk.
 *
 * The model is read for this call rather than taken from a session: an audit is
 * about what was saved and deployed, and a canvas that has unsaved edits would
 * make the answer describe a model no service is running.
 */
export interface NativeDriftInput {
  /** Absolute path of `.evidence/fm`. */
  modelRoot: string;
  /** The OTLP/JSON export, already parsed. */
  document: unknown;
}

export const runNativeDriftAudit = async (input: NativeDriftInput) => {
  const sources = await loadModelSources(input.modelRoot);
  const trace = readProductionTrace(input.document);
  const audit = auditProductionDrift({ model: sources.model, trace });

  // Problems reading the sources are part of the answer: an audit that could
  // not see the whole model must not read like a clean comparison.
  return {
    ...audit,
    errors: [...new Set([...sources.sourceIssues, ...audit.errors])],
  };
};
