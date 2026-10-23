import { useAppSelector } from "@/store/hooks";

export type AppColorScheme = "light" | "dark";

export function useColorScheme(): AppColorScheme {
  const savedMode = useAppSelector(
    (state) =>
      state.settings.appearance?.themeMode ??
      (state.auth.user as any)?.appearance?.themeMode,
  );

  if (typeof savedMode === "string") {
    const normalizedMode = savedMode.toLowerCase();

    if (normalizedMode === "dark") return "dark";
    if (normalizedMode === "light") return "light";
  }

  // System mode defaults to Light.
  return "light";
}
