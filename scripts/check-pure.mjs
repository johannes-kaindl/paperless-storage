// `src/core/` und der gevendorte Kit-Code muessen frei von obsidian-Importen bleiben —
// das ist die Zusicherung, dass die Rechenlogik in Node/vitest testbar ist.
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["src/core", "src/vendor/kit"];
const FORBIDDEN = /(?:from|import)\s*\(?\s*["']obsidian(\/[^"']*)?["']/;

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const offenders = ROOTS.flatMap(walk)
  .filter((file) => file.endsWith(".ts"))
  .filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")));

if (offenders.length > 0) {
  console.error("check:pure FAILED — obsidian-Import in reinem Code:");
  for (const f of offenders) console.error("  " + f);
  process.exit(1);
}
console.log("check:pure OK");
