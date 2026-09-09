import { isAbsolute, relative, resolve, sep } from 'node:path';

export const EXTENSION_NAMESPACE = '.pi/extensions/fm-modeling';
export const STORAGE_NAMESPACE = '.evidence/fm-modeling';
export const LEGACY_EVIDENCE_NAMESPACE = '.pi/extensions/evidence';
export const FM_SKILL_NAMESPACE = '.agents/skills/evidence-fm';

export function fmPaths(root: string) {
  const storage = resolve(root, STORAGE_NAMESPACE);
  return {
    root: storage,
    state: resolve(storage, 'state.json'),
    runs: resolve(storage, 'runs'),
    staging: resolve(storage, 'staging'),
    model: resolve(storage, 'model'),
    backup: resolve(storage, 'model.backup'),
    extension: resolve(root, EXTENSION_NAMESPACE),
    skill: resolve(root, FM_SKILL_NAMESPACE),
  };
}

export function isWithin(parent: string, candidate: string): boolean {
  const value = relative(resolve(parent), resolve(candidate));
  return (
    value === '' ||
    (!value.startsWith(`..${sep}`) && value !== '..' && !isAbsolute(value))
  );
}
