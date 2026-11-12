/**
 * Reading a production trace as the Evidence commits it actually wrote.
 *
 * The input is an OTLP/JSON export — the shape a collector, a test fixture or a
 * `curl` of the tracing backend already produces — so an audit can start from
 * what the services emitted instead of from a bespoke format nobody exports.
 *
 * A span becomes a commit only when it names the Evidence it wrote. Everything
 * else in the trace is context: the service that ran it, when it ran, and what
 * the caller passed in.
 */

/** One business Evidence a production service committed. */
export interface EvidenceCommit {
  traceId: string;
  spanId: string;
  /** `service.name` of the resource that produced the span. */
  serviceName: string;
  /** Span name, e.g. `POST /payments/{id}/confirm`. */
  operation: string;
  /** Span start, as an RFC 3339 instant, when the export carries one. */
  at: string | null;
  /** `fm.evidence.ref`: the Evidence Entity this commit instantiates. */
  evidenceRef: string;
  /** `fm.context.ref`: the context the service believes it is writing into. */
  contextRef: string | null;
  /** `fm.value.<attribute>` values the service actually wrote. */
  values: Readonly<Record<string, unknown>>;
  /** `fm.fulfillment.*`: what the service claims the request did. */
  fulfillment: {
    requestRef: string;
    status: 'completed' | 'breached';
  } | null;
}

export interface ProductionTrace {
  commits: readonly EvidenceCommit[];
  /** Spans inspected, so a summary can say how much was read. */
  spanCount: number;
  /** Shape problems, as `path: message`; a malformed span is skipped, not guessed. */
  errors: readonly string[];
}

/** Span attribute keys the reader understands. */
export const TRACE_ATTRIBUTE_KEYS = {
  evidenceRef: 'fm.evidence.ref',
  contextRef: 'fm.context.ref',
  fulfillmentRequestRef: 'fm.fulfillment.request.ref',
  fulfillmentStatus: 'fm.fulfillment.status',
  /** Prefix for one Evidence attribute value: `fm.value.amount`. */
  valuePrefix: 'fm.value.',
  serviceName: 'service.name',
} as const;

const FULFILLMENT_STATUSES = ['completed', 'breached'] as const;

type JsonObject = Record<string, unknown>;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * One OTLP `AnyValue` as a JSON value.
 *
 * OTLP encodes integers as strings, so an unread attribute would otherwise be
 * compared as text and never match a modeled number.
 */
const anyValue = (value: unknown): unknown => {
  if (!isRecord(value)) {
    return undefined;
  }

  if ('stringValue' in value) {
    return value['stringValue'];
  }
  if ('boolValue' in value) {
    return value['boolValue'];
  }
  if ('intValue' in value) {
    const raw = value['intValue'];

    return typeof raw === 'string' ? Number(raw) : raw;
  }
  if ('doubleValue' in value) {
    return value['doubleValue'];
  }
  if ('arrayValue' in value) {
    const values = isRecord(value['arrayValue'])
      ? value['arrayValue']['values']
      : undefined;

    return Array.isArray(values) ? values.map(anyValue) : [];
  }
  if ('kvlistValue' in value) {
    const entries = isRecord(value['kvlistValue'])
      ? value['kvlistValue']['values']
      : undefined;

    return isRecord(entries) || Array.isArray(entries)
      ? attributeMap(entries)
      : {};
  }

  return undefined;
};

/** OTLP `KeyValue[]` as a plain object; later keys win. */
const attributeMap = (attributes: unknown): Record<string, unknown> => {
  const result: Record<string, unknown> = {};

  if (!Array.isArray(attributes)) {
    return result;
  }

  for (const entry of attributes) {
    if (!isRecord(entry) || !isNonEmptyString(entry['key'])) {
      continue;
    }

    result[entry['key']] = anyValue(entry['value']);
  }

  return result;
};

const unixNanoToIso = (value: unknown): string | null => {
  const text = typeof value === 'string' ? value : undefined;

  if (text === undefined || !/^[0-9]+$/.test(text)) {
    return null;
  }

  const millis = Number(BigInt(text) / 1_000_000n);

  return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
};

/** OTLP wraps every scope's spans one level down; a flat array is also accepted. */
const spansOf = (
  resourceSpan: JsonObject,
): readonly JsonObject[] => {
  const scopes = resourceSpan['scopeSpans'];

  if (!Array.isArray(scopes)) {
    return [];
  }

  return scopes.flatMap((scope) =>
    isRecord(scope) && Array.isArray(scope['spans'])
      ? scope['spans'].filter(isRecord)
      : [],
  );
};

