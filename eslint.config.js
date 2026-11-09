// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "modules/*/android/build/*"],
  },
  {
    // Expo config plugins run in Node (CommonJS).
    files: ["modules/*/plugin/**/*.js"],
    languageOptions: { globals: { __dirname: "readonly", __filename: "readonly" } },
  },
  {
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/preserve-manual-memoization": "off",
    },
  },
]);
