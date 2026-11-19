"use client";
import type { Property } from "@/lib/types";
import type { ClientRecord } from "@/lib/client-data";
import type { Appointment, FollowUp } from "@/lib/operations-data";
import type { AdRecord } from "@/lib/ads-data";

// The workspace keeps a copy of the last successful load in the browser so the
// dashboard paints with real rows immediately, then refreshes in the background.
const KEY = "aqar-workspace-cache-v1";
const MAX_BYTES = 4_500_000;

export type WorkspaceCounts = { properties: number; availableProperties: number; clients: number };

export type WorkspaceSnapshot = {
  savedAt: number;
  properties: Property[];
  clients: ClientRecord[];
  followUps: FollowUp[];
  appointments: Appointment[];
  ads: AdRecord[];
  favorites: string[];
  counts: WorkspaceCounts;
};

export function readWorkspaceCache(): WorkspaceSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    if (!parsed || !Array.isArray(parsed.properties)) return null;
    return {
      savedAt: parsed.savedAt ?? 0,
      properties: parsed.properties,
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      followUps: Array.isArray(parsed.followUps) ? parsed.followUps : [],
      appointments: Array.isArray(parsed.appointments) ? parsed.appointments : [],
      ads: Array.isArray(parsed.ads) ? parsed.ads : [],
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
      counts: parsed.counts ?? { properties: 0, availableProperties: 0, clients: 0 },
    };
  } catch {
    return null;
  }
}

export function writeWorkspaceCache(snapshot: Omit<WorkspaceSnapshot, "savedAt">) {
  if (typeof window === "undefined") return;
  try {
    const payload = JSON.stringify({ ...snapshot, savedAt: Date.now() });
    if (payload.length > MAX_BYTES) return;
    window.localStorage.setItem(KEY, payload);
  } catch {
    // Storage can be full or disabled; the app still works without the cache.
  }
}

export function clearWorkspaceCache() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.localStorage.removeItem("aqar-client-phones-cache-v1");
  } catch {
    // ignore
  }
}
