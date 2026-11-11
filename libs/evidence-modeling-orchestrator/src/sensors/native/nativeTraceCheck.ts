import {
  DOMAIN_ID_PATTERN,
  type DomainModelDocument,
  type EntityAST,
} from '@evidence-poc/evidence-schema';

import { isTimestampText } from '@evidence-poc/evidence-model-core';

/**
 * Interview trace validation without Python.
 *
 * The trace is the record of what was asked and what a person confirmed, so it
 * is checked against the same schema constants the Python script used: a
 * question id that repeats, a focus that names an entity the model does not
 * contain, or a binding to an attribute that was never modeled all make the
 * record unusable as provenance.
 */

type JsonObject = Record<string, unknown>;

export interface TraceCheckResult {
  valid: boolean;
  traceCount: number;
  errors: readonly string[];
  limitations: readonly string[];
}

/** Questions are `Q1`, `Q2`, … and must be unique inside one record. */
const QUESTION_ID_PATTERN = /^Q[0-9]+$/;

/** `entity.attribute` in the trace's `targetAttribute` field. */
const ATTRIBUTE_PATH_PATTERN =
  /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*#[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

const SOURCE_TYPES = [
  'interview_statement',
  'upstream_evidence',
  'system_rule',
  'document',
] as const;

const isRecord = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isId = (value: unknown): boolean =>
  typeof value === 'string' && DOMAIN_ID_PATTERN.test(value);

interface Shape {
  required: readonly string[];
  optional: readonly string[];
}

/**
 * Reports the differences between a value and one object shape.
 *
 * The messages follow the `path: problem` form the Python validator printed, so
 * a reader can jump from a report line to the trace file.
 */
