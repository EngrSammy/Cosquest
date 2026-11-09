// The config plugin's Android side: the NFC permission switch, and embedding
// a Unity 6 export (Unity as a Library) only when asked AND an export exists.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { after, describe, it } = require("node:test");

const plugin = require("../withCostQuestGame");
const {
  addNfcToManifest,
  addUnityToAppBuildGradle,
  addUnityToManifest,
  addUnityToProjectBuildGradle,
  addUnityToSettingsGradle,
  parseProperties,
  readUnityExport,
  setGeneratedBlock,
  setUnityGradleProperties,
  withCostQuestGame,
  UNITY_ACTIVITIES,
} = plugin;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cq-unity-export-"));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A Unity 6000.0-shaped export: unityLibrary (+ an androidlib), shared, gradle.properties. */
function fakeExport(dir, { xr = true, manifestApplication = "" } = {}) {
  const lib = path.join(dir, "unityLibrary");
  fs.mkdirSync(path.join(lib, "src", "main"), { recursive: true });
  fs.mkdirSync(path.join(dir, "shared"), { recursive: true });
  fs.writeFileSync(
    path.join(lib, "build.gradle"),
    [
      "apply plugin: 'com.android.library'",
      "apply from: '../shared/keepUnitySymbols.gradle'",
      "android {",
      '    namespace "com.unity3d.player"',
      '    ndkPath "/opt/unity/Editor/Data/PlaybackEngines/AndroidPlayer/NDK"',
      '    ndkVersion "27.2.12479018"',
      "    androidResources {",
      "        noCompress = ['.unity3d', '.ress', '.resource', '.obb', '.bundle', '.unityexp'] + unityStreamingAssets.tokenize(', ')",
      "    }",
      "}",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(lib, "src", "main", "AndroidManifest.xml"),
    `<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application${manifestApplication}>` +
      '<activity android:name="com.unity3d.player.UnityPlayerActivity" android:theme="@style/UnityThemeSelector"/>' +
      "</application></manifest>",
  );
  if (xr) {
    fs.mkdirSync(path.join(lib, "xrmanifest.androidlib"), { recursive: true });
    fs.writeFileSync(path.join(lib, "xrmanifest.androidlib", "build.gradle"), "apply plugin: 'com.android.library'\n");
  }
  fs.writeFileSync(
    path.join(dir, "gradle.properties"),
    [
      "org.gradle.jvmargs=-Xmx4096M",
      "org.gradle.parallel=true",
      "unityStreamingAssets=.json, .bytes",
      "unity.androidSdkPath=/opt/unity/SDK",
      "unity.androidNdkPath=/opt/unity/NDK",
      "android.useAndroidX=true",
    ].join("\n"),
  );
  return dir;
}

function manifest() {
  return {
    manifest: {
      $: { "xmlns:android": "http://schemas.android.com/apk/res/android" },
      "uses-permission": [{ $: { "android:name": "android.permission.INTERNET" } }],
      application: [{ $: { "android:name": ".MainApplication", "android:label": "@string/app_name" }, activity: [] }],
    },
  };
}

describe("NFC (Android)", () => {
  it("adds the permission and an optional feature, once", () => {
    const m = addNfcToManifest(addNfcToManifest(manifest()));
    const perms = m.manifest["uses-permission"].filter((p) => p.$["android:name"] === "android.permission.NFC");
    assert.equal(perms.length, 1);
    assert.deepEqual(m.manifest["uses-feature"], [
      { $: { "android:name": "android.hardware.nfc", "android:required": "false" } },
    ]);
  });

  it("is only registered with nfc: true", () => {
    const off = withCostQuestGame({ name: "t", slug: "t" }, { nfc: false });
    assert.equal(off.mods?.android?.manifest, undefined);
    const on = withCostQuestGame({ name: "t", slug: "t" }, { nfc: true });
    assert.equal(typeof on.mods.android.manifest, "function");
  });
});

describe("unityAndroid off", () => {
  it("registers no Android mods at all (default)", () => {
    const config = withCostQuestGame({ name: "t", slug: "t" }, {});
    assert.equal(config.mods?.android, undefined);
    // iOS keeps its mods.
    assert.equal(typeof config.mods.ios.infoPlist, "function");
  });
});

describe("readUnityExport", () => {
  it("is null without unityLibrary (nothing to embed)", () => {
    assert.equal(readUnityExport(path.join(tmp, "missing")), null);
    fs.mkdirSync(path.join(tmp, "empty"), { recursive: true });
    assert.equal(readUnityExport(path.join(tmp, "empty")), null);
  });

  it("reads what the host build needs from a Unity 6 export", () => {
    const info = readUnityExport(fakeExport(path.join(tmp, "full")));
    assert.equal(info.unityLibraryDir, path.join(tmp, "full", "unityLibrary"));
    assert.deepEqual(info.androidlibs, ["xrmanifest.androidlib"]);
    assert.equal(info.ndkVersion, "27.2.12479018");
    assert.deepEqual(info.noCompress, [".unity3d", ".ress", ".resource", ".obb", ".bundle", ".unityexp"]);
    assert.deepEqual(info.properties, {
      unityStreamingAssets: ".json, .bytes",
      "unity.androidSdkPath": "/opt/unity/SDK",
      "unity.androidNdkPath": "/opt/unity/NDK",
    });
    assert.deepEqual(info.activities, ["com.unity3d.player.UnityPlayerActivity"]);
    assert.equal(info.hasShared, true);
    assert.equal(info.usesShared, true);
  });

  it("always provides unityStreamingAssets (unityLibrary dereferences it)", () => {
    const dir = fakeExport(path.join(tmp, "noprops"), { xr: false });
    fs.rmSync(path.join(dir, "gradle.properties"));
    const info = readUnityExport(dir);
    assert.deepEqual(info.properties, { unityStreamingAssets: "" });
    assert.deepEqual(info.androidlibs, []);
  });

  it("notices <application> attributes the export sets", () => {
    const dir = fakeExport(path.join(tmp, "attrs"), { manifestApplication: ' android:extractNativeLibs="true" android:label="x"' });
    assert.deepEqual(readUnityExport(dir).applicationAttributes, ["android:extractNativeLibs", "android:label"]);
  });
});

describe("parseProperties", () => {
  it("skips comments and keeps values with = in them", () => {
    assert.deepEqual(parseProperties("# c\n a = b=c \n!x\nk:v\n"), { a: "b=c", k: "v" });
  });
});

describe("Gradle edits", () => {
  const settings = "rootProject.name = 'cosquest'\ninclude ':app'\n";

  it("includes :unityLibrary and its androidlibs from the export, idempotently", () => {
    const once = addUnityToSettingsGradle(settings, {
      unityLibraryPath: "../modules/costquest-game/unity-android/export/unityLibrary",
      androidlibs: ["xrmanifest.androidlib"],
    });
    assert.match(once, /include ':unityLibrary'\n/);
    assert.match(
      once,
      /project\(':unityLibrary'\)\.projectDir = new File\(rootDir, '\.\.\/modules\/costquest-game\/unity-android\/export\/unityLibrary'\)/,
    );
    assert.match(once, /include ':unityLibrary:xrmanifest.androidlib'/);
    assert.match(once, /export\/unityLibrary\/xrmanifest\.androidlib'\)/);
    assert.ok(once.startsWith(settings.trimEnd()));
    const twice = addUnityToSettingsGradle(once, {
      unityLibraryPath: "../modules/costquest-game/unity-android/export/unityLibrary",
      androidlibs: ["xrmanifest.androidlib"],
    });
    assert.equal(twice, once);
  });

  it("replaces its own block instead of stacking a second", () => {
    const a = setGeneratedBlock("x\n", "one");
    const b = setGeneratedBlock(a, "two");
    assert.equal((b.match(/@generated begin/g) || []).length, 1);
    assert.match(b, /two/);
    assert.doesNotMatch(b, /one/);
  });

  it("adds Unity's flatDir to every project's repositories", () => {
    const out = addUnityToProjectBuildGradle("allprojects {\n  repositories {\n    google()\n  }\n}\n");
    assert.match(out, /flatDir \{\n\s+dirs "\$\{rootProject\.project\(':unityLibrary'\)\.projectDir\}\/libs"/);
  });

  it("sets arm64-v8a, Unity's NDK, noCompress and the il2cpp symbol rule on the app", () => {
    const out = addUnityToAppBuildGradle("android {\n}\n", {
      ndkVersion: "27.2.12479018",
      noCompress: [".unity3d", ".ress"],
    });
    assert.match(out, /ndkVersion "27\.2\.12479018"/);
    assert.match(out, /abiFilters 'arm64-v8a'/);
    assert.match(out, /noCompress\.addAll\(\['\.unity3d', '\.ress'\] \+ \(findProperty\('unityStreamingAssets'\) \?: ''\)\.tokenize\(', '\)\)/);
    assert.match(out, /keepDebugSymbols\.add\('\*\*\/libil2cpp\.usym\.so'\)/);
  });

  it("leaves the app's NDK alone when the export does not name one", () => {
    assert.doesNotMatch(addUnityToAppBuildGradle("", { ndkVersion: null }), /ndkVersion/);
  });

  it("copies the export's properties and turns on extracted native libs", () => {
    const items = [
      { type: "comment", value: "x" },
      { type: "property", key: "expo.useLegacyPackaging", value: "false" },
    ];
    setUnityGradleProperties(items, { unityStreamingAssets: "", "unity.androidNdkPath": "/ndk" });
    const get = (k) => items.find((i) => i.key === k)?.value;
    assert.equal(get("expo.useLegacyPackaging"), "true");
    assert.equal(get("unityStreamingAssets"), "");
    assert.equal(get("unity.androidNdkPath"), "/ndk");
    assert.equal(items.filter((i) => i.key === "expo.useLegacyPackaging").length, 1);
  });
});

describe("Manifest edits", () => {
  it("removes Unity's launcher activities (the view is embedded) and resolves attribute clashes", () => {
    const m = addUnityToManifest(manifest(), {
      activities: ["com.unity3d.player.UnityPlayerActivity"],
      applicationAttributes: ["android:label", "android:extractNativeLibs"],
    });
    assert.equal(m.manifest.$["xmlns:tools"], "http://schemas.android.com/tools");
    const app = m.manifest.application[0];
    assert.deepEqual(app.activity, [
      { $: { "android:name": "com.unity3d.player.UnityPlayerActivity", "tools:node": "remove" } },
    ]);
    // Only what the app itself sets can clash.
    assert.equal(app.$["tools:replace"], "android:label");
    // Twice: no duplicates.
    addUnityToManifest(m, { activities: ["com.unity3d.player.UnityPlayerActivity"], applicationAttributes: ["android:label"] });
    assert.equal(app.activity.length, 1);
    assert.equal(app.$["tools:replace"], "android:label");
  });

  it("knows both Unity 6 entry activities", () => {
    assert.deepEqual(UNITY_ACTIVITIES, [
      "com.unity3d.player.UnityPlayerActivity",
      "com.unity3d.player.UnityPlayerGameActivity",
    ]);
  });
});

describe("COSTQUEST_UNITY_ANDROID", () => {
  const { unityAndroidEnabled } = plugin;
  it("overrides the app.json option either way for one prebuild", () => {
    assert.equal(unityAndroidEnabled(false, { COSTQUEST_UNITY_ANDROID: "1" }), true);
    assert.equal(unityAndroidEnabled(true, { COSTQUEST_UNITY_ANDROID: "0" }), false);
    assert.equal(unityAndroidEnabled(true, {}), true);
    assert.equal(unityAndroidEnabled(undefined, {}), false);
    assert.equal(unityAndroidEnabled("yes", {}), false);
  });
});

describe("unityAndroid on", () => {
  it("registers the Gradle, manifest and strings mods", () => {
    const config = withCostQuestGame({ name: "t", slug: "t" }, { unityAndroid: true });
    for (const mod of ["settingsGradle", "projectBuildGradle", "appBuildGradle", "gradleProperties", "manifest", "strings"]) {
      assert.equal(typeof config.mods.android[mod], "function", mod);
    }
  });
});
