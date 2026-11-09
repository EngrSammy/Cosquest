// EAS builds of the app WITH the game (one-time setup):
//   - package.json  "eas-build-post-install": the Godot engine libraries are
//                   downloaded on the build server after npm install (they
//                   aren't on npm; scripts/godot-prebuilt.sh, sha256 checked)
//   - .easignore    the same as .gitignore, but INCLUDES godot-export/ (the
//                   3D fight files, git-ignored), so EAS uploads them
//   - .npmrc        legacy-peer-deps=true (EAS installs like Vercel)
// Run from the project folder:   node game-build-wire.js
const fs = require("fs");
const report = [];

(() => {
  const file = "package.json";
  const json = JSON.parse(fs.readFileSync(file, "utf8"));
  json.scripts = json.scripts || {};
  if (json.scripts["eas-build-post-install"]) return report.push(`already done: ${file} (eas-build-post-install)`);
  json.scripts["eas-build-post-install"] = "bash scripts/godot-prebuilt.sh";
  fs.writeFileSync(file, JSON.stringify(json, null, 2) + "\n", "utf8");
  report.push(`done: ${file} - Godot engine downloaded on the build server`);
})();

(() => {
  const ignore = fs.readFileSync(".gitignore", "utf8").replace(/\r\n/g, "\n");
  const lines = ignore.split("\n").filter((line) => line.trim() !== "/godot-export/" && line.trim() !== "godot-export/");
  const out = [
    "# EAS uploads: the same as .gitignore, but godot-export/ (the 3D fight",
    "# files, git-ignored) IS uploaded. Keep in step with .gitignore.",
    ...lines,
  ].join("\n");
  fs.writeFileSync(".easignore", out.endsWith("\n") ? out : out + "\n", "utf8");
  report.push("done: .easignore - includes godot-export/");
})();

(() => {
  const file = ".npmrc";
  const current = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  if (/legacy-peer-deps\s*=\s*true/.test(current)) return report.push(`already done: ${file}`);
  fs.writeFileSync(file, `${current}${current && !current.endsWith("\n") ? "\n" : ""}legacy-peer-deps=true\n`, "utf8");
  report.push(`done: ${file} - legacy-peer-deps`);
})();

if (!fs.existsSync("godot-export/android/game3d")) {
  report.push("NOTE: godot-export/android/game3d is missing - download and extract the fight files (see the steps)");
}
console.log(report.join("\n"));
