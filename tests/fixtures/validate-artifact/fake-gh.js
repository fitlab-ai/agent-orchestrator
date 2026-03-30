#!/usr/bin/env node
const fs = require("node:fs");

const args = process.argv.slice(2);

function readJson(envName) {
  const filePath = process.env[envName];
  return filePath ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

if (process.env.GH_FAKE_FAIL) {
  console.error(process.env.GH_FAKE_FAIL);
  process.exit(1);
}

if (args[0] === "issue" && args[1] === "view") {
  process.stdout.write(JSON.stringify(readJson("GH_FAKE_ISSUE_PATH")));
  process.exit(0);
}

if (args[0] === "pr" && args[1] === "view") {
  process.stdout.write(JSON.stringify(readJson("GH_FAKE_PR_PATH")));
  process.exit(0);
}

if (args[0] === "api" && args.some((arg) => /\/issues\/\d+\/comments\?per_page=100$/.test(arg))) {
  const requestPath = args.find((arg) => /\/issues\/\d+\/comments\?per_page=100$/.test(arg)) || "";
  const match = requestPath.match(/\/issues\/(\d+)\/comments\?per_page=100$/);
  const issueNumber = match ? match[1] : "";
  const issueCommentsNumber = process.env.GH_FAKE_ISSUE_NUMBER || "";
  const prCommentsNumber = process.env.GH_FAKE_PR_NUMBER || "";
  let comments = null;

  if (issueNumber && issueNumber === issueCommentsNumber) {
    comments = readJson("GH_FAKE_COMMENTS_PATH");
  } else if (issueNumber && issueNumber === prCommentsNumber) {
    comments = readJson("GH_FAKE_PR_COMMENTS_PATH");
  } else {
    comments = readJson("GH_FAKE_COMMENTS_PATH");
  }

  process.stdout.write(JSON.stringify([comments]));
  process.exit(0);
}

console.error(`unexpected gh args: ${args.join(" ")}`);
process.exit(1);
