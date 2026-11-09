// Web stand-in for @borndotcom/react-native-godot (the 3D fight, cq 061):
// Godot runs only in the phone apps. features/game3d/engine.ts never loads
// the library on the web; this keeps the web bundle from pulling in the
// native module all the same.
export const RTNGodot = null;
export const RTNGodotView = null;
export function runOnGodotThread(): Promise<never> {
  return Promise.reject(new Error("Godot is not available on the web."));
}
