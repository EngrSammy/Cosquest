// WEB ONLY - small browser style fixes, loaded once from app/_layout.tsx.
// (The phone version, webGlobalStyles.ts, does nothing.)
const CSS = `
/* Mouse/touch clicks: no focus outline around buttons.
   Keyboard (Tab) users still get it - :focus-visible - for accessibility. */
:focus:not(:focus-visible) { outline: none; }

/* Text boxes: no blue browser outline (the app has its own styling). */
input:focus, textarea:focus { outline: none; }

/* No grey flash when tapping on phone browsers (e.g. iPhone Safari). */
* { -webkit-tap-highlight-color: transparent; }
`;

if (typeof document !== "undefined" && !document.getElementById("cosquest-web-styles")) {
  const style = document.createElement("style");
  style.id = "cosquest-web-styles";
  style.textContent = CSS;
  document.head.appendChild(style);
}

export {};
