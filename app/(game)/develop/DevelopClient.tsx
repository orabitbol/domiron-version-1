"use client";

import React, { useState } from "react";
import { BALANCE } from "@/lib/game/balance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GameTable } from "@/components/ui/game-table";
import { ResourceBadge } from "@/components/ui/resource-badge";
import { formatNumber } from "@/lib/utils";
import { usePlayer } from "@/lib/context/PlayerContext";
import type { Development, Resources } from "@/types/game";

type DevField =
  | "gold_level"
  | "food_level"
  | "wood_level"
  | "iron_level"
  | "population_level"
  | "fortification_level";

// ── Infra upgrade config ───────────────────────────────────────────────────

interface DevConfig {
  field: DevField;
  title: string;
  icon: string;
  maxLevel: number;
  resourceType: "gold" | "iron" | "wood" | "food";
  effectLabel: string;
}

const DEV_ROWS: DevConfig[] = [
  {
    field: "gold_level",
    title: "Gold Mine",
    icon: "🪙",
    maxLevel: 10,
    resourceType: "gold",
    effectLabel: "Gold/tick per slave",
  },
  {
    field: "food_level",
    title: "Farmlands",
    icon: "🌾",
    maxLevel: 10,
    resourceType: "food",
    effectLabel: "Food/tick per slave",
  },
  {
    field: "wood_level",
    title: "Lumber Mill",
    icon: "🪵",
    maxLevel: 10,
    resourceType: "wood",
    effectLabel: "Wood/tick per slave",
  },
  {
    field: "iron_level",
    title: "Iron Foundry",
    icon: "⚙️",
    maxLevel: 10,
    resourceType: "iron",
    effectLabel: "Iron/tick per slave",
  },
  {
    field: "fortification_level",
    title: "Fortifications",
    icon: "🏰",
    maxLevel: 5,
    resourceType: "gold",
    effectLabel: "Defense & capacity",
  },
];

const CITY_EMBLEMS = ["⛺", "🏡", "🏰", "🏯", "⚜"] as const;

// ── Fantasy conquest map ─────────────────────────────────────────────────────
//
// CITY_MAP_POINTS is the single source of truth for visual placement.
// x/y are CSS percentage strings calibrated to public/citys-map.png geography.
// labelAbove controls whether the city name renders above or below the marker.
// All gameplay values come from BALANCE.cities — never duplicated here.
//
interface CityMapPoint {
  level: number;
  label: string;
  x: string;
  y: string;
  labelAbove: boolean;
}

const CITY_MAP_POINTS: CityMapPoint[] = [
  { level: 1, label: "Winterfell",     x: "20%", y: "18%", labelAbove: false },
  { level: 2, label: "King's Landing", x: "67%", y: "22%", labelAbove: false },
  { level: 3, label: "Dragonstone",    x: "26%", y: "50%", labelAbove: false },
  { level: 4, label: "Highgarden",     x: "47%", y: "63%", labelAbove: true  },
  { level: 5, label: "Casterly Rock",  x: "72%", y: "67%", labelAbove: true  },
];

type CityMarkerState = "completed" | "current" | "next" | "locked";

function getCityState(
  level: number,
  currentCity: number,
  maxCity: number,
): CityMarkerState {
  if (level < currentCity)  return "completed";
  if (level === currentCity) return "current";
  if (level === currentCity + 1 && currentCity < maxCity) return "next";
  return "locked";
}

