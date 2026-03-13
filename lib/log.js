const isTTY = process.stdout.isTTY;
const isTTYErr = process.stderr.isTTY;

function color(code, text, tty) {
  return tty ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function info(...args) {
  const msg = args.join(' ');
  process.stdout.write(`  ${color('1;34', '>', isTTY)} ${msg}\n`);
}

function ok(...args) {
  const msg = args.join(' ');
  process.stdout.write(`  ${color('1;32', '\u2713', isTTY)} ${msg}\n`);
}

function err(...args) {
  const msg = args.join(' ');
  process.stderr.write(`  ${color('1;31', '\u2717', isTTYErr)} ${msg}\n`);
}

function ask(text) {
  process.stdout.write(`  ${color('1;33', '?', isTTY)} ${text}`);
}

export { info, ok, err, ask };
