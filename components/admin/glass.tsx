// ==========================================
// ADMIN GLASS: the frosted look (website only)
// ==========================================
// The colours are in ./theme.ts (GLASS). This adds what styles alone can't
// on the web: the glowing background, the frosted blur behind panels, soft
// shadows and the pink gradient on main buttons. It's one small style sheet,
// added once, that only applies to elements marked with glass("...").
//   glass("page")  the background with pink, violet and teal glows
//   glass("nav")   the floating sidebar
//   glass("bar")   the top bar
//   glass("panel") cards and panels
//   glass("pop")   drop-down menus (stronger blur)
//   glass("cta")   main buttons (pink gradient + glow)
import { useEffect } from "react";
import { Platform } from "react-native";

const CSS = `
[data-glass="page"]{background-color:#120E1F;background-image:radial-gradient(circle at 12% 18%,rgba(195,77,156,0.55),transparent 32%),radial-gradient(circle at 88% 12%,rgba(112,86,214,0.45),transparent 30%),radial-gradient(circle at 70% 92%,rgba(46,160,170,0.35),transparent 34%);background-attachment:fixed}
[data-glass="nav"],[data-glass="bar"],[data-glass="panel"]{-webkit-backdrop-filter:blur(20px) saturate(140%);backdrop-filter:blur(20px) saturate(140%)}
[data-glass="nav"]{box-shadow:0 20px 50px rgba(0,0,0,0.25)}
[data-glass="panel"]{box-shadow:0 18px 44px rgba(0,0,0,0.18)}
[data-glass="pop"]{-webkit-backdrop-filter:blur(26px);backdrop-filter:blur(26px);box-shadow:0 24px 60px rgba(0,0,0,0.45)}
[data-glass="cta"]{background-image:linear-gradient(135deg,#E05BB7,#C34D9C);box-shadow:0 10px 24px rgba(195,77,156,0.45)}
`;

/** Adds the glass style sheet once (website). Call it in the admin's screens. */
export function useGlassStyles() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    if (document.getElementById("cq-admin-glass")) return;
    const sheet = document.createElement("style");
    sheet.id = "cq-admin-glass";
    sheet.textContent = CSS;
    document.head.appendChild(sheet);
  }, []);
}

/** Props that mark a View as a glass element: <View {...glass("panel")} /> */
export function glass(kind: "page" | "nav" | "bar" | "panel" | "pop" | "cta"): object {
  return Platform.OS === "web" ? ({ dataSet: { glass: kind } } as object) : {};
}
