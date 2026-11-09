#!/usr/bin/env node
// Task 059: a production build must not carry a raw-IP or plain-http
// host (a Render host only warns). Run by EAS before installing (package.json "eas-build-pre-install")
// and by scripts/verify-ios.sh. Only the production profile is checked; every
// other build (preview, the emulator builds, dev) passes.
//
//   EAS_BUILD_PROFILE=production node scripts/check-release-env.js
//
// The hosts come from EAS environment variables for the "production"
// environment (eas.json), never from the repo. ALLOW_RAW_HOSTS=1 skips the
// check for an emergency build (say so in the release notes).
const profile = process.env.EAS_BUILD_PROFILE || "";
if (profile !== "production") {
  console.log(`release env: not a production build (${profile || "local"}), nothing to check`);
  process.exit(0);
}
if (process.env.ALLOW_RAW_HOSTS === "1") {
  console.log("release env: ALLOW_RAW_HOSTS=1, check skipped");
  process.exit(0);
}

const problems = [];
function check(name, { required }) {
  const value = (process.env[name] || "").trim();
  if (!value) {
    if (required) problems.push(`${name} is not set`);
    return;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    problems.push(`${name} is not a URL`);
    return;
  }
  if (url.protocol !== "https:") problems.push(`${name} is not https (${value})`);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname) || /\d{1,3}-?\.\d{1,3}\.\d{1,3}\.\d{1,3}\.sslip\.io$/.test(url.hostname) || /sslip\.io$|nip\.io$/.test(url.hostname)) {
    problems.push(`${name} is a raw-IP host (${url.hostname})`);
  }
  // The team ships its chat API on Render (EngrSammy/Cosquest eas.json), so a
  // Render host is a warning, not a refusal (team sync, 3 Nov 2026).
  if (/onrender\.com$/.test(url.hostname)) console.warn(`release env: ${name} is a Render host (${url.hostname})`);
}

check("EXPO_PUBLIC_API_URL", { required: true });
// The game server: unset means the built-in production URL, which today is a
// raw-IP sslip.io host (features/game/config.ts), so a store build must name one.
if (!process.env.EXPO_PUBLIC_GAME_SERVER || process.env.EXPO_PUBLIC_GAME_SERVER === "production") {
  problems.push("EXPO_PUBLIC_GAME_SERVER is unset: the built-in production game host is a raw-IP sslip.io address");
} else if (process.env.EXPO_PUBLIC_GAME_SERVER !== "staging") {
  check("EXPO_PUBLIC_GAME_SERVER", { required: true });
}
for (const name of ["EXPO_PUBLIC_WEB_URL", "EXPO_PUBLIC_TERMS_URL", "EXPO_PUBLIC_PRIVACY_URL", "EXPO_PUBLIC_GUIDELINES_URL", "EXPO_PUBLIC_CONFIG_URL"]) {
  check(name, { required: false });
}

if (problems.length) {
  console.error("release env: refusing a production build:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log("release env: ok");
