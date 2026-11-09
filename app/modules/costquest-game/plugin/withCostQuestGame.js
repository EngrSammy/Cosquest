// Config plugin for the CostQuest game module (iOS and Android).
//
// app.json: ["./modules/costquest-game/plugin/withCostQuestGame",
//            { "nfc": false, "serverUrl": "", "unityAndroid": false }]
//
// Keep this plugin FIRST in app.json's list (after expo-router): Expo runs
// mods in reverse order, so it then merges after every other plugin has
// written its own sentence (expo-image-picker sets the camera one outright).
//
// - Info.plist: the game's permission strings, MERGED with the chat app's
//   (a key the chat already has keeps its sentence and gains the game's
//   purpose, never a second copy), its Bonjour services (the peer mesh), and
//   CQServerURL when serverUrl is given (empty = the game's production).
// - Entitlements: NFC tag reading, only with { nfc: true }. It needs the NFC
//   capability on the App ID first, or device signing fails.
// - Build phase "[CostQuest] Embed UnityFramework": on device builds that
//   link Unity (see CostQuestGame.podspec), copies the pinned framework into
//   the app and signs it. Simulator and no-Unity builds skip it.
//
// The iOS deployment target (18.0, what the game needs) is set with
// expo-build-properties in app.json, not here.
//
// Android (see the Android section below): NFC permission with { nfc: true },
// and Unity as a Library with { unityAndroid: true } when an export exists.
const fs = require("node:fs");
const path = require("node:path");
const {
  AndroidConfig,
  createRunOncePlugin,
  withAndroidManifest,
  withAppBuildGradle,
  withEntitlementsPlist,
  withGradleProperties,
  withInfoPlist,
  withProjectBuildGradle,
  withSettingsGradle,
  withStringsXml,
  withXcodeProject,
} = require("expo/config-plugins");

// The game's purpose for each permission, in the merged app's name. The
// standalone game's wording is in costquest-ios project.yml.
const GAME_USAGE = {
  NSCameraUsageDescription:
    "In the game, the camera places the game world around you.",
  NSLocationWhenInUseUsageDescription:
    "In the game, your location places Quest Points around you and tells when you reach one.",
  NSMotionUsageDescription:
    "In the game, motion counts your steps and tells which floor of a venue you are on.",
  NSMicrophoneUsageDescription:
    "In the game, you can say your answer out loud; your voice is recognised on this phone and never leaves it.",
  NSSpeechRecognitionUsageDescription:
    "In the game, your spoken answer is recognised on this phone to pick the choice you said.",
  NFCReaderUsageDescription: "In the game, tap a checkpoint to capture it.",
  NSNearbyInteractionUsageDescription:
    "In the game, ultra wideband shows exactly how far away another player is, and in which direction.",
  NSLocalNetworkUsageDescription:
    "In the game, CosQuest shares game data directly with players standing near you, so the game keeps up when the network does not.",
};

// What the CHAT uses these for, only if no other plugin wrote a sentence
// (today expo-audio does). Without one, the game's sentence would be the only
// reason iOS shows for the microphone that calls and voice messages use.
// Never rewrites the chat's words.
const CHAT_USAGE = {
  NSMicrophoneUsageDescription: "CosQuest uses the microphone for calls and voice messages.",
};

const BONJOUR = ["_costquest._udp", "_costquest._tcp"];

/** The chat's sentence plus the game's, once. Exported for tests. */
function mergeUsage(existing, game) {
  const current = typeof existing === "string" ? existing.trim() : "";
  if (!current) return game;
  if (current.includes(game)) return current;
  const sentence = /[.!?]$/.test(current) ? current : `${current}.`;
  return `${sentence} ${game}`;
}

function withGameInfoPlist(config, { serverUrl, nfc }) {
  return withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;
    for (const [key, chat] of Object.entries(CHAT_USAGE)) {
      if (typeof plist[key] !== "string" || !plist[key].trim()) plist[key] = chat;
    }
    for (const [key, game] of Object.entries(GAME_USAGE)) {
      plist[key] = mergeUsage(plist[key], game);
    }
    const bonjour = Array.isArray(plist.NSBonjourServices) ? plist.NSBonjourServices : [];
    plist.NSBonjourServices = [...new Set([...bonjour, ...BONJOUR])];
    if (serverUrl) {
      plist.CQServerURL = serverUrl;
    }
    // Whether this build has the NFC entitlement (withGameEntitlements), so
    // the RN game's NFC helper says "built without NFC" up front instead of
    // a reader sheet failing later (ios/Embed/GameHelpers.swift NfcHelper).
    plist.CQNfcEnabled = nfc === true;
    return cfg;
  });
}

