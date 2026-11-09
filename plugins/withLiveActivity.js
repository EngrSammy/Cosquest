// LIVE ACTIVITY (Phase 1, 1 Nov 2026): the Quest Run and raid clocks on the
// lock screen and in the Dynamic Island. ActivityKit draws an activity from a
// widget extension, so this plugin adds one at prebuild:
//  1. the app's Info.plist says NSSupportsLiveActivities;
//  2. ios/CosQuestLiveActivity/ gets the extension's sources
//     (targets/live-activity/), the shared attributes type (the game module's
//     CosQuestTimerAttributes.swift, the same file the app compiles, so the two
//     can never drift) and the game's display font;
//  3. the Xcode project gets the target CosQuestLiveActivity
//     (<app bundle id>.LiveActivity, the app's team, Automatic signing, the
//     app's version and deployment target), built before the app and embedded
//     in its PlugIns ("Embed Foundation Extensions").
// Idempotent: a second run finds the target and only refreshes its settings.
// No App Group and no entitlements: the app updates the activity itself and
// the countdown runs off the end date. The game module starts it
// (modules/costquest-game/ios/Embed/LiveTimers.swift).
const fs = require("fs");
const path = require("path");
const { withDangerousMod, withInfoPlist, withXcodeProject } = require("@expo/config-plugins");

const TARGET = "CosQuestLiveActivity";
const SOURCES_DIR = "targets/live-activity";
const SHARED = "modules/costquest-game/ios/Embed/CosQuestTimerAttributes.swift";
const FONT = "assets/fonts/game/LilitaOne-Regular.ttf";
const FRAMEWORKS = ["WidgetKit.framework", "SwiftUI.framework", "ActivityKit.framework"];

const q = (s) => `"${s}"`;
const unq = (s) => (typeof s === "string" ? s.replace(/^"(.*)"$/, "$1") : s);

/** The files the extension folder holds, by kind (names only). */
function extensionFiles(projectRoot) {
  const src = path.join(projectRoot, SOURCES_DIR);
  const own = fs.existsSync(src) ? fs.readdirSync(src).filter((f) => f.endsWith(".swift")).sort() : [];
  return { swift: [...own, path.basename(SHARED)], resources: [path.basename(FONT)], plist: "Info.plist" };
}

/** Copy the sources, the shared attributes and the font into ios/<TARGET>/. */
function copyExtensionFiles(projectRoot, iosRoot) {
  const dest = path.join(iosRoot, TARGET);
  fs.mkdirSync(dest, { recursive: true });
  const src = path.join(projectRoot, SOURCES_DIR);
  for (const f of fs.readdirSync(src)) {
    if (f.endsWith(".swift") || f === "Info.plist") fs.copyFileSync(path.join(src, f), path.join(dest, f));
  }
  fs.copyFileSync(path.join(projectRoot, SHARED), path.join(dest, path.basename(SHARED)));
  fs.copyFileSync(path.join(projectRoot, FONT), path.join(dest, path.basename(FONT)));
  return dest;
}

function objects(project) {
  return project.hash.project.objects;
}

function section(project, isa) {
  const o = objects(project);
  if (!o[isa]) o[isa] = {};
  return o[isa];
}

function findTarget(project, name) {
  const targets = section(project, "PBXNativeTarget");
  for (const [uuid, t] of Object.entries(targets)) {
    if (typeof t === "object" && unq(t.name) === name) return { uuid, target: t };
  }
  return null;
}

/** The app target: the first application target. */
function appTarget(project) {
  const targets = section(project, "PBXNativeTarget");
  for (const [uuid, t] of Object.entries(targets)) {
    if (typeof t === "object" && unq(t.productType) === "com.apple.product-type.application") return { uuid, target: t };
  }
  throw new Error("withLiveActivity: no application target in the Xcode project.");
}

function configsOf(project, target) {
  const list = section(project, "XCConfigurationList")[target.buildConfigurationList];
  const all = section(project, "XCBuildConfiguration");
  return list.buildConfigurations.map((c) => ({ uuid: c.value, config: all[c.value] }));
}

