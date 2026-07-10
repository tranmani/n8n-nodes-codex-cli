// Copies node SVG icons into dist/ alongside the compiled node (tsc only emits
// .js/.d.ts). Runs after `tsc` in the build script.
import { cp, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const icons = [
  ['nodes/CodexSubscription/codex.svg', 'dist/nodes/CodexSubscription/codex.svg'],
];

for (const [src, dest] of icons) {
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest);
  console.log(`copied ${src} -> ${dest}`);
}
