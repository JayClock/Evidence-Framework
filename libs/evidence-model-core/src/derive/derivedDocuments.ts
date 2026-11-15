import type { DomainModelDocument } from '@evidence-poc/evidence-schema';
import {
  analyzeTraceability,
  type TraceabilityDocument,
} from '../validation/traceability.js';

/** Attribute lineage is a model projection, independent of acceptance execution. */
export const derivedTraceability = (
  model: DomainModelDocument,
): TraceabilityDocument => analyzeTraceability(model).document;
