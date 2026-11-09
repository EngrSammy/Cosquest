// GODOT IN THE APP (cq 061): native setup for @borndotcom/react-native-godot,
// which runs the 3D fight (game3d/, a Godot 4.5 project) inside the app.
//
// Android:
//  1. MainActivity hands the activity to the Godot host
//     (RTNLibGodot.init, as in the library's example app). The host draws
//     through SurfaceControl, which is Android 10 (API 29) and up, so older
//     phones skip it and the app keeps its minSdk (26): the library is built
//     with the app's minSdk and its API 29 calls as weak symbols (patches/),
//     and the JS side does not offer the 3D fight below 29
//     (features/game3d/flags.ts).
//  2. The LibGodot AAR carries its own libc++_shared.so, as React Native does:
//     one copy is packaged (pickFirsts in gradle.properties).
//  3. The exported Godot project (scripts/godot-export.sh, a folder of files)
//     is copied to android/app/src/main/assets/game3d, which Godot opens with
//     `--path /game3d`. Expo's template already keeps dot folders in assets
//     (Godot's .godot/imported lives there). GDExtension libraries staged in
//     godot-export/android/jniLibs/<abi>/ (the 3D Tiles plugin) go to jniLibs.
// iOS:
//  4. The exported game3d.pck is copied next to the app sources and added to
//     the bundle's resources (opened with `--main-pack <bundle>/game3d.pck`).
//     The pods come from the library's podspec (autolinking) once
//     `GODOT_PLATFORMS=ios scripts/godot-prebuilt.sh` has unpacked the
//     xcframeworks. Not compiled here (no Mac).
//
// The exported files are build output (git-ignored, godot-export/). With
// none there, prebuild warns and the app builds anyway: the fight then
// reports that the game files are missing.
const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  withDangerousMod,
  withGradleProperties,
  withMainActivity,
  withXcodeProject,
} = require("@expo/config-plugins");

const MARK = "// [withGodot]";
const PICK_FIRST_KEY = "android.packagingOptions.pickFirsts";
const PICK_FIRSTS = ["**/libc++_shared.so"];
const DEFAULTS = { exportDir: "godot-export", name: "game3d" };

/** MainActivity.kt with the Godot host started after super.onCreate. Idempotent. */
function patchMainActivity(src) {
  if (src.includes(MARK)) return src;
  const at = src.match(/\n([ \t]*)super\.onCreate\([^)]*\)\n/);
  if (!at) {
    throw new Error("withGodot: MainActivity has no super.onCreate(...) line; update the plugin.");
  }
  const indent = at[1];
  const lines = [
    `${indent}${MARK} The Godot host (react-native-godot) needs the activity. It draws`,
    `${indent}// through SurfaceControl (API 29+): older phones never open the 3D fight.`,
    `${indent}if (android.os.Build.VERSION.SDK_INT >= 29) {`,
    `${indent}  com.rtngodot.RTNLibGodot.getInstance().init(this)`,
    `${indent}}`,
  ];
  const end = at.index + at[0].length;
  return src.slice(0, end) + lines.join("\n") + "\n" + src.slice(end);
}

/** A comma list with the given entries added once (gradle.properties pickFirsts). */
function mergeList(existing, add) {
  const items = (existing || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const a of add) if (!items.includes(a)) items.push(a);
  return items.join(",");
}

function setPickFirsts(props) {
  const item = props.find((p) => p.type === "property" && p.key === PICK_FIRST_KEY);
  if (item) item.value = mergeList(item.value, PICK_FIRSTS);
  else props.push({ type: "property", key: PICK_FIRST_KEY, value: mergeList("", PICK_FIRSTS) });
  return props;
}

function copyDir(from, to) {
  fs.rmSync(to, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

function withGodotAndroid(config, opts) {
  config = withMainActivity(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withGodot: expects a Kotlin MainActivity.");
    }
    cfg.modResults.contents = patchMainActivity(cfg.modResults.contents);
    return cfg;
  });
  config = withGradleProperties(config, (cfg) => {
    cfg.modResults = setPickFirsts(cfg.modResults);
    return cfg;
  });
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const from = path.join(cfg.modRequest.projectRoot, opts.exportDir, "android", opts.name);
      const to = path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "assets", opts.name);
      if (fs.existsSync(path.join(from, "project.binary")) || fs.existsSync(path.join(from, "project.godot"))) {
        copyDir(from, to);
      } else {
        console.warn(`withGodot: no exported Godot project at ${from}; run scripts/godot-export.sh. The 3D fight will not open in this build.`);
      }
      // GDExtensions (the 3D Tiles plugin, cq 061): native libraries the
      // export step staged per ABI go to jniLibs; Godot dlopens them by name.
      const libs = path.join(cfg.modRequest.projectRoot, opts.exportDir, "android", "jniLibs");
      if (fs.existsSync(libs)) {
        copyDir(libs, path.join(cfg.modRequest.platformProjectRoot, "app", "src", "main", "jniLibs"));
      }
      return cfg;
    },
  ]);
  return config;
}

function withGodotIos(config, opts) {
  const pckName = `${opts.name}.pck`;
  const source = (projectRoot) => path.join(projectRoot, opts.exportDir, "ios", pckName);
  config = withDangerousMod(config, [
    "ios",
    (cfg) => {
      const from = source(cfg.modRequest.projectRoot);
      if (!fs.existsSync(from)) {
        console.warn(`withGodot: no ${pckName} at ${from}; run scripts/godot-export.sh ios. The 3D fight will not open in this build.`);
        return cfg;
      }
      const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
      fs.copyFileSync(from, path.join(cfg.modRequest.platformProjectRoot, projectName, pckName));
      return cfg;
    },
  ]);
  config = withXcodeProject(config, (cfg) => {
    if (!fs.existsSync(source(cfg.modRequest.projectRoot))) return cfg;
    const projectName = IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot);
    const filepath = `${projectName}/${pckName}`;
    const project = cfg.modResults;
    if (!project.hasFile(filepath)) {
      cfg.modResults = IOSConfig.XcodeUtils.addResourceFileToGroup({ filepath, groupName: projectName, isBuildFile: true, project });
    }
    return cfg;
  });
  return config;
}

function withGodot(config, props = {}) {
  const opts = { ...DEFAULTS, ...props };
  config = withGodotAndroid(config, opts);
  config = withGodotIos(config, opts);
  return config;
}

module.exports = withGodot;
module.exports.patchMainActivity = patchMainActivity;
module.exports.mergeList = mergeList;
module.exports.setPickFirsts = setPickFirsts;
