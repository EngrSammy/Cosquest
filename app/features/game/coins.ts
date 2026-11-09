// CosCoins: bought on the web through Stripe, spent in the app. The pure half
// of costquest-ios Features/CoinsFeature.swift (CoinsModel, CoinRegion, the
// wire shapes). The screens are components/game/CoinsSheet.tsx.
//
// Two rules shape everything here, both ported unchanged:
//  1. The app may point a player at a web purchase only where the server says
//     so. The server decides from the region the app reports (`web_allowed`,
//     else its `regions` list). Elsewhere packs and buy buttons are not shown
//     at all. Staging builds report the US so the flow can be tested anywhere.
//  2. The phone never decides it has been paid. Stripe tells the server, the
//     server credits the coins, and the app only asks the server what happened.
//
// CosCoins are only bought, never earned: nothing here suggests otherwise.
// Pure: the client and the effects are passed in (tested in __tests__/coins.test.ts).
import { GameError, type GameClient } from "./client.ts";
import { moneyText } from "./profile.ts";

// ---------- wire ----------

export type CoinPack = {
  id: string;
  name?: string | null;
  coins: number;
  bonus?: number | null;
  price?: string | null;
  price_cents?: number | null;
  currency?: string | null;
  tag?: string | null;
  amount_cents?: number | null;
  best_value?: boolean | null;
};

export type CoinsConfig = {
  web_allowed?: boolean | null;
  regions?: string[] | null;
  currency?: string | null;
  packs?: CoinPack[] | null;
  cash_entry?: boolean | null;
};

export type CoinHistoryRow = { id: string; delta: number; kind: string; label?: string | null; at: string; receipt_url?: string | null };

export type CoinOrder = { order_id?: string | null; status: string; coins?: number | null; balance?: number | null };

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

export function parseCoinPack(raw: unknown): CoinPack | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const coins = num(r.coins);
  if (typeof r.id !== "string" || coins === null) return null;
  return {
    id: r.id,
    name: str(r.name),
    coins,
    bonus: num(r.bonus),
    price: str(r.price),
    price_cents: num(r.price_cents),
    currency: str(r.currency),
    tag: str(r.tag),
    amount_cents: num(r.amount_cents),
    best_value: typeof r.best_value === "boolean" ? r.best_value : null,
  };
}

export function parseCoinsConfig(raw: unknown): CoinsConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    web_allowed: typeof r.web_allowed === "boolean" ? r.web_allowed : null,
    regions: Array.isArray(r.regions) ? r.regions.filter((x): x is string => typeof x === "string") : null,
    currency: str(r.currency),
    packs: Array.isArray(r.packs) ? r.packs.map(parseCoinPack).filter((p): p is CoinPack => p !== null) : null,
    cash_entry: typeof r.cash_entry === "boolean" ? r.cash_entry : null,
  };
}

/** Rows are keyed however the server keys them; a stable composite when it did not (CoinHistoryRow.init). */
export function parseHistoryRow(raw: unknown): CoinHistoryRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const delta = num(r.delta);
  const kind = str(r.kind);
  const at = str(r.at);
  if (delta === null || kind === null || at === null) return null;
  const id = str(r.id) ?? (str(r.ref) ? `${kind}:${str(r.ref)}` : `${kind}:${at}:${delta}`);
  return { id, delta, kind, label: str(r.label), at, receipt_url: str(r.receipt_url) };
}

/** `balance` is a number or {coins}; rows are `items` or `entries` (CoinHistory.init). */
export function parseHistory(raw: unknown): { balance: number | null; entries: CoinHistoryRow[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const b = r.balance;
  const balance = num(b) ?? (b && typeof b === "object" ? num((b as { coins?: unknown }).coins) : null);
  const list = Array.isArray(r.items) ? r.items : Array.isArray(r.entries) ? r.entries : [];
  return { balance, entries: list.map(parseHistoryRow).filter((x): x is CoinHistoryRow => x !== null) };
}

export function parseOrder(raw: unknown): CoinOrder | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = str(r.status);
  if (!status) return null;
  return { order_id: str(r.order_id), status, coins: num(r.coins), balance: num(r.balance) };
}

// ---------- the words ----------

/** The server's display price; else the cents in its currency (USD when it did not say). Never worked out here. */
export function priceText(p: CoinPack): string {
  if (p.price) return p.price;
  const cents = p.price_cents ?? p.amount_cents;
  return cents != null ? moneyText(cents, p.currency) : "";
}

