import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import ts from 'typescript';

const ignored = new Set([
  '.git',
  'node_modules',
  'dist',
  'data',
  'graphify-out',
  'test-results',
  'playwright-report',
]);
const failures = [];

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      inspect(path);
      continue;
    }
    const text = readFileSync(path, 'utf8');
    if (/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry.name)) {
      const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
      const pending = [source];
      while (pending.length) {
        const node = pending.pop();
        if (
          ts.getLeadingCommentRanges(text, node.getFullStart())?.length ||
          ts.getTrailingCommentRanges(text, node.getEnd())?.length
        ) {
          failures.push(relative('.', path));
          break;
        }
        pending.push(...node.getChildren(source));
      }
    } else if (
      (entry.name.endsWith('.css') && /\/\*/.test(text)) ||
      (entry.name.endsWith('.html') && /<!--/.test(text))
    ) {
      failures.push(relative('.', path));
    }
  }
}

inspect('.');
if (failures.length) {
  console.error(`Source comments found: ${failures.join(', ')}`);
  process.exitCode = 1;
} else {
  console.log('Source contains no comments.');
}
