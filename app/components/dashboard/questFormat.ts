// ==========================================
// DASHBOARD: quest labels (place, money, when, countdown)
// ==========================================
import type { Money, Quest } from "@/services/quests";

const SYMBOLS: Record<string, string> = { NGN: "₦", USD: "$", GBP: "£", EUR: "€" };

// "₦50,000" · "$10" · "Free"
export function formatMoney(money?: Money | null, free = "Free") {
  if (!money || !money.amount) return free;
  const symbol = SYMBOLS[money.currency?.toUpperCase()] ?? `${money.currency} `;
  const amount = String(Math.round(money.amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symbol}${amount}`;
}

// The last part of the address is the city: "Lagos Island, Lagos" -> "Lagos".
export function questCity(quest: Quest) {
  const parts = (quest.location?.address || "").split(",").map((part) => part.trim()).filter(Boolean);
  return parts[parts.length - 1] || "";
}

// "Tafawa Balewa Square · Lagos"
export function questPlace(quest: Quest) {
  return [quest.location?.name, questCity(quest)].filter(Boolean).join(" · ");
}

// The backend's status decides; the times only when it sends none.
export function isLiveQuest(quest: Quest, now = Date.now()) {
  if (quest.status) return quest.status === "live";
  const start = quest.startsAt ? new Date(quest.startsAt).getTime() : NaN;
  const end = quest.endsAt ? new Date(quest.endsAt).getTime() : NaN;
  return start <= now && !(end <= now);
}

export function isUpcomingQuest(quest: Quest, now = Date.now()) {
  if (quest.status) return quest.status === "upcoming";
  const start = quest.startsAt ? new Date(quest.startsAt).getTime() : NaN;
  return start > now;
}

// "Today", "Tomorrow", "This Weekend", "Sat, Nov 8"
export function whenLabel(iso?: string, now = new Date()) {
  if (!iso) return "Coming soon";
  const date = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(date) - day(now)) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  const weekday = date.getDay();
  // Within the coming Saturday/Sunday.
  const toSunday = (7 - now.getDay()) % 7;
  if ((weekday === 6 || weekday === 0) && days <= toSunday) return "This Weekend";
  const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${WEEKDAYS[weekday]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
}

// "2:59:12" (hours not capped, so a 30-hour wait reads 30:00:00)
export function formatCountdown(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const seconds = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
}
