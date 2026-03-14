"use client";

/**
 * ShopClient — Domiron Weapons Shop
 *
 * Scroll-jump fix (2026-03-07):
 *   ALL sub-components (CostPill, OwnedPill, TierBadge, IconBox, RowWrap,
 *   ArmoryPanel) are defined OUTSIDE the ShopClient function. Defining them
 *   inside caused React to see new component-type references on every state
 *   update → remount the subtree → destroy the focused Input → browser
 *   scroll to top. Moving them outside gives stable references across renders.
 *
 * Pricing model (2026-03-07):
 *   All items cost all 4 resources equally.
 *   Prices read exclusively from BALANCE.weapons[category][weapon].cost.
 *   No hardcoded price constants in this file.
 *
 * Attack weapons: stackable (no per-player cap).
 * Defense / Spy / Scout: one per player.
 */

import React, { useState } from "react";
import { BALANCE } from "@/lib/game/balance";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceQuad } from "@/components/ui/resource-quad";
import { formatNumber } from "@/lib/utils";
import { usePlayer } from "@/lib/context/PlayerContext";
import { useFreeze } from "@/lib/hooks/useFreeze";
import type { Weapons, Resources } from "@/types/game";

// ── Types & constants ─────────────────────────────────────────────────────────

type TabKey = "attack" | "defense" | "spy" | "scout";

const TAB_ICONS: Record<string, string> = {
  attack:  '/icons/attack-power.png',
  defense: '/icons/defense-power.png',
  spy:     '/icons/spy-power.png',
  scout:   '/icons/renger-power.png',
}

const TABS = [
  { key: "attack",  label: "תקיפה"  },
  { key: "defense", label: "הגנה"   },
  { key: "spy",     label: "ריגול"  },
  { key: "scout",   label: "סיור"   },
].map((t) => ({
  ...t,
  icon: (
    <img
      src={TAB_ICONS[t.key]}
      alt={t.label}
      style={{ width: 44, height: 44, objectFit: 'contain' as const, verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }}
    />
  ),
}));

const ATTACK_WEAPONS = [
  { key: "crude_club",   label: "אלה גסה"        },
  { key: "slingshot",    label: "קלע"           },
  { key: "boomerang",    label: "בומרנג"         },
  { key: "pirate_knife", label: "סכין פיראטים"  },
  { key: "axe",          label: "גרזן"          },
  { key: "master_knife", label: "סכין מאסטר"    },
  { key: "knight_axe",   label: "גרזן אביר"     },
  { key: "iron_ball",    label: "כדור ברזל"     },
  { key: "battle_axe",   label: "גרזן קרב"      },
  { key: "war_hammer",   label: "פטיש מלחמה"    },
  { key: "dragon_sword", label: "חרב הדרקון"    },
] as const;

const DEFENSE_WEAPONS = [
  { key: "wooden_buckler", label: "מגן עץ קטן"      },
  { key: "wood_shield",    label: "מגן עץ"         },
  { key: "iron_shield",    label: "מגן ברזל"       },
  { key: "leather_armor",  label: "שריון עור"      },
  { key: "chain_armor",    label: "שריון שרשרת"    },
  { key: "plate_armor",    label: "שריון פלדה"     },
  { key: "mithril_armor",  label: "שריון מיתריל"   },
  { key: "gods_armor",     label: "שריון האלים"    },
  { key: "shadow_armor",   label: "שריון הצל"      },
  { key: "void_armor",     label: "שריון הריק"     },
  { key: "celestial_armor",label: "שריון שמימי"    },
] as const;

const SPY_WEAPONS = [
  { key: "spy_hood",       label: "כיסוי ריגול"     },
  { key: "shadow_cloak",   label: "גלימת צל"        },
  { key: "dark_mask",      label: "מסכת חושך"       },
  { key: "elven_gear",     label: "ציוד אלפים"      },
  { key: "mystic_cloak",   label: "גלימה מיסטית"    },
  { key: "shadow_veil",    label: "רעלת הצל"        },
  { key: "phantom_shroud", label: "כסות הרוח"       },
  { key: "arcane_veil",    label: "מחסום ארקאני"    },
] as const;

