// ==========================================
// HOME DASHBOARD (Figma · Cosquest tab)
// ==========================================
// "Hello {name}" with city, quest radius, coins and gems; the featured
// quest on the big pin (Join); ongoing quests (ENTER); upcoming events
// (Register). Quests come from GET /api/quests; joining and registering
// use POST /api/quests/:id/registrations. While USE_SAMPLE_QUESTS is on,
// it shows the Figma's San Diego quests instead (constants/sampleQuests.ts).
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Platform, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import HeroQuest, { RED_PIN } from "@/components/dashboard/HeroQuest";
import {
  CHARACTER_REACH,
  ONGOING_WIDTH,
  OngoingCard,
  UPCOMING_WIDTH,
  UpcomingCard,
} from "@/components/dashboard/QuestCards";
import { isLiveQuest, isUpcomingQuest, questCity } from "@/components/dashboard/questFormat";
import {
  DARK_SCREEN_GRADIENT,
  themedStyles,
  useInk,
  useThemedStyles,
} from "@/constants/chatTheme";
import { FONTS } from "@/constants/fonts";
import { makeSampleQuests, SAMPLE_CITY } from "@/constants/sampleQuests";
import type { Quest } from "@/services/quests";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchQuests, registerQuest } from "@/store/thunks/questThunks";
import { fetchCurrentUser } from "@/store/thunks/userThunks";
import { getAvatarSource } from "@/utils/callHelpers";

const MAP = require("@/assets/images/map-texture.png");
const COSCOIN = require("@/assets/images/dashboard/coscoin.png");
const COSXP = require("@/assets/images/dashboard/cosxp.png");

// The backend's quests are three Lagos tests for now: show the design's
// San Diego set until real nearby quests exist. false = GET /api/quests.
const USE_SAMPLE_QUESTS = true;
const DEFAULT_RADIUS_MI = 50;

const formatCount = (value: number) => String(Math.max(0, Math.floor(value))).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

// The user's city from their saved location (phones only; the website
// can't look up addresses).
function useCity(lat?: number | null, lng?: number | null) {
  const [city, setCity] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "web" || typeof lat !== "number" || typeof lng !== "number") return;
    let stale = false;
    Location.reverseGeocodeAsync({ latitude: lat, longitude: lng })
      .then(([place]) => {
        if (!stale) setCity(place?.city || place?.subregion || place?.region || null);
      })
      .catch(() => {
        // No address lookup: the chip just says "Near you".
      });
    return () => {
      stale = true;
    };
  }, [lat, lng]);
  return city;
}

