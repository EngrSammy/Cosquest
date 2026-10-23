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

const WEB_STUBS = {
  "react-native-maps": path.resolve(__dirname, "web-stubs/react-native-maps.tsx"),
};

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === "web" && WEB_STUBS[moduleName]) {
    return { type: "sourceFile", filePath: WEB_STUBS[moduleName] };
  }

  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
