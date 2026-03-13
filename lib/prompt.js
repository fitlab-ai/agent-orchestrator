import readline from 'node:readline';
import { ask } from './log.js';

let _rl = null;
let _lines = [];
let _lineResolve = null;
let _stdinDone = false;

function setupInterface() {
  if (_rl || _stdinDone) return;
  _rl = readline.createInterface({
    input: process.stdin,
    terminal: false
  });

  _rl.on('line', (line) => {
    if (_lineResolve) {
      const resolve = _lineResolve;
      _lineResolve = null;
      resolve(line);
    } else {
      _lines.push(line);
    }
  });

  _rl.on('close', () => {
    _stdinDone = true;
    _rl = null;
    if (_lineResolve) {
      const resolve = _lineResolve;
      _lineResolve = null;
      resolve(null);
    }
  });
}

function nextLine() {
  return new Promise((resolve) => {
    if (_lines.length > 0) {
      resolve(_lines.shift());
    } else if (_stdinDone) {
      resolve(null);
    } else {
      _lineResolve = resolve;
    }
  });
}

async function prompt(question, defaultValue) {
  const label = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  ask(label);

  setupInterface();

  const line = await nextLine();
  if (line === null) {
    return defaultValue || '';
  }
  return line.trim() || defaultValue || '';
}

function closePrompt() {
  if (_rl) {
    _rl.close();
    _rl = null;
    _stdinDone = true;
  }
}

export { prompt, closePrompt };
