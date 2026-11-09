// Ranks (Wale's Build Brief, 7 Nov 2026): the faction entry test, the rank
// screen with its three gates, the rank test, the faction weapon ladder,
// season XP vs event points, and the friends made at events.
//
// Built in the game's existing look (SheetFrame, GamePanel, GameButton, the
// Fredoka/Lilita type) with plain layouts on purpose: Wale's UI guideline
// has not arrived, and these screens wait for his pass. The screens, by id
// (testID "prog-<id>"): hub, pick, test, ladder, season, friends.
//
// The server judges everything (features/game/progression.ts). Each part
// shows only when its feature is on: the tile itself needs `progression`,
// tests need `trivia_banks`, the season card `seasons`, the friends list
// `event_friends`. A feature that is off answers 404 and its part says
// "not open yet" instead of failing.
import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useReducer, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  buyWeapon,
  checkRankUp,
  connectionsByEvent,
  type EventConnection,
  fetchConfig,
  fetchEventConnections,
  fetchMe,
  fetchSeasonMe,
  fetchTestsStatus,
  gateRows,
  gatesDone,
  isFeatureOff,
  joinFaction,
  type LadderWeapon,
  ladderAction,
  type ProgConfig,
  type ProgFaction,
  type ProgMe,
  type Promotion,
  reasonText,
  refusalText,
  type SeasonMe,
  seasonTimeText,
  secondsLeft,
  sortedLadder,
  startTest,
  submitTest,
  type TestKind,
  testReducer,
  type TestsStatus,
  tierLabel,
  weaponForTier,
} from "@/features/game/progression";
import { gameStore, useGame } from "@/features/game/runtime";

import { Chip, GameButton, GamePanel, MAX_FONT_SCALE, ProgressBar } from "./kit";
import { ACCENT, useLook } from "./look";
import { SheetHost } from "./Sheet";
import { SheetFrame } from "./SheetFrame";
import { SheetHeader } from "./SheetHeader";
import { CHOICE_COLORS, GF, GP, realmColor, realmIcon } from "./theme";

type Page =
  | { id: "hub" }
  | { id: "pick" }
  | { id: "test"; kind: TestKind; faction: string; rank?: number }
  | { id: "ladder" }
  | { id: "season" }
  | { id: "friends" };

type Data = {
  config: ProgConfig | null;
  me: ProgMe | null;
  tests: TestsStatus | null;
  /** null = not loaded; "off" = the feature is off on the server. */
  season: SeasonMe | "off" | null;
  friends: EventConnection[] | "off" | null;
  error: string | null;
  loading: boolean;
};

const EMPTY: Data = { config: null, me: null, tests: null, season: null, friends: null, error: null, loading: true };

const TITLES: Record<Page["id"], string> = {
  hub: "Ranks",
  pick: "Choose your faction",
  test: "Test",
  ladder: "Weapon ladder",
  season: "Season and events",
  friends: "Friends from events",
};

export default function ProgressionSheet({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <SheetHost band={{ top: insets.top + 40, height: 90 }} scrimLabel="Close Ranks" onClose={onClose}>
      {(close) => <Body close={close} />}
    </SheetHost>
  );
}

