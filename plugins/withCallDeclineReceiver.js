// Copies plugins/CallDeclineReceiver.kt into the Android project at build
// time (package = the app's). The <receiver> itself is registered by the
// expo-callkit-telecom plugin (androidEventReceiver: ".CallDeclineReceiver").
const { withDangerousMod } = require("expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

function withCallDeclineReceiver(config) {
  return withDangerousMod(config, [
    "android",
    (config) => {
      const packageName = config.android?.package;
      if (!packageName) throw new Error("withCallDeclineReceiver: android.package is not set");
      const dir = path.join(config.modRequest.platformProjectRoot, "app/src/main/java", ...packageName.split("."));
      fs.mkdirSync(dir, { recursive: true });
      const source = fs.readFileSync(path.join(__dirname, "CallDeclineReceiver.kt"), "utf8").replace(/^package .*$/m, `package ${packageName}`);
      fs.writeFileSync(path.join(dir, "CallDeclineReceiver.kt"), source);
      return config;
    },
  ]);
}

module.exports = withCallDeclineReceiver;