const SCOUT_WEAPONS = [
  { key: "scout_cap",      label: "כובע סייר"       },
  { key: "scout_boots",    label: "מגפי סייר"       },
  { key: "scout_cloak",    label: "גלימת סייר"      },
  { key: "elven_boots",    label: "מגפי אלפים"      },
  { key: "swift_boots",    label: "מגפי מהירות"     },
  { key: "shadow_steps",   label: "צעדי הצל"        },
  { key: "phantom_stride", label: "מדרך הרוח"       },
  { key: "arcane_lens",    label: "עדשה ארקאנית"    },
] as const;

// ── Visual tier system ────────────────────────────────────────────────────────

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
    label: "גסי",
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
    label: "ברזלי",
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
    label: "מחושל",
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
    label: "רוני",
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
    label: "אלוהי",
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

const WEAPON_META: Record<string, { icon: string; tier: TierKey }> = {
  // Attack
  crude_club:   { icon: "🪵", tier: "rustic" },
  slingshot:    { icon: "🪃", tier: "rustic" },
  boomerang:    { icon: "🎯", tier: "rustic" },
  pirate_knife: { icon: "🗡️", tier: "iron"   },
  axe:          { icon: "🪓", tier: "iron"   },
  master_knife: { icon: "⚔️", tier: "forged" },
  knight_axe:   { icon: "🔱", tier: "runic"  },
  iron_ball:    { icon: "💀", tier: "divine" },
  battle_axe:   { icon: "🪖", tier: "divine" },
  war_hammer:   { icon: "🔨", tier: "divine" },
  dragon_sword: { icon: "🐉", tier: "divine" },
  // Defense
  wooden_buckler:   { icon: "🪵", tier: "rustic" },
  wood_shield:      { icon: "🛡️", tier: "rustic" },
  iron_shield:      { icon: "🛡️", tier: "iron"   },
  leather_armor:    { icon: "🥷", tier: "iron"   },
  chain_armor:      { icon: "⛓️", tier: "forged" },
  plate_armor:      { icon: "🦾", tier: "forged" },
  mithril_armor:    { icon: "💠", tier: "runic"  },
  gods_armor:       { icon: "👑", tier: "divine" },
  shadow_armor:     { icon: "🌑", tier: "divine" },
  void_armor:       { icon: "🕳️", tier: "divine" },
  celestial_armor:  { icon: "✨", tier: "divine" },
  // Spy
  spy_hood:       { icon: "🎩", tier: "rustic" },
  shadow_cloak:   { icon: "🌑", tier: "iron"   },
  dark_mask:      { icon: "🎭", tier: "forged" },
  elven_gear:     { icon: "🧝", tier: "runic"  },
  mystic_cloak:   { icon: "🌀", tier: "runic"  },
  shadow_veil:    { icon: "🌫️", tier: "divine" },
  phantom_shroud: { icon: "👻", tier: "divine" },
  arcane_veil:    { icon: "🔮", tier: "divine" },
  // Scout
  scout_cap:      { icon: "🧢", tier: "rustic" },
  scout_boots:    { icon: "👢", tier: "iron"   },
  scout_cloak:    { icon: "🗺️", tier: "forged" },
  elven_boots:    { icon: "🌟", tier: "runic"  },
  swift_boots:    { icon: "💨", tier: "runic"  },
  shadow_steps:   { icon: "👣", tier: "divine" },
  phantom_stride: { icon: "🌌", tier: "divine" },
  arcane_lens:    { icon: "🔭", tier: "divine" },
};

