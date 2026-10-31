// ==========================================
// SUPER ADMIN DASHBOARD - shared pieces
// ==========================================
// Cards, stat cards, charts (SVG), pills, buttons and formatting, in the
// "Community administration" designs' style. Used by every admin page.
import { Ionicons } from "@expo/vector-icons";
import { type ReactNode, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, type ViewStyle } from "react-native";
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";

import { FONTS } from "@/constants/fonts";

import { type AdminTheme, useAdminTheme } from "./theme";

// ---------- formatting ----------
export const formatNumber = (value: number | null | undefined) => (value == null ? "—" : value.toLocaleString("en-US"));

export function timeAgo(iso: string | Date | null | undefined) {
  if (!iso) return "";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function initials(name?: string | null) {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : (parts[0] || "?").slice(0, 2)).toUpperCase();
}

// ---------- layout ----------
export function Card({ children, style, padded = true }: { children: ReactNode; style?: ViewStyle; padded?: boolean }) {
  const t = useAdminTheme();
  return (
    <View style={[{ backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.border, ...(padded ? { padding: 20 } : null) }, style]}>
      {children}
    </View>
  );
}

export function CardHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  const t = useAdminTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontFamily: FONTS.medium, fontSize: 16, color: t.text }}>{title}</Text>
        {subtitle ? <Text style={{ marginTop: 3, fontFamily: FONTS.regular, fontSize: 12.5, color: t.muted }}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function PageHeader({ title, subtitle, badge, right }: { title: string; subtitle: string; badge?: ReactNode; right?: ReactNode }) {
  const t = useAdminTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 22 }}>
      <View style={{ flex: 1, minWidth: 280 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Text style={{ fontFamily: FONTS.regular, fontSize: 30, color: t.text }}>{title}</Text>
          {badge}
        </View>
        <Text style={{ marginTop: 6, fontFamily: FONTS.regular, fontSize: 13.5, color: t.muted }}>{subtitle}</Text>
      </View>
      {right ? <View style={{ flexDirection: "row", gap: 10 }}>{right}</View> : null}
    </View>
  );
}

// ---------- small pieces ----------
type Tone = "pink" | "green" | "amber" | "blue" | "red" | "grey";

function toneColors(t: AdminTheme, tone: Tone) {
  switch (tone) {
    case "green":
      return { bg: t.greenSoft, fg: t.green };
    case "amber":
      return { bg: t.amberSoft, fg: t.amber };
    case "blue":
      return { bg: t.blueSoft, fg: t.blue };
    case "red":
      return { bg: t.redSoft, fg: t.red };
    case "grey":
      return { bg: t.cardSoft, fg: t.muted };
    default:
      return { bg: t.pinkSoft, fg: t.pinkText };
  }
}

export function Pill({ label, tone = "pink", dot }: { label: string; tone?: Tone; dot?: boolean }) {
  const t = useAdminTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: c.bg }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.fg }} /> : null}
      <Text style={{ fontFamily: FONTS.medium, fontSize: 11.5, color: c.fg }}>{label}</Text>
    </View>
  );
}

export function Initials({ name, size = 34, tone = "pink" }: { name?: string | null; size?: number; tone?: Tone }) {
  const t = useAdminTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}>
      <Text style={{ fontFamily: FONTS.medium, fontSize: size * 0.32, color: c.fg }}>{initials(name)}</Text>
    </View>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = "secondary",
  disabled,
  loading,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  variant?: "primary" | "secondary" | "ghost";
  disabled?: boolean;
  loading?: boolean;
}) {
  const t = useAdminTheme();
  const primary = variant === "primary";
  const ghost = variant === "ghost";
  const fg = primary ? "#FFFFFF" : ghost ? t.pinkText : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      style={({ hovered }: any) => ({
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: 38,
        paddingHorizontal: ghost ? 4 : 14,
        borderRadius: 10,
        borderWidth: primary || ghost ? 0 : 1,
        borderColor: t.border,
        backgroundColor: primary ? t.pink : ghost ? "transparent" : hovered ? t.cardSoft : t.card,
        opacity: disabled ? 0.5 : hovered && primary ? 0.92 : 1,
      })}>
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Ionicons name={icon} size={16} color={fg} /> : null}
      <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: fg }}>{label}</Text>
    </Pressable>
  );
}

export function Trend({ change, suffix }: { change: number | null; suffix?: string }) {
  const t = useAdminTheme();
  if (change == null) return suffix ? <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>{suffix}</Text> : null;
  const up = change >= 0;
  return (
    <Text style={{ fontFamily: FONTS.regular, fontSize: 12, color: t.muted }}>
      <Text style={{ fontFamily: FONTS.medium, color: up ? t.green : t.red }}>
        {up ? "↑" : "↓"} {Math.abs(change)}%
      </Text>
      {suffix ? `  ${suffix}` : ""}
    </Text>
  );
}

// ---------- charts ----------
function pathFor(values: number[], width: number, height: number, pad = 2, max?: number) {
  const top = Math.max(1, max ?? Math.max(...values, 1));
  const step = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => `${i ? "L" : "M"}${(pad + i * step).toFixed(1)},${(height - pad - (v / top) * (height - pad * 2)).toFixed(1)}`)
    .join(" ");
}

