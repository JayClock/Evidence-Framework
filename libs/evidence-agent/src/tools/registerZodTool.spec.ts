import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { FulfillmentPairIntentSchema } from '@evidence-poc/evidence-schema';
import { registerZodTool } from './registerZodTool.js';

const fakePi = () => {
  let definition: ToolDefinition<{ '~unsafe': unknown }>;
  const pi = {
    registerTool: (tool: typeof definition) => {
      definition = tool;
    },
  } as unknown as ExtensionAPI;
  return { pi, tool: () => definition };
};

describe('Zod tool registration at the Pi SDK boundary', () => {
  it('emits plain JSON Schema from the shared contract and keeps parameter inference', () => {
    const fake = fakePi();
    registerZodTool(fake.pi, {
      name: 'pair',
      label: 'Pair',
      description: 'Pair',
      parameters: FulfillmentPairIntentSchema,
      execute: async (_id, input) => {
        expectTypeOf(input).toEqualTypeOf<
          z.infer<typeof FulfillmentPairIntentSchema>
        >();
        return {
          content: [{ type: 'text', text: input.request.id }],
          details: null,
        };
      },
    });
    const parameters = JSON.parse(JSON.stringify(fake.tool().parameters));
    expect(parameters).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: ['contextRef', 'request', 'confirmation'],
      properties: {
        request: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'label', 'responsibleRoleRef'],
        },
      },
    });
    expect(parameters.properties.request.properties.id.pattern).toBeTruthy();
    expect(parameters['~unsafe']).toBeUndefined();
    expect(JSON.stringify(parameters)).not.toContain('$ref');
  });

  it('enforces Zod-only refinements before calling a handler, even without the host validator', async () => {
    const fake = fakePi();
    const execute = vi.fn(async () => ({
      content: [{ type: 'text' as const, text: 'ok' }],
      details: null,
    }));
    registerZodTool(fake.pi, {
      name: 'refined',
      label: 'Refined',
      description: 'Refined',
      parameters: z
        .object({ left: z.number(), right: z.number() })
        .strict()
        .refine((input) => input.left < input.right, 'invalid interval'),
      execute,
    });
    const invoke = async (params: unknown) =>
      fake.tool().execute('call', params, undefined, undefined, {} as never);
    await expect(invoke({ left: 2, right: 1 })).rejects.toThrow(
      'invalid interval',
    );
    await expect(invoke({ left: 1, right: 2, extra: true })).rejects.toThrow();
    expect(execute).not.toHaveBeenCalled();
    await expect(invoke({ left: 1, right: 2 })).resolves.toMatchObject({
      details: null,
    });
    expect(execute).toHaveBeenCalledOnce();
  });
});
