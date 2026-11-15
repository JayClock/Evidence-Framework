import type {
  ExtensionAPI,
  ToolDefinition,
} from '@earendil-works/pi-coding-agent';
import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Pi 1.5.2's public ABI uses JSON Schema and TypeBox's static inference marker.
// This type-only marker carries Zod inference; no TypeBox runtime is imported.
type Parameters<Schema extends z.ZodTypeAny> = { '~unsafe': z.infer<Schema> };
type ZodTool<Schema extends z.ZodTypeAny, Details> = Omit<
  ToolDefinition<Parameters<Schema>, Details>,
  'parameters'
> & { parameters: Schema };

/** Only the SDK wire format is JSON Schema. Zod remains the runtime authority,
 * including refinements that cannot be expressed in the model-facing schema.
 */
export function registerZodTool<Schema extends z.ZodTypeAny, Details>(
  pi: ExtensionAPI,
  tool: ZodTool<Schema, Details>,
): void {
  const schema = tool.parameters;
  pi.registerTool<Parameters<Schema>, Details>({
    ...tool,
    parameters: zodToJsonSchema(schema, {
      $refStrategy: 'none',
    }) as Parameters<Schema>,
    execute: (id, input, signal, onUpdate, ctx) =>
      tool.execute(id, schema.parse(input), signal, onUpdate, ctx),
  });
}