const checkObject = (
  value: unknown,
  path: string,
  shape: Shape,
  errors: string[],
): JsonObject | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path}: must be an object`);

    return undefined;
  }

  for (const key of shape.required) {
    if (!(key in value)) {
      errors.push(`${path}: must have required property '${key}'`);
    }
  }

  for (const key of Object.keys(value)) {
    if (!shape.required.includes(key) && !shape.optional.includes(key)) {
      errors.push(`${path}: must NOT have additional property '${key}'`);
    }
  }

  return value;
};

const checkString = (
  value: unknown,
  path: string,
  errors: string[],
  options: { nonEmpty?: boolean; pattern?: RegExp } = {},
): void => {
  if (typeof value !== 'string') {
    errors.push(`${path}: must be a string`);

    return;
  }

  if (options.nonEmpty === true && value.length === 0) {
    errors.push(`${path}: must not be empty`);
  }

  if (options.pattern !== undefined && !options.pattern.test(value)) {
    errors.push(`${path}: '${value}' does not match ${String(options.pattern)}`);
  }
};

/** Checks one trace record against the record shape. */
const checkRecord = (
  record: unknown,
  path: string,
  errors: string[],
): void => {
  const object = checkObject(
    record,
    path,
    {
      required: [
        'traceId',
        'timestamp',
        'focus',
        'narrative',
        'qa',
        'userInput',
        'targetBindings',
      ],
      optional: [],
    },
    errors,
  );

  if (object === undefined) {
    return;
  }

  checkString(object['traceId'], `${path}/traceId`, errors, { nonEmpty: true });

  if (!isTimestampText(object['timestamp'])) {
    errors.push(`${path}/timestamp: must be an RFC 3339 timestamp`);
  }

  const focus = checkObject(
    object['focus'],
    `${path}/focus`,
    { required: ['evidenceRef'], optional: ['contextRef', 'roleRef'] },
    errors,
  );

  if (focus !== undefined) {
    for (const field of ['contextRef', 'evidenceRef', 'roleRef'] as const) {
      if (focus[field] === undefined) {
        if (field === 'evidenceRef') {
          errors.push(`${path}/focus: must have required property 'evidenceRef'`);
        }

        continue;
      }

      if (!isId(focus[field])) {
        errors.push(`${path}/focus/${field}: must be a stable FM id`);
      }
    }
  }

  const narrative = checkObject(
    object['narrative'],
    `${path}/narrative`,
    { required: ['judgment', 'story'], optional: ['keyData'] },
    errors,
  );

  if (narrative !== undefined) {
    checkString(narrative['judgment'], `${path}/narrative/judgment`, errors, {
      nonEmpty: true,
    });
    checkString(narrative['story'], `${path}/narrative/story`, errors, {
      nonEmpty: true,
    });

    if (
      narrative['keyData'] !== undefined &&
      (!Array.isArray(narrative['keyData']) ||
        !narrative['keyData'].every((item) => typeof item === 'string'))
    ) {
      errors.push(`${path}/narrative/keyData: must be an array of strings`);
    }
  }

  if (!Array.isArray(object['qa'])) {
    errors.push(`${path}/qa: must be an array`);
  } else {
    object['qa'].forEach((question, index) => {
      const questionPath = `${path}/qa[${index}]`;
      const entry = checkObject(
        question,
        questionPath,
        {
          required: ['questionId', 'question'],
          optional: ['targetAttribute', 'intent'],
        },
        errors,
      );

      if (entry === undefined) {
        return;
      }

      checkString(entry['questionId'], `${questionPath}/questionId`, errors, {
        pattern: QUESTION_ID_PATTERN,
      });
      checkString(entry['question'], `${questionPath}/question`, errors, {
        nonEmpty: true,
      });

      if (entry['targetAttribute'] !== undefined) {
        checkString(
          entry['targetAttribute'],
          `${questionPath}/targetAttribute`,
          errors,
          { pattern: ATTRIBUTE_PATH_PATTERN },
        );
      }
    });
  }

  const userInput = checkObject(
    object['userInput'],
    `${path}/userInput`,
    { required: ['rawText', 'confirmedFacts'], optional: [] },
    errors,
  );

  if (userInput !== undefined) {
    checkString(userInput['rawText'], `${path}/userInput/rawText`, errors, {
      nonEmpty: true,
    });

    if (
      !Array.isArray(userInput['confirmedFacts']) ||
      !userInput['confirmedFacts'].every(
        (fact) => typeof fact === 'string' && fact.length > 0,
      )
    ) {
      errors.push(
        `${path}/userInput/confirmedFacts: must be an array of non-empty strings`,
      );
    }
  }

  if (!Array.isArray(object['targetBindings'])) {
    errors.push(`${path}/targetBindings: must be an array`);
  } else {
    object['targetBindings'].forEach((binding, index) => {
      const bindingPath = `${path}/targetBindings[${index}]`;
      const entry = checkObject(
        binding,
        bindingPath,
        {
          required: ['evidenceRef', 'sourceType'],
          optional: ['attributeName', 'upstreamEvidenceRef', 'sourceDescription'],
        },
        errors,
      );

      if (entry === undefined) {
        return;
      }

      if (!isId(entry['evidenceRef'])) {
        errors.push(`${bindingPath}/evidenceRef: must be a stable FM id`);
      }
      if (
        !SOURCE_TYPES.includes(entry['sourceType'] as (typeof SOURCE_TYPES)[number])
      ) {
        errors.push(
          `${bindingPath}/sourceType: must be one of ${SOURCE_TYPES.join(', ')}`,
        );
      }
      if (entry['attributeName'] !== undefined) {
        checkString(entry['attributeName'], `${bindingPath}/attributeName`, errors);
      }
      if (
        entry['upstreamEvidenceRef'] !== undefined &&
        !isId(entry['upstreamEvidenceRef'])
      ) {
        errors.push(
          `${bindingPath}/upstreamEvidenceRef: must be a stable FM id`,
        );
      }
    });
  }
};

const attributesOf = (entity: EntityAST | undefined): readonly string[] =>
  (entity?.attributes ?? []).map((attribute) => attribute.name);

/**
 * Checks one trace document against the model it claims to describe.
 *
 * A reference the model does not contain is an error rather than a warning: the
 * trace would otherwise claim provenance for something that was never modeled.
 */
export const checkInterviewTrace = (
  document: unknown,
  model: DomainModelDocument,
): TraceCheckResult => {
  const errors: string[] = [];
  const limitations: string[] = [];
  const root = checkObject(
    document,
    '<root>',
    { required: ['schemaVersion', 'modelId', 'traces'], optional: [] },
    errors,
  );

  if (root === undefined) {
    return { valid: false, traceCount: 0, errors, limitations };
  }

  if (root['schemaVersion'] !== '5.0') {
    errors.push(`schemaVersion: must be "5.0", found ${JSON.stringify(root['schemaVersion'])}`);
  }
  if (!isId(root['modelId'])) {
    errors.push('modelId: must be a stable FM id');
  }

  const traces = Array.isArray(root['traces']) ? root['traces'] : [];

  if (!Array.isArray(root['traces'])) {
    errors.push('traces: must be an array');
  }

  traces.forEach((record, index) => checkRecord(record, `traces[${index}]`, errors));

  const entities = new Map(model.entities.map((entity) => [entity.id, entity] as const));
  const seenTraceIds = new Set<string>();

  traces.forEach((record, index) => {
    if (!isRecord(record)) {
      return;
    }

    const traceId = record['traceId'];

    if (typeof traceId === 'string') {
      if (seenTraceIds.has(traceId)) {
        errors.push(`traces[${index}].traceId: duplicate '${traceId}'`);
      }
      seenTraceIds.add(traceId);
    }

    const seenQuestionIds = new Map<string, number>();
    const questions = Array.isArray(record['qa']) ? record['qa'] : [];

    questions.forEach((question, position) => {
      if (!isRecord(question)) {
        return;
      }

      const questionId = question['questionId'];

      if (typeof questionId !== 'string') {
        return;
      }

      const previous = seenQuestionIds.get(questionId);

      if (previous !== undefined) {
        errors.push(
          `traces[${index}].qa[${position}].questionId: duplicate '${questionId}' also used at qa[${previous}]`,
        );
      }

      seenQuestionIds.set(questionId, position);
    });

    const focus = isRecord(record['focus']) ? record['focus'] : {};

    for (const field of ['contextRef', 'evidenceRef', 'roleRef'] as const) {
      const reference = focus[field];

      if (typeof reference === 'string' && !entities.has(reference)) {
        errors.push(
          `traces[${index}].focus.${field}: unmodeled reference '${reference}'`,
        );
      }
    }

    const bindings = Array.isArray(record['targetBindings'])
      ? record['targetBindings']
      : [];

    bindings.forEach((binding, position) => {
      if (!isRecord(binding)) {
        return;
      }

      const reference = binding['evidenceRef'];
      const attribute = binding['attributeName'];

      if (typeof reference !== 'string') {
        return;
      }

      if (!entities.has(reference)) {
        errors.push(
          `traces[${index}].targetBindings[${position}].evidenceRef: unmodeled reference '${reference}'`,
        );

        return;
      }

      if (
        typeof attribute === 'string' &&
        !attributesOf(entities.get(reference)).includes(attribute)
      ) {
        errors.push(
          `traces[${index}].targetBindings[${position}].attributeName: '${reference}' has no modeled attribute '${attribute}'`,
        );
      }
    });
  });

  if (model.entities.length === 0) {
    limitations.push('no modeled Entities; entity references were not checked');
  }

  return {
    valid: errors.length === 0,
    traceCount: traces.length,
    errors,
    limitations,
  };
};
