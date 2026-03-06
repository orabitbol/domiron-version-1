"use client";

import { useState } from "react";
import { BALANCE } from "@/lib/game/balance";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/utils";
import { usePlayer } from "@/lib/context/PlayerContext";
import { useFreeze } from "@/lib/hooks/useFreeze";
import type { Weapons, Resources } from "@/types/game";

type TabKey = "attack" | "defense" | "spy" | "scout";

const TABS = [
  { key: "attack", label: "Arsenal", icon: "⚔️" },
  { key: "defense", label: "Armory", icon: "🛡️" },
  { key: "spy", label: "Shadows", icon: "🌑" },
  { key: "scout", label: "Rangers", icon: "👁️" },
];

// ── Item lists — unchanged keys, order, and values ───────────────────────

const ATTACK_WEAPONS = [
  { key: "slingshot", label: "Slingshot" },
  { key: "boomerang", label: "Boomerang" },
  { key: "pirate_knife", label: "Pirate Knife" },
  { key: "axe", label: "Axe" },
  { key: "master_knife", label: "Master Knife" },
  { key: "knight_axe", label: "Knight Axe" },
  { key: "iron_ball", label: "Iron Ball" },
] as const;

const DEFENSE_WEAPONS = [
  { key: "wood_shield", label: "Wood Shield" },
  { key: "iron_shield", label: "Iron Shield" },
  { key: "leather_armor", label: "Leather Armor" },
  { key: "chain_armor", label: "Chain Armor" },
  { key: "plate_armor", label: "Plate Armor" },
  { key: "mithril_armor", label: "Mithril Armor" },
  { key: "gods_armor", label: "God's Armor" },
] as const;

const SPY_WEAPONS = [
  { key: "shadow_cloak", label: "Shadow Cloak" },
  { key: "dark_mask", label: "Dark Mask" },
  { key: "elven_gear", label: "Elven Gear" },
] as const;

const SCOUT_WEAPONS = [
  { key: "scout_boots", label: "Scout Boots" },
  { key: "scout_cloak", label: "Scout Cloak" },
  { key: "elven_boots", label: "Elven Boots" },
] as const;

const SPY_PRICES: Record<string, number> = {
  shadow_cloak: 5000,
  dark_mask: 20000,
  elven_gear: 80000,
};
const SCOUT_PRICES: Record<string, number> = {
  scout_boots: 5000,
  scout_cloak: 20000,
  elven_boots: 80000,
};

// ── Visual tier system ─────────────────────────────────────────────────────

type TierKey = "rustic" | "iron" | "forged" | "runic" | "divine";

interface TierStyle {
  label: string;
  textColor: string;
  iconBg: string;
  iconBorder: string;
  iconShadow: string;
  leftBorder: string;
  rowBg: string;
  badgeBg: string;
  badgeBorder: string;
}