// Pure CSS gold ring marker — no emoji, no legacy city emblems.
function CityMapMarker({
  point,
  state,
}: {
  point: CityMapPoint;
  state: CityMarkerState;
}) {
  const isCurrent   = state === "current";
  const isNext      = state === "next";
  const isCompleted = state === "completed";

  const outerDiam = isCurrent ? 20 : isNext ? 15 : isCompleted ? 12 : 9;
  const innerDiam = isCurrent ? 7  : isNext ? 5  : isCompleted ? 4  : 3;

  const ringColor = isCurrent
    ? "rgba(240,192,48,1)"
    : isNext      ? "rgba(210,158,32,0.88)"
    : isCompleted ? "rgba(160,112,32,0.72)"
    : "rgba(80,58,18,0.42)";

  const innerColor = isCurrent
    ? "rgba(255,220,100,1)"
    : isNext      ? "rgba(220,168,40,0.92)"
    : isCompleted ? "rgba(160,112,32,0.82)"
    : "rgba(55,40,12,0.5)";

  const ringGlow = isCurrent
    ? "0 0 10px rgba(240,192,48,0.9), 0 0 24px rgba(201,144,26,0.52), 0 0 48px rgba(160,110,20,0.2)"
    : isNext      ? "0 0 7px rgba(201,144,26,0.62), 0 0 16px rgba(160,110,20,0.28)"
    : isCompleted ? "0 0 5px rgba(160,112,32,0.35)"
    : "none";

  const labelColor = isCurrent
    ? "rgba(255,220,100,1)"
    : isNext      ? "rgba(240,192,48,0.95)"
    : isCompleted ? "rgba(180,138,60,0.82)"
    : "rgba(100,78,28,0.5)";

  const labelSize   = isCurrent ? "0.75rem" : isNext ? "0.67rem" : "0.58rem";
  const labelWeight = isCurrent ? 700 : isNext ? 600 : 400;

  return (
    <div
      style={{
        position: "absolute",
        left: point.x,
        top: point.y,
        transform: "translate(-50%, -50%)",
        zIndex: isCurrent ? 10 : isNext ? 8 : isCompleted ? 5 : 3,
        pointerEvents: "none",
      }}
    >
      {/* Gold ring dot — the map pin */}
      <div
        style={{
          position: "relative",
          width: outerDiam,
          height: outerDiam,
          borderRadius: "50%",
          border: `2px solid ${ringColor}`,
          boxShadow: ringGlow,
          background: "rgba(6,4,2,0.85)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* Animated pulse halo — current city only */}
        {isCurrent && (
          <div
            className="animate-ping"
            style={{
              position: "absolute",
              inset: "-8px",
              borderRadius: "50%",
              border: "1.5px solid rgba(240,192,48,0.42)",
            }}
          />
        )}
        {/* Center fill dot */}
        <div
          style={{
            width: innerDiam,
            height: innerDiam,
            borderRadius: "50%",
            background: innerColor,
          }}
        />
      </div>

      {/* City name — absolutely positioned above or below the dot */}
      <span
        style={{
          position: "absolute",
          left: "50%",
          transform: "translateX(-50%)",
          ...(point.labelAbove
            ? { bottom: `calc(100% + 6px)` }
            : { top:    `calc(100% + 6px)` }),
          fontFamily: "Cinzel, serif",
          fontSize: labelSize,
          fontWeight: labelWeight,
          letterSpacing: "0.07em",
          color: labelColor,
          whiteSpace: "nowrap",
          lineHeight: 1,
          textShadow: isCurrent
            ? "0 0 10px rgba(201,144,26,0.82), 0 1px 4px rgba(0,0,0,0.96), 0 -1px 4px rgba(0,0,0,0.96)"
            : isNext
            ? "0 0 7px rgba(160,110,20,0.5), 0 1px 4px rgba(0,0,0,0.9)"
            : "0 1px 4px rgba(0,0,0,0.85), 0 -1px 3px rgba(0,0,0,0.85)",
        }}
      >
        {point.label}
      </span>
    </div>
  );
}

function CityConquestMap({ currentCity }: { currentCity: number }) {
  const maxCity = BALANCE.cities.maxCity;

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Base map — full natural aspect ratio, no cropping */}
      <img
        src="/citys-map.png"
        alt="Realm map"
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          userSelect: "none",
          pointerEvents: "none",
        }}
      />

      {/* SVG overlay: conquest route + subtle edge vignette
          preserveAspectRatio="none" ensures SVG % coords align 1:1 with image % positions */}
      <svg
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <radialGradient id="mapVig" cx="50%" cy="50%" r="60%">
            <stop offset="0%"   stopColor="transparent" />
            <stop offset="100%" stopColor="rgba(3,2,1,0.4)" />
          </radialGradient>
        </defs>

        {/* Route segments — state-aware styling */}
        {CITY_MAP_POINTS.slice(0, -1).map((from, i) => {
          const to     = CITY_MAP_POINTS[i + 1];
          const fx     = parseFloat(from.x);
          const fy     = parseFloat(from.y);
          const tx     = parseFloat(to.x);
          const ty     = parseFloat(to.y);
          const isComp = to.level <= currentCity;
          const isActv = from.level === currentCity && to.level === currentCity + 1;
          return (
            <line
              key={i}
              x1={fx} y1={fy} x2={tx} y2={ty}
              stroke={
                isComp ? "rgba(240,192,48,0.72)"
                : isActv ? "rgba(240,192,48,0.42)"
                : "rgba(30,22,8,0.38)"
              }
              strokeWidth={isComp ? 0.65 : isActv ? 0.5 : 0.28}
              strokeDasharray={isComp ? "none" : isActv ? "2.5,3" : "1,5"}
              strokeLinecap="round"
            />
          );
        })}

        {/* Midpoint dots on completed / active segments */}
        {CITY_MAP_POINTS.slice(0, -1).map((from, i) => {
          const to     = CITY_MAP_POINTS[i + 1];
          const fx     = parseFloat(from.x);
          const fy     = parseFloat(from.y);
          const tx     = parseFloat(to.x);
          const ty     = parseFloat(to.y);
          const isComp = to.level <= currentCity;
          const isActv = from.level === currentCity && to.level === currentCity + 1;
          if (!isComp && !isActv) return null;
          return (
            <circle
              key={`m${i}`}
              cx={(fx + tx) / 2}
              cy={(fy + ty) / 2}
              r={0.42}
              fill={isComp ? "rgba(240,192,48,0.68)" : "rgba(240,192,48,0.36)"}
            />
          );
        })}

        {/* Subtle edge vignette */}
        <rect width="100" height="100" fill="url(#mapVig)" />
      </svg>

      {/* City markers */}
      {CITY_MAP_POINTS.map((point) => (
        <CityMapMarker
          key={point.level}
          point={point}
          state={getCityState(point.level, currentCity, maxCity)}
        />
      ))}
    </div>
  );
}

