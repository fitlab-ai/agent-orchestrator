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

function walkFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(entryPath));
    } else {
      results.push(entryPath);
    }
  }
  return results;
}

function containsPlaceholders(src) {
  const content = fs.readFileSync(src, 'utf8');
  return content.includes('{{project}}') || content.includes('{{org}}');
}

function selectLocalizedFiles(srcDir, language) {
  const selected = new Map();

  for (const src of walkFiles(srcDir)) {
    const relativePath = path.relative(srcDir, src);
    if (relativePath.includes('.zh-CN.')) {
      continue;
    }
    selected.set(relativePath, src);
  }

  if (language === 'zh-CN') {
    for (const src of walkFiles(srcDir)) {
      const relativePath = path.relative(srcDir, src);
      if (!relativePath.includes('.zh-CN.')) {
        continue;
      }

      selected.set(relativePath.replace('.zh-CN.', '.'), src);
    }
  }

  return selected;
}

function copySkillDir(srcDir, dstDir, replacements, language) {
  if (!fs.existsSync(srcDir)) {
    throw new Error(`Template directory not found: ${srcDir}`);
  }

  for (const [relativePath, src] of selectLocalizedFiles(srcDir, language)) {
    const dst = path.join(dstDir, relativePath);
    if (containsPlaceholders(src)) {
      renderFile(src, dst, replacements);
      try {
        fs.chmodSync(dst, fs.statSync(src).mode);
      } catch {
        // Ignore permission sync failures on unsupported filesystems.
      }
      continue;
    }

    copyFile(src, dst);
  }
}

export { renderFile, copyFile, copySkillDir };
