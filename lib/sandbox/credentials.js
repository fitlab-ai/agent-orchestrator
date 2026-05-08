import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { hostJoin } from './engines/wsl2-paths.js';

// Reconcile treats the freshest valid endpoint as authoritative so sandbox
// token rotations can flow back to the host credential store.
function validateClaudeCredentialsBlob(raw, blob = null) {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { status: 'MISSING' };
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { status: 'STALE_ACCESS' };
  }

  const payload = parsed?.claudeAiOauth ?? parsed;
  const scopes = Array.isArray(payload?.scopes) ? payload.scopes : [];
  const hasRequiredScopes = scopes.includes('user:profile')
    && scopes.includes('user:sessions:claude_code');
  if (!payload?.accessToken || !payload?.refreshToken || !hasRequiredScopes) {
    return { status: 'STALE_ACCESS' };
  }

  return {
    status: 'OK',
    blob: blob ?? trimmed,
    expiresAt: typeof payload?.expiresAt === 'number' ? payload.expiresAt : null
  };
}

export function readClaudeCredentialsFile(filePath, readFn = (targetPath) => fs.readFileSync(targetPath, 'utf8'), existsFn = fs.existsSync) {
  if (!existsFn(filePath)) {
    return { status: 'MISSING' };
  }

  try {
    const raw = readFn(filePath);
    return validateClaudeCredentialsBlob(raw, raw);
  } catch {
    return { status: 'STALE_ACCESS' };
  }
}

export function inspectClaudeKeychainStatus(home, execFn = execFileSync, options = {}) {
  if (process.platform === 'darwin') {
    try {
      const keychainAccount = path.basename(home);
      const credentials = execFn('security', [
        'find-generic-password',
        '-a',
        keychainAccount,
        '-s',
        'Claude Code-credentials',
        '-w'
      ], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      });
      return validateClaudeCredentialsBlob(credentials);
    } catch {
      return { status: 'MISSING' };
    }
  }

  const credentialsPath = path.join(home, '.claude', '.credentials.json');
  return readClaudeCredentialsFile(credentialsPath, options.readFn, options.existsFn);
}

export function inspectClaudeMountFile(home, project, options = {}) {
  return readClaudeCredentialsFile(
    claudeCredentialsPath(home, project),
    options.readFn,
    options.existsFn
  );
}

export function extractClaudeCredentialsBlob(home, execFn = execFileSync) {
  const inspection = inspectClaudeKeychainStatus(home, execFn);
  return inspection.status === 'OK' ? inspection.blob : null;
}

export function claudeCredentialsDir(home, project) {
  return hostJoin(home, '.agent-infra', 'credentials', project, 'claude-code');
}

export function claudeCredentialsPath(home, project) {
  return hostJoin(claudeCredentialsDir(home, project), '.credentials.json');
}

export function writeClaudeCredentialsFile(home, project, blob) {
  const dir = claudeCredentialsDir(home, project);
  const filePath = claudeCredentialsPath(home, project);

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.chmodSync(dir, 0o700);
  fs.writeFileSync(filePath, blob, { mode: 0o600 });
  fs.chmodSync(filePath, 0o600);
}

