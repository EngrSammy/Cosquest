// babel-preset-expo adds the Reanimated / react-native-worklets plugin on its
// own. react-native-worklets-core (used by react-native-filament for its
// render-loop callbacks, the Forge 3D models) needs its own plugin as well.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets-core/plugin"],
  };
};
