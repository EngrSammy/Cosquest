import assert from "node:assert/strict";
import { test } from "node:test";

import { SITE_REALM_LINE, siteArriveLine, siteAttribution, siteIdOf, siteLegend, siteSubtitle, type WardenFacts } from "../wardenSite.ts";

// The shape staging served for Sam Wanamaker Playhouse (3 Nov 2026), trimmed.
const SAM: WardenFacts = {
  site_id: "65119c46-8a0b-4a3f-87cc-47915cac4b35",
  point_id: "W65119c468a0b4a3f",
  version: 1,
  name: "Sam Wanamaker Playhouse",
  narration: {
    facts: { fact: "The Sam Wanamaker Playhouse is an indoor theatre", kind: "theatre", fact2: "It forms part of the Shakespeare's Globe complex", place: "Sam Wanamaker Playhouse" },
    fallback_lines: { arrive: "You have reached Sam Wanamaker Playhouse. The Sam Wanamaker Playhouse is an indoor theatre." },
  },
  facts_detail: [{ id: "f1", text: "This place is called Sam Wanamaker Playhouse.", source: "osm", url: "https://www.openstreetmap.org/" }],
  attribution: ["© OpenStreetMap contributors", "Wikipedia, CC BY-SA 4.0"],
};

test("only a published Warden point names its site", () => {
  assert.equal(siteIdOf({ source: "warden", extra: { "warden.site": SAM.site_id } }), SAM.site_id);
  assert.equal(siteIdOf({ source: "landmark", extra: { "warden.site": SAM.site_id } }), null);
  assert.equal(siteIdOf({ source: "warden", extra: {} }), null);
  assert.equal(siteIdOf({ source: "warden", extra: { "warden.site": "../../admin" } }), null);
  assert.equal(siteIdOf(null), null);
});

test("the Warden arrives with the server's line, written from the checked facts", () => {
  assert.equal(siteArriveLine(SAM), "You have reached Sam Wanamaker Playhouse. The Sam Wanamaker Playhouse is an indoor theatre.");
  assert.equal(siteArriveLine({ ...SAM, narration: null }), null);
});

test("the card shows the facts as sentences, and fits", () => {
  assert.equal(siteLegend(SAM), "The Sam Wanamaker Playhouse is an indoor theatre. It forms part of the Shakespeare's Globe complex.");
  assert.equal(siteLegend(SAM, 60), "The Sam Wanamaker Playhouse is an indoor theatre.");
  assert.equal(siteLegend({ ...SAM, narration: { facts: {} } }), null);
  const long = siteLegend({ ...SAM, narration: { facts: { fact: "x".repeat(400) } } });
  assert.ok(long && long.length === 180 && long.endsWith("…"));
});

test("the facts' licences are credited, and the copy says the questions are about the place", () => {
  assert.equal(siteAttribution(SAM), "Facts: © OpenStreetMap contributors · Wikipedia, CC BY-SA 4.0");
  assert.equal(siteAttribution({ ...SAM, attribution: [] }), null);
  assert.match(siteSubtitle({ challenge: "blitz" }), /against the clock/);
  assert.match(siteSubtitle({ challenge: "trivia" }), /question about this place/);
  assert.equal(SITE_REALM_LINE, "Questions about this place");
});
