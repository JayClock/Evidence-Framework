import { STATE_PATH } from '../../storage.ts';

export const PROTECTED_PATHS = [
  '.evidence/',
  '.pi/extensions/evidence/',
  '.pi/skills/',
  '.pi/evidence.json',
  'artifacts/',
  'reports/',
  'AGENTS.md',
  'docs/evidence.md',
];

export function isAllowedReadOnlyShell(
  command: string,
  allowQualityCommands: boolean,
): boolean {
  const normalized = command.trim();
  if (!normalized || /[\n\r;|&><`]|\$\(/.test(normalized)) return false;
  if (
    /(?:^|\s)(?:--output|--update(?:Snapshot)?|-delete|-exec(?:dir)?|-ok(?:dir)?|-fprint0?|-fls)(?:\s|=|$)/i.test(
      normalized,
    )
  )
    return false;

  const inspectionCommands = [
    /^(?:pwd|ls|tree|rg|grep|head|tail|wc|sort|uniq|cut|cat)\b/,
    /^find\b/,
    /^git\s+(?:status|diff|show|log|ls-files|grep|rev-parse)\b/,
    /^(?:node|npm|java|javac|pi)\s+(?:--version|-version|--list-models)\b/,
  ];
  if (inspectionCommands.some((pattern) => pattern.test(normalized)))
    return true;
  if (!allowQualityCommands) return false;
  return [
    /^npm\s+test\b/,
    /^npm\s+run\s+(?:test|lint|build)(?::[\w-]+)?\b/,
    /^npx\s+(?:nx\s+(?:test|lint|build)|vitest(?:\s+run)?|jest)\b/,
    /^(?:pnpm|yarn)\s+(?:test|lint|build)\b/,
    /^(?:\.\/)?[\w./-]*gradlew(?:\.bat)?\s+(?:test|check|build)\b/,
    /^(?:\.\/)?[\w./-]*mvnw(?:\.cmd)?\s+(?:test|verify|package)\b/,
  ].some((pattern) => pattern.test(normalized));
}

export function isProtectedPath(path: string): boolean {
  return PROTECTED_PATHS.some((protectedPath) => {
    const prefix = protectedPath.replace(/\/$/, '');
    return path === prefix || path.startsWith(`${prefix}/`);
  });
}

export function isRuntimeGeneratedPath(path: string): boolean {
  return (
    path === STATE_PATH ||
    path.startsWith('reports/') ||
    path.startsWith('artifacts/gates/') ||
    /^artifacts\/05-coding\/US-\d{3}\.(?:md|json)$/.test(path)
  );
}
