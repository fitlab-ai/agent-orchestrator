import { readFileSync } from 'node:fs';

const { version: VERSION } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
);

export { VERSION };
