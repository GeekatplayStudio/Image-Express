import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Turbopack's dev server evaluates a copy of this file from inside `.next`, so
// `import.meta.url` is not a reliable anchor: resolving `src` against it gave
// Tailwind `.next/src` to scan, which does not exist — every utility class was
// silently dropped and the dev app rendered unstyled. Walk up to the directory
// that actually holds the sources instead.
function findProjectRoot(start) {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'src', 'app', 'globals.css'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

const projectRoot = findProjectRoot(path.dirname(fileURLToPath(import.meta.url)));

const config = {
  plugins: {
    "@tailwindcss/postcss": {
      base: path.resolve(projectRoot, 'src'),
    },
  },
};

export default config;
