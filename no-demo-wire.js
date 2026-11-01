// No demo data: the home page only shows REAL quests from the server.
//   - deletes constants/sampleQuests.ts (the design's made-up San Diego quests)
//   - removes the sample switch and every sample-only branch from the home page
// Run from the project folder (after paid-cards / cards-wire.js):
//   node no-demo-wire.js
const fs = require("fs");
const report = [];
let problems = 0;
const file = "app/(tabs)/home.tsx";

if (!fs.existsSync(file)) {
  report.push(`NOT FOUND: ${file}`);
  problems++;
} else {
  const raw = fs.readFileSync(file, "utf8");
  const crlf = raw.includes("\r\n");
  let s = raw.replace(/\r\n/g, "\n");
  if (!s.includes("sampleQuests") && !s.includes("USE_SAMPLE_QUESTS")) {
    report.push(`already done: ${file}`);
  } else {
    const steps = [
      [`// (Register). Quests come from GET /api/quests; joining and registering
// use POST /api/quests/:id/registrations. While USE_SAMPLE_QUESTS is on,
// it shows the Figma's San Diego quests instead (constants/sampleQuests.ts).`, `// (Register). Real quests only, from GET /api/quests (created in the admin
// dashboard's Quests & Events); every ticket goes through "Get a ticket".`],
      [`import { makeSampleQuests, SAMPLE_CITY } from "@/constants/sampleQuests";
`, ``],
      [`// The backend's quests are three Lagos tests for now: show the design's
// San Diego set until real nearby quests exist. false = GET /api/quests.
// Real quests now (created in the admin dashboard's Quests & Events).
const USE_SAMPLE_QUESTS = false;
`, ``],
      [`  const [sampleQuests] = useState(makeSampleQuests);
  const quests = USE_SAMPLE_QUESTS ? sampleQuests : apiQuests;
  const questsLoading = USE_SAMPLE_QUESTS ? false : apiLoading;`, `  const quests = apiQuests;
  const questsLoading = apiLoading;`],
      [`  const city = USE_SAMPLE_QUESTS ? SAMPLE_CITY : lookedUpCity;`, `  const city = lookedUpCity;`],
      [`    const work: Promise<unknown>[] = USE_SAMPLE_QUESTS ? [] : [dispatch(fetchQuests(undefined))];`, `    const work: Promise<unknown>[] = [dispatch(fetchQuests(undefined))];`],
      [`    if (quest.id.startsWith("sample_")) return;
`, ``],
      [`useRecentJoins(featured && !featured.id.startsWith("sample_") ? featured.id : null)`, `useRecentJoins(featured ? featured.id : null)`],
    ];
    for (const [find, replace] of steps) {
      if (!s.includes(find)) {
        report.push(`NOT FOUND: ${file} (anchor: ${find.slice(0, 50).replace(/\n/g, "\\n")})`);
        problems++;
      } else {
        s = s.replace(find, () => replace);
      }
    }
    // Register / Join / ENTER: always "Get a ticket" (or My tickets once in).
    const start = s.indexOf("  const register = async (quest: Quest) => {");
    const end = s.indexOf("  // Tapping a card (not its button)");
    if (start === -1 || end === -1 || end < start) {
      report.push(`NOT FOUND: ${file} - the register function (run cards-wire.js first)`);
      problems++;
    } else {
      s = s.slice(0, start) + `  // Register / Join / ENTER: "Get a ticket" (paid, through Stripe); once
  // you have one, My tickets.
  const register = async (quest: Quest) => {
    if (!token) return;
    if (registered.has(quest.id)) router.push("/tickets" as any);
    else setTicketQuest(quest);
  };

` + s.slice(end);
    }
    if (!problems) {
      fs.writeFileSync(file, crlf ? s.replace(/\n/g, "\r\n") : s, "utf8");
      report.push(`done: ${file} - real quests only`);
    }
  }
}

const sample = "constants/sampleQuests.ts";
if (fs.existsSync(sample)) {
  const users = [];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      if (["node_modules", ".git", ".expo", "dist"].includes(name)) continue;
      const path = `${dir}/${name}`;
      if (fs.statSync(path).isDirectory()) walk(path);
      else if (/\.(tsx?|jsx?)$/.test(name) && path !== `./${sample}` && fs.readFileSync(path, "utf8").includes("sampleQuests")) users.push(path);
    }
  };
  walk(".");
  if (users.length) {
    report.push(`KEPT: ${sample} - still used by ${users.join(", ")}`);
    problems++;
  } else {
    fs.unlinkSync(sample);
    report.push(`deleted: ${sample}`);
  }
} else {
  report.push(`already done: ${sample} deleted`);
}

console.log(report.join("\n"));
console.log(problems ? `\n${problems} step(s) need a look - paste this output to Claude.` : "\nAll done. Now run: npx tsc --noEmit");