function withGameEntitlements(config, { nfc }) {
  if (!nfc) return config;
  return withEntitlementsPlist(config, (cfg) => {
    const key = "com.apple.developer.nfc.readersession.formats";
    const formats = Array.isArray(cfg.modResults[key]) ? cfg.modResults[key] : [];
    cfg.modResults[key] = [...new Set([...formats, "NDEF"])];
    return cfg;
  });
}

const PHASE_NAME = "[CostQuest] Embed UnityFramework";

// Same decision as the pod: only when this build links Unity.
const EMBED_SCRIPT = [
  "set -e",
  'case "${OTHER_LDFLAGS}" in *UnityFramework*) ;; *) echo "CostQuest: this build has no Unity"; exit 0 ;; esac',
  'FW="${PODS_ROOT}/../../modules/costquest-game/ios/Frameworks/UnityFramework.framework"',
  'if [ ! -f "$FW/UnityFramework" ]; then echo "error: UnityFramework is linked but missing: run scripts/fetch-unity-framework.sh" >&2; exit 1; fi',
  'DEST="${TARGET_BUILD_DIR}/${FRAMEWORKS_FOLDER_PATH}"',
  'mkdir -p "$DEST"',
  'rsync -a --delete "$FW" "$DEST/"',
  'if [ -n "${EXPANDED_CODE_SIGN_IDENTITY}" ] && [ "${CODE_SIGNING_ALLOWED}" != "NO" ]; then',
  '  /usr/bin/codesign --force --sign "${EXPANDED_CODE_SIGN_IDENTITY}" --preserve-metadata=identifier,entitlements --timestamp=none "$DEST/UnityFramework.framework"',
  "fi",
].join("\n");

function withEmbedUnityPhase(config) {
  return withXcodeProject(config, (cfg) => {
    const project = cfg.modResults;
    const target = project.getFirstTarget();
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const exists = Object.values(phases).some(
      (phase) => phase && typeof phase === "object" && String(phase.name).replace(/"/g, "") === PHASE_NAME,
    );
    if (!exists) {
      project.addBuildPhase([], "PBXShellScriptBuildPhase", PHASE_NAME, target.uuid, {
        shellPath: "/bin/sh",
        shellScript: EMBED_SCRIPT,
        // Copies from outside the project: the script sandbox would refuse.
        alwaysOutOfDate: 1,
      });
    }
    // The phase reads modules/ and writes into the app bundle.
    const configs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const settings = configs[key] && configs[key].buildSettings;
      if (settings && settings.PRODUCT_NAME && settings.INFOPLIST_FILE) {
        settings.ENABLE_USER_SCRIPT_SANDBOXING = "NO";
      }
    }
    return cfg;
  });
}

// ---------------------------------------------------------------------------
// Android
//
// - { nfc: true }: android.permission.NFC and an optional NFC feature (phones
//   without NFC can still install). The same switch as the iOS entitlement.
// - { unityAndroid: true } (or COSTQUEST_UNITY_ANDROID=1) AND an exported Unity Gradle project at
//   unity-android/export (scripts/export-unity-android.sh; or
//   { unityAndroidExportDir: "<dir relative to the app>" }): embeds Unity as
//   a library. Off, or no export: nothing changes and the costquest-game
//   module builds without Unity (hasUnity false). See unity-android/README.md.
// ---------------------------------------------------------------------------

const UNITY_BLOCK = "costquest-unity";
const UNITY_ACTIVITIES = ["com.unity3d.player.UnityPlayerActivity", "com.unity3d.player.UnityPlayerGameActivity"];
// Unity 6000.0's built-in noCompress list (its Gradle templates' **BUILTIN_NOCOMPRESS**).
const UNITY_NO_COMPRESS = [".unity3d", ".ress", ".resource", ".obb", ".bundle", ".unityexp"];
const DEFAULT_UNITY_EXPORT = path.resolve(__dirname, "..", "unity-android", "export");

