// Maestro side of e2e/seed/peer-server.js: act as another seeded person.
//   - runScript:
//       file: scripts/peer.js
//       env: { ARGS: "bo|send|ada|Hello there", BG: "false" }
// ARGS is peer.js's arguments joined with "|". BG "true" returns at once.
var res = http.post("http://127.0.0.1:4130/run", {
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ args: ARGS.split("|"), background: typeof BG !== "undefined" && BG === "true" }),
});
var out = json(res.body);
output.peer = out;
if (out.code !== null && out.code !== 0) {
  throw new Error("peer " + ARGS + " failed: " + out.stderr);
}
