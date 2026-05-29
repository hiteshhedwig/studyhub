// Renames the web build's practice.html to index.html so the deployed site root
// serves the practice app directly. Assets use relative paths, so the rename is safe.
import { renameSync, existsSync } from "node:fs";

const from = "dist-web/practice.html";
const to = "dist-web/index.html";
if (existsSync(from)) {
  renameSync(from, to);
  console.log("rename-web-entry: practice.html → index.html");
} else if (!existsSync(to)) {
  console.error("rename-web-entry: dist-web/practice.html not found");
  process.exit(1);
}
