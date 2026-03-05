"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  cn,
  formatNumber,
  formatCountdown,
  getTimeUntilNextTick,
} from "@/lib/utils";
import { usePlayer } from "@/lib/context/PlayerContext";
import { BALANCE } from "@/lib/game/balance";
import {
  Home,
  Sword,
  Users,
  Star,
  Dumbbell,
  Building2,
  ShoppingBag,
  Pickaxe,
  Landmark,
  History,
  LogOut,
  Settings,
  Gem,
  Zap,
  Crown,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/base", icon: Home, label: "בסיס", labelEn: "Base" },
  { href: "/attack", icon: Sword, label: "תקיפה", labelEn: "Attack" },
  { href: "/tribe", icon: Users, label: "שבט", labelEn: "Clan" },
  { href: "/hero", icon: Star, label: "גיבור", labelEn: "Hero" },
  { href: "/training", icon: Dumbbell, label: "אימון", labelEn: "Train" },
  { href: "/develop", icon: Building2, label: "פיתוח", labelEn: "Develop" },
  { href: "/shop", icon: ShoppingBag, label: "חנות", labelEn: "Shop" },
  { href: "/mine", icon: Pickaxe, label: "מכרות", labelEn: "Mines" },
  { href: "/bank", icon: Landmark, label: "בנק", labelEn: "Bank" },
  { href: "/history", icon: History, label: "היסטוריה", labelEn: "History" },
  { href: "/vip", icon: Gem, label: "VIP", labelEn: "VIP" },
];

const MOBILE_NAV = ["/base", "/attack", "/tribe", "/hero", "/training"];

const RACE_LABEL: Record<string, string> = {
  orc: "אורק",
  human: "אדם",
  elf: "אלף",
  dwarf: "גמד",
};

function AnimatedNumber({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const prev = prevRef.current;
    if (prev === value) return;
    prevRef.current = value;
    const diff = value - prev;
    const steps = 18;
    const stepSize = diff / steps;
    let step = 0;
    const id = setInterval(() => {
      step++;
      setDisplayed(Math.round(prev + stepSize * step));
      if (step >= steps) {
        clearInterval(id);
        setDisplayed(value);
      }
    }, 16);
    return () => clearInterval(id);
  }, [value]);

  return <span className="tabular-nums">{formatNumber(displayed, true)}</span>;
}

/**
 * TickCountdown — server-authoritative countdown timer.
 *
 * Source of truth: next_tick_at from /api/tick-status (set by the tick route).
 * All players see the identical countdown because it counts down from the
 * same server timestamp, not from the local wall-clock.
 *
 * Update paths:
 *   1. On mount: fetch /api/tick-status → set nextTickAt
 *   2. On tick_completed window event (dispatched by RealtimeSync from the
 *      realtime broadcast payload): update nextTickAt to the new server value
 *   3. Heartbeat re-sync every 5 minutes to correct any drift
 *   4. When timer reaches 0 (tick overdue): poll every 5 s until next_tick_at
 *      is in the future again (tick ran + world_state updated)
 *   5. Fallback: if fetch fails, getTimeUntilNextTick() is used (local clock)
 *
 * In development (NODE_ENV=development) a debug line is shown below the timer.
 */