// All-4-resources badge used in every ArmoryPanel header
const ALL_RESOURCES_BADGE = (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
    {(['gold','iron','wood','food'] as const).map((r) => (
      <img key={r} src={`/icons/${r}.png`} style={{width:28,height:28,objectFit:'contain',flexShrink:0}} alt={r} />
    ))}
    <span style={{ marginInlineStart: 2 }}>כל המשאבים</span>
  </span>
)

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS — defined OUTSIDE ShopClient so their type references are
// stable across re-renders. Defining them inside the component function causes
// React to treat them as new types on each render, unmounting subtrees and
// destroying focused inputs, which makes the page scroll to the top.
// ═══════════════════════════════════════════════════════════════════════════════

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
          textTransform: "uppercase" as const,
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
        textTransform: "uppercase" as const,
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

function RowWrap({
  t,
  owned,
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
        boxShadow: owned ? `inset 0 0 0 1px rgba(60,160,60,0.08)` : "none",
        transition: "box-shadow 0.15s",
      }}
    >
      {children}
    </div>
  );
}

function ArmoryPanel({
  icon,
  title,
  subtitle,
  resource,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  resource: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-game-xl overflow-hidden"
      style={{
        position: "relative",
        border: "1px solid rgba(201,144,26,0.28)",
        borderTop: "1px solid rgba(201,144,26,0.5)",
        background: "linear-gradient(180deg, rgba(18,14,7,0.99), rgba(8,6,3,1))",
        boxShadow: "0 8px 48px rgba(0,0,0,0.85), inset 0 1px 0 rgba(240,192,48,0.1)",
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
      {(["tl", "tr", "bl", "br"] as const).map((corner) => (
        <div
          key={corner}
          style={{
            position: "absolute",
            top:    corner.startsWith("t") ? 9 : undefined,
            bottom: corner.startsWith("b") ? 9 : undefined,
            left:   corner.endsWith("l")   ? 9 : undefined,
            right:  corner.endsWith("r")   ? 9 : undefined,
            width: 16,
            height: 16,
            borderTop:    corner.startsWith("t") ? "1.5px solid rgba(201,144,26,0.48)" : undefined,
            borderBottom: corner.startsWith("b") ? "1.5px solid rgba(201,144,26,0.48)" : undefined,
            borderLeft:   corner.endsWith("l")   ? "1.5px solid rgba(201,144,26,0.48)" : undefined,
            borderRight:  corner.endsWith("r")   ? "1.5px solid rgba(201,144,26,0.48)" : undefined,
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
      ))}

      {/* Panel header */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          padding: "0.875rem 1.25rem 0.75rem",
          borderBottom: "1px solid rgba(201,144,26,0.16)",
          background: "linear-gradient(180deg, rgba(201,144,26,0.09) 0%, rgba(201,144,26,0.02) 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "3px" }}>
            <span style={{ fontSize: "2.1rem", lineHeight: 1, display: 'flex', alignItems: 'center' }}>{icon}</span>
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
            textTransform: "uppercase" as const,
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

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

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

  const weaponState   = weapons   ?? ({} as Weapons);
  const resourceState = resources ?? ({ gold: 0, iron: 0, wood: 0, food: 0 } as Resources);

  // ── Actions ────────────────────────────────────────────────────────────────

  async function handleBuy(weaponKey: string, category: string) {
    const amt = parseInt(amounts[weaponKey] || "1") || 1;
    setLoading(`buy-${weaponKey}`);
    setMessage(null);
    try {
      const res  = await fetch("/api/shop/buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weapon: weaponKey, amount: amt, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "רכישה נכשלה", type: "error" });
      } else {
        setMessage({ text: `נרכש ${amt}× ${weaponKey.replace(/_/g, " ")}`, type: "success" });
        setAmounts((p) => {
          if (!(weaponKey in p)) return p;
          const next = { ...p };
          delete next[weaponKey];
          return next;
        });
        if (data.weapons)   applyPatch({ weapons:   data.weapons   });
        if (data.resources) applyPatch({ resources: data.resources });
        refresh();
      }
    } catch {
      setMessage({ text: "שגיאת רשת", type: "error" });
    } finally {
      setLoading(null);
    }
  }

  async function handleSell(weaponKey: string, category: string) {
    const amt = parseInt(amounts[weaponKey] || "1") || 1;
    setLoading(`sell-${weaponKey}`);
    setMessage(null);
    try {
      const res  = await fetch("/api/shop/sell", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weapon: weaponKey, amount: amt, category }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "מכירה נכשלה", type: "error" });
      } else {
        setMessage({ text: `נמכר ${amt}× ${weaponKey.replace(/_/g, " ")}`, type: "success" });
        setAmounts((p) => {
          if (!(weaponKey in p)) return p;
          const next = { ...p };
          delete next[weaponKey];
          return next;
        });
        if (data.weapons)   applyPatch({ weapons:   data.weapons   });
        if (data.resources) applyPatch({ resources: data.resources });
        refresh();
      }
    } catch {
      setMessage({ text: "שגיאת רשת", type: "error" });
    } finally {
      setLoading(null);
    }
  }

  const refundPct = (BALANCE.weapons.sellRefundPercent * 100).toFixed(0);

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
          The Iron Vault · All weapons cost all 4 resources equally
        </p>
      </div>

      {/* ── Resource strip (all 4) ───────────────────────────────────────── */}
      <div className="rounded-game-lg border border-game-border overflow-hidden bg-gradient-to-b from-game-elevated to-game-surface">
        <div className="flex divide-x divide-game-border/50">
          {[
            { iconSrc: "/icons/gold.png", label: "זהב",  value: resourceState.gold,  color: "text-res-gold"  },
            { iconSrc: "/icons/iron.png", label: "ברזל", value: resourceState.iron,  color: "text-res-iron"  },
            { iconSrc: "/icons/wood.png", label: "עץ",   value: resourceState.wood,  color: "text-res-wood"  },
            { iconSrc: "/icons/food.png", label: "מזון", value: resourceState.food,  color: "text-res-food"  },
          ].map(({ iconSrc, label, value, color }) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center py-3 px-2 gap-0.5 min-w-0"
            >
              <img src={iconSrc} alt={label} style={{width:20,height:20,objectFit:'contain'}} />
              <span className={`font-heading text-game-base font-bold tabular-nums leading-none ${color}`}>
                {formatNumber(value)}
              </span>
              <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wider leading-none mt-0.5">
                {label}
              </span>
            </div>
          ))}
          <div className="flex-1 flex flex-col items-center justify-center py-3 px-2 gap-0.5">
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
          ATTACK WEAPONS — stackable, no cap
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "attack" && (
        <ArmoryPanel
          icon={<img src="/icons/attack-power.png" alt="attack" style={{ width: 52, height: 52, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />}
          title="ארסנל הברזל"
          subtitle="נשק מזויין שמעצים כוח התקפה גולמי. ניתן לערום — ללא הגבלה."
          resource={ALL_RESOURCES_BADGE}
        >
          {ATTACK_WEAPONS.map(({ key, label }) => {
            const cfg     = BALANCE.weapons.attack[key];
            const owned   = (weaponState[key] as number) ?? 0;
            const amt     = parseInt(amounts[key] || "1") || 1;
            const cost    = cfg.cost;
            const canAfford =
              resourceState.gold >= cost.gold * amt &&
              resourceState.iron >= cost.iron * amt &&
              resourceState.wood >= cost.wood * amt &&
              resourceState.food >= cost.food * amt;
            const canBuy  = canAfford;  // no cap
            const canSell = owned >= amt;
            const meta    = WEAPON_META[key] ?? { icon: "⚔️", tier: "iron" as TierKey };
            const t       = TIER[meta.tier];
            const refundEach = Math.floor(cost.gold * BALANCE.weapons.sellRefundPercent);

            return (
              <RowWrap key={key} t={t}>
                <div style={{ padding: "10px 12px" }}>
                  {/* Top row: icon + identity + stat plate */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                    <IconBox icon={meta.icon} t={t} />

                    {/* Identity + cost */}
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
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          alignItems: "center",
                          flexWrap: "wrap",
                        }}
                      >
                        <ResourceQuad cost={cost} amount={amt} />
                        <span
                          style={{
                            fontSize: "0.62rem",
                            color: "rgba(100,80,48,0.75)",
                            fontFamily: "Source Sans 3, sans-serif",
                          }}
                        >
                          ↩ {formatNumber(refundEach)} ea.
                        </span>
                      </div>
                    </div>

                    {/* Attack power stat plate */}
                    <div
                      style={{
                        flexShrink: 0,
                        textAlign: "center",
                        width: 72,
                        padding: "6px 8px",
                        borderRadius: "6px",
                        background: "rgba(10,6,3,0.9)",
                        border: "1px solid rgba(200,75,35,0.28)",
                        boxShadow: "inset 0 0 14px rgba(200,60,20,0.07)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "1.1rem",
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
                  </div>

                  {/* Bottom row: owned + actions */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap" }}>
                    <OwnedPill count={owned} />
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "6px",
                        direction: "ltr",
                        flexShrink: 0,
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
          DEFENSE WEAPONS — one per player
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "defense" && (
        <ArmoryPanel
          icon={<img src="/icons/defense-power.png" alt="defense" style={{ width: 52, height: 52, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />}
          title="כספת הנשק"
          subtitle="שריון שמכפיל את עמידותך ההגנתית. פריט אחד לכל לוחם — בחר בחוכמה."
          resource={ALL_RESOURCES_BADGE}
        >
          {DEFENSE_WEAPONS.map(({ key, label }) => {
            const cfg      = BALANCE.weapons.defense[key];
            const owned    = (weaponState[key] as number) ?? 0;
            const cost     = cfg.cost;
            const canAfford =
              resourceState.gold >= cost.gold &&
              resourceState.iron >= cost.iron &&
              resourceState.wood >= cost.wood &&
              resourceState.food >= cost.food;
            const canBuy   = !owned && canAfford;
            const canSell  = owned > 0;
            const meta     = WEAPON_META[key] ?? { icon: "🛡️", tier: "iron" as TierKey };
            const t        = TIER[meta.tier];
            const refundEach = Math.floor(cost.gold * BALANCE.weapons.sellRefundPercent);

            return (
              <RowWrap key={key} t={t} owned={owned > 0}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px 6px",
                  }}
                >
                  <IconBox icon={meta.icon} t={t} />

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
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <ResourceQuad cost={cost} />
                      <span
                        style={{
                          fontSize: "0.62rem",
                          color: "rgba(100,80,48,0.75)",
                          fontFamily: "Source Sans 3, sans-serif",
                        }}
                      >
                        ↩ {formatNumber(refundEach)} ea.
                      </span>
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

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", padding: "0 12px 10px" }}>
                  <OwnedPill count={owned} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "6px",
                      direction: "ltr",
                      flexShrink: 0,
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(201,144,26,0.14)",
                      borderRadius: "10px",
                      padding: "6px 8px",
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
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
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SPY GEAR — one per player
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "spy" && (
        <ArmoryPanel
          icon={<img src="/icons/spy-power.png" alt="spy" style={{ width: 52, height: 52, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />}
          title="שוק הצל"
          subtitle="ציוד סמוי שמשפר את סוכניך. פריט אחד לכל מבצע."
          resource={ALL_RESOURCES_BADGE}
        >
          {SPY_WEAPONS.map(({ key, label }) => {
            const cfg    = BALANCE.weapons.spy[key];
            const owned  = (weaponState[key] as number) ?? 0;
            const cost   = cfg.cost;
            const canAfford =
              resourceState.gold >= cost.gold &&
              resourceState.iron >= cost.iron &&
              resourceState.wood >= cost.wood &&
              resourceState.food >= cost.food;
            const canBuy  = !owned && canAfford;
            const canSell = owned > 0;
            const meta    = WEAPON_META[key] ?? { icon: "🌑", tier: "iron" as TierKey };
            const t       = TIER[meta.tier];
            const spyMult = (BALANCE.pp.SPY_GEAR_MULT as Record<string, number>)[key] ?? 1;
            const refundEach = Math.floor(cost.gold * BALANCE.weapons.sellRefundPercent);

            return (
              <RowWrap key={key} t={t} owned={owned > 0}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px 6px",
                  }}
                >
                  <IconBox icon={meta.icon} t={t} />

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
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <ResourceQuad cost={cost} />
                      <span
                        style={{
                          fontSize: "0.62rem",
                          color: "rgba(100,80,48,0.75)",
                          fontFamily: "Source Sans 3, sans-serif",
                        }}
                      >
                        ↩ {formatNumber(refundEach)} ea.
                      </span>
                    </div>
                  </div>

                  {/* Spy gear stat plate */}
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
                      ×{spyMult.toFixed(2)}
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
                      Spy Mult
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", padding: "0 12px 10px" }}>
                  <OwnedPill count={owned} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "6px",
                      direction: "ltr",
                      flexShrink: 0,
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(201,144,26,0.14)",
                      borderRadius: "10px",
                      padding: "6px 8px",
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
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
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          SCOUT GEAR — one per player
      ══════════════════════════════════════════════════════════════════ */}
      {activeTab === "scout" && (
        <ArmoryPanel
          icon={<img src="/icons/renger-power.png" alt="scout" style={{ width: 52, height: 52, objectFit: 'contain', verticalAlign: 'middle', flexShrink: 0, display: 'inline-block' }} />}
          title="מטמון הסייר"
          subtitle="ציוד שמחדד את ראיית סיירייך והישגם. פריט אחד לכל סייר."
          resource={ALL_RESOURCES_BADGE}
        >
          {SCOUT_WEAPONS.map(({ key, label }) => {
            const cfg    = BALANCE.weapons.scout[key];
            const owned  = (weaponState[key] as number) ?? 0;
            const cost   = cfg.cost;
            const canAfford =
              resourceState.gold >= cost.gold &&
              resourceState.iron >= cost.iron &&
              resourceState.wood >= cost.wood &&
              resourceState.food >= cost.food;
            const canBuy  = !owned && canAfford;
            const canSell = owned > 0;
            const meta    = WEAPON_META[key] ?? { icon: "👢", tier: "iron" as TierKey };
            const t       = TIER[meta.tier];
            const scoutMult = (BALANCE.pp.SCOUT_GEAR_MULT as Record<string, number>)[key] ?? 1;
            const refundEach = Math.floor(cost.gold * BALANCE.weapons.sellRefundPercent);

            return (
              <RowWrap key={key} t={t} owned={owned > 0}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "10px 12px 6px",
                  }}
                >
                  <IconBox icon={meta.icon} t={t} />

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
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <ResourceQuad cost={cost} />
                      <span
                        style={{
                          fontSize: "0.62rem",
                          color: "rgba(100,80,48,0.75)",
                          fontFamily: "Source Sans 3, sans-serif",
                        }}
                      >
                        ↩ {formatNumber(refundEach)} ea.
                      </span>
                    </div>
                  </div>

                  {/* Scout gear stat plate */}
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
                      ×{scoutMult.toFixed(2)}
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
                      Scout Mult
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", flexWrap: "wrap", padding: "0 12px 10px" }}>
                  <OwnedPill count={owned} />
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "6px",
                      direction: "ltr",
                      flexShrink: 0,
                      background: "rgba(0,0,0,0.22)",
                      border: "1px solid rgba(201,144,26,0.14)",
                      borderRadius: "10px",
                      padding: "6px 8px",
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                    }}
                  >
                    <Button
                      variant="magic"
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
                </div>
              </RowWrap>
            );
          })}
        </ArmoryPanel>
      )}
    </div>
  );
}
