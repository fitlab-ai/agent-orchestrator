#!/usr/bin/env node
import { VERSION } from '../lib/version.js';

// Node.js version check
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 18) {
  process.stderr.write(
    `ai-collaboration-installer requires Node.js >= 18 (current: ${process.version})\n`
  );
  process.exit(1);
}

const USAGE = `ai-collaboration-installer - bootstrap AI collaboration infrastructure

Usage:
  ai-collaboration-installer init        Initialize a new project with update-ai-collaboration seed command
  ai-collaboration-installer update      Update seed files and sync file registry for an existing project
  ai-collaboration-installer version     Show version
  ai-collaboration-installer help        Show this help message

Shorthand: aci (e.g. aci init)

Install methods:
  npm:   npm install -g ai-collaboration-installer
  npx:   npx ai-collaboration-installer init
  curl:  curl -fsSL https://raw.githubusercontent.com/fitlab-ai/ai-collaboration-installer/main/install.sh | sh

Examples:
  cd my-project && ai-collaboration-installer init
  npx ai-collaboration-installer init
`;

const command = process.argv[2] || '';

switch (command) {
  case 'init': {
    const { cmdInit } = await import('../lib/init.js');
    await cmdInit().catch((e) => {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exitCode = 1;
    });
    break;
  }
  case 'update': {
    const { cmdUpdate } = await import('../lib/update.js');
    await cmdUpdate().catch((e) => {
      process.stderr.write(`Error: ${e.message}\n`);
      process.exitCode = 1;
    });
    break;
  }
  case 'version': {
    console.log(`ai-collaboration-installer ${VERSION}`);
    break;
  }
  case 'help':
  case '':
    process.stdout.write(USAGE);
    break;
  default:
    process.stderr.write(`Unknown command: ${command}\n\n`);
    process.stdout.write(USAGE);
    process.exitCode = 1;
    break;
}
