import fs from "node:fs";

const path = new URL("../docs/RELEASE_NOTE_TEMPLATE.md", import.meta.url);
if (!fs.existsSync(path)) {
  console.error("Missing docs/RELEASE_NOTE_TEMPLATE.md");
  process.exit(1);
}

const content = fs.readFileSync(path, "utf8");
for (const required of ["Hash delta summary", "Consumer impact", "Migration steps"]) {
  if (!content.includes(required)) {
    console.error(`Release note template missing section: ${required}`);
    process.exit(1);
  }
}

console.log("Release note template check passed.");
