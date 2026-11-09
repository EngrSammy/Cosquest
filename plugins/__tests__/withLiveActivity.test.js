// The Live Activity config plugin: the widget extension target, embedded in
// the app, signed like it, added once.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it } = require("node:test");
const xcode = require("xcode");

const { addLiveActivityTarget, copyExtensionFiles, extensionFiles, TARGET } = require("../withLiveActivity");

const HERE = path.dirname(require.resolve("./withLiveActivity.test.js"));
const ROOT = path.join(HERE, "..", "..");
const FIXTURE = path.join(HERE, "fixtures", "app.pbxproj");
const FILES = { swift: ["CosQuestLiveActivity.swift", "CosQuestTimerAttributes.swift"], resources: ["LilitaOne-Regular.ttf"], plist: "Info.plist" };

function load() {
  const p = xcode.project(FIXTURE);
  p.parseSync();
  return p;
}

const entries = (o) => Object.entries(o).filter(([k, v]) => !k.endsWith("_comment") && typeof v === "object");
const unq = (s) => String(s).replace(/^"(.*)"$/, "$1");

function extTarget(p) {
  return entries(p.hash.project.objects.PBXNativeTarget).find(([, t]) => unq(t.name) === TARGET);
}

describe("addLiveActivityTarget", () => {
  it("adds the extension with its own bundle id, the app's team, version and deployment target", () => {
    const p = load();
    const r = addLiveActivityTarget(p, { bundleId: "com.example.app.LiveActivity", files: FILES });
    assert.equal(r.created, true);
    const [uuid, t] = extTarget(p);
    assert.equal(uuid, r.uuid);
    assert.equal(unq(t.productType), "com.apple.product-type.app-extension");
    const list = p.hash.project.objects.XCConfigurationList[t.buildConfigurationList];
    const names = list.buildConfigurations.map((c) => c.comment).sort();
    assert.deepEqual(names, ["Debug", "Release"]);
    for (const c of list.buildConfigurations) {
      const s = p.hash.project.objects.XCBuildConfiguration[c.value].buildSettings;
      assert.equal(unq(s.PRODUCT_BUNDLE_IDENTIFIER), "com.example.app.LiveActivity");
      assert.equal(s.DEVELOPMENT_TEAM, "TEAM123456");
      assert.equal(s.CODE_SIGN_STYLE, "Automatic");
      assert.equal(s.IPHONEOS_DEPLOYMENT_TARGET, "18.0");
      assert.equal(s.MARKETING_VERSION, "1.2");
      assert.equal(s.CURRENT_PROJECT_VERSION, "7");
      assert.equal(s.INFOPLIST_FILE, `${TARGET}/Info.plist`);
    }
  });

  it("compiles both Swift files, bundles the font and links WidgetKit, SwiftUI and ActivityKit", () => {
    const p = load();
    addLiveActivityTarget(p, { bundleId: "x.LiveActivity", files: FILES });
    const [, t] = extTarget(p);
    const o = p.hash.project.objects;
    const phaseFiles = (isa) => {
      const ph = t.buildPhases.find((b) => o[isa]?.[b.value]);
      return o[isa][ph.value].files.map((f) => f.comment);
    };
    assert.deepEqual(phaseFiles("PBXSourcesBuildPhase"), ["CosQuestLiveActivity.swift in Sources", "CosQuestTimerAttributes.swift in Sources"]);
    assert.deepEqual(phaseFiles("PBXResourcesBuildPhase"), ["LilitaOne-Regular.ttf in Resources"]);
    assert.deepEqual(phaseFiles("PBXFrameworksBuildPhase"), ["WidgetKit.framework in Frameworks", "SwiftUI.framework in Frameworks", "ActivityKit.framework in Frameworks"]);
  });

  it("makes the app depend on it and embed it in PlugIns", () => {
    const p = load();
    const { uuid } = addLiveActivityTarget(p, { bundleId: "x.LiveActivity", files: FILES });
    const o = p.hash.project.objects;
    const [, app] = entries(o.PBXNativeTarget).find(([, t]) => unq(t.name) === "App");
    const dep = o.PBXTargetDependency[app.dependencies[0].value];
    assert.equal(dep.target, uuid);
    const embed = app.buildPhases.map((b) => o.PBXCopyFilesBuildPhase?.[b.value]).find(Boolean);
    assert.equal(embed.dstSubfolderSpec, 13);
    assert.deepEqual(embed.files.map((f) => f.comment), [`${TARGET}.appex in Embed Foundation Extensions`]);
    assert.ok(p.getFirstProject().firstProject.targets.some((t) => t.value === uuid));
  });

  it("is idempotent: a second run refreshes settings and adds nothing", () => {
    const p = load();
    addLiveActivityTarget(p, { bundleId: "x.LiveActivity", files: FILES });
    const once = p.writeSync();
    const r = addLiveActivityTarget(p, { bundleId: "x.LiveActivity", files: FILES });
    assert.equal(r.created, false);
    assert.equal(p.writeSync(), once);
    assert.equal(entries(p.hash.project.objects.PBXNativeTarget).length, 2);
  });

  it("writes a project the xcode parser reads back", () => {
    const p = load();
    addLiveActivityTarget(p, { bundleId: "x.LiveActivity", teamId: "OTHERTEAM1", files: FILES });
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "la-")), "project.pbxproj");
    fs.writeFileSync(tmp, p.writeSync());
    const back = xcode.project(tmp);
    back.parseSync();
    const [, t] = extTarget(back);
    const cfg = back.hash.project.objects.XCConfigurationList[t.buildConfigurationList].buildConfigurations[0];
    assert.equal(back.hash.project.objects.XCBuildConfiguration[cfg.value].buildSettings.DEVELOPMENT_TEAM, "OTHERTEAM1");
  });
});

describe("extension files", () => {
  it("lists the checked-in sources plus the shared attributes, and copies them with the font", () => {
    const files = extensionFiles(ROOT);
    assert.ok(files.swift.includes("CosQuestLiveActivity.swift"));
    assert.ok(files.swift.includes("CosQuestTimerAttributes.swift"));
    const ios = fs.mkdtempSync(path.join(os.tmpdir(), "la-ios-"));
    const dest = copyExtensionFiles(ROOT, ios);
    for (const f of [...files.swift, ...files.resources, files.plist]) assert.ok(fs.existsSync(path.join(dest, f)), f);
    // The very same attributes file the app's module compiles.
    assert.equal(
      fs.readFileSync(path.join(dest, "CosQuestTimerAttributes.swift"), "utf8"),
      fs.readFileSync(path.join(ROOT, "modules/costquest-game/ios/Embed/CosQuestTimerAttributes.swift"), "utf8"),
    );
  });
});