/** android.permission.NFC + <uses-feature android.hardware.nfc required=false>, once. Exported for tests. */
function addNfcToManifest(androidManifest) {
  const manifest = androidManifest.manifest;
  const permissions = (manifest["uses-permission"] = manifest["uses-permission"] || []);
  if (!permissions.some((p) => p.$ && p.$["android:name"] === "android.permission.NFC")) {
    permissions.push({ $: { "android:name": "android.permission.NFC" } });
  }
  const features = (manifest["uses-feature"] = manifest["uses-feature"] || []);
  if (!features.some((f) => f.$ && f.$["android:name"] === "android.hardware.nfc")) {
    features.push({ $: { "android:name": "android.hardware.nfc", "android:required": "false" } });
  }
  return androidManifest;
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/** key=value lines of a .properties file (no continuation lines; Unity writes none). */
function parseProperties(text) {
  const out = {};
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("!")) continue;
    const at = line.search(/[=:]/);
    if (at < 0) continue;
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return out;
}

/**
 * What the plugin needs from a Unity 6 Android export (a Gradle project with
 * launcher/, unityLibrary/ and shared/), or null when there is no
 * unityLibrary to embed. Exported for tests.
 */
function readUnityExport(exportDir) {
  const unityLibraryDir = path.join(exportDir, "unityLibrary");
  const libGradle = readText(path.join(unityLibraryDir, "build.gradle"));
  if (libGradle == null) return null;

  // Sub-projects Unity puts inside unityLibrary (xrmanifest.androidlib and
  // other *.androidlib plugins); Unity's own settings.gradle includes them as
  // ':unityLibrary:<name>'.
  const androidlibs = fs
    .readdirSync(unityLibraryDir)
    .filter((name) => name.endsWith(".androidlib") && fs.existsSync(path.join(unityLibraryDir, name, "build.gradle")))
    .sort();

  // unityLibrary/build.gradle reads unityStreamingAssets and, for its IL2CPP
  // build step, unity.androidSdkPath / unity.androidNdkPath from the export's
  // gradle.properties: the app's gradle.properties must carry them.
  const allProps = parseProperties(readText(path.join(exportDir, "gradle.properties")));
  const properties = { unityStreamingAssets: "" };
  for (const [key, value] of Object.entries(allProps)) {
    if (key === "unityStreamingAssets" || key.startsWith("unity.")) properties[key] = value;
  }

  const ndkVersion = (/\bndkVersion\s*=?\s*["']([^"']+)["']/.exec(libGradle) || [])[1] || null;
  const noCompressMatch = /noCompress\s*=\s*\[([^\]]*)\]/.exec(libGradle);
  const noCompress = noCompressMatch
    ? [...noCompressMatch[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1])
    : UNITY_NO_COMPRESS;

  const libManifest = readText(path.join(unityLibraryDir, "src", "main", "AndroidManifest.xml")) || "";
  const activities = UNITY_ACTIVITIES.filter((name) => libManifest.includes(`"${name}"`));
  const applicationTag = (/<application\b([^>]*)>/.exec(libManifest) || [])[1] || "";
  const applicationAttributes = [...applicationTag.matchAll(/(android:[\w]+)\s*=/g)].map((m) => m[1]);

  return {
    exportDir,
    unityLibraryDir,
    androidlibs,
    properties,
    ndkVersion,
    noCompress,
    activities,
    applicationAttributes,
    hasShared: fs.existsSync(path.join(exportDir, "shared")),
    usesShared: /\.\.\/shared\//.test(libGradle),
  };
}

/** Replaces (or appends) the plugin's marked block in a Gradle file. Idempotent. Exported for tests. */
function setGeneratedBlock(contents, body, tag = UNITY_BLOCK) {
  const begin = `// @generated begin ${tag} (withCostQuestGame; do not edit)`;
  const end = `// @generated end ${tag}`;
  const block = `${begin}\n${body.trimEnd()}\n${end}`;
  const re = new RegExp(`\\n?// @generated begin ${tag} [^\\n]*\\n[\\s\\S]*?// @generated end ${tag}\\n?`);
  const stripped = contents.replace(re, "\n");
  return `${stripped.trimEnd()}\n\n${block}\n`;
}

function toGradlePath(p) {
  return p.split(path.sep).join("/");
}