export function discoverProjects(home) {
  const credentialsRoot = hostJoin(home, '.agent-infra', 'credentials');
  if (!fs.existsSync(credentialsRoot)) {
    return [];
  }

  return fs.readdirSync(credentialsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((project) => fs.existsSync(claudeCredentialsPath(home, project)));
}

export function writeClaudeCredentialsToHost(home, blob, options = {}) {
  const {
    execFn = execFileSync,
    mkdirFn = fs.mkdirSync,
    chmodFn = fs.chmodSync,
    writeFileFn = fs.writeFileSync,
    renameFn = fs.renameSync,
    rmFn = fs.rmSync,
    randomFn = () => randomBytes(6).toString('hex')
  } = options;

  try {
    if (process.platform === 'darwin') {
      execFn('security', [
        'add-generic-password',
        '-U',
        '-a',
        path.basename(home),
        '-s',
        'Claude Code-credentials',
        '-w',
        blob
      ], {
        stdio: ['ignore', 'ignore', 'pipe']
      });
      return { ok: true };
    }

    const dir = path.join(home, '.claude');
    const targetPath = path.join(dir, '.credentials.json');
    const tmpPath = `${targetPath}.tmp.${process.pid}.${randomFn()}`;

    try {
      mkdirFn(dir, { recursive: true, mode: 0o700 });
      chmodFn(dir, 0o700);
      writeFileFn(tmpPath, blob, { mode: 0o600 });
      chmodFn(tmpPath, 0o600);
      renameFn(tmpPath, targetPath);
      return { ok: true };
    } catch (error) {
      try {
        rmFn(tmpPath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
      return { ok: false, error: error.message };
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function endpointNameForFile(project) {
  return `file:${project}`;
}

function chooseAuthoritativeEndpoint(endpoints) {
  const okEndpoints = endpoints.filter((endpoint) => endpoint.status === 'OK');
  if (okEndpoints.length === 0) {
    return null;
  }

  const hostEndpoint = okEndpoints.find((endpoint) => endpoint.name === 'host');
  if (hostEndpoint && typeof hostEndpoint.expiresAt !== 'number') {
    return hostEndpoint;
  }

  const withExpiresAt = okEndpoints.filter((endpoint) => typeof endpoint.expiresAt === 'number');
  if (withExpiresAt.length > 0) {
    return withExpiresAt.reduce((best, endpoint) => (
      endpoint.expiresAt > best.expiresAt ? endpoint : best
    ));
  }

  return okEndpoints.find((endpoint) => endpoint.name === 'host') ?? okEndpoints[0];
}

function shouldWriteEndpoint(authoritative, target) {
  if (target.status !== 'OK') {
    return true;
  }

  if (typeof authoritative.expiresAt === 'number' && typeof target.expiresAt === 'number') {
    return authoritative.expiresAt > target.expiresAt;
  }

  // Both endpoints are OK but expiresAt is not comparable (one or both non-numeric,
  // or values are equal at the same millisecond). Stay conservative and refuse to
  // write — a real rotation will produce a strictly larger expiresAt next time.
  // This guards against leaner host blobs (e.g. stored without subscriptionType)
  // overwriting a richer mount blob solely on the basis of byte differences.
  return false;
}

export function reconcileClaudeCredentials(home, options = {}) {
  const {
    execFn = execFileSync,
    writeFn = writeClaudeCredentialsFile,
    writeHostFn = writeClaudeCredentialsToHost,
    readFn,
    existsFn,
    discoverFn = discoverProjects,
    projects = null,
    singleProject = null,
    inspection = null
  } = options;

  const effectiveProjects = singleProject
    ? [singleProject]
    : (projects ?? discoverFn(home));
  const hostInspection = inspection ?? inspectClaudeKeychainStatus(home, execFn, { readFn, existsFn });
  const hostEndpoint = { name: 'host', ...hostInspection };
  const fileEndpoints = effectiveProjects.map((project) => ({
    name: endpointNameForFile(project),
    project,
    ...inspectClaudeMountFile(home, project, { readFn, existsFn })
  }));
  const endpoints = [hostEndpoint, ...fileEndpoints];
  const authoritative = chooseAuthoritativeEndpoint(endpoints);

  if (!authoritative) {
    const hasStaleEndpoint = endpoints.some((endpoint) => endpoint.status === 'STALE_ACCESS');
    return {
      status: hasStaleEndpoint ? 'STALE_ACCESS' : 'MISSING',
      authoritative: null,
      expiresAt: null,
      hostWritten: false,
      filesWritten: [],
      fileErrors: [],
      warnings: []
    };
  }

  const warnings = [];
  const filesWritten = [];
  const fileErrors = [];
  let hostWritten = false;
  let hostWriteFailed = false;

  if (authoritative.name !== 'host' && shouldWriteEndpoint(authoritative, hostEndpoint)) {
    const result = writeHostFn(home, authoritative.blob, { execFn });
    if (result?.ok) {
      hostWritten = true;
    } else {
      hostWriteFailed = true;
      warnings.push(result?.error ?? 'unknown error');
    }
  }

  for (const endpoint of fileEndpoints) {
    if (endpoint.name === authoritative.name || !shouldWriteEndpoint(authoritative, endpoint)) {
      continue;
    }

    try {
      writeFn(home, endpoint.project, authoritative.blob);
      filesWritten.push(endpoint.project);
    } catch (error) {
      fileErrors.push({ project: endpoint.project, error: error.message });
    }
  }

  return {
    status: hostWriteFailed ? 'KEYCHAIN_WRITE_FAILED' : 'OK',
    authoritative: authoritative.name,
    expiresAt: authoritative.expiresAt ?? null,
    hostWritten,
    filesWritten,
    fileErrors,
    warnings
  };
}

export function syncClaudeCredentialsFromKeychain(home, project, options = {}) {
  const result = reconcileClaudeCredentials(home, {
    ...options,
    singleProject: project
  });
  if (result.status !== 'OK' && result.status !== 'KEYCHAIN_WRITE_FAILED') {
    return {
      status: result.status,
      written: false
    };
  }

  return {
    status: result.status === 'KEYCHAIN_WRITE_FAILED' ? 'OK' : result.status,
    written: result.filesWritten.includes(project),
    expiresAt: result.expiresAt
  };
}

export function formatRemaining(expiresAt) {
  if (typeof expiresAt !== 'number') {
    return 'unknown';
  }

  const ms = expiresAt - Date.now();
  if (ms <= 0) {
    return 'EXPIRED';
  }

  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function assertClaudeCredentialsAvailable(
  home,
  project,
  resolvedTools,
  extractFn = extractClaudeCredentialsBlob,
  writeFn = writeClaudeCredentialsFile
) {
  const claudeCodeEntry = resolvedTools.find(({ tool }) => tool.id === 'claude-code');
  if (!claudeCodeEntry) {
    return;
  }

  const blob = extractFn(home);
  if (!blob) {
    throw new Error([
      'Claude Code credentials not found on host.',
      '',
      'The sandbox needs your Claude Code OAuth credentials so the container can use Claude Code.',
      '',
      'To fix:',
      '  1. On the host, run "claude" once and complete the OAuth login flow.',
      '  2. Verify with "claude /status" that you see your subscription.',
      '  3. Re-run "ai sandbox create".',
      '',
      'Alternatively, if you do not need Claude Code in this sandbox,',
      'remove "claude-code" from the "sandbox.tools" array in .agents/.airc.json.'
    ].join('\n'));
  }

  writeFn(home, project, blob);
}