const resourceAttributes = (resourceSpan: JsonObject): Record<string, unknown> =>
  isRecord(resourceSpan['resource'])
    ? attributeMap(resourceSpan['resource']['attributes'])
    : {};

const valuesOf = (
  attributes: Readonly<Record<string, unknown>>,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(attributes)) {
    if (key.startsWith(TRACE_ATTRIBUTE_KEYS.valuePrefix)) {
      values[key.slice(TRACE_ATTRIBUTE_KEYS.valuePrefix.length)] = value;
    }
  }

  return values;
};

const fulfillmentOf = (
  attributes: Readonly<Record<string, unknown>>,
): EvidenceCommit['fulfillment'] => {
  const requestRef = attributes[TRACE_ATTRIBUTE_KEYS.fulfillmentRequestRef];
  const status = attributes[TRACE_ATTRIBUTE_KEYS.fulfillmentStatus];

  if (
    !isNonEmptyString(requestRef) ||
    !FULFILLMENT_STATUSES.includes(status as (typeof FULFILLMENT_STATUSES)[number])
  ) {
    return null;
  }

  return {
    requestRef,
    status: status as (typeof FULFILLMENT_STATUSES)[number],
  };
};

/**
 * Reads an OTLP/JSON export into the commits it recorded.
 *
 * A span without `fm.evidence.ref` is not a business commit and is passed over
 * silently; a span that names Evidence but has no ids is reported, because that
 * is a trace the audit cannot place.
 */
export const readProductionTrace = (document: unknown): ProductionTrace => {
  const errors: string[] = [];

  if (!isRecord(document)) {
    return {
      commits: [],
      spanCount: 0,
      errors: ['trace: must be an object'],
    };
  }

  const resourceSpans = document['resourceSpans'];

  if (!Array.isArray(resourceSpans)) {
    return {
      commits: [],
      spanCount: 0,
      errors: ["trace/resourceSpans: must be an array"],
    };
  }

  const commits: EvidenceCommit[] = [];
  let spanCount = 0;

  resourceSpans.forEach((resourceSpan, resourceIndex) => {
    const path = `trace/resourceSpans[${resourceIndex}]`;

    if (!isRecord(resourceSpan)) {
      errors.push(`${path}: must be an object`);

      return;
    }

    // The service name belongs to the resource; a span that repeats it is
    // allowed to win, because a sidecar may emit on another service's behalf.
    const resource = resourceAttributes(resourceSpan);
    const resourceService = resource[TRACE_ATTRIBUTE_KEYS.serviceName];

    spansOf(resourceSpan).forEach((span, spanIndex) => {
      spanCount += 1;

      const spanPath = `${path}/spans[${spanIndex}]`;
      const attributes = attributeMap(span['attributes']);
      const evidenceRef = attributes[TRACE_ATTRIBUTE_KEYS.evidenceRef];

      if (!isNonEmptyString(evidenceRef)) {
        return;
      }

      const traceId = span['traceId'];
      const spanId = span['spanId'];

      if (!isNonEmptyString(traceId) || !isNonEmptyString(spanId)) {
        errors.push(
          `${spanPath}: names Evidence '${evidenceRef}' but carries no traceId/spanId`,
        );

        return;
      }

      const serviceName = attributes[TRACE_ATTRIBUTE_KEYS.serviceName];
      const contextRef = attributes[TRACE_ATTRIBUTE_KEYS.contextRef];

      commits.push({
        traceId,
        spanId,
        serviceName: isNonEmptyString(serviceName)
          ? serviceName
          : isNonEmptyString(resourceService)
            ? resourceService
            : 'unknown-service',
        operation: isNonEmptyString(span['name']) ? span['name'] : evidenceRef,
        at: unixNanoToIso(span['startTimeUnixNano']),
        evidenceRef,
        contextRef: isNonEmptyString(contextRef) ? contextRef : null,
        values: valuesOf(attributes),
        fulfillment: fulfillmentOf(attributes),
      });
    });
  });

  return {
    commits: [...commits].sort((left, right) =>
      `${left.at ?? ''}${left.spanId}`.localeCompare(
        `${right.at ?? ''}${right.spanId}`,
      ),
    ),
    spanCount,
    errors,
  };
};
