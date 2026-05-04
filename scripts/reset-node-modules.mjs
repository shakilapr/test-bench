import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const dirs = [
  "node_modules",
  "backend/node_modules",
  "ui/node_modules",
  "simulator/node_modules",
  "e2e/node_modules",
].map((dir) => path.join(root, dir));

for (const dir of dirs) {
  await fs.rm(dir, { recursive: true, force: true });
  console.log(`removed ${path.relative(root, dir)}`);
}

console.log("");
console.log("Dependency folders were reset. Run `npm install` for the OS you are using now.");
