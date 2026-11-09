// Task 059: expo-updates brings org.bouncycastle:bcprov-jdk15to18 (1.81) and
// the Sparks SDK bcprov-jdk18on (1.86): the same classes twice, which fails
// the Android build (checkReleaseDuplicateClasses). Everything moves to the
// newer jdk18on family (bcprov, bcutil, bcpkix at 1.86).
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// cosquest: one bouncycastle";
const BLOCK = `
${MARK}
configurations.all {
    resolutionStrategy.dependencySubstitution {
        substitute module("org.bouncycastle:bcprov-jdk15to18") using module("org.bouncycastle:bcprov-jdk18on:1.86")
        substitute module("org.bouncycastle:bcutil-jdk15to18") using module("org.bouncycastle:bcutil-jdk18on:1.86")
        substitute module("org.bouncycastle:bcpkix-jdk15to18") using module("org.bouncycastle:bcpkix-jdk18on:1.86")
    }
}
// Their jars each carry the same licence and OSGi files.
android {
    packaging {
        resources {
            pickFirsts += ["META-INF/LICENSE.md", "META-INF/LICENSE.txt", "META-INF/NOTICE.md", "META-INF/versions/9/OSGI-INF/MANIFEST.MF"]
        }
    }
}
`;

module.exports = function withBouncyCastleDedupe(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARK)) cfg.modResults.contents += BLOCK;
    return cfg;
  });
};
