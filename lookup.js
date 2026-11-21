// ============================================================================
// BrawlVault Player & Club Lookup (with Rating out of 10)
// ============================================================================

const LOOKUP_STATE = {
  type: "player",
  subTab: "matches",
  lastPlayer: null,
};

function setLookupType(type) {
  LOOKUP_STATE.type = type;
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  const input = document.getElementById("lookup-tag-input");
  input.placeholder = type === "club" ? "Enter Clan Tag (e.g. #2PP)" : "Enter Player Tag (e.g. #2PP)";
}

function scoreColorClass(score) {
  if (score >= 8.0) return "score-elite";
  if (score >= 6.5) return "score-good";
  if (score >= 5.0) return "score-mid";
  return "score-low";
}

function formatBattleType(type) {
  const map = {
    ranked: "Trophy Match",
    soloRanked: "Ranked (Solo)",
    teamRanked: "Ranked (Team)",
    championshipChallenge: "Championship",
    challenge: "Challenge",
    friendly: "Friendly",
    tournament: "Tournament",
    regular: "Trophy Match",
  };
  return map[type] || BV.formatMode(type || "Match");
}

function getBreakdownItem(rating, labelPrefix) {
  const item = (rating?.breakdown || []).find((b) => b.label.startsWith(labelPrefix));
  if (!item) return { score: 0, max: 0, gap: 0 };
  return {
    score: item.score,
    max: item.max,
    gap: Math.max(0, Number((item.max - item.score).toFixed(2))),
  };
}

const STEP_COST = {
  1: [20, 20], 2: [30, 35], 3: [50, 75], 4: [80, 140], 5: [130, 290],
  6: [210, 480], 7: [340, 800], 8: [550, 1250], 9: [890, 1875], 10: [1440, 2800],
};

function calcCostTo11(power) {
  let pp = 0, coins = 0;
  for (let l = Math.max(1, power); l < 11; l++) {
    pp += STEP_COST[l][0];
    coins += STEP_COST[l][1];
  }
  return { pp, coins };
}

