// ==========================================
// HOME ON A COMPUTER (website, 1024 px and wider)
// ==========================================
// Same data and actions as the phone home page, laid out for a wide screen:
//   greeting bar (name, city, radius, balances, My tickets)
//   your next ticket (within 24 h)
//   left: the featured quest on its map panel (the phone's pin, kept at its
//         designed size)   right: Happening now + Upcoming events as grids
import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageSource } from "expo-image";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import HeroQuest from "@/components/dashboard/HeroQuest";
import { OngoingCard, UpcomingCard } from "@/components/dashboard/QuestCards";
import NextTicketCard from "@/components/tickets/NextTicketCard";
import { useInk } from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import type { Quest } from "@/services/quests";

const MAP = require("@/assets/images/map-texture.png");
const COSCOIN = require("@/assets/images/dashboard/coscoin.png");
const COSXP = require("@/assets/images/dashboard/cosxp.png");
const PINK = "#C34D9C";

type Props = {
  firstName: string;
  avatar: ImageSource | number | undefined;
  city: string | null;
  radius: number;
  coins: number;
  xp: number;
  featured: Quest | null;
  ongoing: Quest[];
  upcoming: Quest[];
  registered: Set<string>;
  recentJoins: { name: string; you?: boolean }[];
  firstLoad: boolean;
  nearMe: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onRegister: (quest: Quest) => void;
  onOpen: (quest: Quest) => void;
  children?: ReactNode; // the Get a ticket sheet
};

