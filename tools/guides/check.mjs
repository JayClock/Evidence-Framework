import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const requiredDocuments = [
  'AGENTS.md',
  'README.md',
  'docs/guides/index.md',
  'apps/backend/README.md',
  '.evidence/README.md',
  '.evidence/api/README.md',
  '.agents/skills/README.md',
  '.agents/skills/evidence-task-planning/SKILL.md',
  '.agents/skills/evidence-delivery/SKILL.md',
  '.pi/extensions/evidence-delivery/README.md',
  '.pi/agents/evidence-worker.md',
  '.pi/agents/evidence-reviewer.md',
];
const documentationTrees = [
  'docs',
  '.agents/skills/evidence-task-planning/references',
  '.agents/skills/evidence-task-planning/assets',
  '.agents/skills/evidence-delivery/references',
];

// Only current maintained guidance is scanned, not business sources, generated
// output, historical evidence, third-party material, or evaluation fixtures.
export function collectDocuments(root) {
  const documents = new Set(requiredDocuments);
  function visit(directory) {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        documents.add(relative(root, path));
      }
    }
  }
  for (const tree of documentationTrees) visit(resolve(root, tree));
  return [...documents].sort();
}

// Keep line numbers, but do not treat command samples as actual Markdown links.
function withoutFences(markdown) {
  let fence;
  return markdown
    .split('\n')
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (!fence && marker) {
        fence = marker;
        return '';
      }
      if (fence) {
        if (
          marker?.[0] === fence[0] &&
          marker.length >= fence.length &&
          line.trim() === marker
        ) {
          fence = undefined;
        }
        return '';
      }
      return line;
    })
    .join('\n');
}

function outside(root, target) {
  const path = relative(root, target);
  return path === '..' || path.startsWith(`..${sep}`) || isAbsolute(path);
}

export function checkDocuments(root, documents = collectDocuments(root)) {
  root = realpathSync(root);
  const errors = [];
  let localLinks = 0;
  for (const document of documents) {
    const path = resolve(root, document);
    if (!existsSync(path) || !statSync(path).isFile()) {
      errors.push(`${document}: required document is missing`);
      continue;
    }
    if (outside(root, realpathSync(path))) {
      errors.push(`${document}: document escapes project root`);
      continue;
    }
    const markdown = readFileSync(path, 'utf8');
    if (/分布式单体|distributed[ -]monolith/iu.test(markdown)) {
      errors.push(`${document}: obsolete architecture description`);
    }
    const prose = withoutFences(markdown);
    // Bounded inline-link syntax, including angle-bracket paths and titles.
    // Reference-style links and heading anchors are deliberately not validated.
    const links =
      /\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+["'][^\n]*?["'])?\s*\)/g;
    for (const match of prose.matchAll(links)) {
      const href = match[1] ?? match[2];
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(href)) continue;
      if (href.includes('{{') || href.includes('${')) continue;
      const line = prose.slice(0, match.index).split('\n').length;
      const label = `${document}:${line}: ${href}`;
      let file;
      try {
        file = decodeURIComponent(href.split(/[?#]/, 1)[0]);
      } catch {
        errors.push(`${label}: invalid URL encoding`);
        continue;
      }
      if (!file) continue;
      localLinks += 1;
      const target = resolve(dirname(path), file);
      if (outside(root, target))
        errors.push(`${label}: link escapes project root`);
      else if (!existsSync(target))
        errors.push(`${label}: missing local target`);
      else if (outside(root, realpathSync(target))) {
        errors.push(`${label}: link escapes project root through symlink`);
      }
    }
  }
  return { documents: documents.length, localLinks, errors };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const result = checkDocuments(root);
  process.stdout.write(
    `Guides: ${result.documents} documents, ${result.localLinks} local links, ${result.errors.length} errors\n`,
  );
  for (const error of result.errors) process.stderr.write(`${error}\n`);
  process.exitCode = result.errors.length ? 1 : 0;
}
