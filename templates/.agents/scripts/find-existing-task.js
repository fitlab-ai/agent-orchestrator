import { text } from "node:stream/consumers";
import { pathToFileURL } from "node:url";

const markerPattern = /^<!-- sync-issue:(TASK-\d{8}-\d{6}):([a-z][a-z0-9-]*) -->$/;

function parseArgs(argv) {
  const args = {
    format: "json"
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--format") {
      args.format = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      args.help = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function usage() {
  return [
    "Usage:",
    "  <issue comments JSON via stdin> | node .agents/scripts/find-existing-task.js [--format json]",
    "",
    "Reads issue comments JSON (JSON Lines or JSON Array) from stdin and prints {found, task_id, frontmatter?}."
  ].join("\n");
}

function parseComments(output) {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return trimmed
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  }
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/, 1)[0].trim();
}

function normalizeScalar(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatterBlock(block) {
  const match = block.match(/^---\r?\n([\s\S]*?)\r?\n---\s*$/);
  if (!match) {
    return null;
  }

  const metadata = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    metadata[key] = normalizeScalar(value);
  }

  return Object.keys(metadata).length > 0 ? metadata : null;
}

function recoverTaskFrontmatter(body) {
  const detailsStart = body.search(/<details><summary>[^<]*frontmatter[^<]*<\/summary>/i);
  if (detailsStart < 0) {
    return null;
  }

  const detailsBody = body.slice(detailsStart);
  const yamlMatch = detailsBody.match(/```yaml\s*([\s\S]*?)\s*```/i);
  if (!yamlMatch) {
    return null;
  }

  return parseFrontmatterBlock(yamlMatch[1].trim());
}

function collectCandidates(comments) {
  const byTaskId = new Map();

  for (const comment of comments) {
    const match = firstLine(comment.body).match(markerPattern);
    if (!match) {
      continue;
    }

    const [, taskId, fileStem] = match;
    const existing = byTaskId.get(taskId) || {
      task_id: taskId,
      first_seen_at: comment.created_at || "",
      has_task_comment: false,
      task_comment_body: ""
    };

    if (!existing.first_seen_at || (comment.created_at && comment.created_at < existing.first_seen_at)) {
      existing.first_seen_at = comment.created_at;
    }

    if (fileStem === "task") {
      existing.has_task_comment = true;
      existing.task_comment_body = comment.body || "";
    }

    byTaskId.set(taskId, existing);
  }

  return [...byTaskId.values()].sort((left, right) => {
    const createdComparison = String(left.first_seen_at || "").localeCompare(String(right.first_seen_at || ""));
    if (createdComparison !== 0) {
      return createdComparison;
    }
    return left.task_id.localeCompare(right.task_id);
  });
}

function buildResult(comments) {
  const candidates = collectCandidates(comments);
  if (candidates.length === 0) {
    return { found: false };
  }

  const selectedCandidate = candidates[0];
  const frontmatter = selectedCandidate.has_task_comment
    ? recoverTaskFrontmatter(selectedCandidate.task_comment_body)
    : null;

  const result = {
    found: true,
    task_id: selectedCandidate.task_id
  };

  if (frontmatter) {
    result.frontmatter = frontmatter;
  }

  return result;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(1);
  }

  if (args.help) {
    console.log(usage());
    return;
  }

  if (args.format !== "json") {
    console.error(`Unsupported format: ${args.format}`);
    process.exit(1);
  }

  let raw;
  try {
    raw = await text(process.stdin);
  } catch (error) {
    console.error(`Cannot read stdin: ${error.message}`);
    process.exit(1);
  }

  let comments;
  try {
    comments = parseComments(raw);
  } catch (error) {
    console.error(`Cannot parse stdin as JSON: ${error.message}`);
    process.exit(1);
  }

  console.log(JSON.stringify(buildResult(comments), null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
