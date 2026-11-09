// Reanimated 4.5.1 on the web: after a custom Keyframe ENTERING animation, its
// cleanup timer called setElementPosition() on the live element, which made it
// position:absolute with a frozen box. Everything laid out after it then
// overlapped it (5 Nov 2026: a trivia verdict's "No points" sat on top of
// "1 of 4 in the right place." and the Next button rode up). Every pop-in
// built with sheetMotion's popIn() and every Keyframe in Hud/DuelResult did
// the same on the web. patches/react-native-reanimated+4.5.1.patch makes the
// cleanup record the snapshot instead; this checks the installed copy has it.
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const files = [
  "node_modules/react-native-reanimated/src/layoutReanimation/web/componentUtils.ts",
  "node_modules/react-native-reanimated/lib/module/layoutReanimation/web/componentUtils.js",
];

function cleanupBlock(src) {
  const at = src.indexOf("scheduleAnimationCleanup(animationName");
  assert.ok(at > 0, "scheduleAnimationCleanup call not found (Reanimated changed: re-check the patch)");
  return src.slice(at, src.indexOf("});", at));
}

describe("react-native-reanimated web entering cleanup", () => {
  it("is patched in the repo", () => {
    assert.ok(fs.existsSync(path.join(root, "patches", "react-native-reanimated+4.5.1.patch")));
  });
  for (const f of files) {
    it(`never moves the live element: ${path.basename(path.dirname(path.dirname(path.dirname(f))))}/${path.basename(f)}`, () => {
      const block = cleanupBlock(fs.readFileSync(path.join(root, f), "utf8"));
      assert.ok(!block.includes("setElementPosition("), "the entering cleanup still calls setElementPosition");
      assert.ok(block.includes("saveSnapshot(element)"));
    });
  }
});