// ── Cost helper — unchanged logic ─────────────────────────────────────────

function getUpgradeCost(
  field: DevField,
  currentLevel: number,
): { gold: number; resource: number; resourceType: string } {
  const isForti = field === "fortification_level";
  const maxLevel = isForti ? 5 : 10;
  if (currentLevel >= maxLevel)
    return { gold: 0, resource: 0, resourceType: "gold" };

  const next = currentLevel + 1;
  let costConfig: { gold: number; resource: number };
  if (next <= 2) costConfig = BALANCE.production.developmentUpgradeCost.level2;
  else if (next <= 3)
    costConfig = BALANCE.production.developmentUpgradeCost.level3;
  else if (next <= 5)
    costConfig = BALANCE.production.developmentUpgradeCost.level5;
  else costConfig = BALANCE.production.developmentUpgradeCost.level10;

  const multiplier = next;
  const resourceMap: Record<DevField, string> = {
    gold_level: "gold",
    food_level: "food",
    wood_level: "wood",
    iron_level: "iron",
    population_level: "food",
    fortification_level: "gold",
  };

  return {
    gold: costConfig.gold * multiplier,
    resource: costConfig.resource * multiplier,
    resourceType: resourceMap[field],
  };
}

// ── City Promotion sub-components ─────────────────────────────────────────

function SectionDivider({
  label,
  met,
  metLabel,
  unmetLabel,
}: {
  label: string;
  met: boolean;
  metLabel: string;
  unmetLabel: string;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        marginBottom: "0.375rem",
      }}
    >
      <span
        style={{
          fontFamily: "Cinzel, serif",
          fontSize: "0.56rem",
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(139,90,47,0.75)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "rgba(46,32,16,0.55)" }} />
      <span
        style={{
          fontFamily: "Cinzel, serif",
          fontSize: "0.53rem",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: met ? "rgba(80,200,80,0.85)" : "rgba(200,80,80,0.75)",
          whiteSpace: "nowrap",
        }}
      >
        {met ? `✓ ${metLabel}` : `✗ ${unmetLabel}`}
      </span>
    </div>
  );
}

function ReqTableHeader() {
  const cellStyle: React.CSSProperties = {
    fontSize: "0.56rem",
    fontFamily: "Cinzel, serif",
    letterSpacing: "0.12em",
    color: "rgba(90,64,32,0.8)",
    textTransform: "uppercase",
  };
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 96px 96px 26px",
        padding: "5px 12px",
        background: "rgba(8,6,3,0.75)",
        borderBottom: "1px solid rgba(30,22,10,0.5)",
        gap: "8px",
      }}
    >
      <span style={cellStyle}>Requirement</span>
      <span style={{ ...cellStyle, textAlign: "right" }}>Have</span>
      <span style={{ ...cellStyle, textAlign: "right" }}>Need</span>
      <span />
    </div>
  );
}

function ReqRow({
  icon,
  label,
  have,
  need,
  meets,
  last,
}: {
  icon: string;
  label: string;
  have: number;
  need: number;
  meets: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 96px 96px 26px",
        padding: "7px 12px",
        gap: "8px",
        alignItems: "center",
        borderBottom: last ? "none" : "1px solid rgba(20,15,6,0.6)",
        borderLeft: `3px solid ${meets ? "rgba(60,160,60,0.55)" : "rgba(180,50,50,0.45)"}`,
        background: meets ? "rgba(20,50,20,0.1)" : "rgba(50,15,15,0.08)",
      }}
    >
      <span
        style={{
          fontSize: "0.73rem",
          color: "rgba(170,130,80,0.9)",
          fontFamily: "Source Sans 3, sans-serif",
          fontWeight: 500,
        }}
      >
        {icon} {label}
      </span>
      <span
        style={{
          fontSize: "0.78rem",
          fontFamily: "monospace",
          fontWeight: 700,
          textAlign: "right",
          color: meets ? "rgba(80,200,80,0.95)" : "rgba(220,70,70,0.95)",
        }}
      >
        {formatNumber(have)}
      </span>
      <span
        style={{
          fontSize: "0.76rem",
          fontFamily: "monospace",
          textAlign: "right",
          color: "rgba(100,72,36,0.65)",
        }}
      >
        {formatNumber(need)}
      </span>
      <span
        style={{
          fontSize: "0.85rem",
          textAlign: "center",
          color: meets ? "rgba(80,200,80,0.9)" : "rgba(70,40,20,0.4)",
          fontWeight: 700,
        }}
      >
        {meets ? "✓" : "·"}
      </span>
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────

