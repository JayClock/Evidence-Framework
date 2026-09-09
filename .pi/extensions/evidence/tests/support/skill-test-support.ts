import { DISCOVERY_POLICY_PATHS } from '../../instructions/discovery-prompt.ts';
import { readText, writeTextAtomic } from '../../storage.ts';

export async function prepareModelingInstructions(root: string): Promise<void> {
  for (const path of [
    ...DISCOVERY_POLICY_PATHS,
    '.agents/skills/evidence-fm/SKILL.md',
    '.agents/skills/evidence-requirements/SKILL.md',
  ]) {
    await writeTextAtomic(root, path, await readText(process.cwd(), path));
  }
}
