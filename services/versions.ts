// Version maths for the force-update check (pure, tested).

/** "1.2.10" vs "1.2.9" -> 1 (numeric, by part). */
export function compareVersions(a: string, b: string): number {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export type RemoteConfig = { minVersion?: string; latestVersion?: string; storeUrl?: string; message?: string };

/**
 * What the app should do with a remote config. Fails open: anything missing
 * or malformed is "ok", so a broken config file never locks anyone out.
 */
export function updateVerdict(installed: string, config: unknown): "ok" | "suggest" | "force" {
  if (!config || typeof config !== "object") return "ok";
  const { minVersion, latestVersion } = config as RemoteConfig;
  const valid = (v: unknown): v is string => typeof v === "string" && /^\d+(\.\d+)*$/.test(v.trim());
  if (valid(minVersion) && compareVersions(installed, minVersion) < 0) return "force";
  if (valid(latestVersion) && compareVersions(installed, latestVersion) < 0) return "suggest";
  return "ok";
}
