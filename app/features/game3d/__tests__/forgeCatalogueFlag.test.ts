// Build 18 regression: the hero must hold the Forge weapon the player equipped.
// That needs this build's half of the catalogue link (EXPO_PUBLIC_FORGE_CATALOGUE)
// and the server's forge_world. TestFlight builds 15 to 17 were made with
// scripts/cosquest-beta-env.sh, which never set the flag, and unset meant off,
// so the fight showed the starter weapon. Now unset means on (the server
// decides), and every build environment names it anyway.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, it } from "node:test";

import { appCatalogueFlag, catalogueOn } from "../held.ts";

const ROOT = path.join(import.meta.dirname, "..", "..", "..");
const require = createRequire(import.meta.url);

describe("the Forge catalogue link in every build", () => {
  it("is on unless a build says otherwise", () => {
    assert.equal(appCatalogueFlag(undefined), true);
    assert.equal(appCatalogueFlag(""), true);
    assert.equal(appCatalogueFlag("1"), true);
    assert.equal(appCatalogueFlag("0"), false);
    assert.equal(appCatalogueFlag("off"), false);
    // The server's forge_world is still the switch.
    assert.equal(catalogueOn(appCatalogueFlag(undefined), false), false);
    assert.equal(catalogueOn(appCatalogueFlag(undefined), true), true);
  });

  it("the TestFlight environment names it", () => {
    const out = execFileSync("bash", ["-c", 'env -i PATH="$PATH" bash -c \'source scripts/cosquest-beta-env.sh; echo "$EXPO_PUBLIC_FORGE_CATALOGUE"\''], { cwd: ROOT }).toString().trim();
    assert.equal(out, "1");
  });

  it("app.config.js turns it on when a build environment leaves it out", () => {
    const appConfig = require(path.join(ROOT, "app.config.js"));
    const base = require(path.join(ROOT, "app.json")).expo;
    const saved = process.env.EXPO_PUBLIC_FORGE_CATALOGUE;
    delete process.env.EXPO_PUBLIC_FORGE_CATALOGUE;
    try {
      appConfig({ config: base });
      assert.equal(process.env.EXPO_PUBLIC_FORGE_CATALOGUE, "1");
      process.env.EXPO_PUBLIC_FORGE_CATALOGUE = "0";
      appConfig({ config: base });
      assert.equal(process.env.EXPO_PUBLIC_FORGE_CATALOGUE, "0");
    } finally {
      if (saved === undefined) delete process.env.EXPO_PUBLIC_FORGE_CATALOGUE;
      else process.env.EXPO_PUBLIC_FORGE_CATALOGUE = saved;
    }
  });

  it("every EAS profile names it", () => {
    const eas = JSON.parse(readFileSync(path.join(ROOT, "eas.json"), "utf8"));
    for (const [name, profile] of Object.entries(eas.build) as [string, { env?: Record<string, string> }][]) {
      assert.equal(profile.env?.EXPO_PUBLIC_FORGE_CATALOGUE, "1", name);
    }
  });
});