function fileRef(project, name, lastKnownFileType, sourceTree = q("<group>")) {
  const uuid = project.generateUuid();
  const refs = section(project, "PBXFileReference");
  refs[uuid] = { isa: "PBXFileReference", lastKnownFileType, path: q(name), sourceTree };
  refs[`${uuid}_comment`] = name;
  return uuid;
}

function buildFile(project, ref, name, settings) {
  const uuid = project.generateUuid();
  const files = section(project, "PBXBuildFile");
  files[uuid] = { isa: "PBXBuildFile", fileRef: ref, fileRef_comment: name, ...(settings ? { settings } : {}) };
  files[`${uuid}_comment`] = name;
  return uuid;
}

function phase(project, isa, name, files, extra = {}) {
  const uuid = project.generateUuid();
  const s = section(project, isa);
  s[uuid] = {
    isa,
    buildActionMask: 2147483647,
    files: files.map((f) => ({ value: f.uuid, comment: f.comment })),
    ...extra,
    runOnlyForDeploymentPostprocessing: 0,
  };
  s[`${uuid}_comment`] = name;
  return { value: uuid, comment: name };
}

const FILE_TYPE = { swift: "sourcecode.swift", ttf: "file", plist: "text.plist.xml" };

/**
 * The settings every configuration of the extension gets. The app's own
 * values (team, version, build, deployment target) are copied so the
 * extension always matches the app it ships in.
 */
function extensionSettings(base, opts) {
  return {
    ...base,
    PRODUCT_NAME: q(TARGET),
    PRODUCT_BUNDLE_IDENTIFIER: q(opts.bundleId),
    INFOPLIST_FILE: `${TARGET}/Info.plist`,
    GENERATE_INFOPLIST_FILE: "NO",
    SKIP_INSTALL: "YES",
    CODE_SIGN_STYLE: "Automatic",
    ...(opts.teamId ? { DEVELOPMENT_TEAM: opts.teamId } : {}),
    IPHONEOS_DEPLOYMENT_TARGET: opts.deploymentTarget,
    TARGETED_DEVICE_FAMILY: q("1"),
    SDKROOT: "iphoneos",
    SWIFT_VERSION: "5.0",
    MARKETING_VERSION: opts.marketingVersion,
    CURRENT_PROJECT_VERSION: opts.buildNumber,
    LD_RUNPATH_SEARCH_PATHS: q("$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"),
    ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME: "AccentColor",
    APPLICATION_EXTENSION_API_ONLY: "YES",
    SWIFT_EMIT_LOC_STRINGS: "YES",
  };
}

/** The app's value of a build setting (its Release configuration), unquoted. */
function appSetting(project, key) {
  const { target } = appTarget(project);
  const configs = configsOf(project, target);
  const rel = configs.find((c) => unq(c.config.name) === "Release") ?? configs[0];
  const v = rel?.config.buildSettings?.[key];
  return v === undefined ? undefined : unq(String(v));
}

/**
 * Adds (or refreshes) the extension target in an xcode project object
 * (the `xcode` package's pbxProject). Pure apart from the project: testable
 * on a fixture. opts: bundleId, teamId, files ({swift, resources, plist}).
 */