export function DevelopClient() {
  const { player, development, resources, army, tribe, refresh, applyPatch } =
    usePlayer();
  const [loading, setLoading] = useState<string | null>(null);
  const [loadingCity, setLoadingCity] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [showPopTable, setShowPopTable] = useState(false);

  // ── Upgrade ──────────────────────────────────────────────────────────────

  async function handleUpgrade(field: DevField) {
    setLoading(field);
    setMessage(null);
    try {
      const res = await fetch("/api/develop/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error ?? "Upgrade failed", type: "error" });
      } else {
        setMessage({ text: "Upgrade successful!", type: "success" });
        if (development) {
          applyPatch({
            development: {
              ...development,
              [field]: (development[field] as number) + 1,
            },
          });
        }
        if (data.data?.resources)
          applyPatch({ resources: data.data.resources });
        refresh();
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setLoading(null);
    }
  }

  // ── City promotion ────────────────────────────────────────────────────────

  async function handlePromoteCity() {
    setLoadingCity(true);
    setMessage(null);
    try {
      const res = await fetch("/api/city/promote", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setMessage({
          text: data.error ?? "Failed to promote city",
          type: "error",
        });
      } else {
        setMessage({
          text: `Promoted to ${data.data.city_name}!`,
          type: "success",
        });
        if (data.data?.resources)
          applyPatch({ resources: data.data.resources });
        refresh();
      }
    } catch {
      setMessage({ text: "Network error", type: "error" });
    } finally {
      setLoadingCity(false);
    }
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const currentCity = player?.city ?? 1;
  const currentCityName =
    BALANCE.cities.names[currentCity] ?? `City ${currentCity}`;
  const currentCityMult =
    BALANCE.cities.slaveProductionMultByCity[currentCity] ?? 1;
  const hasNextCity = currentCity < BALANCE.cities.maxCity;
  const nextCityNum = currentCity + 1;
  const nextCityName = hasNextCity
    ? (BALANCE.cities.names[nextCityNum] ?? `City ${nextCityNum}`)
    : null;
  const nextCityMult = hasNextCity
    ? (BALANCE.cities.slaveProductionMultByCity[nextCityNum] ?? 1)
    : null;

  const nextReq = hasNextCity
    ? BALANCE.cities.promotion.soldiersRequiredByCity[nextCityNum]
    : null;
  const nextCost = hasNextCity
    ? BALANCE.cities.promotion.resourceCostByCity[nextCityNum]
    : null;

  const inTribe = tribe !== null;
  const meetsArmy = nextReq != null && (army?.soldiers ?? 0) >= nextReq;
  const meetsGold = nextCost != null && (resources?.gold ?? 0) >= nextCost.gold;
  const meetsWood = nextCost != null && (resources?.wood ?? 0) >= nextCost.wood;
  const meetsIron = nextCost != null && (resources?.iron ?? 0) >= nextCost.iron;
  const meetsFood = nextCost != null && (resources?.food ?? 0) >= nextCost.food;
  const meetsAllCosts = meetsGold && meetsWood && meetsIron && meetsFood;
  const canPromote =
    hasNextCity &&
    !inTribe &&
    meetsArmy &&
    meetsAllCosts;

  const popLevel = development?.population_level ?? 0;
  const popPerTick = BALANCE.training.populationPerTick[popLevel] ?? 1;
  const maxPopLevel = 10;
  const popIsMaxed = popLevel >= maxPopLevel;
  const popCost = getUpgradeCost("population_level", popLevel);
  const popCanAfford =
    !popIsMaxed &&
    (resources?.gold ?? 0) >= popCost.gold &&
    (resources?.food ?? 0) >= popCost.resource;

  const popPerTickEntries = Object.entries(
    BALANCE.training.populationPerTick,
  ) as [string, number][];

  return (
    <div className="space-y-4">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className="font-display text-game-3xl gold-gradient-text-static text-title-glow uppercase tracking-wide">
          Development
        </h1>
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

      {/* ══════════════════════════════════════════════════════════════════
          1. RESOURCE STRIP — always at top
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="rounded-game-lg overflow-hidden"
        style={{
          border: "1px solid rgba(201,144,26,0.28)",
          borderTop: "1px solid rgba(201,144,26,0.45)",
          background:
            "linear-gradient(180deg, rgba(30,22,10,0.95) 0%, rgba(18,14,7,0.98) 100%)",
          boxShadow:
            "0 4px 24px rgba(0,0,0,0.6), inset 0 1px 0 rgba(240,192,48,0.1)",
        }}
      >
        <div className="flex">
          {[
            {
              icon: "🪙",
              label: "Gold",
              value: resources?.gold ?? 0,
              color: "text-res-gold",
            },
            {
              icon: "⚙️",
              label: "Iron",
              value: resources?.iron ?? 0,
              color: "text-res-iron",
            },
            {
              icon: "🪵",
              label: "Wood",
              value: resources?.wood ?? 0,
              color: "text-res-wood",
            },
            {
              icon: "🌾",
              label: "Food",
              value: resources?.food ?? 0,
              color: "text-res-food",
            },
          ].map(({ icon, label, value, color }, idx) => (
            <div
              key={label}
              className="flex-1 flex flex-col items-center py-3 px-2 gap-1 min-w-0"
              style={
                idx > 0
                  ? { borderLeft: "1px solid rgba(201,144,26,0.15)" }
                  : undefined
              }
            >
              <span className="text-base leading-none">{icon}</span>
              <span
                className={`font-heading text-game-sm font-bold tabular-nums leading-none ${color}`}
              >
                {formatNumber(value)}
              </span>
              <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wider leading-none">
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          2. CITY PROGRESSION — cinematic conquest map
      ══════════════════════════════════════════════════════════════════ */}
      <div
        className="rounded-game-xl overflow-hidden"
        style={{
          position: "relative",
          border: "1px solid rgba(201,144,26,0.3)",
          borderTop: "1px solid rgba(240,192,48,0.5)",
          background:
            "linear-gradient(180deg, rgba(20,14,6,0.99) 0%, rgba(8,6,3,1) 100%)",
          boxShadow:
            "0 12px 60px rgba(0,0,0,0.9), 0 0 0 1px rgba(201,144,26,0.06), inset 0 1px 0 rgba(240,192,48,0.12)",
        }}
      >
        {/* Corner ornaments */}
        <div
          style={{
            position: "absolute",
            top: 10,
            left: 10,
            width: 18,
            height: 18,
            borderTop: "1.5px solid rgba(201,144,26,0.5)",
            borderLeft: "1.5px solid rgba(201,144,26,0.5)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            width: 18,
            height: 18,
            borderTop: "1.5px solid rgba(201,144,26,0.5)",
            borderRight: "1.5px solid rgba(201,144,26,0.5)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            width: 18,
            height: 18,
            borderBottom: "1.5px solid rgba(201,144,26,0.5)",
            borderLeft: "1.5px solid rgba(201,144,26,0.5)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 10,
            right: 10,
            width: 18,
            height: 18,
            borderBottom: "1.5px solid rgba(201,144,26,0.5)",
            borderRight: "1.5px solid rgba(201,144,26,0.5)",
            pointerEvents: "none",
            zIndex: 2,
          }}
        />

        {/* ── Panel header ── */}
        <div
          style={{
            position: "relative",
            zIndex: 1,
            padding: "0.7rem 1.25rem",
            borderBottom: "1px solid rgba(201,144,26,0.18)",
            background:
              "linear-gradient(180deg, rgba(201,144,26,0.1) 0%, rgba(201,144,26,0.02) 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}
          >
            <span style={{ fontSize: "1rem", lineHeight: 1 }}>🗺</span>
            <h2 className="font-display text-game-lg gold-gradient-text-static text-title-glow uppercase tracking-widest">
              City Progression
            </h2>
          </div>
          <span
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: "0.58rem",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              color:
                currentCity === BALANCE.cities.maxCity
                  ? "rgba(240,192,48,0.75)"
                  : "rgba(139,90,47,0.75)",
            }}
          >
            {currentCity === BALANCE.cities.maxCity
              ? "Apex — All Realms Claimed"
              : `${CITY_MAP_POINTS[currentCity - 1]?.label ?? ""} → ${CITY_MAP_POINTS[nextCityNum - 1]?.label ?? ""}`}
          </span>
        </div>

        {/* ── Main content ── */}
        {hasNextCity && nextCityName && nextCost && nextReq !== null ? (
          <div style={{ position: "relative", zIndex: 1 }}>

            {/* ── Fantasy conquest map — the centerpiece ── */}
            <CityConquestMap currentCity={currentCity} />

            {/* ── Current → next city info strip ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                borderTop: "1px solid rgba(201,144,26,0.15)",
                borderBottom: "1px solid rgba(201,144,26,0.12)",
                background: "linear-gradient(180deg, rgba(10,7,3,0.85) 0%, rgba(6,4,2,0.95) 100%)",
              }}
            >
              {/* Current city */}
              <div style={{ padding: "0.75rem 1rem 0.7rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "1.65rem", lineHeight: 1, flexShrink: 0 }}>
                  {CITY_EMBLEMS[currentCity - 1]}
                </span>
                <div>
                  <p style={{ fontFamily: "Cinzel, serif", fontSize: "0.46rem", letterSpacing: "0.16em", color: "rgba(120,88,36,0.72)", textTransform: "uppercase", marginBottom: "2px" }}>
                    Your Kingdom
                  </p>
                  <p style={{ fontFamily: "Cinzel, serif", fontSize: "0.88rem", color: "#F0C030", textShadow: "0 0 12px rgba(240,192,48,0.4)", lineHeight: 1.15, marginBottom: "3px" }}>
                    {currentCityName}
                  </p>
                  <p style={{ fontFamily: "Source Sans 3, sans-serif", fontSize: "0.58rem", color: "rgba(150,112,52,0.7)" }}>
                    ×{currentCityMult} production
                  </p>
                </div>
              </div>

              {/* Arrow divider */}
              <div style={{ display: "flex", alignItems: "center", padding: "0 0.875rem", color: canPromote ? "rgba(80,200,80,0.65)" : "rgba(90,68,30,0.5)", fontSize: "1.1rem" }}>
                {canPromote ? "⚡" : "→"}
              </div>

              {/* Next city */}
              <div style={{ padding: "0.75rem 1rem 0.7rem", display: "flex", alignItems: "center", gap: "0.75rem", borderLeft: "1px solid rgba(201,144,26,0.1)" }}>
                <span style={{ fontSize: "1.65rem", lineHeight: 1, flexShrink: 0, opacity: 0.78 }}>
                  {CITY_EMBLEMS[(nextCityNum - 1) as 0 | 1 | 2 | 3 | 4]}
                </span>
                <div>
                  <p style={{ fontFamily: "Cinzel, serif", fontSize: "0.46rem", letterSpacing: "0.16em", color: "rgba(201,144,26,0.68)", textTransform: "uppercase", marginBottom: "2px" }}>
                    Next Conquest
                  </p>
                  <p style={{ fontFamily: "Cinzel, serif", fontSize: "0.88rem", color: "#FFD700", textShadow: "0 0 14px rgba(240,192,48,0.5)", lineHeight: 1.15, marginBottom: "3px", opacity: 0.88 }}>
                    {nextCityName}
                  </p>
                  <p style={{ fontFamily: "Source Sans 3, sans-serif", fontSize: "0.58rem", color: "rgba(201,144,26,0.62)" }}>
                    ×{nextCityMult} production
                  </p>
                </div>
              </div>
            </div>

            {/* ── Requirements & Cost ── */}
            <div style={{ padding: "0.875rem 1rem 0" }}>

              {/* ── Requirements block (soldiers) ── */}
              <SectionDivider
                label="Requirements"
                met={meetsArmy}
                metLabel="Met"
                unmetLabel="Not Met"
              />
              <div
                style={{
                  borderRadius: "6px",
                  overflow: "hidden",
                  border: "1px solid rgba(30,22,10,0.7)",
                  marginBottom: "0.75rem",
                }}
              >
                <ReqTableHeader />
                <ReqRow
                  icon="⚔️"
                  label="Soldiers"
                  have={army?.soldiers ?? 0}
                  need={nextReq}
                  meets={meetsArmy}
                  last
                />
              </div>

              {/* ── Cost block (resources) ── */}
              <SectionDivider
                label="Cost"
                met={meetsAllCosts}
                metLabel="Can Afford"
                unmetLabel="Insufficient"
              />
              <div
                style={{
                  borderRadius: "6px",
                  overflow: "hidden",
                  border: "1px solid rgba(30,22,10,0.7)",
                }}
              >
                <ReqTableHeader />
                {[
                  { label: "Gold", icon: "🪙", have: resources?.gold ?? 0, need: nextCost.gold, meets: meetsGold },
                  { label: "Iron", icon: "⚙️", have: resources?.iron ?? 0, need: nextCost.iron, meets: meetsIron },
                  { label: "Wood", icon: "🪵", have: resources?.wood ?? 0, need: nextCost.wood, meets: meetsWood },
                  { label: "Food", icon: "🌾", have: resources?.food ?? 0, need: nextCost.food, meets: meetsFood },
                ].map(({ label, icon, have, need, meets }, idx) => (
                  <ReqRow
                    key={label}
                    icon={icon}
                    label={label}
                    have={have}
                    need={need}
                    meets={meets}
                    last={idx === 3}
                  />
                ))}
              </div>
            </div>

            {/* ── Tribe-blocked banner ── */}
            {inTribe && (
              <div
                style={{
                  margin: "0.75rem 1rem 0",
                  padding: "0.6rem 0.875rem",
                  borderRadius: "6px",
                  background: "rgba(120,40,20,0.18)",
                  border: "1px solid rgba(200,80,50,0.35)",
                  borderLeft: "3px solid rgba(200,80,50,0.7)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <span style={{ fontSize: "0.9rem", flexShrink: 0 }}>🚫</span>
                <span
                  style={{
                    fontFamily: "Source Sans 3, sans-serif",
                    fontSize: "0.72rem",
                    color: "rgba(220,100,80,0.9)",
                    lineHeight: 1.4,
                  }}
                >
                  You must leave your tribe before promoting your city.
                </span>
              </div>
            )}

            {/* ── CTA footer ── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem 1.125rem",
                gap: "1rem",
                marginTop: "0.5rem",
              }}
            >
              <p
                style={{
                  fontFamily: "Source Sans 3, sans-serif",
                  fontSize: "0.65rem",
                  color: "rgba(90,64,32,0.65)",
                  fontStyle: "italic",
                }}
              >
                Irreversible — no downgrade possible
              </p>
              <Button
                variant="primary"
                disabled={!canPromote}
                loading={loadingCity}
                onClick={handlePromoteCity}
                className="shrink-0"
              >
                Advance to {nextCityName}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Max city reached ── */
          <div style={{ position: "relative", zIndex: 1 }}>
            <CityConquestMap currentCity={currentCity} />
            <div
              style={{
                padding: "1.125rem 1.25rem 1.375rem",
                textAlign: "center",
                borderTop: "1px solid rgba(201,144,26,0.18)",
                background: "linear-gradient(180deg, rgba(18,12,4,0.9) 0%, rgba(8,5,2,0.97) 100%)",
              }}
            >
              <div
                style={{
                  width: "4.5rem",
                  height: "4.5rem",
                  borderRadius: "50%",
                  background: "linear-gradient(135deg, rgba(80,60,18,0.95), rgba(36,26,8,0.88))",
                  border: "2px solid rgba(201,144,26,0.82)",
                  boxShadow: "0 0 28px rgba(201,144,26,0.72), 0 0 56px rgba(201,144,26,0.28)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "2.4rem",
                  margin: "0 auto 0.75rem",
                }}
              >
                ⚜
              </div>
              <p className="font-display text-game-xl gold-gradient-text-static text-title-glow uppercase">
                {currentCityName}
              </p>
              <p className="text-game-sm text-game-text-secondary font-body mt-1">
                You have reached the apex of the known world.
              </p>
              <p className="text-game-xs text-game-text-muted font-body mt-0.5">
                ×{currentCityMult} slave production — maximum multiplier.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          3. POPULATION GROWTH — compact
      ══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-game-lg border border-game-border bg-gradient-to-b from-game-elevated to-game-surface shadow-engrave overflow-hidden">
        <div className="px-4 py-2 bg-game-bg/50 border-b border-game-border/60 flex items-center gap-2">
          <span className="text-sm leading-none">👥</span>
          <span className="font-heading text-game-xs uppercase tracking-widest text-game-text-secondary">
            Population
          </span>
        </div>
        <div className="px-4 py-3 space-y-3">
          <div className="flex flex-wrap gap-3">
            {[
              {
                label: "Untrained",
                value: formatNumber(army?.free_population ?? 0),
                color: "text-game-text-white",
              },
              {
                label: "Per Tick",
                value: `+${popPerTick}`,
                color: "text-game-green-bright",
              },
              {
                label: "Growth Lv",
                value: `${popLevel} / ${maxPopLevel}`,
                color: "text-game-gold",
              },
            ].map(({ label, value, color }) => (
              <div
                key={label}
                className="flex items-center gap-2 bg-game-bg/40 border border-game-border/50 rounded-game px-3 py-1.5"
              >
                <span className="text-game-xs text-game-text-muted font-body uppercase tracking-wide">
                  {label}
                </span>
                <span
                  className={`font-heading text-game-sm font-semibold ${color}`}
                >
                  {value}
                </span>
              </div>
            ))}
          </div>
          {popIsMaxed ? (
            <div className="flex items-center gap-2">
              <Badge variant="gold">MAX</Badge>
              <span className="text-game-xs text-game-text-secondary font-body">
                Population Growth fully upgraded.
              </span>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-game-xs font-body text-game-text-muted">
                  Lv {popLevel} → {popLevel + 1}:
                </span>
                <span className="text-game-xs font-body text-game-green-bright font-semibold">
                  +{BALANCE.training.populationPerTick[popLevel + 1] ?? "?"}{" "}
                  pop/tick
                </span>
                <ResourceBadge type="gold" amount={popCost.gold} />
                <ResourceBadge type="food" amount={popCost.resource} />
              </div>
              <Button
                variant="primary"
                size="sm"
                disabled={!popCanAfford}
                loading={loading === "population_level"}
                onClick={() => handleUpgrade("population_level")}
                className="shrink-0"
              >
                Upgrade
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          4. INFRASTRUCTURE UPGRADES — table-style rows
      ══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-game-lg border border-game-border bg-gradient-to-b from-game-elevated to-game-surface shadow-engrave overflow-hidden">
        <div className="px-4 py-3 border-b border-game-border">
          <h2 className="font-heading text-game-base uppercase tracking-wide text-game-gold">
            Infrastructure
          </h2>
        </div>
        <div className="hidden sm:grid grid-cols-[1fr_120px_1fr_auto] gap-3 px-4 py-2 border-b border-game-border/50 bg-game-bg/40">
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">
            Building
          </span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">
            Level
          </span>
          <span className="text-game-xs font-heading uppercase tracking-widest text-game-text-muted">
            Next Cost
          </span>
          <span></span>
        </div>
        <div className="divide-y divide-game-border/40">
          {DEV_ROWS.map((row) => {
            const currentLevel = (development?.[row.field] as number) ?? 0;
            const cost = getUpgradeCost(row.field, currentLevel);
            const isMaxed = currentLevel >= row.maxLevel;
            const progress = (currentLevel / row.maxLevel) * 100;

            let canAfford = false;
            if (!isMaxed) {
              const resAmt =
                ((resources as Resources | null)?.[
                  cost.resourceType as keyof Resources
                ] as number) ?? 0;
              canAfford =
                (resources?.gold ?? 0) >= cost.gold &&
                (cost.resourceType === "gold" || resAmt >= cost.resource);
            }

            return (
              <div
                key={row.field}
                className="grid grid-cols-1 sm:grid-cols-[1fr_120px_1fr_auto] gap-2 sm:gap-3 items-center px-4 py-3 hover:bg-game-elevated/30 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-base leading-none">{row.icon}</span>
                  <div>
                    <span className="font-heading text-game-sm uppercase tracking-wide text-game-text-white">
                      {row.title}
                    </span>
                    <span className="sm:hidden ml-2 text-game-xs text-game-text-muted font-body">
                      Lv {currentLevel}/{row.maxLevel}
                    </span>
                    <p className="text-game-xs text-game-text-muted font-body">
                      {row.effectLabel}
                    </p>
                  </div>
                </div>
                <div className="hidden sm:block space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-game-xs text-game-text-secondary">
                      {currentLevel} / {row.maxLevel}
                    </span>
                    {isMaxed && <Badge variant="gold">MAX</Badge>}
                  </div>
                  <div className="progress-bar h-1.5">
                    <div
                      className="progress-fill progress-fill-gold"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {isMaxed ? (
                    <span className="text-game-xs text-game-text-muted font-body italic">
                      Fully upgraded
                    </span>
                  ) : (
                    <>
                      {cost.gold > 0 && (
                        <ResourceBadge type="gold" amount={cost.gold} />
                      )}
                      {cost.resourceType !== "gold" && cost.resource > 0 && (
                        <ResourceBadge
                          type={cost.resourceType as "iron" | "wood" | "food"}
                          amount={cost.resource}
                        />
                      )}
                    </>
                  )}
                </div>
                <div>
                  <Button
                    variant="success"
                    size="sm"
                    disabled={!canAfford || isMaxed}
                    loading={loading === row.field}
                    onClick={() => handleUpgrade(row.field)}
                    className="w-full sm:w-auto whitespace-nowrap"
                  >
                    {isMaxed ? "Max" : "Upgrade"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          5. POPULATION GROWTH REFERENCE — collapsible
      ══════════════════════════════════════════════════════════════════ */}
      <div className="rounded-game border border-game-border/50 overflow-hidden">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-2.5 bg-game-surface/40 hover:bg-game-surface/70 transition-colors"
          onClick={() => setShowPopTable((v) => !v)}
        >
          <span className="font-heading text-game-xs uppercase tracking-widest text-game-text-muted">
            Population Growth Rate Table
          </span>
          <span className="text-game-text-muted text-xs">
            {showPopTable ? "▲ Hide" : "▼ Show"}
          </span>
        </button>
        {showPopTable && (
          <div className="p-3 border-t border-game-border/40">
            <GameTable
              headers={["Level", "Population / Tick"]}
              striped
              rows={popPerTickEntries.map(([lvl, pop]) => {
                const isCurrent = Number(lvl) === popLevel;
                return [
                  <span
                    key="lvl"
                    className={`font-heading text-game-sm flex items-center gap-2 ${isCurrent ? "text-game-gold-bright" : "text-game-text"}`}
                  >
                    {lvl}
                    {isCurrent && <Badge variant="gold">Current</Badge>}
                  </span>,
                  <span
                    key="pop"
                    className={`font-semibold ${isCurrent ? "text-game-gold-bright" : "text-game-text-white"}`}
                  >
                    +{pop}
                  </span>,
                ];
              })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
