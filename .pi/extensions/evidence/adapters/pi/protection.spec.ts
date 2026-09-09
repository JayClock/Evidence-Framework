import { describe, expect, it } from 'vitest';
import { isProtectedPath, PROTECTED_PATHS } from './protection.ts';

describe('workflow path protection', () => {
  it('protects the canonical project skill directory without retaining the legacy path', () => {
    expect(PROTECTED_PATHS).toContain('.agents/skills/');
    expect(PROTECTED_PATHS).not.toContain('.pi/skills/');
    expect(isProtectedPath('.agents/skills/evidence-tdd/SKILL.md')).toBe(true);
  });
});
