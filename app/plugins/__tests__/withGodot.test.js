// The Godot config plugin (cq 061): MainActivity starts the Godot host after
// super.onCreate (Android 10+ only), once; one libc++_shared.so is packaged.
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const { mergeList, patchMainActivity, setPickFirsts } = require("../withGodot");

const ACTIVITY = `package com.x
class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    SplashScreenManager.registerOnActivity(this)
    super.onCreate(null)
  }
}
`;

describe("patchMainActivity", () => {
  it("starts the Godot host right after super.onCreate, on API 29+", () => {
    const out = patchMainActivity(ACTIVITY);
    const lines = out.split("\n");
    const sup = lines.findIndex((l) => l.includes("super.onCreate(null)"));
    assert.match(lines[sup + 1], /\[withGodot\]/);
    assert.ok(out.includes("if (android.os.Build.VERSION.SDK_INT >= 29) {"));
    assert.ok(out.includes("    com.rtngodot.RTNLibGodot.getInstance().init(this)"));
    assert.ok(out.indexOf("RTNLibGodot") > out.indexOf("super.onCreate(null)"));
  });

  it("is idempotent", () => {
    const once = patchMainActivity(ACTIVITY);
    assert.equal(patchMainActivity(once), once);
  });

  it("refuses an activity it does not understand", () => {
    assert.throws(() => patchMainActivity("class MainActivity {}"), /super\.onCreate/);
  });
});

describe("pickFirsts", () => {
  it("adds libc++_shared.so once, keeping what is there", () => {
    assert.equal(mergeList("", ["**/libc++_shared.so"]), "**/libc++_shared.so");
    assert.equal(mergeList("a, **/libc++_shared.so", ["**/libc++_shared.so"]), "a,**/libc++_shared.so");
    const props = [{ type: "property", key: "android.packagingOptions.pickFirsts", value: "**/x.so" }];
    setPickFirsts(props);
    setPickFirsts(props);
    assert.equal(props.length, 1);
    assert.equal(props[0].value, "**/x.so,**/libc++_shared.so");
    const fresh = setPickFirsts([{ type: "comment", value: "c" }]);
    assert.deepEqual(fresh[1], { type: "property", key: "android.packagingOptions.pickFirsts", value: "**/libc++_shared.so" });
  });
});
