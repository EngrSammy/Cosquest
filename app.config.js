// app.json plus the production plumbing that must stay inert until someone
// supplies the keys (task 059, docs/polish/DECISIONS.md). Each part switches
// on only from build-time env:
//
//   SENTRY_ORG + SENTRY_PROJECT   the Sentry plugin (source maps upload with
//                                 SENTRY_AUTH_TOKEN). The SDK itself runs only
//                                 when EXPO_PUBLIC_SENTRY_DSN is set.
//   EAS_UPDATE_CHANNEL            OTA updates from the EAS project in
//                                 app.json (extra.eas.projectId). Unset: the
//                                 app runs its embedded bundle, never checks.
//   (Sign in with Apple uses the backend's Apple web flow, utils/appleAuth.ts:
//   no entitlement needed; the button shows with EXPO_PUBLIC_APPLE_SIGNIN=1.)
module.exports = ({ config }) => {
  const env = process.env;
  // battle-3d-only (1 Nov 2026): the 3D fight is every mode's fight, so every build has it
  // (features/game3d/flags.ts also treats unset as on). EXPO_PUBLIC_GAME3D=0 builds the 2D-only app.
  if (env.EXPO_PUBLIC_GAME3D === undefined) env.EXPO_PUBLIC_GAME3D = "1";
  // The equipped Forge weapon in the hero's hand (cq 234) needs this build's half of the
  // catalogue link AND the server's `forge_world` feature (features/game3d/held.ts catalogueOn).
  // Builds 15 to 17 were made without it, so the hero held the starter weapon, not the one the
  // player equipped. The server's feature is the real switch, so every build has the app's half
  // on; EXPO_PUBLIC_FORGE_CATALOGUE=0 builds an app that never links.
  if (env.EXPO_PUBLIC_FORGE_CATALOGUE === undefined) env.EXPO_PUBLIC_FORGE_CATALOGUE = "1";
  // One copy of BouncyCastle (expo-updates and the Sparks SDK both bring one).
  const plugins = [...(config.plugins || []), "./plugins/withBouncyCastleDedupe"];
  // Run and raid clocks on the lock screen (iOS Live Activity widget extension,
  // plugins/withLiveActivity.js). The extension needs its own bundle id
  // (<app>.LiveActivity) registered under the signing team, so it is on for the
  // dev build (COSQUEST_DEV=1) and wherever LIVE_ACTIVITY=1 says the id exists.
  if (env.COSQUEST_DEV === "1" || env.LIVE_ACTIVITY === "1") plugins.push("./plugins/withLiveActivity");

  if (env.SENTRY_ORG && env.SENTRY_PROJECT) {
    plugins.push(["@sentry/react-native", { organization: env.SENTRY_ORG, project: env.SENTRY_PROJECT }]);
  }

  const projectId = config.extra?.eas?.projectId;
  const channel = env.EAS_UPDATE_CHANNEL;
  const updates =
    channel && projectId
      ? {
          enabled: true,
          url: `https://u.expo.dev/${projectId}`,
          checkAutomatically: "ON_LOAD",
          fallbackToCacheTimeout: 0,
          requestHeaders: { "expo-channel-name": channel },
        }
      : { enabled: false };

  const out = {
    ...config,
    plugins,
    updates,
    // OTA updates only reach builds with the same runtime version.
    runtimeVersion: { policy: "appVersion" },
  };
  // The public trivia web page is served by the game server's own site under a
  // path (https://<game server>/play, same origin as the API, so no CORS):
  // EXPO_WEB_BASE_URL=/play prefixes every route and asset (scripts/build-trivia-web.sh).
  const webBase = webBaseUrl(env.EXPO_WEB_BASE_URL);
  if (webBase) out.experiments = { ...(config.experiments || {}), baseUrl: webBase };
  // COSQUEST_TESTFLIGHT=1: the team's "CosQuest Beta" build (App Store Connect
  // app 6824541255, bundle com.subomi.cosquest.chat, Subomi's team P8M65P9522),
  // the same overlay the team's TestFlight builds 1 to 14 were made with
  // (~/Desktop/cosquest-expo/app.config.js, untracked there), now inside the
  // merged app: name "CosQuest", the square opaque icon, clearer permission
  // texts, the privacy manifest, no link to the team's EAS project unless
  // COSQUEST_EAS_PROJECT_ID names one this account can use, and the game on
  // the STAGING game server. Build numbers: build 14 (31 Oct) was the last
  // upload, so this branch defaults to 15 (COSQUEST_BUILD_NUMBER overrides;
  // every upload needs a new one). Android: same id, versionCode 15 (the
  // team test APK com.subomi.cosquest.chat was versionCode 1).
  //   scripts/cosquest-beta-env.sh sets the whole environment.
  if (env.COSQUEST_TESTFLIGHT === "1") return cosquestBeta(out, env);

  // COSQUEST_DEV=1: the side-by-side developer build "CosQuest Dev" for a
  // personal Android phone (as on merged-app-push-android, b4e41ed/49f2d46):
  // its own application id (COSQUEST_DEV_ANDROID_PACKAGE, default
  // com.subomi.cosquest.dev) so it installs next to the team's app, and the
  // game on the STAGING game server. Unset: app.json as is.
  if (env.COSQUEST_DEV !== "1") return out;
  const STAGING_GAME_SERVER = "https://costquest-staging.204.168.162.79.sslip.io";
  const GAME_PLUGIN = "./modules/costquest-game/plugin/withCostQuestGame";
  return {
    ...out,
    name: "CosQuest Dev",
    plugins: out.plugins.map((p) =>
      Array.isArray(p) && p[0] === GAME_PLUGIN
        ? [GAME_PLUGIN, { ...p[1], nfc: false, serverUrl: STAGING_GAME_SERVER }]
        : p,
    ),
    android: { ...config.android, package: env.COSQUEST_DEV_ANDROID_PACKAGE || "com.subomi.cosquest.dev" },
    // iOS: the same side-by-side dev app (COSQUEST_DEV_BUNDLE_ID, signed by
    // COSQUEST_DEV_TEAM when set).
    ios: {
      ...config.ios,
      bundleIdentifier: env.COSQUEST_DEV_BUNDLE_ID || "com.subomi.cosquest.dev",
      ...(env.COSQUEST_DEV_TEAM ? { appleTeamId: env.COSQUEST_DEV_TEAM } : {}),
    },
  };
};

