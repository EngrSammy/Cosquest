// Metro = the tool that bundles the app's code.
//
// WEB STUBS: some packages only work on phones (they crash a browser).
// When bundling for the WEBSITE, Metro swaps them for a simple stand-in
// from the web-stubs/ folder. Phones (Android / iOS) are NOT affected -
// they keep using the real packages.
//
// To stub another phone-only package later, add one line to WEB_STUBS.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// The bundled default weapons (assets/weapons/*.glb, cq 234) ship as assets.
if (!config.resolver.assetExts.includes("glb")) config.resolver.assetExts.push("glb");
// A shared build machine: METRO_MAX_WORKERS caps the bundler (by default one worker per core).
if (process.env.METRO_MAX_WORKERS) config.maxWorkers = Number(process.env.METRO_MAX_WORKERS);

const WEB_STUBS = {
  "react-native-maps": path.resolve(__dirname, "web-stubs/react-native-maps.tsx"),
  "react-native-filament": path.resolve(__dirname, "web-stubs/forge-3d.tsx"),
  "react-native-worklets-core": path.resolve(__dirname, "web-stubs/forge-3d.tsx"),
  "@borndotcom/react-native-godot": path.resolve(__dirname, "web-stubs/react-native-godot.tsx"),
};

const defaultResolveRequest = config.resolver.resolveRequest;

// TEXT SIZE CAP (phones only): React Native's Text and TextInput resolve to
// utils/textScale/, which give every one of them the app's default
// maxFontSizeMultiplier (see utils/textScale/cap.ts). Those two files still
// get the real ones.
const TEXT_CAP_DIR = path.resolve(__dirname, "utils/textScale");
const TEXT_CAP = [
  [path.join("react-native", "Libraries", "Text", "Text.js"), path.join(TEXT_CAP_DIR, "Text.tsx")],
  [path.join("react-native", "Libraries", "Components", "TextInput", "TextInput.js"), path.join(TEXT_CAP_DIR, "TextInput.tsx")],
];

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_STUBS[moduleName]) {
    return { type: "sourceFile", filePath: WEB_STUBS[moduleName] };
  }

  const resolved = defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);

  if (platform !== "web" && resolved?.type === "sourceFile" && !context.originModulePath.startsWith(TEXT_CAP_DIR)) {
    const swap = TEXT_CAP.find(([original]) => resolved.filePath.endsWith(original));
    if (swap) return { type: "sourceFile", filePath: swap[1] };
  }

  return resolved;
};

// RELEASE BUILDS (task 059): console.log / info / debug calls are dropped by
// the minifier (dev builds are not minified, so they keep them). Warnings
// and errors stay, for crash reports and logcat. Test builds with the timing
// or perf logs on (EXPO_PUBLIC_WORLD_TIMING / EXPO_PUBLIC_PERF_MARKS, which the
// journeys and docs/polish/BASELINE.md read from logcat) keep them.
const KEEP_LOGS = process.env.EXPO_PUBLIC_WORLD_TIMING === "1" || process.env.EXPO_PUBLIC_PERF_MARKS === "1";
config.transformer.minifierConfig = KEEP_LOGS ? config.transformer.minifierConfig : {
  ...config.transformer.minifierConfig,
  compress: {
    ...(config.transformer.minifierConfig?.compress || {}),
    pure_funcs: ["console.log", "console.info", "console.debug"],
  },
};

module.exports = config;