function TickCountdown() {
  const [nextTickAt, setNextTickAt] = useState<string | null>(null);
  const [serverNow, setServerNow] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const overduePollerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const syncFromServer = useCallback(() => {
    fetch("/api/tick-status")
      .then((r) => r.json())
      .then((data: { server_now: string; next_tick_at: string | null }) => {
        if (process.env.NODE_ENV === "development") {
          const d = data.next_tick_at ? new Date(data.next_tick_at) : null;
          const diff = d ? d.getTime() - Date.now() : null;
          console.log("[TickCountdown] server_now", data.server_now);
          console.log("[TickCountdown] next_tick_at", data.next_tick_at);
          console.log("[TickCountdown] parsed toString()", d?.toString() ?? "null");
          console.log("[TickCountdown] isNaN?", d ? isNaN(d.getTime()) : "no date");
          console.log("[TickCountdown] diff ms", diff, diff !== null ? (diff > 0 ? "FUTURE ✓" : "PAST ✗") : "—");
        }
        if (data.next_tick_at) setNextTickAt(data.next_tick_at);
        if (data.server_now) setServerNow(data.server_now);
      })
      .catch(() => {/* fallback to local clock via null nextTickAt */});
  }, []);

  // Mount: initial fetch + heartbeat every 5 minutes
  useEffect(() => {
    syncFromServer();
    const heartbeat = setInterval(syncFromServer, 5 * 60 * 1000);
    return () => clearInterval(heartbeat);
  }, [syncFromServer]);

  // Listen for tick_completed window event dispatched by RealtimeSync
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ next_tick_at: string }>).detail;
      if (detail?.next_tick_at) {
        setNextTickAt(detail.next_tick_at);
        // Stop any overdue poller — a fresh next_tick_at just arrived
        if (overduePollerRef.current) {
          clearInterval(overduePollerRef.current);
          overduePollerRef.current = null;
        }
      }
    };
    window.addEventListener("domiron:tick-completed", handler);
    return () => window.removeEventListener("domiron:tick-completed", handler);
  }, []);

  // Count down every second; when overdue, start polling every 5 s
  useEffect(() => {
    const compute = () =>
      nextTickAt
        ? new Date(nextTickAt).getTime() - Date.now()
        : getTimeUntilNextTick();

    const tick = () => {
      const raw = compute();
      setMs(Math.max(0, raw));

      if (raw <= 0 && !overduePollerRef.current) {
        // Tick is overdue — poll server every 5 s until next_tick_at advances
        overduePollerRef.current = setInterval(() => {
          syncFromServer();
        }, 5_000);
      } else if (raw > 0 && overduePollerRef.current) {
        clearInterval(overduePollerRef.current);
        overduePollerRef.current = null;
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => {
      clearInterval(id);
      if (overduePollerRef.current) {
        clearInterval(overduePollerRef.current);
        overduePollerRef.current = null;
      }
    };
  }, [nextTickAt, syncFromServer]);

  const isDev = process.env.NODE_ENV === "development";
  const remainingSec = ms !== null ? Math.round(ms / 1000) : null;

  return (
    <>
      <span className="tabular-nums font-semibold text-game-gold-bright">
        {ms === null ? "--:--" : formatCountdown(ms)}
      </span>
      {isDev && nextTickAt && (
        <span
          title={`server_now=${serverNow ?? "?"} next_tick_at=${nextTickAt} remaining=${remainingSec}s`}
          className="ms-1 text-[8px] text-game-text-muted tabular-nums cursor-help"
        >
          ({remainingSec}s)
        </span>
      )}
    </>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="px-3 pt-2 pb-0.5 flex items-center gap-2">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-game-border-gold/40 to-transparent" />
      <span className="text-[8px] font-heading uppercase tracking-[0.18em] text-game-text-muted shrink-0">
        {label}
      </span>
      <div className="h-px flex-1 bg-gradient-to-r from-transparent via-game-border-gold/40 to-transparent" />
    </div>
  );
}

/** Icon + number only, no label — minimal space */
function ResourceChip({
  emoji,
  value,
  valueClass,
}: {
  emoji: string;
  value: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-0.5 shrink-0">
      <span className="text-[10px] leading-none" aria-hidden>
        {emoji}
      </span>
      <span
        className={cn("text-[10px] font-semibold tabular-nums", valueClass)}
      >
        {value}
      </span>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { player, resources, hero } = usePlayer();

  const cityName = player
    ? (BALANCE.cities.names[player.city] ?? `City ${player.city}`)
    : "—";
  const raceName = player ? (RACE_LABEL[player.race] ?? player.race) : "—";

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "sidebar hidden md:flex flex-col",
          "fixed top-[76px] bottom-3 start-4 z-30",
          "w-sidebar",
          "rounded-xl",
          "border border-game-border-gold/20",
          "bg-gradient-to-b from-game-surface/98 via-game-surface/96 to-game-bg/92",
          "backdrop-blur-game",
          "overflow-y-auto overflow-x-hidden",
          "shadow-[0_8px_32px_rgba(0,0,0,0.55),0_0_0_1px_rgba(201,144,26,0.08),inset_0_1px_0_rgba(240,192,48,0.05)]",
        )}
      >
        {/* Brand */}
        <Link
          href="/base"
          className="flex items-center gap-2 px-4 py-3 hover:opacity-80 transition-opacity shrink-0"
        >
          <Crown className="size-4 text-game-gold-bright drop-shadow-[0_0_6px_rgba(240,192,48,0.4)]" />
          <span className="font-display text-game-sm text-game-gold-bright uppercase tracking-widest text-title-glow">
            Domiron
          </span>
        </Link>
        <div className="divider-gold" />

        {/* Player identity */}
        <div className="px-3 py-1.5 shrink-0">
          <p className="font-heading text-game-xs text-game-gold-bright truncate leading-snug">
            {player?.username ?? "…"}
          </p>
          <p className="text-[8px] text-game-text-muted font-body mt-0.5 uppercase tracking-wide">
            {raceName} · {cityName}
          </p>
        </div>

        {/* Ranking */}
        <SectionLabel label="Ranking" />
        <div className="px-3 pb-2 pt-0.5 space-y-0.5">
          <div className="flex items-center justify-between text-[10px] font-body">
            <span className="text-game-text-secondary">Global Rank</span>
            <span className="font-semibold text-game-gold-bright tabular-nums">
              {player?.rank_global != null ? `#${player.rank_global}` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] font-body">
            <span className="text-game-text-secondary">City Rank</span>
            <span className="font-semibold text-game-gold-bright tabular-nums">
              {player?.rank_city != null ? `#${player.rank_city}` : "—"}
            </span>
          </div>
        </div>

        {/* Resources — icon + number only */}
        <SectionLabel label="Resources" />
        <div className="px-3 pb-2 pt-0.5 flex flex-wrap gap-x-3 gap-y-1.5">
          <ResourceChip
            emoji="🪙"
            value={<AnimatedNumber value={resources?.gold ?? 0} />}
            valueClass="text-res-gold"
          />
          <ResourceChip
            emoji="⚙️"
            value={<AnimatedNumber value={resources?.iron ?? 0} />}
            valueClass="text-res-iron"
          />
          <ResourceChip
            emoji="🪵"
            value={<AnimatedNumber value={resources?.wood ?? 0} />}
            valueClass="text-res-wood"
          />
          <ResourceChip
            emoji="🌾"
            value={<AnimatedNumber value={resources?.food ?? 0} />}
            valueClass="text-res-food"
          />
          {hero?.mana !== undefined && (
            <ResourceChip
              emoji="🔮"
              value={<AnimatedNumber value={hero.mana} />}
              valueClass="text-res-mana"
            />
          )}
        </div>

        {/* Status — תורות + טיק הבא קרוב */}
        <SectionLabel label="Status" />
        <div className="px-3 pb-2 pt-0.5 flex items-center gap-3 text-[10px]">
          <div className="flex items-center gap-1">
            <Zap className="size-3 text-res-turns shrink-0" />
            <span className="font-semibold text-res-turns tabular-nums">
              {player?.turns ?? 0}
            </span>
            <span className="text-game-text-muted">/</span>
            <span className="text-game-text-muted tabular-nums">
              {BALANCE.tick.maxTurns}
            </span>
          </div>
          <span className="text-game-text-muted">·</span>
          <div className="flex items-center gap-1">
            <span className="text-game-text-muted">טיק הבא</span>
            <TickCountdown />
          </div>
        </div>

        {/* Navigation */}
        <SectionLabel label="Navigation" />
        <nav className="flex-1 py-1 min-h-0 space-y-0.5">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
            const isActive =
              pathname === href || pathname.startsWith(href + "/");
            return (
              <Link
                key={href}
                href={href}
                className={cn("nav-link", isActive && "active")}
              >
                <Icon
                  className={cn(
                    "size-3.5 shrink-0 transition-all duration-200",
                    isActive &&
                      "text-game-gold-bright drop-shadow-[0_0_4px_rgba(240,192,48,0.4)]",
                  )}
                />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-3 shrink-0">
          <div className="divider-gold mb-3" />
          <button
            onClick={() => signOut({ callbackUrl: "/login" })}
            className={cn(
              "nav-link w-full text-start cursor-pointer",
              "hover:!bg-game-red/15 hover:!text-game-red-bright hover:!border-game-red/30",
            )}
          >
            <LogOut className="size-4 shrink-0" />
            <span>יציאה</span>
          </button>
        </div>
      </aside>

      {/* Mobile bottom navigation */}
      <nav
        className={cn(
          "md:hidden fixed bottom-0 start-0 end-0 z-30",
          "bg-game-surface/95 backdrop-blur-game",
          "border-t border-game-border-gold/30",
          "shadow-[0_-4px_20px_rgba(0,0,0,0.5)]",
          "flex items-center justify-around px-1 py-1.5",
        )}
      >
        {NAV_ITEMS.filter((i) => MOBILE_NAV.includes(i.href)).map(
          ({ href, icon: Icon, label }) => {
            const isActive = pathname === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-game min-w-[52px]",
                  "transition-all duration-200",
                  isActive
                    ? "text-game-gold-bright bg-game-gold/10"
                    : "text-game-text-muted hover:text-game-text-secondary",
                )}
              >
                <Icon
                  className={cn(
                    "size-5",
                    isActive && "drop-shadow-[0_0_8px_rgba(240,192,48,0.6)]",
                  )}
                />
                <span className="text-[9px] font-heading uppercase tracking-wide">
                  {label}
                </span>
              </Link>
            );
          },
        )}
        <Link
          href="/settings"
          className={cn(
            "flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-game min-w-[52px]",
            "transition-all duration-200",
            pathname === "/settings"
              ? "text-game-gold-bright bg-game-gold/10"
              : "text-game-text-muted",
          )}
        >
          <Settings className="size-5" />
          <span className="text-[9px] font-heading uppercase tracking-wide">
            עוד
          </span>
        </Link>
      </nav>
    </>
  );
}
