#!/usr/bin/env node
// One-off codemod (task 059): the chat half's hex colour literals -> the
// shared tokens (theme/tokens.ts `C`), value for value, so the migration
// changes nothing on screen. The game already reads GP, which is built from
// the same palette. Pure white and black stay literals (they never change
// between palettes; dark mode maps them by role).
//
//   node scripts/tokenize-colors.js [--dry]
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIRS = ["app", "components", "constants", "context", "hooks", "services", "store", "utils", "features/world"];
const SKIP = [/components[\\/]game[\\/]/, /features[\\/]game[\\/]/, /__tests__/, /[\\/]theme[\\/]/, /constants[\\/]theme\.ts$/, /mock\w*\.ts$/];

const MAP = {
  C5399A: "brand",
  B63D91: "brandDeep",
  C34D9C: "brandSoft",
  F3DDED: "brandTint",
  DC179F: "brandVivid",
  "7D356D": "plum",
  "2A1030": "plumDark",
  "1D1020": "plumInk",
  F0EDF9: "lilac",
  191922: "ink",
  "24283C": "inkNavy",
  "2B2B2C": "inkSoft",
  "3B3B42": "ink2",
  "9C9CAA": "muted",
  "66738A": "slate",
  "8A8A90": "grey1",
  "8A8A93": "grey2",
  "6B6B72": "grey3",
  "7A7A84": "grey4",
  777780: "grey5",
  "9AA3B5": "placeholder",
  D64545: "danger",
  C0394B: "dangerDeep",
  B42318: "dangerInk",
  "2A8A92": "teal",
  F6F9FE: "skyPale",
  E3F0FC: "skyPale2",
  E1F3FF: "skyWash",
};

const dry = process.argv.includes("--dry");

function walk(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

const files = DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).filter((f) => !SKIP.some((re) => re.test(f)));
const hex = Object.keys(MAP).join("|");
const attrRe = new RegExp(`([A-Za-z]+)=(["'])#(${hex})\\2`, "gi");
const litRe = new RegExp(`(["'])#(${hex})\\1`, "gi");
const importRe = /^(import\s[^;]*?from\s*["'][^"']+["']|import\s*["'][^"']+["']);?[ \t]*$/gm;

let total = 0;
const perFile = [];
for (const file of files) {
  const src = fs.readFileSync(file, "utf8");
  // A file with its own `C` gets the tokens as TC.
  const own = /\b(const|let|var|function|class)\s+C\b|[{,]\s*C\s*[,}]|\bC\s*=/.test(src);
  const id = own ? "TC" : "C";
  let n = 0;
  let out = src.replace(attrRe, (_m, attr, _q, h) => {
    n += 1;
    return `${attr}={${id}.${MAP[h.toUpperCase()]}}`;
  });
  out = out.replace(litRe, (_m, _q, h) => {
    n += 1;
    return `${id}.${MAP[h.toUpperCase()]}`;
  });
  if (!n) continue;
  const line = own ? 'import { C as TC } from "@/theme/tokens";' : 'import { C } from "@/theme/tokens";';
  let last = null;
  for (const m of out.matchAll(importRe)) last = m;
  if (last) {
    const at = last.index + last[0].length;
    out = `${out.slice(0, at)}\n${line}${out.slice(at)}`;
  } else {
    out = `${line}\n${out}`;
  }
  total += n;
  perFile.push([path.relative(ROOT, file), n]);
  if (!dry) fs.writeFileSync(file, out);
}
perFile.sort((a, b) => b[1] - a[1]);
for (const [f, n] of perFile) console.log(`${String(n).padStart(4)}  ${f}`);
console.log(`${total} literals in ${perFile.length} files${dry ? " (dry run)" : ""}`);
