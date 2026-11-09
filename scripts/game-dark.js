#!/usr/bin/env node
// One-off codemod (task 059): the game follows dark mode the way the chat
// does (constants/chatTheme.ts). Each game file's `StyleSheet.create` becomes
// `themedStyles` (the light sheet as written, plus a dark copy mapped by
// role), and each component that reads `styles` picks the one for the
// current scheme with `useThemedStyles`. Light mode is unchanged.
//   node scripts/game-dark.js [--dry]
const fs = require("fs");
const path = require("path");

const DIR = path.resolve(__dirname, "../components/game");
const SKIP = new Set(["kit.tsx", "theme.ts", "Sheet.tsx"]);
const dry = process.argv.includes("--dry");
const IMPORT = 'import { themedStyles, useThemedStyles } from "@/constants/chatTheme";';

function bodyStart(src, from) {
  // from: index just after "function Name"; skip the params (balanced parens), then the first "{".
  let i = src.indexOf("(", from);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.indexOf("{", i);
}

function blockEnd(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

let changed = 0;
for (const name of fs.readdirSync(DIR)) {
  if (!name.endsWith(".tsx") || SKIP.has(name)) continue;
  const file = path.join(DIR, name);
  let src = fs.readFileSync(file, "utf8");
  if ((src.match(/const styles = StyleSheet\.create\(/g) || []).length !== 1) continue;
  src = src.replace("const styles = StyleSheet.create(", "const STYLE_PAIR = themedStyles(");
  const fnRe = /(?:^|\n)(?:export (?:default )?)?function ([A-Z]\w*)/g;
  const inserts = [];
  let m;
  while ((m = fnRe.exec(src))) {
    const open = bodyStart(src, m.index + m[0].length);
    const close = blockEnd(src, open);
    if (/\bstyles\./.test(src.slice(open, close))) inserts.push(open + 1);
  }
  // memo(function Name(...) / forwardRef(function Name(...)
  const wrapRe = /(?:memo|forwardRef)\(function ([A-Z]\w*)/g;
  while ((m = wrapRe.exec(src))) {
    const open = bodyStart(src, m.index + m[0].length);
    const close = blockEnd(src, open);
    if (/\bstyles\./.test(src.slice(open, close)) && !inserts.includes(open + 1)) inserts.push(open + 1);
  }
  for (const at of inserts.sort((a, b) => b - a)) {
    src = `${src.slice(0, at)}\n  const styles = useThemedStyles(STYLE_PAIR);${src.slice(at)}`;
  }
  // the import, after the last import
  const imports = [...src.matchAll(/^(import\s[^;]*?from\s*["'][^"']+["']|import\s*["'][^"']+["']);?[ \t]*$/gm)];
  const last = imports[imports.length - 1];
  const at = last.index + last[0].length;
  src = `${src.slice(0, at)}\n${IMPORT}${src.slice(at)}`;
  changed += 1;
  if (!dry) fs.writeFileSync(file, src);
  console.log(`${String(inserts.length).padStart(3)} components  ${name}`);
}
console.log(`${changed} files`);
