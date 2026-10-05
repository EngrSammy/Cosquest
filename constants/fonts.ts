// POPPINS (from the Figma) - loaded once in app/_layout.tsx.
// With a custom font, each weight is its own font name, so use these
// instead of fontWeight (fontWeight doesn't switch Poppins weights on
// Android).
export const FONTS = {
  regular: "Poppins_400Regular",
  medium: "Poppins_500Medium",
  semibold: "Poppins_600SemiBold",
  bold: "Poppins_700Bold",
  extrabold: "Poppins_800ExtraBold",
} as const;