/** `coins` is what the player gets, bonus included; `bonus` is only how much of it to call out. */
export function packTotal(p: CoinPack): number {
  return p.coins;
}

export function packBase(p: CoinPack): number {
  return p.coins - Math.max(0, p.bonus ?? 0);
}

const grouped = (n: number): string => {
  try {
    return n.toLocaleString("en-US");
  } catch {
    return String(n);
  }
};
export const formatCoins = grouped;

export function packSub(p: CoinPack): string {
  return p.bonus != null && p.bonus > 0 ? `${grouped(packBase(p))} + ${grouped(p.bonus)} bonus` : "CosCoins";
}

/** "best_value" or whatever tag the server sets, as the tag the card wears; null for none. */
export function packTag(p: CoinPack): string | null {
  return p.tag ?? (p.best_value === true ? "best_value" : null);
}

export function packTagText(tag: string): string {
  return tag === "best_value" ? "BEST VALUE" : tag.replace(/_/g, " ").toUpperCase();
}

export function packLabel(p: CoinPack): string {
  return `${packTotal(p)} CosCoins, ${priceText(p)}`;
}

export function historyTitle(kind: string): string {
  switch (kind) {
    case "purchase":
      return "Bought CosCoins";
    case "earn":
      return "Earned playing";
    case "spend":
      return "Event entry";
    case "refund":
      return "Refund";
    case "clawback":
      return "Payment reversed";
    case "grant":
      return "From CosQuest";
    default:
      return kind.charAt(0).toUpperCase() + kind.slice(1);
  }
}

export type HistoryIcon = "card" | "star" | "ticket" | "arrow-undo" | "warning" | "gift";

export function historyIcon(kind: string): HistoryIcon {
  switch (kind) {
    case "purchase":
      return "card";
    case "earn":
      return "star";
    case "spend":
      return "ticket";
    case "refund":
      return "arrow-undo";
    case "clawback":
      return "warning";
    default:
      return "gift";
  }
}

/** "+1,200" / "−1,200" (CoinHistoryLine). */
export function deltaText(delta: number): string {
  return delta >= 0 ? `+${grouped(delta)}` : `−${grouped(-delta)}`;
}

/** "2 hours ago" in the device's language (Date.formatted(.relative(presentation: .named))). */
export function relativeWhen(iso: string, now: number = Date.now(), locale?: string): string {
  const t = Date.parse(iso.replace(/(\.\d{3})\d+/, "$1"));
  if (!Number.isFinite(t)) return "";
  const diff = (t - now) / 1000;
  const abs = Math.abs(diff);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31_536_000],
    ["month", 2_592_000],
    ["week", 604_800],
    ["day", 86_400],
    ["hour", 3600],
    ["minute", 60],
  ];
  try {
    const f = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    for (const [unit, secs] of units) {
      if (abs >= secs) return f.format(Math.round(diff / secs), unit);
    }
    return f.format(0, "second");
  } catch {
    return new Date(t).toISOString().slice(0, 10);
  }
}

/** "+N" counts up in 24 steps, one every 30 ms (CoinsGainedMoment). */
export const COUNT_STEPS = 24;
export const COUNT_STEP_MS = 30;
export function countAt(coins: number, step: number): number {
  return Math.trunc((coins * Math.min(COUNT_STEPS, Math.max(0, step))) / COUNT_STEPS);
}

// ---------- the region gate ----------

/** "en-US" / "en_GB" / "fr-CA-u-nu-latn" -> "US" / "GB" / "CA"; "" when the tag has no region. */
export function regionFromLocale(tag: string | null | undefined): string {
  if (!tag) return "";
  const m = tag.split(/[-_]/).slice(1).find((part) => /^[A-Za-z]{2}$/.test(part));
  return m ? m.toUpperCase() : "";
}

/**
 * CoinRegion.current(): staging is for testing the flow, wherever the tester
 * is, so it reports the US; production reports the player's region. (iOS asks
 * the App Store storefront, which is what Apple's link-out rule is about; an
 * RN build has no storefront, so the phone's region is what it sends. The
 * server holds the allowed list and reads anything it does not know as no.)
 */
export function coinRegion(opts: { isProduction: boolean; deviceRegion: string; override?: string | null }): string {
  if (opts.override) return opts.override.toUpperCase();
  if (!opts.isProduction) return "US";
  return opts.deviceRegion.toUpperCase();
}

/** CoinsModel.webAllowed: the server's say-so, else its list holding this region. */
export function webAllowed(config: CoinsConfig | null, region: string): boolean {
  if (config?.web_allowed != null) return config.web_allowed;
  return config?.regions?.some((r) => r.toUpperCase() === region.toUpperCase()) === true;
}