/** settings.gradle: :unityLibrary (+ its *.androidlib children) from the export. Exported for tests. */
function addUnityToSettingsGradle(contents, { unityLibraryPath, androidlibs = [] }) {
  const lines = [
    "// Unity as a Library: the exported unityLibrary (unity-android/README.md).",
    "include ':unityLibrary'",
    `project(':unityLibrary').projectDir = new File(rootDir, '${unityLibraryPath}')`,
  ];
  for (const lib of androidlibs) {
    lines.push(`include ':unityLibrary:${lib}'`);
    lines.push(`project(':unityLibrary:${lib}').projectDir = new File(rootDir, '${unityLibraryPath}/${lib}')`);
  }
  return setGeneratedBlock(contents, lines.join("\n"));
}

/** Root build.gradle: the flatDir Unity's own settings.gradle declares (libs/*.aar). Exported for tests. */
function addUnityToProjectBuildGradle(contents) {
  return setGeneratedBlock(
    contents,
    [
      "allprojects {",
      "  repositories {",
      "    flatDir {",
      "      dirs \"${rootProject.project(':unityLibrary').projectDir}/libs\"",
      "    }",
      "  }",
      "}",
    ].join("\n"),
  );
}

/** app/build.gradle: ABI, Unity's NDK, noCompress, symbols. Exported for tests. */
function addUnityToAppBuildGradle(contents, { ndkVersion, noCompress = UNITY_NO_COMPRESS }) {
  const list = noCompress.map((ext) => `'${ext}'`).join(", ");
  const lines = ["android {"];
  if (ndkVersion) {
    lines.push("  // The NDK the Unity export was built for (its unityLibrary/build.gradle).");
    lines.push(`  ndkVersion "${ndkVersion}"`);
  }
  lines.push(
    "  defaultConfig {",
    "    // Unity exports arm64-v8a only: an APK with Unity cannot run on x86_64 emulators.",
    "    ndk { abiFilters 'arm64-v8a' }",
    "  }",
    "  androidResources {",
    `    noCompress.addAll([${list}] + (findProperty('unityStreamingAssets') ?: '').tokenize(', '))`,
    "  }",
    "  packaging {",
    "    jniLibs {",
    "      // il2cpp's symbol file is not an ELF binary; stripping it fails.",
    "      keepDebugSymbols.add('**/libil2cpp.usym.so')",
    "    }",
    "  }",
    "}",
  );
  return setGeneratedBlock(contents, lines.join("\n"));
}

/** gradle.properties: the export's unity.* keys, unityStreamingAssets, extracted native libs. Exported for tests. */
function setUnityGradleProperties(items, properties) {
  const wanted = { ...properties, "expo.useLegacyPackaging": "true" };
  for (const [key, value] of Object.entries(wanted)) {
    const existing = items.find((item) => item.type === "property" && item.key === key);
    if (existing) existing.value = value;
    else items.push({ type: "property", key, value });
  }
  return items;
}

/**
 * Manifest: Unity's own launcher activities are removed (the app embeds
 * Unity's view; it never starts UnityPlayerActivity, and its LAUNCHER filter
 * would add a second icon), and any <application> attribute the export also
 * sets is replaced by the app's. Exported for tests.
 */
function addUnityToManifest(androidManifest, { activities = UNITY_ACTIVITIES, applicationAttributes = [] }) {
  const manifest = androidManifest.manifest;
  manifest.$ = manifest.$ || {};
  manifest.$["xmlns:tools"] = manifest.$["xmlns:tools"] || "http://schemas.android.com/tools";
  const application = (manifest.application = manifest.application || [{ $: {} }])[0];
  application.$ = application.$ || {};
  const list = (application.activity = application.activity || []);
  for (const name of activities) {
    if (!list.some((a) => a.$ && a.$["android:name"] === name)) {
      list.push({ $: { "android:name": name, "tools:node": "remove" } });
    }
  }
  const conflicts = applicationAttributes.filter((attr) => attr in application.$);
  if (conflicts.length) {
    const current = (application.$["tools:replace"] || "").split(",").map((s) => s.trim()).filter(Boolean);
    application.$["tools:replace"] = [...new Set([...current, ...conflicts])].join(",");
  }
  return androidManifest;
}

