// iOS SCENE LIFECYCLE
// iOS 27 stops apps that don't use "scenes" (UIScene) at launch, before any
// of our code runs. Expo's AppDelegate template still creates the window in
// application(_:didFinishLaunchingWithOptions:), so this plugin:
//  1. adds UIApplicationSceneManifest to Info.plist (one window scene), and
//  2. moves the window + React Native start into a SceneDelegate, which also
//     forwards links (deep links, universal links, Google / Apple sign-in
//     callbacks) to the AppDelegate exactly as before.
// Works on every iOS version the app supports (scenes exist since iOS 13).
const { withAppDelegate, withInfoPlist } = require("@expo/config-plugins");

const MARK = "// [withSceneLifecycle]";

const SCENE_DELEGATE = `

${MARK} The window lives in a scene (required on iOS 27).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate,
          let factory = appDelegate.reactNativeFactory else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)

    // A link or sign-in callback that launched the app.
    for context in connectionOptions.urlContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
    for activity in connectionOptions.userActivities {
      _ = appDelegate.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
  }

  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: [:])
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}
`;

function patchAppDelegate(src) {
  if (src.includes(MARK)) return src;

  // Keep the launch options for the scene; don't create the window here.
  const start = /#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\(\n\s*withModuleName: "main",\n\s*in: window,\n\s*launchOptions: launchOptions\)\n#endif/;
  if (!start.test(src)) {
    throw new Error("withSceneLifecycle: AppDelegate.swift doesn't match the Expo template it expects; update the plugin.");
  }
  src = src.replace(
    start,
    `    ${MARK} The window and React Native start in SceneDelegate.\n    self.launchOptions = launchOptions`,
  );
  src = src.replace(
    "  var reactNativeFactory: RCTReactNativeFactory?\n",
    "  var reactNativeFactory: RCTReactNativeFactory?\n  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n",
  );
  return src + SCENE_DELEGATE;
}

module.exports = function withSceneLifecycle(config) {
  config = withInfoPlist(config, (c) => {
    c.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: "Default Configuration",
            UISceneDelegateClassName: "$(PRODUCT_MODULE_NAME).SceneDelegate",
          },
        ],
      },
    };
    return c;
  });
  return withAppDelegate(config, (c) => {
    if (c.modResults.language !== "swift") {
      throw new Error("withSceneLifecycle: expects a Swift AppDelegate.");
    }
    c.modResults.contents = patchAppDelegate(c.modResults.contents);
    return c;
  });
};
