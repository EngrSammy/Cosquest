// WEBSITE: no browser scroll bars. Every list and page still scrolls (mouse
// wheel, trackpad, touch, keyboard); only the grey bar is hidden.
if (typeof document !== "undefined" && !document.getElementById("cq-hide-scrollbars")) {
  const style = document.createElement("style");
  style.id = "cq-hide-scrollbars";
  style.textContent = [
    "* { scrollbar-width: none; -ms-overflow-style: none; }",
    "*::-webkit-scrollbar { width: 0 !important; height: 0 !important; display: none; }",
  ].join("\n");
  document.head.appendChild(style);
}
export {};