function withGameAndroid(config, options) {
  if (options.nfc) {
    config = withAndroidManifest(config, (cfg) => {
      addNfcToManifest(cfg.modResults);
      return cfg;
    });
  }
  if (!options.unityAndroid) return config;

  // Read when the mods run (prebuild), so the export can appear after the
  // config is first evaluated. Missing: warn once, change nothing.
  let cached;
  let warned = false;
  const unity = (cfg) => {
    if (cached === undefined) {
      const dir = options.unityAndroidExportDir
        ? path.resolve(cfg.modRequest.projectRoot, options.unityAndroidExportDir)
        : DEFAULT_UNITY_EXPORT;
      cached = readUnityExport(dir);
      if (!cached && !warned) {
        warned = true;
        console.warn(
          `[costquest-game] unityAndroid is on but there is no Unity export at ${dir}/unityLibrary: ` +
            "building Android without Unity. Run scripts/export-unity-android.sh (needs a Unity licence).",
        );
      } else if (cached && cached.usesShared && !cached.hasShared) {
        console.warn(`[costquest-game] the Unity export at ${dir} has no shared/ folder; unityLibrary applies ../shared/*.gradle`);
      }
    }
    return cached;
  };

  config = withSettingsGradle(config, (cfg) => {
    const info = unity(cfg);
    if (!info) return cfg;
    const rel = toGradlePath(path.relative(cfg.modRequest.platformProjectRoot, info.unityLibraryDir));
    cfg.modResults.contents = addUnityToSettingsGradle(cfg.modResults.contents, {
      unityLibraryPath: rel,
      androidlibs: info.androidlibs,
    });
    return cfg;
  });
  config = withProjectBuildGradle(config, (cfg) => {
    if (!unity(cfg)) return cfg;
    cfg.modResults.contents = addUnityToProjectBuildGradle(cfg.modResults.contents);
    return cfg;
  });
  config = withAppBuildGradle(config, (cfg) => {
    const info = unity(cfg);
    if (!info) return cfg;
    cfg.modResults.contents = addUnityToAppBuildGradle(cfg.modResults.contents, info);
    return cfg;
  });
  config = withGradleProperties(config, (cfg) => {
    const info = unity(cfg);
    if (!info) return cfg;
    setUnityGradleProperties(cfg.modResults, info.properties);
    return cfg;
  });
  config = withAndroidManifest(config, (cfg) => {
    const info = unity(cfg);
    if (!info) return cfg;
    addUnityToManifest(cfg.modResults, {
      activities: info.activities.length ? info.activities : UNITY_ACTIVITIES,
      applicationAttributes: info.applicationAttributes,
    });
    return cfg;
  });
  config = withStringsXml(config, (cfg) => {
    if (!unity(cfg)) return cfg;
    // Unity's player looks this string up in the app's resources.
    cfg.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: "game_view_content_description" }, _: "Game view" }],
      cfg.modResults,
    );
    return cfg;
  });
  return config;
}

/**
 * COSTQUEST_UNITY_ANDROID=1 / =0 overrides the unityAndroid option for one
 * prebuild (CI, or trying an export without editing app.json), like
 * COSTQUEST_NO_UNITY=1 on iOS. Exported for tests.
 */
function unityAndroidEnabled(option, env = process.env) {
  const value = env.COSTQUEST_UNITY_ANDROID;
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return option === true;
}

function withCostQuestGame(config, props = {}) {
  const options = { nfc: false, serverUrl: "", ...props };
  options.unityAndroid = unityAndroidEnabled(props.unityAndroid);
  config = withGameInfoPlist(config, options);
  config = withGameEntitlements(config, options);
  config = withEmbedUnityPhase(config);
  config = withGameAndroid(config, options);
  return config;
}

module.exports = createRunOncePlugin(withCostQuestGame, "costquest-game", "0.2.0");
module.exports.mergeUsage = mergeUsage;
module.exports.GAME_USAGE = GAME_USAGE;
module.exports.CHAT_USAGE = CHAT_USAGE;
module.exports.withCostQuestGame = withCostQuestGame;
module.exports.unityAndroidEnabled = unityAndroidEnabled;
module.exports.addNfcToManifest = addNfcToManifest;
module.exports.parseProperties = parseProperties;
module.exports.readUnityExport = readUnityExport;
module.exports.setGeneratedBlock = setGeneratedBlock;
module.exports.addUnityToSettingsGradle = addUnityToSettingsGradle;
module.exports.addUnityToProjectBuildGradle = addUnityToProjectBuildGradle;
module.exports.addUnityToAppBuildGradle = addUnityToAppBuildGradle;
module.exports.setUnityGradleProperties = setUnityGradleProperties;
module.exports.addUnityToManifest = addUnityToManifest;
module.exports.UNITY_ACTIVITIES = UNITY_ACTIVITIES;
module.exports.DEFAULT_UNITY_EXPORT = DEFAULT_UNITY_EXPORT;