const TIER: Record<TierKey, TierStyle> = {
  rustic: {
    label: "Rustic",
    textColor: "rgba(162,140,105,0.85)",
    iconBg: "rgba(38,30,18,0.95)",
    iconBorder: "rgba(105,88,58,0.55)",
    iconShadow: "none",
    leftBorder: "rgba(105,88,58,0.65)",
    rowBg: "linear-gradient(135deg, rgba(16,12,6,0.98), rgba(10,8,4,1))",
    badgeBg: "rgba(55,44,28,0.75)",
    badgeBorder: "rgba(105,88,58,0.45)",
  },
  iron: {
    label: "Iron",
    textColor: "rgba(130,170,225,0.9)",
    iconBg: "rgba(16,32,62,0.95)",
    iconBorder: "rgba(75,115,180,0.6)",
    iconShadow: "0 0 10px rgba(75,140,220,0.2)",
    leftBorder: "rgba(75,130,200,0.7)",
    rowBg: "linear-gradient(135deg, rgba(12,18,28,0.98), rgba(8,12,18,1))",
    badgeBg: "rgba(22,40,78,0.75)",
    badgeBorder: "rgba(75,115,180,0.45)",
  },
  forged: {
    label: "Forged",
    textColor: "rgba(72,208,162,0.9)",
    iconBg: "rgba(8,42,36,0.95)",
    iconBorder: "rgba(50,150,120,0.6)",
    iconShadow: "0 0 12px rgba(50,175,140,0.25)",
    leftBorder: "rgba(50,160,128,0.7)",
    rowBg: "linear-gradient(135deg, rgba(8,16,14,0.98), rgba(5,10,8,1))",
    badgeBg: "rgba(12,52,44,0.75)",
    badgeBorder: "rgba(50,150,120,0.45)",
  },
  runic: {
    label: "Runic",
    textColor: "rgba(192,118,255,0.9)",
    iconBg: "rgba(32,14,62,0.95)",
    iconBorder: "rgba(148,75,220,0.6)",
    iconShadow: "0 0 14px rgba(165,75,240,0.32)",
    leftBorder: "rgba(148,72,230,0.7)",
    rowBg: "linear-gradient(135deg, rgba(15,8,24,0.98), rgba(10,5,16,1))",
    badgeBg: "rgba(48,18,78,0.75)",
    badgeBorder: "rgba(148,75,220,0.45)",
  },
  divine: {
    label: "Divine",
    textColor: "rgba(240,200,52,1.0)",
    iconBg: "rgba(48,34,6,0.98)",
    iconBorder: "rgba(201,144,26,0.78)",
    iconShadow: "0 0 18px rgba(201,144,26,0.5)",
    leftBorder: "rgba(201,144,26,0.88)",
    rowBg: "linear-gradient(135deg, rgba(22,16,4,0.99), rgba(12,8,2,1))",
    badgeBg: "rgba(58,42,8,0.8)",
    badgeBorder: "rgba(201,144,26,0.58)",
  },
};

// ── Weapon icon + tier metadata ────────────────────────────────────────────

const WEAPON_META: Record<string, { icon: string; tier: TierKey }> = {
  slingshot: { icon: "🪃", tier: "rustic" },
  boomerang: { icon: "🎯", tier: "rustic" },
  pirate_knife: { icon: "🗡️", tier: "iron" },
  axe: { icon: "🪓", tier: "iron" },
  master_knife: { icon: "⚔️", tier: "forged" },
  knight_axe: { icon: "🔱", tier: "runic" },
  iron_ball: { icon: "💀", tier: "divine" },
  wood_shield: { icon: "🛡️", tier: "rustic" },
  iron_shield: { icon: "🛡️", tier: "iron" },
  leather_armor: { icon: "🥷", tier: "iron" },
  chain_armor: { icon: "⛓️", tier: "forged" },
  plate_armor: { icon: "🦾", tier: "forged" },
  mithril_armor: { icon: "💠", tier: "runic" },
  gods_armor: { icon: "👑", tier: "divine" },
  shadow_cloak: { icon: "🌑", tier: "iron" },
  dark_mask: { icon: "🎭", tier: "forged" },
  elven_gear: { icon: "🧝", tier: "runic" },
  scout_boots: { icon: "👢", tier: "iron" },
  scout_cloak: { icon: "🗺️", tier: "forged" },
  elven_boots: { icon: "🌟", tier: "runic" },
};

const ROMAN = ["I", "II", "III"] as const;

// ── Component ──────────────────────────────────────────────────────────────

