import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireFromRoot = createRequire(path.join(root, "package.json"));
const requireFromBackend = createRequire(path.join(root, "backend", "package.json"));
const requireFromUi = createRequire(path.join(root, "ui", "package.json"));

const rollupPackages = {
  "linux-x64": "@rollup/rollup-linux-x64-gnu",
  "win32-x64": "@rollup/rollup-win32-x64-msvc",
  "darwin-x64": "@rollup/rollup-darwin-x64",
  "darwin-arm64": "@rollup/rollup-darwin-arm64",
};

const esbuildPackages = {
  "linux-x64": "@esbuild/linux-x64",
  "win32-x64": "@esbuild/win32-x64",
  "darwin-x64": "@esbuild/darwin-x64",
  "darwin-arm64": "@esbuild/darwin-arm64",
};

const platformKey = `${process.platform}-${process.arch}`;
const expectedRollup = rollupPackages[platformKey];
const expectedEsbuild = esbuildPackages[platformKey];
const problems = [];

function canResolve(packageName, resolver = requireFromRoot) {
  if (!packageName) {
    return true;
  }

  try {
    resolver.resolve(`${packageName}/package.json`);
    return true;
  } catch {
    return false;
  }
}

function hasValidSqliteBinary() {
  let binary;

  try {
    binary = path.join(
      path.dirname(requireFromBackend.resolve("better-sqlite3/package.json")),
      "build",
      "Release",
      "better_sqlite3.node",
    );
  } catch {
    return false;
  }

  if (!fs.existsSync(binary)) {
    return false;
  }

  const fd = fs.openSync(binary, "r");
  const header = Buffer.alloc(4);
  fs.readSync(fd, header, 0, header.length, 0);
  fs.closeSync(fd);
  if (process.platform === "win32") {
    return header[0] === 0x4d && header[1] === 0x5a;
  }

  if (process.platform === "linux") {
    return header[0] === 0x7f && header[1] === 0x45 && header[2] === 0x4c && header[3] === 0x46;
  }

  if (process.platform === "darwin") {
    return true;
  }

  return true;
}

if (!canResolve(expectedRollup, requireFromUi)) {
  problems.push(expectedRollup ?? `Rollup native package for ${platformKey}`);
}

if (!canResolve(expectedEsbuild)) {
  problems.push(expectedEsbuild ?? `esbuild native package for ${platformKey}`);
}

if (!hasValidSqliteBinary()) {
  problems.push("backend better-sqlite3 native binary");
}

if (problems.length > 0) {
  console.error("");
  console.error("Native Node dependencies are not installed for this OS/CPU.");
  console.error(`Current platform: ${platformKey}`);
  console.error("Missing or mismatched:");
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  console.error("");
  console.error("This usually happens after switching the same checkout between Windows and Linux/WSL.");
  console.error("Run these commands on the OS you are using now:");
  console.error("");
  console.error("  npm run deps:reset");
  console.error("  npm install");
  console.error("  npm run dev");
  console.error("");
  process.exit(1);
}