/** Only https pages are sent to (CoinsModel.buy guards the same). */
export function isHttpsUrl(url: string): boolean {
  return /^https:\/\/[^\s/]+/i.test(url);
}

/** cosquest://coins?order=...&result=success|cancel, from Stripe's return page via the server. */
export function parseCoinsReturn(url: string): { order: string | null; result: string | null } | null {
  const m = url.match(/^cosquest:\/\/coins\/?(?:\?([^#]*))?/i);
  if (!m) return null;
  const q = new Map<string, string>();
  for (const part of (m[1] ?? "").split("&")) {
    if (!part) continue;
    const [k, v = ""] = part.split("=");
    try {
      q.set(decodeURIComponent(k), decodeURIComponent(v.replace(/\+/g, " ")));
    } catch {
      q.set(k, v);
    }
  }
  return { order: q.get("order") ?? null, result: q.get("result") ?? null };
}

// ---------- the routes ----------

export async function fetchCoinsConfig(client: GameClient, region: string): Promise<CoinsConfig> {
  const key = client.deviceKey();
  const raw = await client.retrying(() => client.request<unknown>("GET", "v1/coins/config", { query: { device_key: key, region } }));
  return parseCoinsConfig(raw);
}

export async function fetchCoinHistory(client: GameClient) {
  const key = client.deviceKey();
  const raw = await client.retrying(() => client.request<unknown>("GET", "v1/coins/history", { query: { device_key: key }, signed: true }));
  return parseHistory(raw);
}

/** The server creates the Stripe session and the app opens Stripe's own page; nothing about the card passes through the app. */
export async function createCheckout(client: GameClient, packId: string, region: string): Promise<{ order_id: string; checkout_url: string; expires_at?: string | null }> {
  const raw = await client.request<Record<string, unknown>>("POST", "v1/coins/checkout", {
    body: { device_key: client.deviceKey(), pack_id: packId, region },
    signed: true,
  });
  const order_id = str(raw?.order_id);
  const checkout_url = str(raw?.checkout_url);
  if (!order_id || !checkout_url) throw new GameError("decoding", "The server sent something unexpected.");
  return { order_id, checkout_url, expires_at: str(raw.expires_at) };
}

export async function fetchOrder(client: GameClient, orderId: string): Promise<CoinOrder | null> {
  const key = client.deviceKey();
  const raw = await client.retrying(() =>
    client.request<unknown>("GET", `v1/coins/order/${encodeURIComponent(orderId)}`, { query: { device_key: key }, signed: true }),
  );
  return parseOrder(raw);
}

/** Enter an event with coins. Idempotent on the server per game. */
export async function spendCoins(client: GameClient, gameId: string): Promise<{ spent: number | null; balance: number; entered: boolean | null }> {
  const raw = await client.request<Record<string, unknown>>("POST", "v1/coins/spend", {
    body: { device_key: client.deviceKey(), game_id: gameId },
    signed: true,
  });
  const balance = num(raw?.coins) ?? num(raw?.balance);
  if (balance === null) throw new GameError("decoding", "The server sent something unexpected.");
  return { spent: num(raw.spent) ?? num(raw.entry_coins), balance, entered: typeof raw.entered === "boolean" ? raw.entered : null };
}

// ---------- the model ----------

export type CoinsState = {
  config: CoinsConfig | null;
  history: CoinHistoryRow[];
  balance: number | null;
  region: string;
  problem: string | null;
  busy: boolean;
  /** Coins just added, for the "+1,200" moment. Null when nothing to show. */
  gained: number | null;
  /** The order the player is paying for right now, so a close without the return link is still followed up. */
  pendingOrder: string | null;
};

export type CoinsDeps = {
  client: GameClient;
  isProduction: boolean;
  /** The phone's region (alpha-2), "" when unknown. */
  deviceRegion: () => string;
  /** The server's own `me` refresh, after a purchase. */
  refreshMe?: () => Promise<void>;
  /** The player's coins from `me` (the balance until the ledger says). */
  meCoins?: () => number | null;
  /** Success haptic + coin sound, at the moment coins are added. */
  onCelebrate?: (coins: number) => void;
  sleep?: (ms: number) => Promise<void>;
  /** A debug override for the region (iOS: -coinsRegion). */
  regionOverride?: () => string | null | undefined;
};

const EMPTY: CoinsState = { config: null, history: [], balance: null, region: "", problem: null, busy: false, gained: null, pendingOrder: null };

export function createCoinsStore(deps: CoinsDeps) {
  let state: CoinsState = EMPTY;
  const listeners = new Set<() => void>();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const set = (patch: Partial<CoinsState>) => {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  };

  function celebrate(coins: number) {
    if (coins <= 0) return;
    set({ gained: coins });
    deps.onCelebrate?.(coins);
  }

  /** The webhook can land a moment after the browser returns, so the order is asked about a few times first. */
  const following = new Set<string>();
  async function follow(orderId: string, quiet = false): Promise<void> {
    // The return link and the browser closing both ask: one asker per order, or the moment plays twice.
    if (following.has(orderId)) return;
    following.add(orderId);
    try {
      await followOnce(orderId, quiet);
    } finally {
      following.delete(orderId);
    }
  }

  async function followOnce(orderId: string, quiet: boolean): Promise<void> {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        const o = await fetchOrder(deps.client, orderId);
        if (o) {
          if (o.status === "paid") {
            set({ pendingOrder: null, ...(o.balance != null ? { balance: o.balance } : {}) });
            celebrate(o.coins ?? 0);
            await store.refresh();
            return;
          }
          if (o.status === "expired" || o.status === "cancelled" || o.status === "failed") {
            set({ pendingOrder: null });
            return;
          }
        }
      } catch {
        // Ask again: a lost reply is not a failed payment.
      }
      await sleep(500 + 300 * attempt);
    }
    if (!quiet) set({ problem: "Your payment is still being confirmed. Your CosCoins will appear as soon as it is." });
  }

  const store = {
    get: () => state,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },

    webAllowed: () => webAllowed(state.config, state.region),
    packs: (): CoinPack[] => (webAllowed(state.config, state.region) ? (state.config?.packs ?? []) : []),
    /** What the sheet shows as the balance: the ledger's when known, else the player's standing. */
    displayBalance: (): number => state.balance ?? deps.meCoins?.() ?? 0,

    async refresh(): Promise<void> {
      if (!state.region) {
        set({ region: coinRegion({ isProduction: deps.isProduction, deviceRegion: deps.deviceRegion(), override: deps.regionOverride?.() }) });
      }
      try {
        deps.client.deviceKey();
      } catch {
        return;
      }
      const [config, history] = await Promise.all([
        fetchCoinsConfig(deps.client, state.region).catch(() => null),
        fetchCoinHistory(deps.client).catch(() => null),
      ]);
      if (config) set({ config });
      if (history) {
        const before = state.balance;
        set({ history: history.entries, ...(history.balance != null ? { balance: history.balance } : {}) });
        // Coins that arrived some other way (a payment confirmed after the window closed).
        if (before != null && history.balance != null && history.balance > before && state.gained === null) celebrate(history.balance - before);
      }
      if (deps.refreshMe) await deps.refreshMe();
    },

    /** A pack tapped: the URL of Stripe's hosted checkout for the caller to open, or null (the reason is in `problem`). */
    async buy(pack: CoinPack): Promise<string | null> {
      if (state.busy || !webAllowed(state.config, state.region)) return null;
      set({ busy: true, problem: null });
      try {
        const c = await createCheckout(deps.client, pack.id, state.region);
        if (!isHttpsUrl(c.checkout_url)) {
          set({ problem: "Checkout couldn't open. Try again." });
          return null;
        }
        set({ pendingOrder: c.order_id });
        return c.checkout_url;
      } catch (error) {
        set({ problem: error instanceof GameError ? error.message : "Checkout couldn't open. Try again." });
        return null;
      } finally {
        set({ busy: false });
      }
    },

    /** cosquest://coins?order=...&result=...: the way back from Stripe. */
    async handleReturn(ret: { order?: string | null; result?: string | null }): Promise<void> {
      const order = ret.order ?? state.pendingOrder;
      if (!order) return;
      if (ret.result === "cancel") {
        set({ pendingOrder: null, problem: null });
        return;
      }
      await follow(order);
    },

    /** The browser was closed by the player: ask what happened rather than assume. */
    async checkoutClosed(): Promise<void> {
      const order = state.pendingOrder;
      if (!order) return;
      await follow(order, true);
    },

    dismissGained() {
      if (state.gained !== null) set({ gained: null });
    },

    clearProblem() {
      if (state.problem) set({ problem: null });
    },

    /** A different player: forget the last one's ledger. */
    reset() {
      state = EMPTY;
      listeners.forEach((l) => l());
    },
  };
  return store;
}

export type CoinsStore = ReturnType<typeof createCoinsStore>;