export function Sparkline({ values, color, width = 84, height = 34 }: { values: number[]; color: string; width?: number; height?: number }) {
  if (!values.length) return null;
  return (
    <Svg width={width} height={height}>
      <Path d={pathFor(values, width, height)} stroke={color} strokeWidth={1.8} fill="none" strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

export function StatCard({
  title,
  value,
  icon,
  footer,
  series,
  seriesColor,
}: {
  title: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  footer?: ReactNode;
  series?: number[];
  seriesColor?: string;
}) {
  const t = useAdminTheme();
  return (
    <Card style={{ flex: 1, minWidth: 220 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>{title}</Text>
        <Ionicons name={icon} size={18} color={t.muted} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", marginTop: 12 }}>
        <Text style={{ flex: 1, fontFamily: FONTS.regular, fontSize: 30, color: t.text }}>{value}</Text>
        {series?.length ? <Sparkline values={series} color={seriesColor || t.blue} /> : null}
      </View>
      {footer ? <View style={{ marginTop: 10 }}>{footer}</View> : null}
    </Card>
  );
}

/** This period (solid, filled) against the previous one (dashed), per day. */
export function AreaChart({ current, previous, labels, height = 210 }: { current: number[]; previous: number[]; labels: string[]; height?: number }) {
  const t = useAdminTheme();
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);
  const padLeft = 34;
  const padBottom = 24;
  const chartW = Math.max(100, width - padLeft);
  const chartH = height - padBottom;
  const max = Math.max(1, ...current, ...previous) * 1.1;
  const step = current.length > 1 ? chartW / (current.length - 1) : 0;
  const x = (i: number) => padLeft + i * step;
  const y = (v: number) => chartH - (v / max) * (chartH - 8);
  const line = (values: number[]) => values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = current.length ? `${line(current)} L${x(current.length - 1)},${chartH} L${x(0)},${chartH} Z` : "";
  const ticks = [0, 0.5, 1].map((f) => Math.round((max / 1.1) * f));
  const peak = current.length ? current.indexOf(Math.max(...current)) : -1;
  const shown = hover ?? peak;

  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      // Web: follow the pointer to show that day's value.
      {...({
        onMouseMove: (event: any) => {
          const rect = event.currentTarget.getBoundingClientRect?.();
          if (!rect || !step) return;
          const i = Math.round((event.clientX - rect.left - padLeft) / step);
          setHover(Math.max(0, Math.min(current.length - 1, i)));
        },
        onMouseLeave: () => setHover(null),
      } as any)}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="adminArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.pink} stopOpacity={0.18} />
            <Stop offset="1" stopColor={t.pink} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {ticks.map((tick) => (
          <Line key={tick} x1={padLeft} x2={width} y1={y(tick)} y2={y(tick)} stroke={t.chartGrid} strokeWidth={1} />
        ))}
        {ticks.map((tick) => (
          <SvgText key={`l${tick}`} x={0} y={y(tick) + 4} fontSize={10} fill={t.faint}>
            {tick >= 1000 ? `${Math.round(tick / 100) / 10}k` : String(tick)}
          </SvgText>
        ))}
        {previous.length ? <Path d={line(previous)} stroke={t.chartPrevious} strokeWidth={1.5} strokeDasharray="4 4" fill="none" /> : null}
        {area ? <Path d={area} fill="url(#adminArea)" /> : null}
        {current.length ? <Path d={line(current)} stroke={t.pink} strokeWidth={2.4} fill="none" strokeLinejoin="round" /> : null}
        {labels.map((label, i) => (
          <SvgText key={label + i} x={x(i)} y={height - 6} fontSize={10} fill={t.faint} textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}>
            {label}
          </SvgText>
        ))}
        {shown >= 0 && current.length ? (
          <>
            <Line x1={x(shown)} x2={x(shown)} y1={0} y2={chartH} stroke={t.pink} strokeOpacity={0.35} strokeWidth={1} />
            <Circle cx={x(shown)} cy={y(current[shown])} r={4} fill={t.pink} stroke={t.card} strokeWidth={2} />
          </>
        ) : null}
      </Svg>
      {shown >= 0 && current.length ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: Math.max(0, y(current[shown]) - 40),
            left: Math.min(Math.max(0, x(shown) - 56), width - 112),
            width: 112,
            paddingVertical: 5,
            borderRadius: 8,
            alignItems: "center",
            backgroundColor: t.text,
          }}>
          <Text style={{ fontFamily: FONTS.medium, fontSize: 11.5, color: t.card }}>
            {labels[shown]}  {formatNumber(current[shown])}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

// ---------- states ----------
export function Loading({ label = "Loading…" }: { label?: string }) {
  const t = useAdminTheme();
  return (
    <View style={{ paddingVertical: 60, alignItems: "center", gap: 10 }}>
      <ActivityIndicator color={t.pink} />
      <Text style={{ fontFamily: FONTS.regular, fontSize: 13, color: t.muted }}>{label}</Text>
    </View>
  );
}

export function Notice({ icon = "information-circle-outline", title, text, tone = "blue", action }: { icon?: keyof typeof Ionicons.glyphMap; title?: string; text: string; tone?: Tone; action?: ReactNode }) {
  const t = useAdminTheme();
  const c = toneColors(t, tone);
  return (
    <View style={{ flexDirection: "row", gap: 10, padding: 14, borderRadius: 12, backgroundColor: c.bg }}>
      <Ionicons name={icon} size={17} color={c.fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 3 }}>
        {title ? <Text style={{ fontFamily: FONTS.medium, fontSize: 13, color: t.text }}>{title}</Text> : null}
        <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, lineHeight: 18, color: t.muted }}>{text}</Text>
        {action}
      </View>
    </View>
  );
}
