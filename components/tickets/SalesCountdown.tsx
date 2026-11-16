// "Sales close in 09:58": shown in the last hour before ticket sales close
// (they close when the quest starts). Red in the last 10 minutes; "Ticket
// sales have closed" afterwards. The server refuses late purchases anyway.
import { useEffect, useState } from "react";
import { Text } from "react-native";

import { FONTS } from "@/constants/fonts";

const pad = (n: number) => String(n).padStart(2, "0");

export function salesClosed(closesAt?: string | null) {
  return !!closesAt && new Date(closesAt).getTime() <= Date.now();
}

export default function SalesCountdown({ closesAt }: { closesAt?: string | null }) {
  const [now, setNow] = useState(Date.now());
  const end = closesAt ? new Date(closesAt).getTime() : null;
  const left = end ? end - now : null;
  useEffect(() => {
    if (left === null || left > 3600e3 + 60e3) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [left === null, left !== null && left > 3600e3]);
  if (left === null || left > 3600e3) return null;
  if (left <= 0) return <Text style={{ textAlign: "center", fontFamily: FONTS.semibold, fontSize: 14, color: "#D9364F" }}>Ticket sales have closed.</Text>;
  const minutes = Math.floor(left / 60000);
  const seconds = Math.floor((left % 60000) / 1000);
  return (
    <Text style={{ textAlign: "center", fontFamily: FONTS.semibold, fontSize: 14, color: left <= 10 * 60e3 ? "#D9364F" : "#B26B12" }} accessibilityLiveRegion="polite">
      Sales close in {pad(minutes)}:{pad(seconds)}
    </Text>
  );
}