function addLiveActivityTarget(project, opts) {
  const settingsOpts = {
    bundleId: opts.bundleId,
    teamId: opts.teamId ?? appSetting(project, "DEVELOPMENT_TEAM"),
    deploymentTarget: opts.deploymentTarget ?? appSetting(project, "IPHONEOS_DEPLOYMENT_TARGET") ?? "18.0",
    marketingVersion: opts.marketingVersion ?? appSetting(project, "MARKETING_VERSION") ?? "1.0",
    buildNumber: opts.buildNumber ?? appSetting(project, "CURRENT_PROJECT_VERSION") ?? "1",
  };
  const existing = findTarget(project, TARGET);
  if (existing) {
    for (const { config } of configsOf(project, existing.target)) {
      config.buildSettings = extensionSettings(config.buildSettings, settingsOpts);
    }
    return { created: false, uuid: existing.uuid };
  }
  const app = appTarget(project);
  const files = opts.files;

  // Files, in a group of their own under the main group.
  const refs = [];
  for (const name of files.swift) refs.push({ name, kind: "swift", ref: fileRef(project, name, FILE_TYPE.swift) });
  for (const name of files.resources) refs.push({ name, kind: "res", ref: fileRef(project, name, FILE_TYPE.ttf) });
  const plistRef = fileRef(project, files.plist, FILE_TYPE.plist);
  const groupUuid = project.generateUuid();
  const groups = section(project, "PBXGroup");
  groups[groupUuid] = {
    isa: "PBXGroup",
    children: [...refs.map((r) => ({ value: r.ref, comment: r.name })), { value: plistRef, comment: files.plist }],
    path: TARGET,
    sourceTree: q("<group>"),
  };
  groups[`${groupUuid}_comment`] = TARGET;
  const mainGroup = groups[project.getFirstProject().firstProject.mainGroup];
  mainGroup.children.push({ value: groupUuid, comment: TARGET });

  // Phases: sources, the system frameworks, the font.
  const srcFiles = refs.filter((r) => r.kind === "swift").map((r) => ({ uuid: buildFile(project, r.ref, `${r.name} in Sources`), comment: `${r.name} in Sources` }));
  const resFiles = refs.filter((r) => r.kind === "res").map((r) => ({ uuid: buildFile(project, r.ref, `${r.name} in Resources`), comment: `${r.name} in Resources` }));
  const fwFiles = FRAMEWORKS.map((fw) => {
    const ref = fileRef(project, `System/Library/Frameworks/${fw}`, "wrapper.framework", "SDKROOT");
    section(project, "PBXFileReference")[ref].name = fw;
    section(project, "PBXFileReference")[`${ref}_comment`] = fw;
    return { uuid: buildFile(project, ref, `${fw} in Frameworks`), comment: `${fw} in Frameworks` };
  });
  const phases = [
    phase(project, "PBXSourcesBuildPhase", "Sources", srcFiles),
    phase(project, "PBXFrameworksBuildPhase", "Frameworks", fwFiles),
    phase(project, "PBXResourcesBuildPhase", "Resources", resFiles),
  ];

  // The product and the configurations.
  const productRef = project.generateUuid();
  const fileRefs = section(project, "PBXFileReference");
  fileRefs[productRef] = {
    isa: "PBXFileReference",
    explicitFileType: q("wrapper.app-extension"),
    includeInIndex: 0,
    path: `${TARGET}.appex`,
    sourceTree: "BUILT_PRODUCTS_DIR",
  };
  fileRefs[`${productRef}_comment`] = `${TARGET}.appex`;
  const productsGroup = Object.entries(groups).find(([, g]) => typeof g === "object" && unq(g.name) === "Products");
  if (productsGroup) productsGroup[1].children.push({ value: productRef, comment: `${TARGET}.appex` });

  const cfgSection = section(project, "XCBuildConfiguration");
  const cfgs = configsOf(project, app.target).map(({ config }) => {
    const uuid = project.generateUuid();
    const name = unq(config.name);
    const base = name === "Debug" ? { DEBUG_INFORMATION_FORMAT: "dwarf", SWIFT_ACTIVE_COMPILATION_CONDITIONS: q("DEBUG $(inherited)") } : { DEBUG_INFORMATION_FORMAT: q("dwarf-with-dsym") };
    cfgSection[uuid] = { isa: "XCBuildConfiguration", buildSettings: extensionSettings(base, settingsOpts), name };
    cfgSection[`${uuid}_comment`] = name;
    return { value: uuid, comment: name };
  });
  const listUuid = project.generateUuid();
  const lists = section(project, "XCConfigurationList");
  lists[listUuid] = { isa: "XCConfigurationList", buildConfigurations: cfgs, defaultConfigurationIsVisible: 0, defaultConfigurationName: "Release" };
  lists[`${listUuid}_comment`] = `Build configuration list for PBXNativeTarget "${TARGET}"`;

  const targetUuid = project.generateUuid();
  const targets = section(project, "PBXNativeTarget");
  targets[targetUuid] = {
    isa: "PBXNativeTarget",
    buildConfigurationList: listUuid,
    buildConfigurationList_comment: `Build configuration list for PBXNativeTarget "${TARGET}"`,
    buildPhases: phases,
    buildRules: [],
    dependencies: [],
    name: TARGET,
    productName: TARGET,
    productReference: productRef,
    productReference_comment: `${TARGET}.appex`,
    productType: q("com.apple.product-type.app-extension"),
  };
  targets[`${targetUuid}_comment`] = TARGET;
  const proj = project.getFirstProject().firstProject;
  proj.targets.push({ value: targetUuid, comment: TARGET });
  // Signing: Automatic, the app's team (xcodebuild -allowProvisioningUpdates makes its profile).
  proj.attributes = proj.attributes || {};
  proj.attributes.TargetAttributes = proj.attributes.TargetAttributes || {};
  proj.attributes.TargetAttributes[targetUuid] = { CreatedOnToolsVersion: "16.0", ...(settingsOpts.teamId ? { DevelopmentTeam: settingsOpts.teamId } : {}) };

  // The app depends on the extension and embeds it in PlugIns.
  const proxyUuid = project.generateUuid();
  const proxies = section(project, "PBXContainerItemProxy");
  proxies[proxyUuid] = {
    isa: "PBXContainerItemProxy",
    containerPortal: project.hash.project.rootObject,
    containerPortal_comment: "Project object",
    proxyType: 1,
    remoteGlobalIDString: targetUuid,
    remoteInfo: TARGET,
  };
  proxies[`${proxyUuid}_comment`] = "PBXContainerItemProxy";
  const depUuid = project.generateUuid();
  const deps = section(project, "PBXTargetDependency");
  deps[depUuid] = { isa: "PBXTargetDependency", target: targetUuid, target_comment: TARGET, targetProxy: proxyUuid, targetProxy_comment: "PBXContainerItemProxy" };
  deps[`${depUuid}_comment`] = "PBXTargetDependency";
  app.target.dependencies = app.target.dependencies || [];
  app.target.dependencies.push({ value: depUuid, comment: "PBXTargetDependency" });

  const embedFile = buildFile(project, productRef, `${TARGET}.appex in Embed Foundation Extensions`, { ATTRIBUTES: ["RemoveHeadersOnCopy"] });
  const embed = phase(project, "PBXCopyFilesBuildPhase", "Embed Foundation Extensions", [{ uuid: embedFile, comment: `${TARGET}.appex in Embed Foundation Extensions` }], {
    dstPath: q(""),
    dstSubfolderSpec: 13,
    name: q("Embed Foundation Extensions"),
  });
  app.target.buildPhases.push(embed);
  return { created: true, uuid: targetUuid };
}

const withLiveActivity = (config) => {
  const bundleId = `${config.ios?.bundleIdentifier ?? "com.subomi.cosquest.dev"}.LiveActivity`;
  config = withInfoPlist(config, (c) => {
    c.modResults.NSSupportsLiveActivities = true;
    return c;
  });
  config = withDangerousMod(config, [
    "ios",
    (c) => {
      copyExtensionFiles(c.modRequest.projectRoot, c.modRequest.platformProjectRoot);
      return c;
    },
  ]);
  config = withXcodeProject(config, (c) => {
    addLiveActivityTarget(c.modResults, {
      bundleId,
      teamId: config.ios?.appleTeamId,
      files: extensionFiles(c.modRequest.projectRoot),
    });
    return c;
  });
  return config;
};

module.exports = withLiveActivity;
module.exports.addLiveActivityTarget = addLiveActivityTarget;
module.exports.extensionFiles = extensionFiles;
module.exports.copyExtensionFiles = copyExtensionFiles;
module.exports.TARGET = TARGET;
