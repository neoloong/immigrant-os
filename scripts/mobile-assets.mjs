import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const assetPath = path.join(root, '.sites-runtime/mobile-assets');
await mkdir(assetPath, { recursive: true });
// Keep the existing favicon as the source of truth; enlarge its SVG canvas
// without changing the viewBox or artwork for the official asset generator.
const logo = (await readFile(path.join(root, 'public/favicon.svg'), 'utf8'))
  .replace('width="24" height="24"', 'width="1024" height="1024"');
await writeFile(path.join(assetPath, 'logo.svg'), logo);

// Explicit platform flags prevent PWA manifest or web asset mutations.
const result = spawnSync('capacitor-assets', [
  'generate', '--assetPath', assetPath, '--ios', '--android',
  '--iconBackgroundColor', '#f8f9f6',
  '--iconBackgroundColorDark', '#f8f9f6',
  '--splashBackgroundColor', '#f8f9f6',
  '--splashBackgroundColorDark', '#f8f9f6',
], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error('Mobile asset generation could not start. Run npm run app:install-tooling first.');
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