function Section({ title, onSeeAll, children }: { title: string; onSeeAll?: () => void; children: ReactNode }) {
  const ink = useInk();
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <Text style={{ flex: 1, fontFamily: FONTS.bold, fontSize: 20, letterSpacing: 0.4, color: ink.text("#1E2232") }}>{title}</Text>
        {onSeeAll ? (
          <Pressable onPress={onSeeAll} hitSlop={8} accessibilityRole="link">
            <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK }}>See all ›</Text>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export default function DesktopHome(p: Props) {
  const ink = useInk();
  const card = { borderRadius: 24, backgroundColor: ink.dark ? "#1C1E2B" : "#FFFFFF", borderWidth: 1, borderColor: ink.dark ? "#2C2F42" : "#E7ECF4" };
  const empty = (text: string, link?: { label: string; onPress: () => void }) => (
    <View style={{ paddingVertical: 28, alignItems: "center", gap: 8, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: ink.dark ? "#34374A" : "#D9DFEA" }}>
      <Text style={{ fontFamily: FONTS.regular, fontSize: 14, color: ink.text("#66738A") }}>{text}</Text>
      {link ? (
        <Pressable onPress={link.onPress}>
          <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK }}>{link.label} ›</Text>
        </Pressable>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {p.children}
      <ScrollView
        contentContainerStyle={{ padding: 28, gap: 22, width: "100%", maxWidth: 1360, alignSelf: "center" }}
        refreshControl={<RefreshControl refreshing={p.refreshing} onRefresh={p.onRefresh} />}>
        {/* Greeting bar */}
        <View style={[card, { flexDirection: "row", alignItems: "center", gap: 18, padding: 20 }]}>
          {p.avatar ? <Image source={p.avatar as any} style={{ width: 64, height: 64, borderRadius: 32 }} contentFit="cover" /> : null}
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={{ fontFamily: FONTS.bold, fontSize: 28, color: ink.text("#1E2232") }}>Hello {p.firstName}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: ink.dark ? "#3A2440" : "#FBEAF3" }}>
                <Ionicons name="location" size={13} color="#E0345A" />
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 12.5, color: ink.text("#1E2232") }}>{p.city || "Near you"}</Text>
                <Text style={{ fontFamily: FONTS.regular, fontSize: 12.5, color: ink.text("#5F6170") }}> · Quests within {p.radius} mi</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Image source={COSCOIN} style={{ width: 18, height: 18 }} contentFit="contain" />
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: ink.text("#1E2232") }}>{p.coins.toLocaleString()}</Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Image source={COSXP} style={{ width: 18, height: 18 }} contentFit="contain" />
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: ink.text("#1E2232") }}>{p.xp.toLocaleString()}</Text>
              </View>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/tickets" as any)}
            style={({ hovered }: any) => ({ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, height: 44, borderRadius: 22, backgroundColor: hovered ? "#A93F86" : PINK })}>
            <Ionicons name="ticket" size={18} color="#FFFFFF" />
            <Text style={{ fontFamily: FONTS.bold, fontSize: 14, color: "#FFFFFF" }}>My tickets</Text>
          </Pressable>
        </View>

        <View style={{ marginHorizontal: -16 }}>
          <NextTicketCard />
        </View>

        <View style={{ flexDirection: "row", gap: 22, alignItems: "flex-start" }}>
          {/* Featured quest on its map */}
          <View style={[card, { width: 460, overflow: "hidden", paddingBottom: 20 }]}>
            <Image source={MAP} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: ink.dark ? 0.12 : 0.5 }} contentFit="cover" />
            <Text style={{ marginTop: 18, marginLeft: 20, fontFamily: FONTS.bold, fontSize: 13, letterSpacing: 1, color: PINK }}>
              {p.featured ? "FEATURED NEAR YOU" : "NEAR YOU"}
            </Text>
            <HeroQuest
              quest={p.firstLoad ? null : p.featured}
              joined={!!p.featured && p.registered.has(p.featured.id)}
              busy={false}
              dark={ink.dark}
              recentJoins={p.recentJoins}
              onJoin={() => p.featured && p.onRegister(p.featured)}
              onOpen={() => p.featured && p.onOpen(p.featured)}
            />
            {p.featured ? (
              <Pressable onPress={() => p.onOpen(p.featured!)} style={{ alignSelf: "center", marginTop: 6 }}>
                <Text style={{ fontFamily: FONTS.semibold, fontSize: 13.5, color: PINK }}>See details ›</Text>
              </Pressable>
            ) : null}
          </View>

          {/* Rows as grids */}
          <View style={{ flex: 1, gap: 28, minWidth: 0 }}>
            <Section title="HAPPENING NOW" onSeeAll={p.ongoing.length ? () => router.push({ pathname: "/quests", params: { tab: "live" } } as any) : undefined}>
              {p.ongoing.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                  {p.ongoing.slice(0, 6).map((quest, index) => (
                    <OngoingCard
                      key={quest.id}
                      quest={quest}
                      index={index}
                      joined={p.registered.has(quest.id)}
                      busy={false}
                      onEnter={() => p.onRegister(quest)}
                      onOpen={() => p.onOpen(quest)}
                    />
                  ))}
                </View>
              ) : (
                empty(p.firstLoad ? "Finding quests near you…" : "Nothing else is live near you right now.")
              )}
            </Section>

            <Section title="UPCOMING EVENTS" onSeeAll={p.upcoming.length ? () => router.push({ pathname: "/quests", params: { tab: "upcoming" } } as any) : undefined}>
              {p.upcoming.length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
                  {p.upcoming.slice(0, 9).map((quest, index) => (
                    <UpcomingCard
                      key={quest.id}
                      quest={quest}
                      index={index}
                      registered={p.registered.has(quest.id)}
                      busy={false}
                      onRegister={() => p.onRegister(quest)}
                      onOpen={() => p.onOpen(quest)}
                    />
                  ))}
                </View>
              ) : (
                empty(
                  p.firstLoad ? "Finding quests near you…" : p.nearMe ? `No upcoming events within ${p.radius} miles yet.` : "No upcoming events yet. Check back soon.",
                  !p.firstLoad && p.nearMe ? { label: "See events anywhere", onPress: () => router.push({ pathname: "/quests", params: { tab: "upcoming", radius: "0" } } as any) } : undefined,
                )
              )}
            </Section>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
