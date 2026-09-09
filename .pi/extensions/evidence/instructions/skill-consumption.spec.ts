import {
  DefaultResourceLoader,
  SettingsManager,
} from '@earendil-works/pi-coding-agent';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FM_SKILL_ROOT } from '../contracts/paths.ts';
import { getPhaseDefinition } from '../phases.ts';
import { buildDiscoveryPolicy } from '../prompts.ts';
import { readText, writeTextAtomic } from '../storage.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

const resources = [
  '.agents/skills/evidence-discovery/SKILL.md',
  '.agents/skills/evidence-discovery/references/interview.md',
  '.agents/skills/evidence-fm/references/business-analysis.md',
  '.agents/skills/evidence-fm/references/provenance.md',
  '.agents/skills/evidence-fm/references/scenario-validation.md',
  '.pi/extensions/evidence/instructions/modeling-adapter.md',
];

async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'evidence-skill-consumer-'));
  roots.push(root);
  for (const [index, path] of resources.entries())
    await writeTextAtomic(root, path, `# Resource ${index}\n本地标记 ${index}`);
  return root;
}

describe('Pi consumes canonical skills without maintaining copies', () => {
  it('discovers all three skills natively without extensions or configured skill paths', async () => {
    const agentDir = await mkdtemp(join(tmpdir(), 'evidence-native-skills-'));
    roots.push(agentDir);
    const loader = new DefaultResourceLoader({
      cwd: process.cwd(),
      agentDir,
      settingsManager: SettingsManager.inMemory({}, { projectTrusted: true }),
      noExtensions: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    for (let pass = 0; pass < 2; pass++) {
      await loader.reload();
      const result = loader.getSkills();
      const local = result.skills.filter((skill) =>
        skill.filePath.startsWith(join(process.cwd(), '.agents/skills') + '/'),
      );
      expect(local.map((skill) => skill.name).sort()).toEqual([
        'evidence-discovery',
        'evidence-fm',
        'evidence-requirements',
      ]);
      expect(
        result.diagnostics.filter((item) =>
          item.path?.startsWith(join(process.cwd(), '.agents/skills') + '/'),
        ),
      ).toEqual([]);
    }
  });

  it('uses the canonical discovery and FM runtime roots without loading generation steps', async () => {
    expect(getPhaseDefinition('modeling').skillFile).toBe(
      '.agents/skills/evidence-discovery/SKILL.md',
    );
    expect(FM_SKILL_ROOT).toBe('.agents/skills/evidence-fm');
    const policy = await buildDiscoveryPolicy(process.cwd());
    expect(policy).toContain('# 访谈方法');
    expect(policy).toContain('# 业务建模判断准则');
    expect(policy).toContain('### 业务来源追溯的统一循环');
    expect(policy).not.toContain('# Evidence 正式 FM 建模');
  });

  it('reads every discovery resource once and reflects a direct skill edit without syncing', async () => {
    const root = await setup();
    const first = await buildDiscoveryPolicy(root);
    for (const [index] of resources.entries())
      expect(first.split(`本地标记 ${index}`)).toHaveLength(2);
    await writeTextAtomic(
      root,
      resources[3],
      '# 新来源方法\n新维护的业务来源规则',
    );
    const next = await buildDiscoveryPolicy(root);
    expect(next).toContain('新维护的业务来源规则');
    expect(next).not.toContain('本地标记 3');
    expect(await readText(root, resources[3])).toBe(
      '# 新来源方法\n新维护的业务来源规则',
    );
    expect(next).toContain('本地标记 5');
    expect(next).not.toContain('evidence-fm/SKILL.md');
  });

  it.each(resources)(
    'fails closed when required instruction %s is missing',
    async (path) => {
      const root = await setup();
      await rm(join(root, path));
      await expect(buildDiscoveryPolicy(root)).rejects.toThrow(
        `Evidence 指令文件不存在或为空：${path}`,
      );
    },
  );
});