function Body({ close }: { close: () => void }) {
  const insets = useSafeAreaInsets();
  const look = useLook();
  const [page, setPage] = useState<Page>({ id: "hub" });
  const [data, setData] = useState<Data>(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const client = gameStore.client;
    setData((d) => ({ ...d, loading: true, error: null }));
    try {
      const [config, me] = await Promise.all([fetchConfig(client), fetchMe(client)]);
      const faction = me.faction ?? me.pending?.faction ?? null;
      const [tests, season, friends] = await Promise.all([
        faction ? fetchTestsStatus(client, faction).catch(() => null) : Promise.resolve(null),
        fetchSeasonMe(client).catch((e) => (isFeatureOff(e) ? ("off" as const) : null)),
        fetchEventConnections(client).catch((e) => (isFeatureOff(e) ? ("off" as const) : null)),
      ]);
      setData({ config, me, tests, season, friends, error: null, loading: false });
    } catch (e) {
      setData((d) => ({ ...d, loading: false, error: isFeatureOff(e) ? "Ranks aren't open yet." : refusalText(e) }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const back = page.id === "hub" ? null : () => setPage({ id: "hub" });
  const title = page.id === "test" ? (page.kind === "entry" ? "Entry test" : `Rank ${page.rank} test`) : TITLES[page.id];

  return (
    <SheetFrame top={insets.top + 40}>
      <View style={{ paddingHorizontal: 18 }}>
        <SheetHeader title={title} onClose={close} />
        {back ? (
          <Pressable onPress={back} accessibilityRole="button" accessibilityLabel="Back to Ranks" testID="prog-back" style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 6 }}>
            <Ionicons name="chevron-back" size={18} color={look.textMuted} />
            <Text style={{ fontFamily: GF.body, fontSize: 14, color: look.textMuted }}>Ranks</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 8, paddingBottom: insets.bottom + 28, gap: 14 }} showsVerticalScrollIndicator={false}>
        {notice ? (
          <GamePanel face={GP.cream}>
            <Text style={[txt.body, { color: look.text }]} testID="prog-notice">
              {notice}
            </Text>
          </GamePanel>
        ) : null}
        {data.loading && !data.me ? <ActivityIndicator style={{ marginTop: 40 }} color={look.textMuted} /> : null}
        {data.error ? <Muted text={data.error} /> : null}
        {data.config && data.me ? (
          <PageBody
            page={page}
            data={data}
            go={(p) => {
              setNotice(null);
              setPage(p);
            }}
            reload={load}
            say={setNotice}
          />
        ) : null}
      </ScrollView>
    </SheetFrame>
  );
}

function PageBody({ page, data, go, reload, say }: { page: Page; data: Data; go: (p: Page) => void; reload: () => Promise<void>; say: (s: string | null) => void }) {
  const config = data.config!;
  const me = data.me!;
  switch (page.id) {
    case "hub":
      return me.faction ? <RankHub data={data} go={go} /> : <JoinStart me={me} config={config} tests={data.tests} go={go} />;
    case "pick":
      return <FactionPick config={config} go={go} say={say} reload={reload} />;
    case "test":
      return <TestRunner kind={page.kind} faction={page.faction} rank={page.rank} config={config} go={go} reload={reload} />;
    case "ladder":
      return <Ladder me={me} reload={reload} say={say} />;
    case "season":
      return <Season data={data} />;
    case "friends":
      return <EventFriends friends={data.friends} />;
  }
}

// ---------- not in a faction yet ----------

function JoinStart({ me, config, tests, go }: { me: ProgMe; config: ProgConfig; tests: TestsStatus | null; go: (p: Page) => void }) {
  const look = useLook();
  const pending = me.pending;
  // After a failed try the server says when the next one may start.
  const entry = tests?.entry;
  const wait = entry && !entry.can_start && entry.reason && entry.reason !== "already_passed" ? reasonText(entry.reason, entry.retry_at) : null;
  const name = pending ? (config.factions.find((f) => f.id === pending.faction)?.name ?? pending.faction) : null;
  return (
    <View style={{ gap: 14 }} testID="prog-hub">
      <GamePanel>
        <Text style={[txt.h2, { color: look.text }]}>Join a faction</Text>
        <Text style={[txt.body, { color: look.textMuted, marginTop: 6 }]}>
          {"Pick one of the six factions and pass its entry test. You start at Initiate with the faction's starter weapon."}
        </Text>
      </GamePanel>
      {pending && name ? (
        <GamePanel>
          <Text style={[txt.kicker, { color: look.textMuted }]}>IN PROGRESS</Text>
          <Text style={[txt.h3, { color: look.text, marginTop: 2 }]}>{name}: entry test</Text>
          {wait ? (
            <Text style={[txt.body, { color: look.textMuted, marginTop: 8 }]} testID="prog-entry-wait">
              {wait}
            </Text>
          ) : (
            <GameButton title="Take the entry test" color={ACCENT.sun.fill} onPress={() => go({ id: "test", kind: "entry", faction: pending.faction })} style={{ marginTop: 12 }} testID="prog-entry-resume" />
          )}
        </GamePanel>
      ) : null}
      <GameButton title={pending ? "Pick a different faction" : "Choose a faction"} color={pending ? GP.skyDeep : ACCENT.sun.fill} onPress={() => go({ id: "pick" })} testID="prog-choose" />
    </View>
  );
}

function FactionPick({ config, go, say, reload }: { config: ProgConfig; go: (p: Page) => void; say: (s: string | null) => void; reload: () => Promise<void> }) {
  const look = useLook();
  const roamFaction = useGame((s) => s.me?.faction ?? null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const suggested = (f: ProgFaction & { legacy_faction?: string | null }) => !!roamFaction && (f.legacy_faction === roamFaction || f.id === roamFaction);
  const pick = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await joinFaction(gameStore.client, chosen);
      if (r.status === "pending_entry_test") {
        go({ id: "test", kind: "entry", faction: chosen });
      } else {
        await reload();
        say(`You joined ${config.factions.find((f) => f.id === chosen)?.name ?? chosen}.`);
        go({ id: "hub" });
      }
    } catch (e) {
      say(refusalText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }} testID="prog-pick">
      <Muted text="Each faction has its own trivia, weapons and ranks. Switching later is costly, so pick the fandom you know best." />
      {config.factions.map((f) => {
        const on = chosen === f.id;
        const tint = realmColor(f.id);
        return (
          <Pressable key={f.id} onPress={() => setChosen(f.id)} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${f.name}, ${f.realm}`} testID={`prog-faction-${f.id}`}>
            <GamePanel padding={14} style={on ? { borderWidth: 3, borderColor: tint } : null}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name={realmIcon(f.id)} size={20} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[txt.h3, { color: look.text }]}>{f.name}</Text>
                    {suggested(f) ? <Chip text="Your realm" color={GP.mint} /> : null}
                  </View>
                  <Text style={[txt.small, { color: look.textMuted }]} numberOfLines={2}>
                    {f.realm} · {f.themes}
                  </Text>
                </View>
                <Ionicons name={on ? "radio-button-on" : "radio-button-off"} size={22} color={on ? tint : look.textMuted} />
              </View>
            </GamePanel>
          </Pressable>
        );
      })}
      <GameButton title={busy ? "Joining..." : "Take the entry test"} color={ACCENT.sun.fill} disabled={!chosen || busy} onPress={() => void pick()} testID="prog-pick-go" />
    </View>
  );
}

// ---------- the rank screen ----------

function RankHub({ data, go }: { data: Data; go: (p: Page) => void }) {
  const look = useLook();
  const me = data.me!;
  const config = data.config!;
  const g = me.next ?? null;
  const tint = realmColor(me.faction);
  const total = config.ranks.length || 10;
  const nextWeapon = g ? weaponForTier(me.ladder, g.weapon.tier) : null;
  const rankStanding = g ? data.tests?.ranks.find((r) => r.rank === g.rank) : null;
  return (
    <View style={{ gap: 14 }} testID="prog-hub">
      <GamePanel>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 14, backgroundColor: tint, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={realmIcon(me.faction)} size={26} color="#FFFFFF" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[txt.kicker, { color: look.textMuted }]}>{`${(me.faction_name ?? me.faction ?? "").toUpperCase()} · RANK ${me.rank?.number ?? 1} OF ${total}`}</Text>
            <Text style={[txt.h1, { color: look.text }]} testID="prog-rank-name">
              {me.rank?.name ?? "Initiate"}
            </Text>
            <Text style={[txt.small, { color: look.textMuted }]}>{`${fmt(me.xp ?? 0)} rank XP`}</Text>
          </View>
        </View>
      </GamePanel>

      {g ? (
        <GamePanel>
          <Text style={[txt.kicker, { color: look.textMuted }]}>{`NEXT RANK · ${gatesDone(g)} OF 3 GATES`}</Text>
          <Text style={[txt.h2, { color: look.text, marginBottom: 8 }]}>{g.name}</Text>
          {gateRows(g, nextWeapon?.name).map((row) => (
            <View key={row.id} style={{ paddingVertical: 8, gap: 6 }} testID={`prog-gate-${row.id}`} accessible accessibilityLabel={`${row.title}: ${row.detail}${row.ok ? ", done" : ""}`}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Ionicons name={row.ok ? "checkmark-circle" : "ellipse-outline"} size={22} color={row.ok ? GP.mint : look.textMuted} />
                <View style={{ flex: 1 }}>
                  <Text style={[txt.h3, { color: look.text }]}>{row.title}</Text>
                  <Text style={[txt.small, { color: look.textMuted }]}>{row.detail}</Text>
                </View>
              </View>
              {row.progress != null ? <ProgressBar value={row.progress} color={row.ok ? GP.mint : GP.sun} /> : null}
            </View>
          ))}
          <View style={{ gap: 10, marginTop: 8 }}>
            {!g.test.ok ? (
              rankStanding && !rankStanding.can_start && rankStanding.reason ? (
                <Muted text={reasonText(rankStanding.reason, rankStanding.retry_at)} />
              ) : (
                <GameButton title={`Take the ${g.name} test`} color={ACCENT.sun.fill} onPress={() => go({ id: "test", kind: "rank", faction: me.faction!, rank: g.rank })} testID="prog-rank-test" />
              )
            ) : null}
            {!g.weapon.ok ? <GameButton title={g.weapon.available ? "Get the rank weapon" : "See the weapon ladder"} color={GP.skyDeep} onPress={() => go({ id: "ladder" })} testID="prog-gate-weapon-go" /> : null}
          </View>
        </GamePanel>
      ) : (
        <GamePanel>
          <Text style={[txt.h2, { color: look.text }]}>Top rank reached</Text>
          <Muted text="You've cleared every rank in this faction." />
        </GamePanel>
      )}

      <NavRow icon="hammer" title="Weapon ladder" detail={`${me.inventory?.length ?? 0} of ${me.ladder?.length ?? 10} owned`} onPress={() => go({ id: "ladder" })} testID="prog-nav-ladder" />
      <NavRow icon="trophy" title="Season and events" detail={seasonLine(data)} onPress={() => go({ id: "season" })} testID="prog-nav-season" />
      {data.friends !== "off" ? (
        <NavRow icon="people" title="Friends from events" detail={Array.isArray(data.friends) ? `${data.friends.length} met at events` : "Made only at events"} onPress={() => go({ id: "friends" })} testID="prog-nav-friends" />
      ) : null}
      {config.draft ? <Muted text="Draft numbers: XP, pass marks and prices may change before launch." /> : null}
    </View>
  );
}

function seasonLine(data: Data): string {
  const s = data.season;
  if (s && s !== "off" && s.season) return `${s.season.name}: ${fmt(s.season_xp)} XP`;
  return `${fmt(data.me?.season?.xp ?? 0)} season XP`;
}

function NavRow({ icon, title, detail, onPress, testID }: { icon: keyof typeof Ionicons.glyphMap; title: string; detail: string; onPress: () => void; testID: string }) {
  const look = useLook();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}, ${detail}`} testID={testID}>
      <GamePanel padding={14}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name={icon} size={22} color={GP.skyDeep} />
          <View style={{ flex: 1 }}>
            <Text style={[txt.h3, { color: look.text }]}>{title}</Text>
            <Text style={[txt.small, { color: look.textMuted }]}>{detail}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={look.textMuted} />
        </View>
      </GamePanel>
    </Pressable>
  );
}

// ---------- a test (entry or rank) ----------

function TestRunner({ kind, faction, rank, config, go, reload }: { kind: TestKind; faction: string; rank?: number; config: ProgConfig; go: (p: Page) => void; reload: () => Promise<void> }) {
  const look = useLook();
  const [flow, send] = useReducer(testReducer, { step: "idle" });
  const [after, setAfter] = useState<{ joined?: string; starter?: string | null; promoted?: Promotion[] } | null>(null);
  const [now, setNow] = useState(() => new Date());
  const fname = config.factions.find((f) => f.id === faction)?.name ?? faction;

  useEffect(() => {
    if (flow.step !== "question") return;
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [flow.step]);

  const begin = async () => {
    send({ type: "start" });
    try {
      send({ type: "paper", paper: await startTest(gameStore.client, faction, kind, rank) });
    } catch (e) {
      send({ type: "refused", message: isFeatureOff(e) ? "Tests aren't open yet." : refusalText(e) });
    }
  };

  useEffect(() => {
    if (flow.step !== "submitting") return;
    let live = true;
    void (async () => {
      try {
        const result = await submitTest(gameStore.client, flow.paper.test_id, flow.answers);
        if (!live) return;
        send({ type: "result", result });
        if (result.passed) {
          // The server records the pass; ask progression to act on it now.
          if (kind === "entry") {
            const j = await joinFaction(gameStore.client, faction).catch(() => null);
            const starter = j?.starter_weapon ? (config.weapons.find((w) => w.id === j.starter_weapon)?.name ?? j.starter_weapon) : null;
            setAfter({ joined: j?.status === "active" ? fname : undefined, starter, promoted: j?.promoted ?? [] });
          } else {
            const r = await checkRankUp(gameStore.client).catch(() => null);
            setAfter({ promoted: r?.promoted ?? [] });
          }
        }
        void gameStore.refreshMe();
        void reload();
      } catch (e) {
        if (live) send({ type: "refused", message: refusalText(e) });
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow.step]);

  if (flow.step === "idle") {
    const mark = kind === "entry" ? null : config.ranks.find((r) => r.number === rank)?.pass_mark_pct;
    return (
      <GamePanel>
        <View testID="prog-test-intro" style={{ gap: 8 }}>
          <Text style={[txt.h2, { color: look.text }]}>{kind === "entry" ? `${fname} entry test` : `Rite of passage: rank ${rank}`}</Text>
          <Text style={[txt.body, { color: look.textMuted }]}>
            {kind === "entry"
              ? `Answer ${fname} questions against the clock. Pass and you join as an Initiate with the starter weapon.`
              : `Answer questions against the clock. You need ${mark ?? "the pass mark"}${mark != null ? "%" : ""} to pass.`}
          </Text>
          <GameButton title="Start" color={ACCENT.sun.fill} onPress={() => void begin()} testID="prog-test-start" style={{ marginTop: 6 }} />
        </View>
      </GamePanel>
    );
  }
  if (flow.step === "loading" || flow.step === "submitting") {
    return (
      <View style={{ alignItems: "center", gap: 10, paddingTop: 30 }} testID={`prog-test-${flow.step}`}>
        <ActivityIndicator color={look.textMuted} />
        <Muted text={flow.step === "loading" ? "Getting your questions..." : "Marking..."} />
      </View>
    );
  }
  if (flow.step === "refused") {
    return (
      <GamePanel>
        <View testID="prog-test-refused" style={{ gap: 10 }}>
          <Text style={[txt.body, { color: look.text }]}>{flow.message}</Text>
          <GameButton title="Back to Ranks" color={GP.skyDeep} onPress={() => go({ id: "hub" })} />
        </View>
      </GamePanel>
    );
  }
  if (flow.step === "question") {
    const q = flow.paper.questions[flow.index];
    const left = secondsLeft(flow.paper, now);
    return (
      <View style={{ gap: 12 }} testID="prog-test-question">
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <Text style={[txt.kicker, { color: look.textMuted }]}>{`QUESTION ${flow.index + 1} OF ${flow.paper.questions.length}`}</Text>
          <Text style={[txt.kicker, { color: left < 30 ? GP.berry : look.textMuted }]} testID="prog-test-clock">{`${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}</Text>
        </View>
        <ProgressBar value={flow.index / flow.paper.questions.length} color={GP.sun} />
        <GamePanel>
          <Text style={[txt.h2, { color: look.text }]} testID="prog-test-q">
            {q.q}
          </Text>
        </GamePanel>
        {q.choices.map((c, i) => (
          <GameButton key={i} title={c} color={CHOICE_COLORS[i % CHOICE_COLORS.length]} onPress={() => send({ type: "answer", choice: i })} testID={`prog-choice-${i}`} />
        ))}
        <Pressable onPress={() => send({ type: "skip" })} accessibilityRole="button" testID="prog-test-skip" style={{ alignSelf: "center", padding: 8 }}>
          <Text style={[txt.body, { color: look.textMuted }]}>Skip</Text>
        </Pressable>
      </View>
    );
  }
  // result
  const r = flow.result;
  return (
    <View style={{ gap: 12 }} testID={r.passed ? "prog-test-passed" : "prog-test-failed"}>
      <GamePanel>
        <Ionicons name={r.passed ? "ribbon" : "close-circle"} size={40} color={r.passed ? GP.mint : GP.berry} />
        <Text style={[txt.h1, { color: look.text, marginTop: 6 }]}>{r.passed ? "Passed" : "Not this time"}</Text>
        <Text style={[txt.body, { color: look.textMuted }]}>{`${r.correct} of ${r.total} right · ${Math.round(r.score)}% (pass mark ${r.pass_mark}%)`}</Text>
        {r.outcome === "timeout" ? <Muted text="The clock ran out." /> : null}
        {!r.passed && r.retry_at ? <Muted text={reasonText("cooldown", r.retry_at)} /> : null}
        <View style={{ flexDirection: "row", gap: 4, marginTop: 10, flexWrap: "wrap" }}>
          {r.results.map((ok, i) => (
            <Ionicons key={i} name={ok ? "checkmark-circle" : "close-circle"} size={18} color={ok ? GP.mint : GP.berry} />
          ))}
        </View>
      </GamePanel>
      {after?.joined ? (
        <GamePanel>
          <Text testID="prog-joined" style={[txt.kicker, { color: look.textMuted }]}>WELCOME</Text>
          <Text style={[txt.h2, { color: look.text }]}>{`You're an Initiate of ${after.joined}`}</Text>
          {after.starter ? <Text style={[txt.body, { color: look.textMuted, marginTop: 4 }]}>{`Starter weapon: ${after.starter}`}</Text> : null}
        </GamePanel>
      ) : null}
      {after?.promoted?.length ? (
        <GamePanel>
          <Text testID="prog-promoted" style={[txt.kicker, { color: look.textMuted }]}>PROMOTED</Text>
          <Text style={[txt.h2, { color: look.text }]}>{after.promoted[after.promoted.length - 1].name}</Text>
        </GamePanel>
      ) : r.passed && kind === "rank" ? (
        <Muted text="Clear the other gates to rank up: the XP and the rank weapon." />
      ) : null}
      <GameButton title="Back to Ranks" color={GP.skyDeep} onPress={() => go({ id: "hub" })} testID="prog-test-done" />
    </View>
  );
}

// ---------- the weapon ladder ----------

function Ladder({ me, reload, say }: { me: ProgMe; reload: () => Promise<void>; say: (s: string | null) => void }) {
  const look = useLook();
  const [busy, setBusy] = useState<string | null>(null);
  const coins = useGame((s) => s.me?.coins ?? null);
  const buy = async (w: LadderWeapon) => {
    setBusy(w.id);
    try {
      const r = await buyWeapon(gameStore.client, w.id);
      const promoted = r.promoted?.length ? ` Promoted to ${r.promoted[r.promoted.length - 1].name}!` : "";
      say(`${w.name} is yours.${promoted}`);
      void gameStore.refreshMe();
      await reload();
    } catch (e) {
      say(refusalText(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <View style={{ gap: 10 }} testID="prog-ladder">
      <Muted text={`One weapon per rank. A weapon goes on sale when you reach its rank's XP, and it stays with ${me.faction_name ?? "this faction"}.${coins != null ? ` You have ${fmt(coins)} CosCoins.` : ""}`} />
      {sortedLadder(me.ladder).map((w) => {
        const a = ladderAction(w, me.purchase_mode);
        const tint = w.state === "owned" ? GP.mint : w.state === "available" ? GP.sun : look.textMuted;
        return (
          <GamePanel key={w.id} padding={14} style={w.state === "locked" ? { opacity: 0.7 } : null}>
            <View testID={`prog-weapon-${w.tier}`} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Ionicons name={w.state === "owned" ? "checkmark-circle" : w.state === "available" ? "lock-open" : "lock-closed"} size={20} color={tint} />
                <Text style={[txt.kicker, { color: look.textMuted, flex: 1 }]}>{`${tierLabel(w).toUpperCase()}${w.unlocks_at_rank ? ` · RANK ${w.unlocks_at_rank}` : ""}`}</Text>
                <Chip text={w.state === "owned" ? "Owned" : w.state === "available" ? "Unlocked" : "Locked"} color={w.state === "owned" ? GP.mint : w.state === "available" ? ACCENT.sun.fill : GP.slate} />
              </View>
              <Text style={[txt.h3, { color: look.text }]}>{w.name}</Text>
              {w.description ? <Text style={[txt.small, { color: look.textMuted }]}>{w.description}</Text> : null}
              {a.kind === "buy" ? (
                <GameButton title={busy === w.id ? "Buying..." : a.label} size="small" color={ACCENT.coin.fill} disabled={busy !== null} onPress={() => void buy(w)} testID={`prog-buy-${w.tier}`} style={{ alignSelf: "flex-start", marginTop: 4 }} />
              ) : (
                <Text style={[txt.small, { color: look.textMuted }]}>{a.label}</Text>
              )}
            </View>
          </GamePanel>
        );
      })}
    </View>
  );
}

// ---------- season XP vs event points ----------

function Season({ data }: { data: Data }) {
  const look = useLook();
  const s = data.season;
  const live = s && s !== "off" ? s : null;
  const seasonXp = live ? live.season_xp : (data.me?.season?.xp ?? 0);
  return (
    <View style={{ gap: 12 }} testID="prog-season">
      <GamePanel>
        <Text style={[txt.kicker, { color: look.textMuted }]}>{live?.season ? `${live.season.name.toUpperCase()} · ${seasonTimeText(live.season).toUpperCase()}` : "THIS SEASON"}</Text>
        <Text style={[txt.h1, { color: look.text }]} testID="prog-season-xp">{`${fmt(seasonXp)} XP`}</Text>
        {live?.place ? <Text style={[txt.body, { color: look.textMuted }]}>{`Place ${live.place} this season`}</Text> : null}
        <Text style={[txt.body, { color: look.textMuted, marginTop: 6 }]}>{"Season XP adds up across every CosQuest this season and drives your rank. It is earned by playing, never bought."}</Text>
        {s === "off" ? <Muted text="Season tables open later. Your XP still counts." /> : null}
      </GamePanel>
      <GamePanel>
        <Text style={[txt.kicker, { color: look.textMuted }]}>EVENT POINTS</Text>
        <Text style={[txt.h2, { color: look.text }]}>Quest points</Text>
        <Text style={[txt.body, { color: look.textMuted, marginTop: 4 }]}>{"Quest points count only inside one CosQuest. They decide that event's leaderboard and prizes, then reset when it ends. They never change your rank."}</Text>
        {(data.me?.events ?? []).map((e) => (
          <View key={e.event_ref} style={{ flexDirection: "row", justifyContent: "space-between", paddingTop: 8 }} testID={`prog-event-${e.event_ref}`}>
            <Text style={[txt.h3, { color: look.text, flex: 1 }]} numberOfLines={1}>
              {e.title || e.event_ref}
            </Text>
            <Text style={[txt.h3, { color: look.text }]}>{`${fmt(e.points)} pts${e.place ? ` · #${e.place}` : ""}`}</Text>
          </View>
        ))}
      </GamePanel>
      {live && Object.keys(live.faction_contribution).length ? (
        <GamePanel>
          <Text style={[txt.kicker, { color: look.textMuted }]}>FOR YOUR FACTION</Text>
          {Object.entries(live.faction_contribution).map(([f, xp]) => (
            <Text key={f} style={[txt.body, { color: look.text }]}>{`${gameStore.factionName(f)}: ${fmt(xp)} XP`}</Text>
          ))}
        </GamePanel>
      ) : null}
    </View>
  );
}

// ---------- friends made at events ----------

function EventFriends({ friends }: { friends: EventConnection[] | "off" | null }) {
  const look = useLook();
  if (friends === "off" || friends === null) return <Muted text="Friends from events open later." />;
  const groups = connectionsByEvent(friends);
  return (
    <View style={{ gap: 12 }} testID="prog-friends">
      <Muted text="Friends are made in person at a CosQuest: both of you checked in at the same live event. Use Friends to swap codes while you are there." />
      {groups.length === 0 ? <Muted text="No event friends yet." /> : null}
      {groups.map((g) => (
        <GamePanel key={g.game_id}>
          <Text style={[txt.kicker, { color: look.textMuted }]}>{`MET AT ${g.title.toUpperCase()}`}</Text>
          {g.friends.map((f) => (
            <View key={f.friend_key} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 }}>
              <Ionicons name="person-circle" size={24} color={GP.skyDeep} />
              <Text style={[txt.h3, { color: look.text }]}>{f.handle}</Text>
            </View>
          ))}
        </GamePanel>
      ))}
    </View>
  );
}

// ---------- bits ----------

function Muted({ text }: { text: string }) {
  const look = useLook();
  return (
    <Text style={[txt.body, { color: look.textMuted }]} maxFontSizeMultiplier={MAX_FONT_SCALE}>
      {text}
    </Text>
  );
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

const txt = {
  h1: { fontFamily: GF.display, fontSize: 28, lineHeight: 33 },
  h2: { fontFamily: GF.display, fontSize: 21, lineHeight: 26 },
  h3: { fontFamily: GF.bold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: GF.regular, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: GF.regular, fontSize: 13, lineHeight: 18 },
  kicker: { fontFamily: GF.body, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
} as const;
