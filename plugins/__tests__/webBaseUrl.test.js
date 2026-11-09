// The public trivia web page lives under the game server's own site
// (https://<game server>/play, same origin as the API): EXPO_WEB_BASE_URL sets
// Expo's experiments.baseUrl so every route and asset carries the prefix.
const assert = require("node:assert/strict");
const { describe, it } = require("node:test");
const path = require("node:path");

const appConfig = require(path.join(__dirname, "..", "..", "app.config.js"));
const base = require(path.join(__dirname, "..", "..", "app.json")).expo;

function withEnv(env, fn) {
  const saved = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe("web base path", () => {
  it("normalises a plain path and refuses anything else", () => {
    const { webBaseUrl } = appConfig;
    assert.equal(webBaseUrl("/play"), "/play");
    assert.equal(webBaseUrl("play/"), "/play");
    assert.equal(webBaseUrl("/a/b"), "/a/b");
    for (const bad of [undefined, "", "/", "https://x.io/play", "../x", "pl ay", "/play?x"]) {
      assert.equal(webBaseUrl(bad), "", String(bad));
    }
  });

  it("sets experiments.baseUrl only when asked, keeping the other experiments", () => {
    const on = withEnv({ EXPO_WEB_BASE_URL: "/play" }, () => appConfig({ config: base }));
    assert.equal(on.experiments.baseUrl, "/play");
    assert.equal(on.experiments.typedRoutes, base.experiments.typedRoutes);
    const off = withEnv({ EXPO_WEB_BASE_URL: undefined }, () => appConfig({ config: base }));
    assert.equal(off.experiments.baseUrl, undefined);
  });
});

// The trivia web build runs in a clean environment (only what it names is
// inlined into the public page). Its first build left out EXPO_PUBLIC_API_URL,
// which services/api.ts requires when it is imported, and the page was blank.
describe("scripts/build-trivia-web.sh", () => {
  const fs = require("node:fs");
  const root = path.join(__dirname, "..", "..");
  const script = fs.readFileSync(path.join(root, "scripts", "build-trivia-web.sh"), "utf8");
  it("passes every EXPO_PUBLIC_* the app refuses to load without", () => {
    const required = [];
    for (const dir of ["services", "features", "components", "app", "constants", "utils", "store"]) {
      const walk = (d) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const f = path.join(d, e.name);
          if (e.isDirectory()) {
            if (e.name !== "__tests__" && e.name !== "node_modules") walk(f);
          } else if (/\.(ts|tsx|js)$/.test(e.name)) {
            // A module that throws at import time when a variable is unset.
            const src = fs.readFileSync(f, "utf8");
            for (const m of src.matchAll(/^\s*throw new Error\(["'`](EXPO_PUBLIC_[A-Z0-9_]+) is not configured/gm)) required.push(m[1]);
          }
        }
      };
      if (fs.existsSync(path.join(root, dir))) walk(path.join(root, dir));
    }
    assert.ok(required.includes("EXPO_PUBLIC_API_URL"), "the scan finds services/api.ts");
    for (const v of new Set(required)) assert.match(script, new RegExp(`${v}=`), `${v} is not passed to the web build`);
  });
});