export function ShopClient() {
  const { weapons, resources, refresh, applyPatch } = usePlayer();
  const isFrozen = useFreeze();
  const [activeTab, setActiveTab] = useState<TabKey>("attack");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Fallback empty objects so reads never throw
  const weaponState = weapons ?? ({} as Weapons);
  const resourceState =
    resources ?? ({ gold: 0, iron: 0, wood: 0, food: 0 } as Resources);

  // ── Buy / Sell — identical logic ─────────────────────────────────────────

  async function handleBuy(weaponKey: string, category: string) {
    const amt = parseInt(amounts[weaponKey] || "1") || 1;
    setLoading(`buy-${weaponKey}`);
    setMessage(null);
    try {
      const res = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weapon: weaponKey, amount: amt, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Purchase failed", type: "error" });
      } else {
        setMessage({
          text: `Purchased ${amt}x ${weaponKey.replace(/_/g, " ")}`,
          type: "success",
        });
        setAmounts((p) => {
          if (!(weaponKey in p)) return p;
          const next = { ...p };
          delete next[weaponKey];
          return next;
        });
        if (data.weapons) applyPatch({ weapons: data.weapons });
        if (data.resources) applyPatch({ resources: data.resources });
        refresh();
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setLoading(null);
    }
  }

  async function handleSell(weaponKey: string, category: string) {
    const amt = parseInt(amounts[weaponKey] || "1") || 1;
    setLoading(`sell-${weaponKey}`);
    setMessage(null);
    try {
      const res = await fetch("/api/shop/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weapon: weaponKey, amount: amt, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Sale failed", type: "error" });
      } else {
        setMessage({
          text: `Sold ${amt}x ${weaponKey.replace(/_/g, " ")}`,
          type: "success",
        });
        setAmounts((p) => {
          if (!(weaponKey in p)) return p;
          const next = { ...p };
          delete next[weaponKey];
          return next;
        });
        if (data.weapons) applyPatch({ weapons: data.weapons });
        if (data.resources) applyPatch({ resources: data.resources });
        refresh();
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setLoading(null);
    }
  }

  // ── Shared sub-elements ───────────────────────────────────────────────────

  const refundPct = (BALANCE.weapons.sellRefundPercent * 100).toFixed(0);

  function CostPill({
    icon,
    text,
    tone = "gold",
  }: {
    icon: string;
    text: string;
    tone?: "gold" | "iron";
  }) {
    const styles =
      tone === "iron"
        ? {
            fg: "rgba(140,190,255,0.95)",
            bg: "rgba(22,40,78,0.55)",
            br: "rgba(75,115,180,0.45)",
          }
        : {
            fg: "rgba(240,200,52,0.95)",
            bg: "rgba(58,42,8,0.55)",
            br: "rgba(201,144,26,0.45)",
          };

    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          padding: "2px 8px",
          borderRadius: "999px",
          background: styles.bg,
          border: `1px solid ${styles.br}`,
          color: styles.fg,
          fontWeight: 700,
          letterSpacing: "0.02em",
          fontFamily: "Source Sans 3, sans-serif",
          fontSize: "0.66rem",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.22)",
        }}
      >
        <span style={{ opacity: 0.95 }}>{icon}</span>
        <span className="tabular-nums">{text}</span>
      </span>
    );
  }

  function OwnedPill({ count }: { count: number }) {
    return (
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "5px",
          padding: "4px 12px",
          borderRadius: "6px",
          background: count > 0 ? "rgba(30,22,10,0.65)" : "rgba(0,0,0,0.28)",
          border: count > 0
            ? "1px solid rgba(201,144,26,0.3)"
            : "1px solid rgba(201,144,26,0.12)",
          fontFamily: "Source Sans 3, sans-serif",
        }}
      >
        <span
          style={{
            fontSize: "0.55rem",
            fontWeight: 600,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: count > 0 ? "rgba(201,144,26,0.7)" : "rgba(201,144,26,0.38)",
          }}
        >
          Owned
        </span>
        <span
          className="tabular-nums"
          style={{
            fontSize: "0.85rem",
            fontWeight: 800,
            color: count > 0 ? "rgba(240,200,52,0.95)" : "rgba(201,144,26,0.35)",
            letterSpacing: "-0.02em",
          }}
        >
          {formatNumber(count)}
        </span>
      </span>
    );
  }

  function TierBadge({ t }: { t: TierStyle }) {
    return (
      <span
        style={{
          fontSize: "0.44rem",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          padding: "1px 5px",
          borderRadius: "3px",
          background: t.badgeBg,
          border: `1px solid ${t.badgeBorder}`,
          color: t.textColor,
          fontFamily: "Cinzel, serif",
          flexShrink: 0,
        }}
      >
        {t.label}
      </span>
    );
  }

  function IconBox({ icon, t }: { icon: string; t: TierStyle }) {
    return (
      <div
        style={{
          width: 48,
          height: 48,
          flexShrink: 0,
          borderRadius: "8px",
          background: t.iconBg,
          border: `1.5px solid ${t.iconBorder}`,
          boxShadow: t.iconShadow,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "1.5rem",
        }}
      >
        {icon}
      </div>
    );
  }

  // ── Row wrappers ──────────────────────────────────────────────────────────

  function RowWrap({
    t,
    owned: isOwned,
    children,
  }: {
    t: TierStyle;
    owned?: boolean;
    children: React.ReactNode;
  }) {
    return (
      <div
        style={{
          borderRadius: "8px",
          overflow: "hidden",
          border: "1px solid rgba(32,24,12,0.85)",
          borderLeft: `3px solid ${t.leftBorder}`,
          background: t.rowBg,
          boxShadow: isOwned ? `inset 0 0 0 1px rgba(60,160,60,0.08)` : "none",
          transition: "box-shadow 0.15s",
        }}
      >
        {children}
      </div>
    );
  }

  // ── Category panel wrapper ────────────────────────────────────────────────

  function ArmoryPanel({
    icon,
    title,
    subtitle,
    resource,
    children,
  }: {
    icon: string;
    title: string;
    subtitle: string;
    resource: string;
    children: React.ReactNode;
  }) {
    return (
      <div
        className="rounded-game-xl overflow-hidden"
        style={{
          position: "relative",
          border: "1px solid rgba(201,144,26,0.28)",
          borderTop: "1px solid rgba(201,144,26,0.5)",
          background:
            "linear-gradient(180deg, rgba(18,14,7,0.99), rgba(8,6,3,1))",
          boxShadow:
            "0 8px 48px rgba(0,0,0,0.85), inset 0 1px 0 rgba(240,192,48,0.1)",
        }}
      >
        {/* Map grid texture */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            zIndex: 0,
            backgroundImage:
              "linear-gradient(rgba(201,144,26,0.018) 1px, transparent 1px), linear-gradient(90deg, rgba(201,144,26,0.018) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {/* Corner ornaments */}
        <div
          style={{
            position: "absolute",
            top: 9,
            left: 9,
            width: 16,
            height: 16,
            borderTop: "1.5px solid rgba(201,144,26,0.48)",
            borderLeft: "1.5px solid rgba(201,144,26,0.48)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 9,
            right: 9,
            width: 16,
            height: 16,
            borderTop: "1.5px solid rgba(201,144,26,0.48)",
            borderRight: "1.5px solid rgba(201,144,26,0.48)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 9,
            left: 9,
            width: 16,
            height: 16,
            borderBottom: "1.5px solid rgba(201,144,26,0.48)",
            borderLeft: "1.5px solid rgba(201,144,26,0.48)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 9,
            right: 9,
            width: 16,
            height: 16,
            borderBottom: "1.5px solid rgba(201,144,26,0.48)",
            borderRight: "1.5px solid rgba(201,144,26,0.48)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        {/* Panel header */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "0.875rem 1.25rem 0.75rem",
            borderBottom: "1px solid rgba(201,144,26,0.16)",
            background:
              "linear-gradient(180deg, rgba(201,144,26,0.09) 0%, rgba(201,144,26,0.02) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                marginBottom: "3px",
              }}
            >
              <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>{icon}</span>
              <h2 className="font-display text-game-base gold-gradient-text-static text-title-glow uppercase tracking-widest">
                {title}
              </h2>
            </div>
            <p
              style={{
                fontFamily: "Source Sans 3, sans-serif",
                fontSize: "0.65rem",
                color: "rgba(139,90,47,0.72)",
                lineHeight: 1.3,
              }}
            >
              {subtitle}
            </p>
          </div>
          <span
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: "0.55rem",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              padding: "3px 8px",
              borderRadius: "4px",
              flexShrink: 0,
              background: "rgba(30,22,10,0.6)",
              border: "1px solid rgba(201,144,26,0.22)",
              color: "rgba(201,144,26,0.7)",
            }}
          >
            {resource}
          </span>
        </div>

        {/* Items */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "0.75rem",
            display: "flex",
            flexDirection: "column",
            gap: "6px",
          }}
        >
          {children}
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Weapons Shop
        </h1>
        <p
          style={{
            fontFamily: "Source Sans 3, sans-serif",
            fontSize: "0.75rem",
            color: "rgba(139,90,47,0.72)",
            marginTop: "2px",
          }}
        >
          The Iron Vault · Arm your forces for conquest
        </p>
      </div>

      {/* ── Resource strip ──────────────────────────────────────────────── */}
      <div className="rounded-game-lg border border-game-border overflow-hidden bg-gradient-to-b from-game-elevated to-game-surface">
        <div className="flex divide-x divide-game-border/50">
          {[
            {
              icon: "🪙",
              label: "Gold",
              value: resourceState.gold,
              color: "text-res-gold",
            },
            {
              icon: "⚙️",
              label: "Iron",
              value: resourceState.iron,
              color: "text-res-iron",
            },
          ].map(({ icon, label, value, color }) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center py-3 px-4 gap-0.5 min-w-0"
            >
              <span className="text-base leading-none">{icon}</span>
              <span
                className={`font-heading text-game-base font-bold tabular-nums leading-none ${color}`}
              >
                {formatNumber(value)}
              </span>
              <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wider leading-none mt-0.5">
                {label}
              </span>
            </div>
          ))}
          <div className="flex-1 flex flex-col items-center justify-center py-3 px-4 gap-0.5">
            <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wider">
              Sell Refund
            </span>
            <span className="font-heading text-game-sm text-game-text-secondary tabular-nums">
              {refundPct}%
            </span>
          </div>
        </div>
      </div>

      {/* ── Message ─────────────────────────────────────────────────────── */}
      {message && (
        <div
          className={`rounded-game-lg border px-4 py-2.5 font-body text-game-sm ${
            message.type === "success"
              ? "bg-game-green/10 border-green-900 text-game-green-bright"
              : "bg-game-red/10 border-red-900 text-game-red-bright"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* ── Tabs ────────────────────────────────────────────────────────── */}
      <Tabs
        tabs={TABS}
        activeTab={activeTab}
        onChange={(k) => setActiveTab(k as TabKey)}
      />

      {/* ══════════════════════════════════════════════════════════════════
          ATTACK WEAPONS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "attack" && (
        <ArmoryPanel
          icon="⚔️"
          title="Iron Arsenal"
          subtitle="Forged weapons that channel raw offensive power into each strike of your soldiers."
          resource="Paid in Iron"
        >
          {ATTACK_WEAPONS.map(({ key, label }) => {
            const cfg = BALANCE.weapons.attack[key];
            const owned = (weaponState[key] as number) ?? 0;
            const costIron = cfg.costIron;
            const refund = Math.floor(
              costIron * BALANCE.weapons.sellRefundPercent,
            );
            const amt = parseInt(amounts[key] || "1") || 1;
            const canBuy =
              resourceState.iron >= costIron * amt &&
              owned + amt <= cfg.maxPerPlayer;
            const canSell = owned >= amt;
            const isMaxed = owned >= cfg.maxPerPlayer;
            const meta = WEAPON_META[key] ?? {
              icon: "⚔️",
              tier: "iron" as TierKey,
            };
            const t = TIER[meta.tier];

            return (
              <RowWrap key={key} t={t}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "48px minmax(0, 1fr) 88px",
                    columnGap: "10px",
                    rowGap: "8px",
                    alignItems: "center",
                    padding: "10px 12px 10px",
                  }}
                >
                  <div style={{ gridColumn: 1, gridRow: 1 }}>
                    <IconBox icon={meta.icon} t={t} />
                  </div>

                  {/* Item identity */}
                  <div style={{ gridColumn: 2, gridRow: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        flexWrap: "wrap",
                        marginBottom: "4px",
                      }}
                    >
                      <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                        {label}
                      </span>
                      <TierBadge t={t} />
                      {isMaxed && (
                        <span
                          style={{
                            fontSize: "0.44rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            padding: "1px 5px",
                            borderRadius: "3px",
                            background: "rgba(58,44,8,0.8)",
                            border: "1px solid rgba(201,144,26,0.5)",
                            color: "rgba(240,198,48,0.9)",
                            fontFamily: "Cinzel, serif",
                          }}
                        >
                          Maxed
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        fontSize: "0.64rem",
                        color: "rgba(110,88,58,0.8)",
                        fontFamily: "Source Sans 3, sans-serif",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <CostPill
                        icon="⚙"
                        text={`${formatNumber(costIron)} iron`}
                        tone="iron"
                      />
                      <span>↩ {formatNumber(refund)}</span>
                    </div>
                  </div>

                  {/* Attack power stat plate */}
                  <div
                    style={{
                      gridColumn: 3,
                      gridRow: 1,
                      textAlign: "center",
                      width: 88,
                      justifySelf: "end",
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "rgba(10,6,3,0.9)",
                      border: "1px solid rgba(200,75,35,0.28)",
                      boxShadow: "inset 0 0 14px rgba(200,60,20,0.07)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.2rem",
                        fontWeight: 700,
                        fontFamily: "Cinzel, serif",
                        color: "#FF7040",
                        lineHeight: 1,
                        letterSpacing: "-0.01em",
                      }}
                    >
                      +{cfg.power}
                    </div>
                    <div
                      style={{
                        fontSize: "0.42rem",
                        letterSpacing: "0.14em",
                        color: "rgba(220,105,60,0.72)",
                        textTransform: "uppercase",
                        marginTop: "2px",
                        fontFamily: "Cinzel, serif",
                      }}
                    >
                      Atk Pwr
                    </div>
                  </div>

                  {/* Owned count (under icon) */}
                  <div
                    style={{
                      gridColumn: "1 / 3",
                      gridRow: 2,
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <OwnedPill count={owned} />
                  </div>

                  {/* Actions (under stat plate) */}
                  <div
                    style={{ gridColumn: 3, gridRow: 2, justifySelf: "end" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "6px",
                        direction: "ltr",
                        background: "rgba(0,0,0,0.22)",
                        border: "1px solid rgba(201,144,26,0.14)",
                        borderRadius: "10px",
                        padding: "6px 8px",
                        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                      }}
                    >
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={amounts[key] ?? ""}
                        min={1}
                        max={cfg.maxPerPlayer}
                        onChange={(e) =>
                          setAmounts((p) => ({ ...p, [key]: e.target.value }))
                        }
                        className="w-16 text-center tabular-nums"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={isFrozen || !canBuy || !!loading}
                        loading={loading === `buy-${key}`}
                        onClick={() => handleBuy(key, "attack")}
                      >
                        Buy
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isFrozen || !canSell || !!loading}
                        loading={loading === `sell-${key}`}
                        onClick={() => handleSell(key, "attack")}
                      >
                        Sell
                      </Button>
                    </div>
                  </div>
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          DEFENSE WEAPONS
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "defense" && (
        <ArmoryPanel
          icon="🛡️"
          title="Armory Vault"
          subtitle="Armor and shields that multiply your defensive resilience. One piece per warrior — choose wisely."
          resource="Paid in Gold"
        >
          {DEFENSE_WEAPONS.map(({ key, label }) => {
            const cfg = BALANCE.weapons.defense[key];
            const owned = (weaponState[key] as number) ?? 0;
            const costGold = cfg.costGold;
            const refund = Math.floor(
              costGold * BALANCE.weapons.sellRefundPercent,
            );
            const isGodsArmor = key === "gods_armor";
            const canBuy =
              !owned &&
              resourceState.gold >= costGold &&
              (!isGodsArmor ||
                (resourceState.iron >= 500000 && resourceState.wood >= 300000));
            const canSell = owned > 0;
            const meta = WEAPON_META[key] ?? {
              icon: "🛡️",
              tier: "iron" as TierKey,
            };
            const t = TIER[meta.tier];

            return (
              <RowWrap key={key} t={t} owned={owned > 0}>
                {/* Top section: icon + info + stat plate */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px 6px",
                  }}
                >
                  <IconBox icon={meta.icon} t={t} />

                  {/* Item identity */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        flexWrap: "wrap",
                        marginBottom: "4px",
                      }}
                    >
                      <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                        {label}
                      </span>
                      <TierBadge t={t} />
                      {owned > 0 && (
                        <span
                          style={{
                            fontSize: "0.44rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            padding: "1px 5px",
                            borderRadius: "3px",
                            background: "rgba(18,58,22,0.8)",
                            border: "1px solid rgba(60,160,70,0.5)",
                            color: "rgba(80,210,95,0.9)",
                            fontFamily: "Cinzel, serif",
                          }}
                        >
                          Equipped
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        fontSize: "0.64rem",
                        color: "rgba(110,88,58,0.8)",
                        fontFamily: "Source Sans 3, sans-serif",
                        flexWrap: "wrap",
                        alignItems: "center",
                      }}
                    >
                      <CostPill
                        icon="🪙"
                        text={`${formatNumber(costGold)} gold`}
                        tone="gold"
                      />
                      {isGodsArmor && (
                        <>
                          <span style={{ color: "rgba(120,160,210,0.8)" }}>
                            + 500K iron
                          </span>
                          <span style={{ color: "rgba(110,175,120,0.8)" }}>
                            + 300K wood
                          </span>
                        </>
                      )}
                      <span>↩ {formatNumber(refund)}</span>
                    </div>
                  </div>

                  {/* Defense multiplier stat plate */}
                  <div
                    style={{
                      flexShrink: 0,
                      textAlign: "center",
                      width: 78,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "rgba(10,8,3,0.9)",
                      border: "1px solid rgba(201,144,26,0.25)",
                      boxShadow: "inset 0 0 14px rgba(201,144,26,0.07)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.1rem",
                        fontWeight: 700,
                        fontFamily: "Cinzel, serif",
                        color: "#F0C030",
                        lineHeight: 1,
                      }}
                    >
                      ×{cfg.multiplier}
                    </div>
                    <div
                      style={{
                        fontSize: "0.42rem",
                        letterSpacing: "0.14em",
                        color: "rgba(201,144,26,0.65)",
                        textTransform: "uppercase",
                        marginTop: "2px",
                        fontFamily: "Cinzel, serif",
                      }}
                    >
                      Def Mult
                    </div>
                  </div>
                </div>

                {/* Bottom section: buy + sell */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "0 12px 10px 70px",
                  }}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, "defense")}
                  >
                    {owned > 0 ? "Owned" : "Buy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, "defense")}
                  >
                    Sell
                  </Button>
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SPY GEAR
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "spy" && (
        <ArmoryPanel
          icon="🌑"
          title="Shadow Market"
          subtitle="Covert equipment that enhances your agents' power and concealment in enemy territory."
          resource="Paid in Gold"
        >
          {SPY_WEAPONS.map(({ key, label }, idx) => {
            const owned = (weaponState[key] as number) ?? 0;
            const costGold = SPY_PRICES[key] ?? 0;
            const refund = Math.floor(
              costGold * BALANCE.weapons.sellRefundPercent,
            );
            const canBuy = !owned && resourceState.gold >= costGold;
            const canSell = owned > 0;
            const meta = WEAPON_META[key] ?? {
              icon: "🌑",
              tier: "iron" as TierKey,
            };
            const t = TIER[meta.tier];
            const tierNum = ROMAN[idx];

            return (
              <RowWrap key={key} t={t} owned={owned > 0}>
                {/* Top section: icon + info + stat plate */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px 6px",
                  }}
                >
                  <IconBox icon={meta.icon} t={t} />

                  {/* Item identity */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        flexWrap: "wrap",
                        marginBottom: "4px",
                      }}
                    >
                      <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                        {label}
                      </span>
                      <TierBadge t={t} />
                      {owned > 0 && (
                        <span
                          style={{
                            fontSize: "0.44rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            padding: "1px 5px",
                            borderRadius: "3px",
                            background: "rgba(18,58,22,0.8)",
                            border: "1px solid rgba(60,160,70,0.5)",
                            color: "rgba(80,210,95,0.9)",
                            fontFamily: "Cinzel, serif",
                          }}
                        >
                          Equipped
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        fontSize: "0.64rem",
                        color: "rgba(110,88,58,0.8)",
                        fontFamily: "Source Sans 3, sans-serif",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <CostPill
                        icon="🪙"
                        text={`${formatNumber(costGold)} gold`}
                        tone="gold"
                      />
                      <span>↩ {formatNumber(refund)}</span>
                    </div>
                  </div>

                  {/* Spy tier stat plate */}
                  <div
                    style={{
                      flexShrink: 0,
                      textAlign: "center",
                      width: 78,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "rgba(10,6,14,0.9)",
                      border: "1px solid rgba(148,75,220,0.25)",
                      boxShadow: "inset 0 0 14px rgba(148,75,220,0.07)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.0rem",
                        fontWeight: 700,
                        fontFamily: "Cinzel, serif",
                        color: "rgba(195,118,255,0.95)",
                        lineHeight: 1,
                      }}
                    >
                      {tierNum}
                    </div>
                    <div
                      style={{
                        fontSize: "0.42rem",
                        letterSpacing: "0.14em",
                        color: "rgba(165,88,240,0.65)",
                        textTransform: "uppercase",
                        marginTop: "2px",
                        fontFamily: "Cinzel, serif",
                      }}
                    >
                      Spy Gear
                    </div>
                  </div>
                </div>

                {/* Bottom section: buy + sell */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "0 12px 10px 70px",
                  }}
                >
                  <Button
                    variant="magic"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, "spy")}
                  >
                    {owned > 0 ? "Owned" : "Buy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, "spy")}
                  >
                    Sell
                  </Button>
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SCOUT GEAR
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "scout" && (
        <ArmoryPanel
          icon="👁️"
          title="Ranger's Cache"
          subtitle="Equipment that sharpens your scouts' vision and reach beyond the fog of war."
          resource="Paid in Gold"
        >
          {SCOUT_WEAPONS.map(({ key, label }, idx) => {
            const owned = (weaponState[key] as number) ?? 0;
            const costGold = SCOUT_PRICES[key] ?? 0;
            const refund = Math.floor(
              costGold * BALANCE.weapons.sellRefundPercent,
            );
            const canBuy = !owned && resourceState.gold >= costGold;
            const canSell = owned > 0;
            const meta = WEAPON_META[key] ?? {
              icon: "👢",
              tier: "iron" as TierKey,
            };
            const t = TIER[meta.tier];
            const tierNum = ROMAN[idx];

            return (
              <RowWrap key={key} t={t} owned={owned > 0}>
                {/* Top section: icon + info + stat plate */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px 6px",
                  }}
                >
                  <IconBox icon={meta.icon} t={t} />

                  {/* Item identity */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "5px",
                        flexWrap: "wrap",
                        marginBottom: "4px",
                      }}
                    >
                      <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                        {label}
                      </span>
                      <TierBadge t={t} />
                      {owned > 0 && (
                        <span
                          style={{
                            fontSize: "0.44rem",
                            letterSpacing: "0.1em",
                            textTransform: "uppercase",
                            padding: "1px 5px",
                            borderRadius: "3px",
                            background: "rgba(18,58,22,0.8)",
                            border: "1px solid rgba(60,160,70,0.5)",
                            color: "rgba(80,210,95,0.9)",
                            fontFamily: "Cinzel, serif",
                          }}
                        >
                          Equipped
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        fontSize: "0.64rem",
                        color: "rgba(110,88,58,0.8)",
                        fontFamily: "Source Sans 3, sans-serif",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <CostPill
                        icon="🪙"
                        text={`${formatNumber(costGold)} gold`}
                        tone="gold"
                      />
                      <span>↩ {formatNumber(refund)}</span>
                    </div>
                  </div>

                  {/* Scout tier stat plate */}
                  <div
                    style={{
                      flexShrink: 0,
                      textAlign: "center",
                      width: 78,
                      padding: "6px 8px",
                      borderRadius: "6px",
                      background: "rgba(4,10,18,0.9)",
                      border: "1px solid rgba(75,130,200,0.25)",
                      boxShadow: "inset 0 0 14px rgba(75,130,200,0.07)",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "1.0rem",
                        fontWeight: 700,
                        fontFamily: "Cinzel, serif",
                        color: "rgba(130,175,230,0.95)",
                        lineHeight: 1,
                      }}
                    >
                      {tierNum}
                    </div>
                    <div
                      style={{
                        fontSize: "0.42rem",
                        letterSpacing: "0.14em",
                        color: "rgba(100,155,210,0.65)",
                        textTransform: "uppercase",
                        marginTop: "2px",
                        fontFamily: "Cinzel, serif",
                      }}
                    >
                      Scout Gear
                    </div>
                  </div>
                </div>

                {/* Bottom section: buy + sell */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "0 12px 10px 70px",
                  }}
                >
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={isFrozen || !canBuy || !!loading}
                    loading={loading === `buy-${key}`}
                    onClick={() => handleBuy(key, "scout")}
                  >
                    {owned > 0 ? "Owned" : "Buy"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={isFrozen || !canSell || !!loading}
                    loading={loading === `sell-${key}`}
                    onClick={() => handleSell(key, "scout")}
                  >
                    Sell
                  </Button>
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}
    </div>
  );
}
