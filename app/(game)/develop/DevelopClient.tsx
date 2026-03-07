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

const ROMAN = ["I", "II", "III", "IV", "V"] as const;

// City emblems per tier — one per city level
const CITY_EMBLEMS = ["⛺", "🏡", "🏰", "🏯", "⚜"] as const;

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

  // ── Campaign waypoint nodes (conquest track) ──────────────────────────────

  const campaignNodes: JSX.Element[] = [];
  for (let i = 0; i < 5; i++) {
    const cityNum = i + 1;
    const name = BALANCE.cities.names[cityNum] ?? `City ${cityNum}`;
    const isCompleted = cityNum < currentCity;
    const isCurrent = cityNum === currentCity;
    const isNext = hasNextCity && cityNum === nextCityNum;

    // Connector segment before each node except the first
    if (i > 0) {
      const segDone = cityNum <= currentCity;
      const segActive = !segDone && cityNum === nextCityNum;
      campaignNodes.push(
        <div
          key={`seg-${cityNum}`}
          style={{
            flex: 1,
            marginTop: "1.375rem",
            height: "2px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: segDone
                ? "linear-gradient(90deg, rgba(201,144,26,0.85), rgba(240,192,48,0.6))"
                : segActive
                  ? "repeating-linear-gradient(90deg, rgba(201,144,26,0.5) 0px, rgba(201,144,26,0.5) 5px, transparent 5px, transparent 12px)"
                  : "rgba(30,22,10,0.5)",
            }}
          />
        </div>,
      );
    }

    // City waypoint node
    campaignNodes.push(
      <div
        key={`city-${cityNum}`}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "4px",
          flexShrink: 0,
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: isCurrent ? "2.75rem" : isNext ? "2.25rem" : "1.75rem",
            height: isCurrent ? "2.75rem" : isNext ? "2.25rem" : "1.75rem",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: isCurrent ? "1.2rem" : isNext ? "1rem" : "0.75rem",
            background: isCompleted
              ? "linear-gradient(135deg, rgba(80,60,20,0.9), rgba(50,36,12,0.8))"
              : isCurrent
                ? "linear-gradient(135deg, rgba(201,144,26,0.38), rgba(122,92,18,0.28))"
                : isNext
                  ? "linear-gradient(135deg, rgba(30,22,10,0.95), rgba(20,16,8,0.9))"
                  : "rgba(12,10,6,0.9)",
            border: isCompleted
              ? "1.5px solid rgba(201,144,26,0.65)"
              : isCurrent
                ? "2px solid rgba(240,192,48,0.9)"
                : isNext
                  ? "1.5px solid rgba(201,144,26,0.4)"
                  : "1px solid rgba(30,22,10,0.6)",
            boxShadow: isCurrent
              ? "0 0 24px rgba(201,144,26,0.9), 0 0 48px rgba(201,144,26,0.4), 0 0 72px rgba(201,144,26,0.15)"
              : isNext
                ? "0 0 12px rgba(201,144,26,0.25)"
                : "none",
          }}
        >
          {isCompleted ? (
            <span
              style={{
                color: "rgba(201,144,26,0.85)",
                fontSize: "0.8rem",
                fontWeight: 700,
              }}
            >
              ✓
            </span>
          ) : (
            <span>{CITY_EMBLEMS[i]}</span>
          )}
        </div>

        <span
          style={{
            fontFamily: "Cinzel, serif",
            fontSize: "0.48rem",
            letterSpacing: "0.04em",
            textAlign: "center",
            maxWidth: "60px",
            lineHeight: 1.2,
            color: isCurrent
              ? "rgba(240,192,48,0.9)"
              : isNext
                ? "rgba(201,144,26,0.7)"
                : isCompleted
                  ? "rgba(201,144,26,0.45)"
                  : "rgba(40,30,12,0.5)",
          }}
        >
          {name}
        </span>

        {isCurrent && (
          <span
            style={{
              fontSize: "0.42rem",
              letterSpacing: "0.12em",
              color: "rgba(201,144,26,0.7)",
              textTransform: "uppercase",
              fontFamily: "Source Sans 3, sans-serif",
            }}
          >
            here
          </span>
        )}
        {isNext && (
          <span
            style={{
              fontSize: "0.42rem",
              letterSpacing: "0.12em",
              color: "rgba(240,192,48,0.8)",
              textTransform: "uppercase",
              fontFamily: "Source Sans 3, sans-serif",
            }}
          >
            next
          </span>
        )}
      </div>,
    );
  }

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
        {/* Background map grid texture */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: `
              linear-gradient(rgba(201,144,26,0.022) 1px, transparent 1px),
              linear-gradient(90deg, rgba(201,144,26,0.022) 1px, transparent 1px)
            `,
            backgroundSize: "44px 44px",
            pointerEvents: "none",
            zIndex: 0,
          }}
        />

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
              ? "Apex — Maximum Tier"
              : `Tier ${ROMAN[currentCity - 1]} → Tier ${ROMAN[nextCityNum - 1]}`}
          </span>
        </div>

        {/* ── Main content ── */}
        {hasNextCity && nextCityName && nextCost && nextReq !== null ? (
          <div style={{ position: "relative", zIndex: 1 }}>
            {/* ── Territory diptych — the cinematic centerpiece ── */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto 1fr",
                position: "relative",
                overflow: "hidden",
              }}
            >
              {/* Radial territory lights */}
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse at 22% 50%, rgba(201,144,26,0.08) 0%, transparent 55%)",
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background:
                    "radial-gradient(ellipse at 78% 50%, rgba(240,192,48,0.065) 0%, transparent 55%)",
                  pointerEvents: "none",
                }}
              />

              {/* Current city territory */}
              <div
                style={{
                  padding: "1.5rem 1rem 1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.625rem",
                  position: "relative",
                }}
              >
                {/* City emblem */}
                <div
                  style={{
                    width: "5rem",
                    height: "5rem",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, rgba(50,38,16,0.95), rgba(22,16,8,0.98))",
                    border: "2px solid rgba(201,144,26,0.65)",
                    boxShadow:
                      "0 0 22px rgba(201,144,26,0.55), 0 0 44px rgba(201,144,26,0.2), inset 0 1px 0 rgba(240,192,48,0.15)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2.2rem",
                  }}
                >
                  {CITY_EMBLEMS[currentCity - 1]}
                </div>

                <div style={{ textAlign: "center" }}>
                  <p
                    style={{
                      fontFamily: "Cinzel, serif",
                      fontSize: "0.5rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(139,90,47,0.75)",
                      marginBottom: "4px",
                    }}
                  >
                    Your Kingdom
                  </p>
                  <p
                    style={{
                      fontFamily: "Cinzel, serif",
                      fontSize: "1.05rem",
                      color: "#F0C030",
                      textShadow: "0 0 16px rgba(240,192,48,0.45)",
                      lineHeight: 1.15,
                      marginBottom: "0.5rem",
                    }}
                  >
                    {currentCityName}
                  </p>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "rgba(201,144,26,0.12)",
                      border: "1px solid rgba(201,144,26,0.28)",
                      borderRadius: "4px",
                      padding: "2px 8px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Cinzel, serif",
                        fontSize: "0.65rem",
                        color: "rgba(201,144,26,0.88)",
                        fontWeight: 600,
                      }}
                    >
                      ×{currentCityMult}
                    </span>
                    <span
                      style={{
                        fontFamily: "Source Sans 3, sans-serif",
                        fontSize: "0.52rem",
                        color: "rgba(139,90,47,0.65)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      prod
                    </span>
                  </div>
                </div>
              </div>

              {/* Conquest path divider */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "1rem 1.25rem",
                  gap: "0.5rem",
                  borderLeft: "1px solid rgba(201,144,26,0.1)",
                  borderRight: "1px solid rgba(201,144,26,0.1)",
                  minWidth: "76px",
                }}
              >
                <div
                  style={{
                    width: "1px",
                    flex: 1,
                    background:
                      "linear-gradient(to bottom, transparent, rgba(201,144,26,0.28))",
                  }}
                />
                <div
                  style={{
                    width: "3rem",
                    height: "3rem",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    fontSize: "1.15rem",
                    background: canPromote
                      ? "linear-gradient(135deg, rgba(22,65,22,0.65), rgba(12,45,12,0.75))"
                      : "linear-gradient(135deg, rgba(40,30,12,0.65), rgba(20,15,6,0.75))",
                    border: canPromote
                      ? "1.5px solid rgba(60,160,60,0.5)"
                      : "1.5px solid rgba(201,144,26,0.22)",
                    boxShadow: canPromote
                      ? "0 0 16px rgba(60,160,60,0.28)"
                      : "none",
                  }}
                >
                  {canPromote ? "⚡" : "⚔"}
                </div>
                <span
                  style={{
                    fontFamily: "Cinzel, serif",
                    fontSize: "0.44rem",
                    letterSpacing: "0.14em",
                    textTransform: "uppercase",
                    color: "rgba(139,90,47,0.65)",
                  }}
                >
                  Advance
                </span>
                <div
                  style={{
                    width: "1px",
                    flex: 1,
                    background:
                      "linear-gradient(to bottom, rgba(201,144,26,0.28), transparent)",
                  }}
                />
              </div>

              {/* Next city territory */}
              <div
                style={{
                  padding: "1.5rem 1rem 1.25rem",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.625rem",
                  background:
                    "linear-gradient(135deg, rgba(201,144,26,0.04), transparent 60%)",
                  position: "relative",
                }}
              >
                {/* City emblem */}
                <div
                  style={{
                    width: "5rem",
                    height: "5rem",
                    borderRadius: "50%",
                    background:
                      "linear-gradient(135deg, rgba(40,30,10,0.75), rgba(16,12,6,0.9))",
                    border: "2px solid rgba(240,192,48,0.45)",
                    boxShadow:
                      "0 0 20px rgba(240,192,48,0.22), 0 0 44px rgba(240,192,48,0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "2.2rem",
                    opacity: 0.88,
                  }}
                >
                  {CITY_EMBLEMS[(nextCityNum - 1) as 0 | 1 | 2 | 3 | 4] ?? "⚜"}
                </div>

                <div style={{ textAlign: "center" }}>
                  <p
                    style={{
                      fontFamily: "Cinzel, serif",
                      fontSize: "0.5rem",
                      letterSpacing: "0.18em",
                      textTransform: "uppercase",
                      color: "rgba(201,144,26,0.65)",
                      marginBottom: "4px",
                    }}
                  >
                    Target Territory
                  </p>
                  <p
                    style={{
                      fontFamily: "Cinzel, serif",
                      fontSize: "1.05rem",
                      color: "#FFD700",
                      textShadow: "0 0 20px rgba(240,192,48,0.55)",
                      lineHeight: 1.15,
                      marginBottom: "0.5rem",
                    }}
                  >
                    {nextCityName}
                  </p>
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      background: "rgba(240,192,48,0.1)",
                      border: "1px solid rgba(240,192,48,0.32)",
                      borderRadius: "4px",
                      padding: "2px 8px",
                    }}
                  >
                    <span
                      style={{
                        fontFamily: "Cinzel, serif",
                        fontSize: "0.65rem",
                        color: "rgba(240,192,48,0.9)",
                        fontWeight: 600,
                      }}
                    >
                      ×{nextCityMult}
                    </span>
                    <span
                      style={{
                        fontFamily: "Source Sans 3, sans-serif",
                        fontSize: "0.52rem",
                        color: "rgba(201,144,26,0.7)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      prod
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Campaign Waypoints (conquest track) ── */}
            <div
              style={{
                padding: "0.75rem 1.25rem 1rem",
                borderTop: "1px solid rgba(201,144,26,0.1)",
                borderBottom: "1px solid rgba(201,144,26,0.1)",
                background: "rgba(6,4,2,0.55)",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  width: "100%",
                }}
              >
                {campaignNodes}
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
          <div
            style={{
              position: "relative",
              zIndex: 1,
              padding: "2rem 1.25rem",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "6rem",
                height: "6rem",
                borderRadius: "50%",
                background:
                  "linear-gradient(135deg, rgba(80,60,20,0.95), rgba(40,30,10,0.85))",
                border: "2px solid rgba(201,144,26,0.8)",
                boxShadow:
                  "0 0 32px rgba(201,144,26,0.7), 0 0 64px rgba(201,144,26,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "3rem",
                margin: "0 auto 1rem",
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
            <div
              style={{
                marginTop: "1.5rem",
                display: "flex",
                alignItems: "flex-start",
              }}
            >
              {campaignNodes}
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