function generatePlayerCoaching(p) {
  const tips = [];
  const rating = p.rating || { score: 5.0, breakdown: [] };
  const bs = p.battle_stats || {};
  const brawlers = p.brawlers || [];

  // 1. Level 11 Roster Depth + Incomplete Lv 11 Kits
  const rosterItem = getBreakdownItem(rating, "Lv 11");
  const lv10s = brawlers.filter((b) => b.power === 10).sort((a, b) => b.trophies - a.trophies);
  const lv9s = brawlers.filter((b) => b.power === 9).sort((a, b) => b.trophies - a.trophies);
  const lvLow = brawlers.filter((b) => b.power <= 8);
  const nearMax = [...lv10s, ...lv9s];
  const incompleteLv11 = brawlers.filter(
    (b) => b.power >= 11 && ((b.star_powers || []).length === 0 || (b.gadgets || []).length === 0 || (b.gears || []).length < 2)
  );

  if (rosterItem.gap >= 0.1 || p.power11_count < 35 || incompleteLv11.length > 0) {
    const targetP11 = p.power11_count < 12 ? 12 : p.power11_count < 24 ? 24 : 35;
    const needed = Math.max(0, targetP11 - p.power11_count);
    const top3Cost = nearMax.slice(0, 3).reduce(
      (acc, b) => {
        const c = calcCostTo11(b.power);
        acc.pp += c.pp;
        acc.coins += c.coins;
        return acc;
      },
      { pp: 0, coins: 0 }
    );

    const steps = [];
    if (nearMax.length) {
      const detailed = nearMax.slice(0, 4).map((b) => {
        const c = calcCostTo11(b.power);
        return `${b.name} (Lv ${b.power}: ${c.coins.toLocaleString()} coins / ${c.pp.toLocaleString()} PP)`;
      }).join(" • ");
      steps.push(`Closest brawlers to max right now: ${detailed}.`);
    } else {
      steps.push(`No Lv 9–10 brawlers ready yet (${lvLow.length} brawlers are Lv 1–8). Pick 1 S-tier brawler at a time and push it straight to Lv 11 instead of leveling everything evenly.`);
    }
    if (incompleteLv11.length) {
      const missingList = incompleteLv11.slice(0, 4).map((b) => {
        const miss = [];
        if (!(b.star_powers || []).length) miss.push("SP");
        if (!(b.gadgets || []).length) miss.push("Gadget");
        if ((b.gears || []).length < 2) miss.push(`${2 - (b.gears || []).length} Gear`);
        return `${b.name} (needs ${miss.join(" + ")})`;
      }).join(", ");
      steps.push(`Incomplete Lv 11 builds (${incompleteLv11.length} found): ${missingList} — finishing kits immediately increases Ranked win rate.`);
    }
    if (p.power11_count < 12) {
      steps.push(`Priority #1: reach 12 Level 11 brawlers (+${needed} more) so you unlock Mythic+ Ranked and never get banned out.`);
    } else if (needed > 0) {
      steps.push(`Next milestone: ${targetP11} Level 11s (+${needed} more). Balance your maxed pool across Snipers, Tank Counters, Controllers, Throwers, and Assassins.`);
    }

    const metrics = [
      { label: "Current", value: `${p.power11_count} Lv11` },
      { label: "Lv 10 / Lv 9", value: `${lv10s.length} / ${lv9s.length}` },
      { label: "Avg Power", value: `${p.avg_power}` },
      { label: "Score Room", value: `+${rosterItem.gap.toFixed(2)} pts` },
    ];
    if (nearMax.length) {
      metrics.push({ label: `Next ${Math.min(3, nearMax.length)} Cost`, value: `🪙 ${top3Cost.coins.toLocaleString()}` });
    }

    const cardTitle =
      p.power11_count >= 35
        ? (incompleteLv11.length ? `Complete Missing Kits on ${incompleteLv11.length} Lv 11 Brawlers` : `Keep Your Maxed Roster Updated (${p.power11_count} Lv 11s)`)
        : `Grow Maxed Roster: ${p.power11_count} → ${targetP11} Level 11s`;

    tips.push({
      impact: rosterItem.gap,
      category: "LV 11 ROSTER DEPTH",
      tag: rosterItem.gap >= 0.7 ? "HIGH IMPACT" : "QUICK WIN",
      title: cardTitle,
      summary: `Currently ${rosterItem.score}/${rosterItem.max} pts (${p.power11_count} Lv11, ${lv10s.length} Lv10, ${lv9s.length} Lv9, ${lvLow.length} Lv1–8).`,
      metrics,
      steps,
      ctaHref: "/upgrade/",
      ctaLabel: "Open Full Upgrade Guide & Builds →",
    });
  }

  // 2. Trophies & Trophy Distribution Breakdown
  const trophyItem = getBreakdownItem(rating, "Trophies");
  const under300 = brawlers.filter((b) => b.trophies < 300);
  const mid300to599 = brawlers.filter((b) => b.trophies >= 300 && b.trophies < 600);
  const mid600to999 = brawlers.filter((b) => b.trophies >= 600 && b.trophies < 1000);
  const over1k = brawlers.filter((b) => b.trophies >= 1000);
  const easyFarm = brawlers
    .filter((b) => b.trophies < 600)
    .sort((a, b) => (b.power >= 9 ? 1 : 0) - (a.power >= 9 ? 1 : 0) || a.trophies - b.trophies);

  if (trophyItem.gap >= 0.1) {
    const milestones = [15000, 25000, 35000, 50000, 60000, 70000, 85000, 100000];
    const nextMs = milestones.find((m) => m > p.trophies) || p.trophies + 10000;
    const diff = nextMs - p.trophies;
    const farmTop5 = easyFarm.slice(0, 5);
    const estFarmGain = farmTop5.reduce((sum, b) => sum + Math.max(0, 600 - b.trophies), 0);
    const belowPeak = Math.max(0, p.highest_trophies - p.trophies);

    const steps = [];
    if (farmTop5.length) {
      const picks = farmTop5.map((b) => `${b.name} (${b.trophies} → 600 🏆, Lv ${b.power})`).join(" • ");
      steps.push(`Fastest +${estFarmGain.toLocaleString()} 🏆 farm on your account: ${picks}.`);
    }
    if (belowPeak >= 1000) {
      steps.push(`You're ${belowPeak.toLocaleString()} 🏆 under your all-time peak (${p.highest_trophies.toLocaleString()} 🏆). Reclaiming seasonal drop on Lv 11 comfort picks is faster than pushing new highs.`);
    }
    steps.push(`Distribution: ${under300.length} brawlers under 300 🏆, ${mid300to599.length} at 300–599, ${mid600to999.length} at 600–999, ${over1k.length} at 1,000+. Lifting low-trophy brawlers to 500–600 is the highest trophies-per-hour grind.`);
    steps.push(`Stack win-streak bonuses (+5 🏆 per streak win) in fast modes (Brawl Ball / Heist / Knockout) with a pre-made team.`);

    tips.push({
      impact: trophyItem.gap,
      category: "TROPHIES & PEAK",
      tag: trophyItem.gap >= 0.8 ? "HIGH IMPACT" : "STEADY GAIN",
      title: `Push +${diff.toLocaleString()} 🏆 to Hit ${nextMs.toLocaleString()} Trophies`,
      summary: `Currently ${trophyItem.score}/${trophyItem.max} pts — peaks at 70,000+ trophies.`,
      metrics: [
        { label: "Current", value: `🏆 ${p.trophies.toLocaleString()}` },
        { label: "Peak", value: `${p.highest_trophies.toLocaleString()}` },
        { label: "< 600 🏆 Pool", value: `${under300.length + mid300to599.length} brawlers` },
        { label: "Top 5 Farm", value: `+${estFarmGain.toLocaleString()} 🏆` },
        { label: "Score Room", value: `+${trophyItem.gap.toFixed(2)} pts` },
      ],
      steps,
    });
  }

  // 3. Recent Win Rate, Per-Mode & Per-Brawler Breakdown
  const wrItem = getBreakdownItem(rating, "Recent Win");
  const matches = bs.recent_matches || [];
  if (wrItem.gap >= 0.15 || (bs.win_rate != null && bs.win_rate < 62)) {
    const modeStats = new Map();
    const brawlerStats = new Map();
    matches.forEach((m) => {
      if (m.result !== "victory" && m.result !== "defeat") return;
      const ms = modeStats.get(m.mode) || { w: 0, l: 0 };
      if (m.result === "victory") ms.w += 1; else ms.l += 1;
      modeStats.set(m.mode, ms);

      if (m.brawler) {
        const bs2 = brawlerStats.get(m.brawler) || { w: 0, l: 0 };
        if (m.result === "victory") bs2.w += 1; else bs2.l += 1;
        brawlerStats.set(m.brawler, bs2);
      }
    });

    const modeArr = Array.from(modeStats.entries())
      .map(([mode, st]) => ({ mode, ...st, tot: st.w + st.l, wr: Math.round((st.w / (st.w + st.l)) * 100) }))
      .sort((a, b) => b.tot - a.tot);
    const brawlerArr = Array.from(brawlerStats.entries())
      .map(([name, st]) => ({ name, ...st, tot: st.w + st.l, wr: Math.round((st.w / (st.w + st.l)) * 100) }))
      .filter((x) => x.tot >= 2);

    const bestMode = [...modeArr].filter((x) => x.tot >= 2).sort((a, b) => b.wr - a.wr)[0];
    const worstMode = [...modeArr].filter((x) => x.tot >= 2).sort((a, b) => a.wr - b.wr)[0];
    const bestBrawler = [...brawlerArr].sort((a, b) => b.wr - a.wr || b.w - a.w)[0];
    const worstBrawler = [...brawlerArr].sort((a, b) => a.wr - b.wr || b.l - a.l)[0];

    let streakType = matches[0]?.result || "";
    let streakLen = 0;
    for (const m of matches) {
      if (m.result === streakType) streakLen += 1;
      else break;
    }
    const streakLabel =
      streakType === "victory" ? `${streakLen}W Streak` : streakType === "defeat" ? `${streakLen}L Streak` : "Neutral";

    const steps = [];
    if (streakType === "defeat" && streakLen >= 3) {
      steps.push(`Loss streak detected (${streakLen} defeats in a row). Take a 15-minute reset or swap modes to stop tanking your 25-game win rate.`);
    }
    if (modeArr.length) {
      const modeSummary = modeArr.slice(0, 4).map((m) => `${BV.formatMode(m.mode)}: ${m.w}W-${m.l}L (${m.wr}%)`).join(" • ");
      steps.push(`Mode breakdown (last ${matches.length} games): ${modeSummary}.`);
    }
    if (worstMode && worstMode.wr < 50) {
      steps.push(`Cut losses in ${BV.formatMode(worstMode.mode)} (${worstMode.wr}% WR) — avoid queuing it with randoms or check the AI Tier List for stronger picks on that map.`);
    }
    if (bestBrawler && worstBrawler && bestBrawler.name !== worstBrawler.name) {
      steps.push(`Recent hot hand: ${bestBrawler.name} (${bestBrawler.w}W-${bestBrawler.l}L, ${bestBrawler.wr}%) vs cold pick: ${worstBrawler.name} (${worstBrawler.w}W-${worstBrawler.l}L, ${worstBrawler.wr}%).`);
    }
    if ((bs.ranked_games || 0) === 0) {
      steps.push(`All ${matches.length} recent battles were Trophy/Event matches (0 Competitive Ranked games) — try Ranked with BrawlVault Drafting when pushing competitive.`);
    } else if (bs.ranked_win_rate != null) {
      steps.push(`Competitive Ranked form: ${bs.ranked_win_rate}% WR across ${bs.ranked_games} Ranked games — use BrawlVault Drafting for map counters & synergies.`);
    }

    const wrTarget = bs.win_rate == null ? "65%+" : bs.win_rate < 55 ? "60%+" : bs.win_rate < 65 ? "68%+" : "75%+";
    const wrTitle =
      bs.win_rate != null
        ? `Push Recent Win Rate: ${bs.win_rate}% → ${wrTarget}`
        : "Build a 65%+ Recent Win Rate";

    tips.push({
      impact: wrItem.gap,
      category: "RECENT WIN RATE & MODES",
      tag: streakType === "defeat" && streakLen >= 3 ? "FIX NOW" : (bs.win_rate != null && bs.win_rate >= 65 ? "FINE-TUNE" : "HIGH IMPACT"),
      title: wrTitle,
      summary: `Currently ${wrItem.score}/${wrItem.max} pts (${bs.wins || 0}W–${bs.losses || 0}L, W/L ${bs.wl_ratio ?? "N/A"} — maxes at 75% WR).`,
      metrics: [
        { label: "Recent WR", value: bs.win_rate != null ? `${bs.win_rate}%` : "N/A" },
        { label: "Record", value: `${bs.wins || 0}W-${bs.losses || 0}L` },
        { label: "Current Form", value: streakLabel },
        { label: "Best Mode", value: bestMode ? `${BV.formatMode(bestMode.mode)} (${bestMode.wr}%)` : "--" },
        { label: "Score Room", value: `+${wrItem.gap.toFixed(2)} pts` },
      ],
      steps,
      ctaHref: "/drafting/",
      ctaLabel: "Open Ranked AI Drafting →",
    });
  }

  // 4. Carry Factor & 1,000+ Mastery
  const carryItem = getBreakdownItem(rating, "Carry");
  const near1k = brawlers
    .filter((b) => b.trophies >= 750 && b.trophies < 1000)
    .sort((a, b) => b.trophies - a.trophies);
  const under1k = brawlers
    .filter((b) => b.trophies < 1000)
    .sort((a, b) => b.trophies - a.trophies);
  if (carryItem.gap >= 0.1) {
    const steps = [];
    const maxed1kPool = p.max_tier_brawlers >= 20;

    if (maxed1kPool) {
      const leaders = brawlers.slice(0, 3).map((b) => `${b.name} (${b.trophies.toLocaleString()} 🏆)`).join(" • ");
      steps.push(`Your 1,000+ trophy pool is already maxed (${p.max_tier_brawlers} brawlers at 1k+, led by ${leaders}).`);
      steps.push(`The remaining +${carryItem.gap.toFixed(2)} pts in this category come purely from Star Player rate (currently ${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"} across recent team games — 35%+ maxes the score).`);
      steps.push(`To raise Star Player %, play high-impact carry mids/snipers, keep deaths low, and lead objective damage (Heist Safe / Hot Zone % / Gem Carrier control).`);
    } else {
      if (near1k.length) {
        const list = near1k.slice(0, 4).map((b) => `${b.name} (${b.trophies} 🏆 — ${1000 - b.trophies} away)`).join(" • ");
        steps.push(`Closest to 1,000 🏆 (Max Tier): ${list}.`);
      } else if (p.max_tier_brawlers > 0 && under1k.length) {
        const nextUp = under1k.slice(0, 3).map((b) => `${b.name} (${b.trophies} 🏆, Lv ${b.power})`).join(" • ");
        steps.push(`You already have ${p.max_tier_brawlers} brawlers at 1,000+ 🏆. Highest candidates under 1k to push next: ${nextUp}.`);
      } else if (under1k.length) {
        const topB = under1k.slice(0, 3).map((b) => `${b.name} (${b.trophies} 🏆, Lv ${b.power})`).join(" • ");
        steps.push(`No brawlers at 750+ 🏆 yet. Focus on pushing your top mains (${topB}) on their best maps from the Tier List.`);
      }

      if (bs.star_player_rate != null) {
        steps.push(
          bs.star_player_rate < 20
            ? `Star Player rate is ${bs.star_player_rate}% (${bs.star_players || 0} Star Players). Focus on surviving your lane, holding objective pressure, and punishing over-extensions instead of trading 1-for-1.`
            : `Strong ${bs.star_player_rate}% Star Player rate (${bs.star_players || 0} awards) — push toward 35% while expanding your 1k+ trophy pool to 20 brawlers.`
        );
      }
      steps.push(`Reaching 20 brawlers at 1,000+ 🏆 (${Math.max(0, 20 - p.max_tier_brawlers)} more) and 35% Star Player rate maxes this entire 1.50-pt category.`);
    }

    const carryTitle = maxed1kPool
      ? `Raise Star Player Impact (${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"} → 35%+)`
      : `Expand 1,000+ Trophy Pool (${p.max_tier_brawlers} → ${Math.min(20, Math.max(p.max_tier_brawlers + 3, 20))})`;

    tips.push({
      impact: carryItem.gap,
      category: "CARRY & 1K+ MASTERY",
      tag: maxed1kPool ? "STAR PLAYER FOCUS" : near1k.length ? "ALMOST THERE" : "SKILL GROWTH",
      title: carryTitle,
      summary: `Currently ${carryItem.score}/${carryItem.max} pts (${p.max_tier_brawlers} at 1k+, ${bs.star_player_rate != null ? `${bs.star_player_rate}% Star Player` : "no recent team games"}).`,
      metrics: [
        { label: "1k+ Brawlers", value: `${p.max_tier_brawlers}${maxed1kPool ? " (MAX)" : " / 20"}` },
        { label: "750–999 Pool", value: `${near1k.length}` },
        { label: "Star Player %", value: bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A" },
        { label: "Score Room", value: `+${carryItem.gap.toFixed(2)} pts` },
      ],
      steps,
      ctaHref: "/tierlist/",
      ctaLabel: "Find S-Tier Carry Mains →",
    });
  }

  // 5. 3v3 Experience & Mode Balance
  const expItem = getBreakdownItem(rating, "3v3 Experience");
  const sdTotal = (p.solo_victories || 0) + (p.duo_victories || 0);
  const totalWinsAll = Math.max(1, (p.victories_3v3 || 0) + sdTotal);
  const share3v3 = Math.round(((p.victories_3v3 || 0) / totalWinsAll) * 100);
  if (expItem.gap >= 0.15) {
    const next3v3 = p.victories_3v3 < 3000 ? 3000 : p.victories_3v3 < 7500 ? 7500 : p.victories_3v3 < 12000 ? 12000 : 20000;
    const remain = Math.max(0, next3v3 - p.victories_3v3);
    const steps = [];
    if (share3v3 < 65) {
      steps.push(`Only ${share3v3}% of your total wins are 3v3 (${p.victories_3v3.toLocaleString()} 3v3 vs ${sdTotal.toLocaleString()} Solo/Duo). Shift daily quests & pushes into 3v3 — BrawlVault weights 3v3 heavily for competitive rating.`);
    } else {
      steps.push(`Strong ${share3v3}% 3v3 focus! You need +${remain.toLocaleString()} more 3v3 wins to reach ${next3v3.toLocaleString()} (maxes out at 20,000 3v3 wins).`);
    }
    if (!p.club) {
      steps.push(`You're currently clanless — joining an active 25–30 member clan gives Mega Pig Coins/PP and steady 3v3 teammates.`);
    } else {
      steps.push(`Team up with your clan (${p.club.name}) for Brawl Ball / Heist / Knockout sessions to stack fast 3v3 victories.`);
    }

    tips.push({
      impact: expItem.gap,
      category: "3V3 EXPERIENCE",
      tag: "LONG-TERM",
      title: `Grow 3v3 Victories (${p.victories_3v3.toLocaleString()} → ${next3v3.toLocaleString()})`,
      summary: `Currently ${expItem.score}/${expItem.max} pts (${share3v3}% 3v3 share across ${totalWinsAll.toLocaleString()} total wins).`,
      metrics: [
        { label: "3v3 Wins", value: p.victories_3v3.toLocaleString() },
        { label: "Solo + Duo", value: sdTotal.toLocaleString() },
        { label: "3v3 Share", value: `${share3v3}%` },
        { label: "Score Room", value: `+${expItem.gap.toFixed(2)} pts` },
      ],
      steps,
    });
  }

  if (!tips.length) {
    tips.push({
      impact: 0.5,
      category: "MASTERS MAINTENANCE",
      tag: "ELITE ACCOUNT",
      title: "Top-Tier Account — Maintain Your Meta Edge",
      summary: `Your ${rating.score.toFixed(1)}/10 rating is near the ceiling across every category.`,
      metrics: [
        { label: "Rating", value: `${rating.score.toFixed(1)} / 10` },
        { label: "Level 11s", value: `${p.power11_count}` },
        { label: "1k+ Brawlers", value: `${p.max_tier_brawlers}` },
      ],
      steps: [
        `Max newly buffed & released S-tier brawlers every season via the Upgrade Guide & AI Tier List.`,
        `Keep recent win rate above 60% and Star Player rate above 25% in Legendary/Masters Ranked.`,
      ],
    });
  }

  tips.sort((a, b) => b.impact - a.impact);
  return tips;
}

function generateClubCoaching(c) {
  const tips = [];
  const rating = c.rating || { score: 5.0, breakdown: [] };
  const members = c.members || [];
  const count = c.member_count || members.length;

  const t60k = members.filter((m) => m.trophies >= 60000).length;
  const t40k = members.filter((m) => m.trophies >= 40000 && m.trophies < 60000).length;
  const t20k = members.filter((m) => m.trophies >= 20000 && m.trophies < 40000).length;
  const tUnder20k = members.filter((m) => m.trophies < 20000).length;

  // 1. Roster Fill (/30)
  const fillItem = getBreakdownItem(rating, "Roster Fill");
  const openSlots = Math.max(0, 30 - count);
  if (openSlots > 0) {
    const recReq = Math.max(5000, Math.round((c.avg_trophies * 0.7) / 1000) * 1000);
    const projTrophyGain = openSlots * c.avg_trophies;
    const steps = [
      `Recruit ${openSlots} more active member${openSlots === 1 ? "" : "s"} to hit 30/30 — filling them at your current average adds ~+${projTrophyGain.toLocaleString()} 🏆 total clan trophies and +${fillItem.gap.toFixed(2)} rating pts.`,
      c.type === "closed"
        ? `Your clan is set to CLOSED — switch to "Invite Only" or "Open" with Required Trophies at ${recReq.toLocaleString()} 🏆 so players can apply.`
        : `Keep Required Trophies near ${recReq.toLocaleString()} 🏆 (~70% of your ${c.avg_trophies.toLocaleString()} average) to attract active applicants.`,
      `30 full active members unlock up to 450 Mega Pig tickets per event (currently max ${count * 15} tickets).`,
    ];

    tips.push({
      impact: fillItem.gap + 0.4,
      category: "ROSTER FILL (/30)",
      tag: openSlots >= 5 ? "HIGH IMPACT" : "QUICK WIN",
      title: `Fill ${openSlots} Open Clan Slot${openSlots === 1 ? "" : "s"} (${count}/30 → 30/30)`,
      summary: `Currently ${fillItem.score}/${fillItem.max} pts — missing ${openSlots} slots hurts both rating and Mega Pig.`,
      metrics: [
        { label: "Members", value: `${count} / 30` },
        { label: "Open Slots", value: `${openSlots}` },
        { label: "Proj. Trophies", value: `+${projTrophyGain.toLocaleString()}` },
        { label: "Score Room", value: `+${fillItem.gap.toFixed(2)} pts` },
      ],
      steps,
    });
  }

  // 2. Average Trophies & Bottom-End Drag Simulation
  const avgItem = getBreakdownItem(rating, "Average Trophies");
  if (avgItem.gap >= 0.15 && members.length >= 5) {
    const top5 = members.slice(0, 5);
    const bottom5 = members.slice(-5);
    const top5Avg = Math.round(top5.reduce((s, m) => s + m.trophies, 0) / top5.length);
    const bot5Avg = Math.round(bottom5.reduce((s, m) => s + m.trophies, 0) / bottom5.length);
    const spread = top5Avg - bot5Avg;
    const suggestedMin = Math.max(10000, Math.round((c.avg_trophies * 0.8) / 1000) * 1000);

    // Simulate replacing bottom 3 with suggestedMin players
    const bot3 = members.slice(-3);
    const bot3Sum = bot3.reduce((s, m) => s + m.trophies, 0);
    const simNewAvg = Math.round((c.trophies - bot3Sum + 3 * suggestedMin) / Math.max(count, 1));
    const simGain = Math.max(0, simNewAvg - c.avg_trophies);
    const lowestNames = bot3.reverse().map((m) => `${m.name} (${m.trophies.toLocaleString()} 🏆)`).join(" • ");

    const steps = [
      `Trophy distribution: ${t60k} at 60k+ • ${t40k} at 40k–60k • ${t20k} at 20k–40k • ${tUnder20k} under 20k.`,
    ];
    if (spread >= 15000) {
      steps.push(`Bottom 3 slots right now: ${lowestNames}. If any are inactive, replacing them with ${suggestedMin.toLocaleString()}+ 🏆 recruits jumps clan average from ${c.avg_trophies.toLocaleString()} → ${simNewAvg.toLocaleString()} 🏆 (+${simGain.toLocaleString()} 🏆).`);
    } else {
      steps.push(`Very tight, balanced roster (${spread.toLocaleString()} 🏆 spread). Run a +500 🏆/week clan push goal so everyone rises together.`);
    }
    if (c.required_trophies < suggestedMin * 0.65) {
      steps.push(`Raise Required Trophies from ${c.required_trophies.toLocaleString()} → ${suggestedMin.toLocaleString()} 🏆 so every new member lifts your average.`);
    }

    tips.push({
      impact: avgItem.gap,
      category: "AVERAGE TROPHIES",
      tag: avgItem.gap >= 1.2 ? "HIGH IMPACT" : "CORE GROWTH",
      title: `Raise Clan Average (${c.avg_trophies.toLocaleString()} → ${Math.min(65000, Math.round((c.avg_trophies + 8000) / 1000) * 1000).toLocaleString()} 🏆)`,
      summary: `Worth 5.0 / 10 of your Clan Rating — currently ${avgItem.score}/${avgItem.max} pts.`,
      metrics: [
        { label: "Clan Avg", value: `${c.avg_trophies.toLocaleString()}` },
        { label: "Top 5 Avg", value: `${top5Avg.toLocaleString()}` },
        { label: "Bottom 5 Avg", value: `${bot5Avg.toLocaleString()}` },
        { label: "Spread", value: `${spread.toLocaleString()} 🏆` },
        { label: "Score Room", value: `+${avgItem.gap.toFixed(2)} pts` },
      ],
      steps,
    });
  }

  // 3. Top 5 Aces
  const topItem = getBreakdownItem(rating, "Top 5 Aces");
  if (topItem.gap >= 0.15 && members.length > 0) {
    const top5 = members.slice(0, 5);
    const top5Avg = Math.round(top5.reduce((s, m) => s + m.trophies, 0) / top5.length);
    const gapTo75k = Math.max(0, 75000 - top5Avg);
    const aceList = top5.map((m) => `${m.name} (${m.trophies.toLocaleString()})`).join(" • ");

    tips.push({
      impact: topItem.gap,
      category: "TOP 5 ACES",
      tag: "RECRUITMENT",
      title: `Boost Top 5 Average (${top5Avg.toLocaleString()} → 75,000 🏆)`,
      summary: `Currently ${topItem.score}/${topItem.max} pts — ${gapTo75k.toLocaleString()} 🏆 average gap to max score.`,
      metrics: [
        { label: "Top 5 Avg", value: `${top5Avg.toLocaleString()}` },
        { label: "Target", value: "75,000 🏆" },
        { label: "Gap / Ace", value: `+${gapTo75k.toLocaleString()}` },
        { label: "Score Room", value: `+${topItem.gap.toFixed(2)} pts` },
      ],
      steps: [
        `Current Top 5: ${aceList}.`,
        `Recruit 2–3 competitive Masters/high-trophy players (65k–80k+ 🏆) as team captains — strong top players pull higher-tier applicants automatically.`,
        `Coordinate Ranked & 1,000-trophy brawler pushes among your top 5 each season.`,
      ],
    });
  }

  // 4. Leadership & Clan Health
  const pres = members.filter((m) => m.role === "president").length;
  const vps = members.filter((m) => m.role === "vicePresident").length;
  const seniors = members.filter((m) => m.role === "senior").length;
  const regulars = members.filter((m) => m.role === "member").length;
  const opsSteps = [];
  if (vps === 0) {
    opsSteps.push(`0 Vice Presidents assigned — promote 2–3 active high-trophy players to Vice President so invites, kicks, and Mega Pig checks run smoothly.`);
  } else if (vps > 7) {
    opsSteps.push(`${vps} Vice Presidents is too many — trim leadership to 2–4 trusted VPs to avoid accidental kicks, and move loyal regulars to Senior.`);
  } else {
    opsSteps.push(`Healthy leadership ratio (${vps} VP${vps === 1 ? "" : "s"}, ${seniors} Senior${seniors === 1 ? "" : "s"}) — assign clear weekly inactivity (7d) & Mega Pig audits.`);
  }
  if (!c.description || c.description.trim().length < 25) {
    opsSteps.push(`Add a clear clan description with Mega Pig ticket minimums, inactivity rules, and Ranked team expectations to filter in active players.`);
  }
  opsSteps.push(`Full Mega Pig completion every event feeds all ${count} members extra Coins & Power Points, accelerating clan-wide trophy growth.`);

  tips.push({
    impact: vps === 0 || vps > 7 ? 0.55 : 0.2,
    category: "CLAN OPERATIONS",
    tag: "MANAGEMENT",
    title: "Leadership Balance, Rules & Mega Pig Activity",
    summary: `Strong structure keeps top members loyal and prevents trophy bleed from inactive accounts.`,
    metrics: [
      { label: "President", value: `${pres}` },
      { label: "Vice Pres.", value: `${vps}` },
      { label: "Seniors", value: `${seniors}` },
      { label: "Members", value: `${regulars}` },
      { label: "Req. Trophies", value: `${c.required_trophies.toLocaleString()}` },
    ],
    steps: opsSteps,
  });

  tips.sort((a, b) => b.impact - a.impact);
  return tips;
}

function renderCoachingSection(title, subtitle, tips) {
  const cardsHtml = tips
    .map((t) => {
      const metricsHtml = (t.metrics || []).length
        ? `<div class="coach-metrics">${t.metrics
            .map((m) => `<div class="coach-metric"><span>${BV.esc(m.label)}</span><strong>${BV.esc(m.value)}</strong></div>`)
            .join("")}</div>`
        : "";
      return `
        <article class="coach-card">
          <div class="coach-head">
            <span class="coach-cat">${BV.esc(t.category)}</span>
            <span class="coach-tag">${BV.esc(t.tag)}</span>
          </div>
          <h4 class="coach-title">${BV.esc(t.title)}</h4>
          <p class="coach-summary">${BV.esc(t.summary)}</p>
          ${metricsHtml}
          <ul class="coach-steps">
            ${t.steps.map((s) => `<li>${BV.esc(s)}</li>`).join("")}
          </ul>
          ${t.ctaHref ? `<a href="${t.ctaHref}" class="coach-cta">${BV.esc(t.ctaLabel)}</a>` : ""}
        </article>
      `;
    })
    .join("");

  return `
    <section class="panel coaching-panel">
      <div class="coaching-header">
        <div>
          <h3 class="brawl-title coaching-heading">${BV.esc(title)}</h3>
          <p class="coaching-sub">${BV.esc(subtitle)}</p>
        </div>
        <span class="stat-chip chip-pick">ACTION PLAN</span>
      </div>
      <div class="coaching-grid">${cardsHtml}</div>
    </section>
  `;
}

function renderParticipantButton(pl) {
  const selfCls = pl.is_self ? "mp-self" : "";
  const powerTag = pl.power ? `<span class="mp-lv ${pl.power >= 11 ? "lv11" : ""}">LV ${pl.power}</span>` : "";
  const trophyTag = pl.trophies ? `<span class="mp-trophies">🏆 ${pl.trophies.toLocaleString()}</span>` : "";
  const spTag = pl.is_star_player ? `<span class="sp-badge">★ SP</span>` : "";
  return `
    <button type="button" class="match-player-btn ${selfCls}" data-player-tag="${BV.esc(pl.tag)}">
      ${pl.portrait ? `<img src="${pl.portrait}" alt="${BV.esc(pl.brawler)}" onerror="this.style.display='none'" />` : `<div class="match-img-empty">?</div>`}
      <div class="mp-info">
        <div class="mp-name-line">
          <strong>${BV.esc(pl.name)}</strong>
          ${spTag}
        </div>
        <div class="mp-sub-line">
          <span>${BV.esc(pl.brawler || "Brawler")}</span>
          ${powerTag}
          ${trophyTag}
        </div>
      </div>
      <span class="mp-arrow">→</span>
    </button>
  `;
}

function renderMatchDetails(m) {
  const teams = m.teams || [];
  const players = m.players || [];
  const durationLine =
    typeof m.duration === "number" && m.duration > 0
      ? `<div class="match-detail-meta">Duration: ${Math.floor(m.duration / 60)}m ${m.duration % 60}s • Tap any player to inspect their stats &amp; rating</div>`
      : `<div class="match-detail-meta">Tap any player to inspect their full profile &amp; rating</div>`;

  if (teams.length >= 2) {
    const teamCards = teams
      .map((team, idx) => {
        const label = teams.length === 2 ? (idx === 0 ? "TEAM 1 (PLAYER'S TEAM)" : "TEAM 2 (OPPONENTS)") : `TEAM ${idx + 1}`;
        const sideCls = teams.length === 2 ? (idx === 0 ? "md-blue" : "md-red") : "";
        return `
          <div class="match-team-col ${sideCls}">
            <div class="match-team-lbl">${label}</div>
            <div class="match-team-list">${team.map(renderParticipantButton).join("")}</div>
          </div>
        `;
      })
      .join("");
    return `${durationLine}<div class="match-teams-grid">${teamCards}</div>`;
  }

  if (players.length) {
    return `${durationLine}<div class="match-team-list">${players.map(renderParticipantButton).join("")}</div>`;
  }

  return `<div class="match-detail-meta">Detailed lobby roster is not available for this match.</div>`;
}

function renderPlayerSubTab() {
  const container = document.getElementById("player-sub-content");
  const p = LOOKUP_STATE.lastPlayer;
  if (!container || !p) return;

  if (LOOKUP_STATE.subTab === "matches") {
    const matches = p.battle_stats?.recent_matches || [];
    if (!matches.length) {
      container.innerHTML = `<div class="empty-card">No recent matches in battlelog.</div>`;
      return;
    }
    container.innerHTML = `<div class="match-list">${matches
      .map((m, idx) => {
        const resClass = m.result === "victory" ? "res-win" : m.result === "defeat" ? "res-loss" : "res-draw";
        const resLabel = m.result === "victory" ? "WIN" : m.result === "defeat" ? "LOSS" : "DRAW";
        const trophyChip =
          typeof m.trophy_change === "number"
            ? `<span class="match-trophy ${m.trophy_change >= 0 ? "pos" : "neg"}">${m.trophy_change >= 0 ? "+" : ""}${m.trophy_change} 🏆</span>`
            : "";
        return `
          <div class="match-card ${resClass}" data-match-idx="${idx}">
            <button type="button" class="match-row match-row-toggle" aria-expanded="false">
              ${m.portrait ? `<img src="${m.portrait}" alt="${BV.esc(m.brawler)}" onerror="this.style.display='none'" />` : `<div class="match-img-empty">?</div>`}
              <div class="match-info">
                <div class="match-title">
                  <strong>${BV.esc(m.brawler || "Brawler")}</strong>
                  <span class="match-mode-tag">${BV.esc(BV.formatMode(m.mode))}</span>
                  ${m.star_player ? '<span class="sp-badge">★ STAR PLAYER</span>' : ""}
                </div>
                <div class="match-map">${BV.esc(m.map)} • ${BV.esc(formatBattleType(m.type))}</div>
              </div>
              <div class="match-right">
                <span class="match-res-badge ${resClass}">${resLabel}</span>
                ${trophyChip}
                <span class="match-chevron">▾</span>
              </div>
            </button>
            <div class="match-details hidden">${renderMatchDetails(m)}</div>
          </div>
        `;
      })
      .join("")}</div>`;

    container.querySelectorAll(".match-row-toggle").forEach((toggleBtn) => {
      toggleBtn.addEventListener("click", () => {
        const card = toggleBtn.closest(".match-card");
        const details = card.querySelector(".match-details");
        const isOpen = !details.classList.contains("hidden");
        details.classList.toggle("hidden", isOpen);
        card.classList.toggle("open", !isOpen);
        toggleBtn.setAttribute("aria-expanded", String(!isOpen));
      });
    });

    container.querySelectorAll(".match-player-btn").forEach((playerBtn) => {
      playerBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const targetTag = playerBtn.dataset.playerTag;
        if (!targetTag) return;
        setLookupType("player");
        document.getElementById("lookup-tag-input").value = targetTag;
        runLookup("player", targetTag);
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    });
  } else {
    const brawlers = p.brawlers || [];
    container.innerHTML = `<div class="player-brawler-grid">${brawlers
      .map(
        (b) => `
          <div class="pb-card ${b.power >= 11 ? "tile-lv11" : ""}">
            <span class="pb-power ${b.power >= 11 ? "lv11" : ""}">LV ${b.power}</span>
            <img
              src="${BV.resolvePortraitUrl(b.portrait, b.id)}"
              alt="${BV.esc(b.name)}"
              loading="lazy"
              onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${b.id}.png'"
            />
            <div class="pb-name">${BV.esc(b.name)}</div>
            <div class="pb-trophies">🏆 ${b.trophies.toLocaleString()}</div>
          </div>
        `
      )
      .join("")}</div>`;
  }
}

function renderPlayerProfile(p) {
  LOOKUP_STATE.lastPlayer = p;
  LOOKUP_STATE.subTab = "matches";

  const rating = p.rating || { score: 5.0, grade: "PLAYER", breakdown: [] };
  const bs = p.battle_stats || {};
  const isSaved = BV.getSavedTag() === BV.normalizeTag(p.tag);

  const breakdownHtml = (rating.breakdown || [])
    .map((b) => {
      const pct = Math.min(100, Math.round((b.score / Math.max(b.max, 0.1)) * 100));
      return `
        <div class="rb-row">
          <div class="rb-head">
            <span>${BV.esc(b.label)}</span>
            <strong>${b.score} / ${b.max}</strong>
          </div>
          <div class="rb-track"><div class="rb-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join("");

  const clubHtml = p.club
    ? `<button type="button" id="jump-club-btn" class="club-link-pill">🛡 ${BV.esc(p.club.name)} (${BV.esc(p.club.tag)}) →</button>`
    : `<span class="muted-tag">No Club</span>`;

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <div class="profile-hero">
      <div class="profile-main">
        <div class="profile-top-row">
          <div>
            <h2 class="brawl-title profile-name">${BV.esc(p.name)}</h2>
            <div class="profile-tag-row">
              <span class="profile-tag">${BV.esc(p.tag)}</span>
              ${clubHtml}
            </div>
          </div>
          <div class="profile-actions">
            <button type="button" id="save-my-tag-btn" class="btn ${isSaved ? "btn-blue" : "btn-gold"} btn-sm">
              ${isSaved ? "✓ Saved as My ID" : "★ Set as My ID"}
            </button>
            <a href="/upgrade/" class="btn btn-ghost btn-sm">Upgrade Guide →</a>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-tile"><span>Trophies</span><strong class="gold-text">🏆 ${p.trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Highest Trophies</span><strong>${p.highest_trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>3v3 Victories</span><strong>${p.victories_3v3.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Recent Win Rate</span><strong class="green-text">${bs.win_rate != null ? `${bs.win_rate}%` : "N/A"}</strong></div>
          <div class="stat-tile"><span>W/L Ratio (Last ${bs.matches_analyzed || 0})</span><strong>${bs.wl_ratio != null ? `${bs.wl_ratio} (${bs.wins}W-${bs.losses}L)` : "N/A"}</strong></div>
          <div class="stat-tile"><span>Star Player Rate</span><strong class="gold-text">${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"}</strong></div>
          <div class="stat-tile"><span>Ranked Win Rate</span><strong>${bs.ranked_win_rate != null ? `${bs.ranked_win_rate}% (${bs.ranked_games}g)` : "No recent Ranked"}</strong></div>
          <div class="stat-tile"><span>Level 11 Brawlers</span><strong class="green-text">${p.power11_count} / ${p.brawlers_owned}</strong></div>
          <div class="stat-tile"><span>1,000+ Trophy Brawlers</span><strong>${p.max_tier_brawlers}</strong></div>
          <div class="stat-tile"><span>Avg Power Level</span><strong>${p.avg_power}</strong></div>
        </div>
      </div>

      <div class="rating-card ${scoreColorClass(rating.score)}">
        <div class="rating-label">BRAWLVAULT RATING</div>
        <div class="rating-score-big">
          <span class="brawl-title">${rating.score.toFixed(1)}</span>
          <small>/ 10</small>
        </div>
        <div class="rating-grade">${BV.esc(rating.grade)}</div>
        <div class="rating-breakdown">${breakdownHtml}</div>
      </div>
    </div>

    ${renderCoachingSection(
      "HOW TO RAISE YOUR SCORE",
      "Deep personalized steps calculated directly from your live account stats & rating gaps.",
      generatePlayerCoaching(p)
    )}

    <div class="sub-tabs-bar">
      <button type="button" class="sub-tab active" data-sub="matches">Recent Matches (${(bs.recent_matches || []).length})</button>
      <button type="button" class="sub-tab" data-sub="brawlers">All Brawlers (${p.brawlers_owned})</button>
    </div>
    <div id="player-sub-content"></div>
  `;

  document.getElementById("save-my-tag-btn").addEventListener("click", (e) => {
    BV.setSavedTag(p.tag);
    BV.setCachedProfile(p);
    e.currentTarget.textContent = "✓ Saved as My ID";
    e.currentTarget.className = "btn btn-blue btn-sm";
  });

  const clubBtn = document.getElementById("jump-club-btn");
  if (clubBtn && p.club) {
    clubBtn.addEventListener("click", () => {
      setLookupType("club");
      document.getElementById("lookup-tag-input").value = p.club.tag;
      runLookup("club", p.club.tag);
    });
  }

  document.querySelectorAll(".sub-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      LOOKUP_STATE.subTab = btn.dataset.sub;
      document.querySelectorAll(".sub-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderPlayerSubTab();
    });
  });

  renderPlayerSubTab();
}

function renderClubProfile(c) {
  const rating = c.rating || { score: 5.0, grade: "CLUB", breakdown: [] };
  const breakdownHtml = (rating.breakdown || [])
    .map((b) => {
      const pct = Math.min(100, Math.round((b.score / Math.max(b.max, 0.1)) * 100));
      return `
        <div class="rb-row">
          <div class="rb-head">
            <span>${BV.esc(b.label)}</span>
            <strong>${b.score} / ${b.max}</strong>
          </div>
          <div class="rb-track"><div class="rb-fill" style="width:${pct}%"></div></div>
        </div>
      `;
    })
    .join("");

  const membersHtml = (c.members || [])
    .map(
      (m, idx) => `
        <button type="button" class="club-member-row" data-tag="${BV.esc(m.tag)}">
          <span class="member-rank">#${idx + 1}</span>
          <div class="member-info">
            <strong>${BV.esc(m.name)}</strong>
            <span class="member-meta">${BV.esc(m.tag)} • ${BV.esc(m.role)}</span>
          </div>
          <span class="member-trophies">🏆 ${m.trophies.toLocaleString()}</span>
        </button>
      `
    )
    .join("");

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <div class="profile-hero">
      <div class="profile-main">
        <div class="profile-top-row">
          <div>
            <h2 class="brawl-title profile-name">🛡 ${BV.esc(c.name)}</h2>
            <div class="profile-tag-row">
              <span class="profile-tag">${BV.esc(c.tag)}</span>
              <span class="stat-chip">${BV.esc(c.type.toUpperCase())}</span>
            </div>
          </div>
        </div>
        ${c.description ? `<p class="club-desc">${BV.esc(c.description)}</p>` : ""}
        <div class="stats-grid">
          <div class="stat-tile"><span>Total Trophies</span><strong class="gold-text">🏆 ${c.trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Avg Member Trophies</span><strong>${c.avg_trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Members</span><strong class="green-text">${c.member_count} / 30</strong></div>
          <div class="stat-tile"><span>Required Trophies</span><strong>${c.required_trophies.toLocaleString()}</strong></div>
        </div>
      </div>

      <div class="rating-card ${scoreColorClass(rating.score)}">
        <div class="rating-label">CLAN RATING</div>
        <div class="rating-score-big">
          <span class="brawl-title">${rating.score.toFixed(1)}</span>
          <small>/ 10</small>
        </div>
        <div class="rating-grade">${BV.esc(rating.grade)}</div>
        <div class="rating-breakdown">${breakdownHtml}</div>
      </div>
    </div>

    ${renderCoachingSection(
      "HOW TO RAISE YOUR CLAN SCORE",
      "Deep recruiting, trophy spread, and leadership breakdown calculated from your live clan roster.",
      generateClubCoaching(c)
    )}

    <div class="panel">
      <div class="section-bar-title">CLAN MEMBERS (TAP ANY MEMBER TO INSPECT &amp; RATE)</div>
      <div class="club-member-list">${membersHtml}</div>
    </div>
  `;

  document.querySelectorAll(".club-member-row").forEach((row) => {
    row.addEventListener("click", () => {
      const mTag = row.dataset.tag;
      setLookupType("player");
      document.getElementById("lookup-tag-input").value = mTag;
      runLookup("player", mTag);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

async function runLookup(type, rawTag) {
  const norm = BV.normalizeTag(rawTag);
  const input = document.getElementById("lookup-tag-input");
  const btn = document.getElementById("lookup-btn");
  const resultEl = document.getElementById("lookup-result");

  if (!norm || norm.length < 4) {
    resultEl.innerHTML = `<div class="empty-card error-card">Please enter a valid Brawl Stars tag (e.g. #2PP).</div>`;
    return;
  }

  input.value = norm;
  btn.disabled = true;
  btn.textContent = "Searching...";
  resultEl.innerHTML = `<div class="empty-card">Fetching live ${type} data for ${BV.esc(norm)}...</div>`;

  try {
    if (type === "club") {
      const data = await BV.apiFetch(`/api/v1/club/${encodeURIComponent(BV.tagForUrl(norm))}`);
      renderClubProfile(data);
    } else {
      const data = await BV.fetchPlayer(norm, true);
      renderPlayerProfile(data);
    }
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-card error-card">${BV.esc(err.message || "Lookup failed.")}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Search";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLookupType(btn.dataset.type));
  });

  document.getElementById("lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    runLookup(LOOKUP_STATE.type, document.getElementById("lookup-tag-input").value);
  });

  const params = new URLSearchParams(window.location.search);
  const qClub = params.get("club");
  const qPlayer = params.get("player");

  if (qClub) {
    setLookupType("club");
    runLookup("club", qClub);
  } else if (qPlayer) {
    setLookupType("player");
    runLookup("player", qPlayer);
  } else {
    const saved = BV.getSavedTag();
    if (saved) {
      document.getElementById("lookup-tag-input").value = saved;
      runLookup("player", saved);
    }
  }
});
