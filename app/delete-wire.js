// Quests & Events: the Delete button's audit log label.
// Run from the project folder (after unzipping quest-delete.zip):   node delete-wire.js
const fs = require("fs");
const file = "components/admin/auditLabels.ts";
const raw = fs.readFileSync(file, "utf8");
const crlf = raw.includes("\r\n");
let s = raw.replace(/\r\n/g, "\n");
if (s.includes('"quest.delete"')) {
  console.log(`already done: ${file}`);
} else {
  const find = `  "quest.cancel": "Cancelled a quest",\n`;
  if (!s.includes(find)) {
    console.log(`NOT FOUND: ${file} - paste this output to Claude`);
    process.exit(1);
  }
  s = s.replace(find, `${find}  "quest.delete": "Deleted a quest",\n`);
  fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
  console.log(`done: ${file}`);
}
console.log("\nAll done. Now run: npx tsc --noEmit");
