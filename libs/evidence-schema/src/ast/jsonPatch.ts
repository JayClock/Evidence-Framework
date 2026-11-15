import { z } from 'zod';
import { isJsonValue } from './json.js';

// Model examples intentionally carry Record<string, unknown>. Accept their
// object types at compile time; the boundary guard validates every nested value.
type JsonValue = null | boolean | number | string | object;

/** RFC 6901 pointer, not Immer's internal array path. Block prototype traversal at the IPC boundary. */
const pointer = z.string().refine((value) => {
  if (value !== '' && !value.startsWith('/')) return false;
  if (/~(?:[^01]|$)/.test(value)) return false;
  return value
    .split('/')
    .every(
      (part) =>
        !['__proto__', 'constructor', 'prototype'].includes(
          part.replaceAll('~1', '/').replaceAll('~0', '~'),
        ),
    );
}, 'must be a safe RFC 6901 JSON Pointer');
const value = z.custom<JsonValue>(
  isJsonValue,
  'must be a finite, acyclic JSON value',
);

export const JsonPatchItemSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), path: pointer, value }).strict(),
  z.object({ op: z.literal('remove'), path: pointer }).strict(),
  z.object({ op: z.literal('replace'), path: pointer, value }).strict(),
  z.object({ op: z.literal('move'), path: pointer, from: pointer }).strict(),
  z.object({ op: z.literal('copy'), path: pointer, from: pointer }).strict(),
  z.object({ op: z.literal('test'), path: pointer, value }).strict(),
]);
export type JsonPatchOperation = z.infer<typeof JsonPatchItemSchema>;
export const JsonPatchSchema = z.array(JsonPatchItemSchema);
export const ModelPatchRequestSchema = z
  .object({
    rationale: z.string().trim().min(1).describe('本批修改的业务理由。'),
    patches: JsonPatchSchema.min(1).describe(
      'RFC 6902 JSON Patch；path/from 为 JSON Pointer，例如 /entities/0/label。',
    ),
  })
  .strict();