/** "/play" from "/play", "play/" or "/play/"; "" for unset or anything that is not a plain path. */
function webBaseUrl(raw) {
  const v = String(raw || "").trim().replace(/^\/+|\/+$/g, "");
  return /^[a-z0-9][a-z0-9_-]*(\/[a-z0-9][a-z0-9_-]*)*$/i.test(v) ? `/${v}` : "";
}
module.exports.webBaseUrl = webBaseUrl;

const BETA_BUILD_NUMBER = "19";
// Build 19 on: the beta plays on PRODUCTION (scripts/cosquest-beta-env.sh sets both game-server settings).
const BETA_GAME_SERVER = "https://costquest.204.168.162.79.sslip.io";
const BETA_GAME_PLUGIN = "./modules/costquest-game/plugin/withCostQuestGame";

function cosquestBeta(config, env) {
  const extra = { ...(config.extra || {}) };
  const eas = { ...(extra.eas || {}) };
  if (env.COSQUEST_EAS_PROJECT_ID) eas.projectId = env.COSQUEST_EAS_PROJECT_ID;
  else delete eas.projectId;
  extra.eas = eas;
  const buildNumber = env.COSQUEST_BUILD_NUMBER || BETA_BUILD_NUMBER;

  // expo-image-picker writes the camera and photo texts itself, so they are set
  // on its plugin entry (an infoPlist value alone would be overwritten).
  const plugins = (config.plugins || []).map((plugin) => {
    if (Array.isArray(plugin) && plugin[0] === "expo-image-picker") {
      return [
        "expo-image-picker",
        {
          ...plugin[1],
          photosPermission: "CosQuest needs access to your photos so you can share them in chats or set a profile picture.",
          cameraPermission:
            "CosQuest uses the camera for video calls and to take photos to share in chats or as your profile picture.",
        },
      ];
    }
    if (Array.isArray(plugin) && plugin[0] === BETA_GAME_PLUGIN) {
      return [BETA_GAME_PLUGIN, { ...plugin[1], nfc: false, serverUrl: env.COSQUEST_GAME_SERVER_URL || BETA_GAME_SERVER }];
    }
    return plugin;
  });

  return {
    ...config,
    name: "CosQuest",
    plugins,
    extra,
    android: {
      ...androidWithoutTeamFirebase(config.android, env),
      package: env.COSQUEST_ANDROID_PACKAGE || "com.subomi.cosquest.chat",
      versionCode: Number(env.COSQUEST_ANDROID_VERSION_CODE || buildNumber),
    },
    ios: {
      ...config.ios,
      bundleIdentifier: env.COSQUEST_IOS_BUNDLE_ID || "com.subomi.cosquest.chat",
      appleTeamId: "P8M65P9522",
      buildNumber,
      supportsTablet: false,
      icon: "./assets/images/app-icon-ios.png",
      // The Sparks SDK checks free disk space before the model download
      // (volumeAvailableCapacityForImportantUsage), a required-reason API.
      privacyManifests: {
        NSPrivacyAccessedAPITypes: [
          { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryFileTimestamp", NSPrivacyAccessedAPITypeReasons: ["C617.1"] },
          { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryUserDefaults", NSPrivacyAccessedAPITypeReasons: ["CA92.1"] },
          { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategorySystemBootTime", NSPrivacyAccessedAPITypeReasons: ["35F9.1"] },
          { NSPrivacyAccessedAPIType: "NSPrivacyAccessedAPICategoryDiskSpace", NSPrivacyAccessedAPITypeReasons: ["E174.1"] },
        ],
      },
      infoPlist: {
        ...(config.ios && config.ios.infoPlist),
        ITSAppUsesNonExemptEncryption: false,
        NSCameraUsageDescription:
          "CosQuest uses the camera for video calls and to take photos to share in chats or as your profile picture.",
        NSMicrophoneUsageDescription: "CosQuest uses the microphone for voice and video calls and voice messages.",
        NSPhotoLibraryUsageDescription: "CosQuest needs access to your photos so you can share them in chats or set a profile picture.",
        NSLocationWhenInUseUsageDescription: "CosQuest uses your location to show quests and events near you, and to share it with friends when you choose to.",
        // Team sync (3 Nov 2026): the plugins' generic "Allow $(PRODUCT_NAME) ..."
        // texts replaced with what the app really does (the game appends its own line).
        NSLocationAlwaysAndWhenInUseUsageDescription:
          "CosQuest uses your location to show quests and events near you, and to share it with friends when you choose to.",
        NSLocationAlwaysUsageDescription:
          "CosQuest uses your location to show quests and events near you, and to share it with friends when you choose to.",
        NSMotionUsageDescription: "CosQuest uses motion while you play.",
        NSLocalNetworkUsageDescription: "CosQuest uses the local network for calls.",
        NSFaceIDUsageDescription: "CosQuest uses Face ID to keep your saved sign-in safe on this phone.",
      },
    },
  };
}

// The team's google-services.json only has a Firebase client for their own
// package (com.dammy0227.cosquest), and Gradle refuses to build another
// package with it. A beta build leaves it out unless
// COSQUEST_GOOGLE_SERVICES_FILE names one with com.subomi.cosquest.chat in it:
// without it Android has no FCM, so no push on the beta APK (the app says
// "Push registration skipped" and carries on).
function androidWithoutTeamFirebase(android, env) {
  const out = { ...(android || {}) };
  if (env.COSQUEST_GOOGLE_SERVICES_FILE) out.googleServicesFile = env.COSQUEST_GOOGLE_SERVICES_FILE;
  else delete out.googleServicesFile;
  return out;
}
