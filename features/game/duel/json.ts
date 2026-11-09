// A small strict JSON parser that keeps big integers exact.
//
// The duel's seed is a 62-bit integer; JSON.parse turns it into the nearest
// double, which is a different seed and a different fight. This parser returns
// an integer literal outside Number's safe range as a BigInt and everything
// else exactly as JSON.parse would. (Hermes has no JSON.parse source access.)

import { DuelFormatError } from "./errors.ts";

export function parseJsonExact(text: string): unknown {
  let i = 0;
  const n = text.length;

  const fail = (what: string): never => {
    throw new DuelFormatError(`invalid JSON at ${i}: ${what}`);
  };
  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09) i++;
      else break;
    }
  };

  const str = (): string => {
    i++; // opening quote
    let out = "";
    let start = i;
    while (true) {
      if (i >= n) fail("unterminated string");
      const c = text.charCodeAt(i);
      if (c === 0x22) {
        out += text.slice(start, i);
        i++;
        return out;
      }
      if (c < 0x20) fail("control character in string");
      if (c === 0x5c) {
        out += text.slice(start, i);
        const e = text[i + 1];
        i += 2;
        switch (e) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad \\u escape");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail("bad escape");
        }
        start = i;
        continue;
      }
      i++;
    }
  };

  const num = (): number | bigint => {
    const m = /^-?(?:0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(text.slice(i, i + 400));
    if (!m) return fail("bad number");
    i += m[0].length;
    const v = Number(m[0]);
    if (m[1] === undefined && m[2] === undefined && !Number.isSafeInteger(v)) return BigInt(m[0]);
    return v;
  };

  const value = (): unknown => {
    ws();
    if (i >= n) fail("unexpected end");
    const c = text[i];
    if (c === "{") {
      i++;
      const o: Record<string, unknown> = {};
      ws();
      if (text[i] === "}") {
        i++;
        return o;
      }
      while (true) {
        ws();
        if (text[i] !== '"') fail("expected a key");
        const k = str();
        ws();
        if (text[i] !== ":") fail("expected ':'");
        i++;
        const v = value();
        // Like JSON.parse: a repeated key keeps the last value.
        Object.defineProperty(o, k, { value: v, writable: true, enumerable: true, configurable: true });
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return o;
        }
        fail("expected ',' or '}'");
      }
    }
    if (c === "[") {
      i++;
      const a: unknown[] = [];
      ws();
      if (text[i] === "]") {
        i++;
        return a;
      }
      while (true) {
        a.push(value());
        ws();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return a;
        }
        fail("expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    if (text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    return num();
  };

  const v = value();
  ws();
  if (i !== n) fail("trailing characters");
  return v;
}