export default function HomeScreen() {
  const styles = useThemedStyles(STYLE_PAIR);
  const ink = useInk();
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();

  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const user = useAppSelector((state) => state.user.user);
  const apiQuests = useAppSelector((state) => state.quest.quests);
  const apiLoading = useAppSelector((state) => state.quest.loading);
  const [sampleQuests] = useState(makeSampleQuests);
  const quests = USE_SAMPLE_QUESTS ? sampleQuests : apiQuests;
  const questsLoading = USE_SAMPLE_QUESTS ? false : apiLoading;

  // Quests joined or registered for from here (the list has no "mine" flag yet).
  const [registered, setRegistered] = useState<Set<string>>(() => new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const profile = user?.profile || authUser?.profile;
  const firstName = profile?.firstName || profile?.username || "there";
  const radius = user?.preferences?.radiusMiles ?? DEFAULT_RADIUS_MI;
  const lookedUpCity = useCity(user?.location?.lat, user?.location?.lng);
  const city = USE_SAMPLE_QUESTS ? SAMPLE_CITY : lookedUpCity;
  // CosCoin and CosXP. The user record only has pointsBalance so far (shown
  // as XP); coins appear once the backend sends coinBalance.
  const coins = Number((user as any)?.coinBalance ?? 0);
  const xp = Number((user as any)?.xpBalance ?? (user as any)?.pointsBalance ?? 0);
  const avatar = getAvatarSource({
    avatarKey: profile?.avatarKey,
    avatarPhotoUrl: profile?.avatarPhotoUrl,
  } as any);

  const load = useCallback(async () => {
    const work: Promise<unknown>[] = USE_SAMPLE_QUESTS ? [] : [dispatch(fetchQuests(undefined))];
    if (authUser?.email && !user) work.push(dispatch(fetchCurrentUser(authUser.email)));
    await Promise.all(work);
  }, [dispatch, authUser?.email, user]);

  // Fresh quests each time the tab comes into view.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const { featured, ongoing, upcoming } = useMemo(() => {
    const byStart = (a: Quest, b: Quest) =>
      new Date(a.startsAt || 0).getTime() - new Date(b.startsAt || 0).getTime();
    const live = quests.filter((quest) => isLiveQuest(quest)).sort(byStart);
    const soon = quests.filter((quest) => isUpcomingQuest(quest)).sort(byStart);
    // The big pin is for a quest in the user's city (live first, then the
    // next to start); other cities only when there's nothing local.
    const here = (quest: Quest) => !!city && questCity(quest).toLowerCase() === city.toLowerCase();
    const featured = live.find(here) || soon.find(here) || live[0] || soon[0] || null;
    return {
      featured,
      ongoing: live.filter((quest) => quest !== featured),
      upcoming: soon.filter((quest) => quest !== featured),
    };
  }, [quests, city]);

  const register = async (quest: Quest) => {
    if (!token) return;
    if (registered.has(quest.id)) return;
    // Sample quests don't exist on the backend: just mark them.
    if (quest.id.startsWith("sample_")) {
      setRegistered((current) => new Set(current).add(quest.id));
      return;
    }
    setBusyId(quest.id);
    try {
      await dispatch(registerQuest({ questId: quest.id, token })).unwrap();
      setRegistered((current) => new Set(current).add(quest.id));
      dispatch(fetchQuests(undefined));
    } catch (error) {
      const message = typeof error === "string" ? error : "Couldn't register. Please try again.";
      // Already registered counts as success.
      if (/already/i.test(message)) {
        setRegistered((current) => new Set(current).add(quest.id));
      } else {
        Alert.alert(quest.title, message);
      }
    } finally {
      setBusyId(null);
    }
  };

  const firstLoad = questsLoading && !quests.length && !refreshing;

  return (
    <View style={styles.screen}>
      <LinearGradient
        colors={ink.dark ? [...DARK_SCREEN_GRADIENT] : ["#FFFFFF", "#F4F8FD", "#D5EAFB"]}
        locations={ink.dark ? [0, 0.6] : [0, 0.35, 1]}
        style={styles.fill}
      />
      <Image source={MAP} style={[styles.map, ink.dark && styles.mapDark]} contentFit="cover" />
      <LinearGradient
        colors={ink.dark ? ["rgba(23,24,35,0)", "rgba(23,24,35,1)"] : ["rgba(220,236,251,0)", "rgba(220,236,251,1)"]}
        style={styles.mapFade}
        pointerEvents="none"
      />

      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#B63D91" />}>
        {/* HEADER */}
        <View style={styles.header}>
          <View style={styles.avatarRing}>
            {avatar ? (
              <Image source={avatar} style={styles.avatar} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={44} color="#B63D91" />
            )}
          </View>
          <View style={styles.headerText}>
            <Text style={styles.hello} numberOfLines={1} adjustsFontSizeToFit>
              Hello {firstName}
            </Text>
            <View style={styles.cityChip}>
              <Image source={RED_PIN} style={styles.cityPin} contentFit="contain" />
              <Text style={styles.cityText} numberOfLines={1}>
                <Text style={styles.cityName}>{city || "Near you"}</Text> · Quests Within {radius} Mi
              </Text>
            </View>
            <View style={styles.balances}>
              <View style={styles.balance} accessibilityLabel={`${coins} CosCoin`}>
                <Image source={COSCOIN} style={styles.coin} contentFit="contain" />
                <Text style={styles.balanceText}>{formatCount(coins)}</Text>
              </View>
              <View style={styles.balance} accessibilityLabel={`${xp} CosXP`}>
                <Image source={COSXP} style={styles.coin} contentFit="contain" />
                <Text style={styles.balanceText}>{formatCount(xp)}</Text>
              </View>
            </View>
          </View>
          <Pressable
            onPress={() => router.push("/notifications")}
            hitSlop={10}
            style={styles.bell}
            accessibilityLabel="Notifications">
            <Ionicons name="notifications" size={30} color="#B63D91" />
          </Pressable>
        </View>

        {/* FEATURED QUEST */}
        <HeroQuest
          quest={firstLoad ? null : featured}
          joined={!!featured && registered.has(featured.id)}
          busy={!!featured && busyId === featured.id}
          dark={ink.dark}
          onJoin={() => featured && register(featured)}
        />

        {/* ONGOING */}
        {ongoing.length ? (
          <FlatList
            horizontal
            data={ongoing}
            keyExtractor={(quest) => quest.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={[styles.row, { paddingLeft: 16 + CHARACTER_REACH }]}
            snapToInterval={ONGOING_WIDTH + 14}
            decelerationRate="fast"
            renderItem={({ item, index }) => (
              <OngoingCard
                quest={item}
                index={index}
                joined={registered.has(item.id)}
                busy={busyId === item.id}
                onEnter={() => register(item)}
              />
            )}
          />
        ) : null}

        {/* UPCOMING EVENTS */}
        <Text style={styles.sectionTitle}>UPCOMING EVENTS</Text>
        {upcoming.length ? (
          <FlatList
            horizontal
            data={upcoming}
            keyExtractor={(quest) => quest.id}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.row}
            snapToInterval={UPCOMING_WIDTH + 14}
            decelerationRate="fast"
            renderItem={({ item, index }) => (
              <UpcomingCard
                quest={item}
                index={index}
                registered={registered.has(item.id)}
                busy={busyId === item.id}
                onRegister={() => register(item)}
              />
            )}
          />
        ) : (
          <Text style={styles.empty}>
            {firstLoad ? "Finding quests near you…" : "No upcoming events yet. Check back soon."}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const STYLE_PAIR = themedStyles(
  {
    screen: { flex: 1, backgroundColor: "#FFFFFF" },
    fill: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
    // The street map sits behind the hero only, fading out below it.
    map: { position: "absolute", top: 170, left: 0, right: 0, height: 480, opacity: 0.35 },
    mapDark: { opacity: 0.08 },
    mapFade: { position: "absolute", top: 520, left: 0, right: 0, height: 140 },
    header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 },
    avatarRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
      backgroundColor: "#F1D9EA",
      borderWidth: 3,
      borderColor: "#FFFFFF",
      shadowColor: "#24283C",
      shadowOpacity: 0.15,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    avatar: { width: 72, height: 72 },
    headerText: { flex: 1, minWidth: 0 },
    hello: { fontFamily: FONTS.semibold, fontSize: 26, lineHeight: 34, color: "#191922" },
    // Same pill as the hero's "Live Now" chip.
    cityChip: {
      alignSelf: "flex-start",
      maxWidth: "100%",
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      marginTop: 4,
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 20,
      backgroundColor: "rgba(230,205,226,0.75)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.9)",
    },
    cityPin: { width: 9, height: 14 },
    cityText: { flexShrink: 1, fontFamily: FONTS.medium, fontSize: 12, color: "#191922" },
    cityName: { fontFamily: FONTS.semibold },
    balances: { flexDirection: "row", gap: 16, marginTop: 6 },
    balance: { flexDirection: "row", alignItems: "center", gap: 5 },
    coin: { width: 18, height: 18 },
    balanceText: { fontFamily: FONTS.medium, fontSize: 15, color: "#191922" },
    bell: { alignSelf: "flex-start", marginTop: 8 },
    row: { paddingHorizontal: 16, gap: 14 },
    sectionTitle: {
      marginTop: 26,
      marginBottom: 2,
      textAlign: "center",
      fontFamily: FONTS.bold,
      fontSize: 24,
      letterSpacing: 0.5,
      color: "#191922",
    },
    empty: {
      marginTop: 16,
      paddingHorizontal: 24,
      textAlign: "center",
      fontFamily: FONTS.regular,
      fontSize: 14,
      color: "#66738A",
    },
  },
  {
    screen: { backgroundColor: "#171823" },
    avatarRing: { backgroundColor: "#3A2740", borderColor: "#252837" },
    // The chip is pastel in both modes, so its text stays dark.
    cityChip: { backgroundColor: "rgba(230,205,226,0.85)" },
    cityText: { color: "#191922" },
  },
);
