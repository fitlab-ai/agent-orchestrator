import fs from 'node:fs';
import path from 'node:path';

function renderFile(src, dst, replacements) {
  if (!fs.existsSync(src)) {
    throw new Error(`Template file not found: ${src}`);
  }

  let content = fs.readFileSync(src, 'utf8');
  content = content
    .replace(/\{\{project\}\}/g, replacements.project)
    .replace(/\{\{org\}\}/g, replacements.org || '');

  const dir = path.dirname(dst);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dst, content, 'utf8');
}

function copyFile(src, dst) {
  if (!fs.existsSync(src)) {
    throw new Error(`Template file not found: ${src}`);
  }

  const dir = path.dirname(dst);
  fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dst);

  try {
    fs.chmodSync(dst, fs.statSync(src).mode);
  } catch {
    // Ignore permission sync failures on unsupported filesystems.
  }
}

export { renderFile, copyFile };
