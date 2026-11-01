// ==========================================
// TICKETS SAVED ON THE PHONE (offline at the door)
// ==========================================
// Venues often have bad signal, so the next few tickets - including their QR
// code - are kept in the app's secure storage (encrypted on phones, the
// browser's storage on the website) and shown instantly, then refreshed
// when the connection is back. The code never changes, and check-in still
// happens once on the server, so a saved copy is safe to show.
import { useCallback, useEffect, useState } from "react";

import { useAppSelector } from "@/store/hooks";
import { getPref, setPref } from "@/utils/prefsStorage";

import { type MyTicket, getMyTicket, getMyTickets } from "./tickets";

const KEEP = 5; // secure storage is small: the next five tickets
const keyFor = (owner: string) => `tickets_${owner}`.slice(0, 120);

// Only what the ticket screen needs (keeps it small).
function slim(t: MyTicket): MyTicket {
  const q = t.quest;
  return {
    id: t.id,
    status: t.status,
    ...(t.code ? { code: t.code } : {}),
    quest: q ? ({ id: q.id, title: q.title, startsAt: q.startsAt, endsAt: q.endsAt, location: q.location ? { name: q.location.name, address: q.location.address } : undefined } as any) : null,
    ticketType: t.ticketType,
    order: t.order ? { ...t.order } : null,
    checkedInAt: t.checkedInAt,
    canGiveBack: false, // decided by the server when online
    giveBackUntil: t.giveBackUntil,
  };
}

const upcoming = (t: MyTicket) => (t.status === "valid" || t.status === "checked_in") && !!t.quest?.endsAt && new Date(t.quest.endsAt).getTime() > Date.now();

export async function loadSaved(owner: string): Promise<MyTicket[]> {
  try {
    const raw = await getPref(keyFor(owner));
    const list = raw ? (JSON.parse(raw) as MyTicket[]) : [];
    return list.filter(upcoming);
  } catch {
    return [];
  }
}

/** Saves the next tickets, keeping codes already saved (the list has none). */
export async function saveTickets(owner: string, fresh: MyTicket[]) {
  const before = await loadSaved(owner);
  const codes = new Map(before.filter((t) => t.code).map((t) => [t.id, t.code!]));
  const next = fresh
    .filter(upcoming)
    .sort((a, b) => new Date(a.quest!.startsAt || 0).getTime() - new Date(b.quest!.startsAt || 0).getTime())
    .slice(0, KEEP)
    .map((t) => slim({ ...t, code: t.code || codes.get(t.id) }));
  await setPref(keyFor(owner), JSON.stringify(next));
}

/** Saves (or updates) one ticket, with its code. */
export async function saveTicket(owner: string, ticket: MyTicket) {
  const list = await loadSaved(owner);
  const others = list.filter((t) => t.id !== ticket.id);
  await saveTickets(owner, [...others, ticket]);
}

export async function savedTicket(owner: string, id: string) {
  return (await loadSaved(owner)).find((t) => t.id === id) || null;
}

export function useTicketOwner() {
  const user = useAppSelector((state) => state.auth.user) as any;
  return String(user?.profile?.username || user?.email || user?.id || "me").toLowerCase();
}

/**
 * Upcoming tickets: the saved copy at once, then the server's. The next
 * ticket starting within 48 hours is fetched with its code and saved, so
 * its QR shows offline.
 */
export function useUpcomingTickets() {
  const token = useAppSelector((state) => state.auth.token);
  const owner = useTicketOwner();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [offline, setOffline] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const fresh = (await getMyTickets("upcoming", token)).tickets.filter(upcoming);
      setTickets(fresh);
      setOffline(false);
      await saveTickets(owner, fresh);
      const next = fresh[0];
      if (next && next.status === "valid" && new Date(next.quest!.startsAt || 0).getTime() - Date.now() < 48 * 3600e3) {
        const full = await getMyTicket(next.id, token).catch(() => null);
        if (full) await saveTicket(owner, full.ticket);
      }
    } catch {
      setOffline(true);
    }
  }, [token, owner]);

  useEffect(() => {
    let alive = true;
    loadSaved(owner).then((saved) => {
      if (alive) setTickets((current) => current ?? saved);
    });
    refresh();
    return () => {
      alive = false;
    };
  }, [owner, refresh]);

  return { tickets, offline, refresh };
}
