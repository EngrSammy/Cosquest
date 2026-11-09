// ==========================================
// SAMPLE QUESTS (dashboard, until the backend has real ones)
// ==========================================
// The backend only has three test quests in Lagos, so the dashboard shows
// these (the Figma's San Diego set) while USE_SAMPLE_QUESTS is on in
// app/(tabs)/home.tsx. Times are made relative to now, so the countdown
// always runs. Same shape as GET /api/quests.
import type { Quest } from "@/services/quests";

export const SAMPLE_CITY = "San Diego";

const usd = (amount: number) => ({ amount, currency: "USD" });

function inHours(hours: number, from = Date.now()) {
  return new Date(from + hours * 3_600_000).toISOString();
}

// The coming Saturday, 2 pm (this weekend).
function thisSaturday(hour = 14) {
  const date = new Date();
  date.setDate(date.getDate() + ((6 - date.getDay() + 7) % 7 || 7));
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

function quest(id: string, patch: Partial<Quest>): Quest {
  return {
    id: `sample_${id}`,
    title: "CosQuest",
    hostName: "CosQuest",
    status: "upcoming",
    prizePool: usd(500),
    entryFee: usd(10),
    maxParticipants: 50,
    registrationCount: 0,
    spacesRemaining: 50,
    ...patch,
  };
}

export function makeSampleQuests(): Quest[] {
  const now = Date.now();
  // Starts in about 3 hours: "Starting Soon" on the dashboard.
  const featuredStart = now + (2 * 3600 + 59 * 60 + 12) * 1000;

  return [
    // Featured (San Diego): not live yet.
    quest("waterfront", {
      title: "Waterfront Cosplay Hunt",
      startsAt: new Date(featuredStart).toISOString(),
      endsAt: new Date(featuredStart + 3 * 3_600_000).toISOString(),
      location: { name: "Waterfront Plaza", address: "San Diego", lat: 32.7157, lng: -117.1611 },
      // Nobody has registered on the backend yet.
      registrationCount: 0,
      spacesRemaining: 50,
    }),

    // Ongoing elsewhere.
    quest("ontario", { status: "live", title: "Maple Quest", startsAt: inHours(-1, now), endsAt: inHours(2, now), location: { name: "Ontario", address: "UK" } }),
    quest("tokyo", { status: "live", title: "Akiba Run", startsAt: inHours(-2, now), endsAt: inHours(1, now), location: { name: "Tokyo", address: "Hanuma" } }),
    quest("lagos", { status: "live", title: "Ikeja Showdown", startsAt: inHours(-0.5, now), endsAt: inHours(3, now), location: { name: "Ikeja", address: "Lagos" } }),
    quest("paris", { status: "live", title: "Paris Cos Walk", startsAt: inHours(-1.5, now), endsAt: inHours(1.5, now), location: { name: "Le Marais", address: "Paris" } }),

    // Upcoming events.
    quest("weekend-1", { title: "Anime Realm Showdown", startsAt: thisSaturday(12), location: { name: "Tokyo", address: "Hanuma" } }),
    quest("weekend-2", { title: "Marvel Trivia Night", startsAt: thisSaturday(15), location: { name: "Tokyo", address: "Hanuma" } }),
    quest("weekend-3", { title: "Cosplay City Hunt", startsAt: thisSaturday(18), location: { name: "Tokyo", address: "Hanuma" } }),
    quest("weekend-4", { title: "Gaming Legends Meetup", startsAt: thisSaturday(20), location: { name: "Gaslamp", address: "San Diego" }, prizePool: usd(750), entryFee: usd(15) }),
  ];
}
