// How far text may grow with the phone's text size (iOS Dynamic Type, Android
// font size), app-wide. 1.3x keeps every screen readable at the largest
// standard sizes without breaking fixed layouts (cards, pills, bubbles); the
// game caps its own text at 1.4 (components/game/kit.tsx MAX_FONT_SCALE) and
// the tab labels at 1.15. A Text or TextInput that sets maxFontSizeMultiplier
// itself keeps its own value.
//
// Metro (metro.config.js) resolves React Native's Text and TextInput to the
// two files next to this one on Android and iOS, so the default applies to
// every Text in the app and in libraries, without touching each screen:
// React 19 no longer reads defaultProps on function components.
export const MAX_TEXT_SCALE = 1.3;

export function withTextCap<P extends { maxFontSizeMultiplier?: number | null }>(props: P): P {
  return props.maxFontSizeMultiplier === undefined ? { ...props, maxFontSizeMultiplier: MAX_TEXT_SCALE } : props;
}
