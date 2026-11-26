// ============================================================================
// BrawlVault Player & Club Lookup (Strict 50k-Avg Judging + Deep Match Info)
// ============================================================================

const GAME_AVG_TROPHIES = 50000;

const LOOKUP_STATE = {
  type: "player",
  subTab: "overview",
  matchFilter: "all",
  matchMode: "",
  historyMetric: "trophies",
  brawlerSearch: "",
  brawlerFilter: "all",
  brawlerSort: "trophies",
  selectedBrawler: null,
  clubTab: "overview",
  clubSearch: "",
  clubFilter: "all",
  clubSort: "trophies_desc",
  lastPlayer: null,
  lastClub: null,
  lastRating: null,
  lastVerdict: null,
  lastEnrichedMatches: [],
  lastHistory: [],
};

const RECENT_KEY = "bv_recent_lookups";

function getRecentLookups() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") || [];
  } catch {
    return [];
  }
}

function saveRecentLookup(type, tag, name) {
  const norm = BV.normalizeTag(tag);
  if (!norm) return;
  const list = getRecentLookups().filter((x) => !(x.type === type && x.tag === norm));
  list.unshift({ type, tag: norm, name: name || norm });
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    // ignore
  }
  renderRecentSearches();
}

function renderRecentSearches() {
  const bar = document.getElementById("recent-searches-bar");
  if (!bar) return;
  const list = getRecentLookups();
  if (!list.length) {
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = `
    <span class="recent-lbl">Recent:</span>
    ${list
      .map(
        (x) => `
          <button type="button" class="recent-chip" data-rtype="${BV.esc(x.type)}" data-rtag="${BV.esc(x.tag)}">
            <span>${x.type === "club" ? "🛡" : "👤"} ${BV.esc(x.name)}</span>
            <small>${BV.esc(x.tag)}</small>
          </button>
        `
      )
      .join("")}
  `;
  bar.querySelectorAll(".recent-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.rtype;
      const tag = btn.dataset.rtag;
      setLookupType(t);
      document.getElementById("lookup-tag-input").value = tag;
      runLookup(t, tag);
    });
  });
}

function renderRatingRing(score, grade) {
  const r = 46;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0.05, Math.min(1, score / 10));
  const offset = circ * (1 - pct);
  return `
    <div class="rating-ring-wrap">
      <svg class="rating-ring-svg" viewBox="0 0 112 112" aria-hidden="true">
        <circle class="rating-ring-bg" cx="56" cy="56" r="${r}" />
        <circle class="rating-ring-fg" cx="56" cy="56" r="${r}" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}" />
      </svg>
      <div class="rating-ring-center">
        <strong>${score.toFixed(1)}</strong>
        <span>/ 10</span>
      </div>
    </div>
    <div class="rating-grade">${BV.esc(grade)}</div>
  `;
}

function setLookupType(type) {
  LOOKUP_STATE.type = type;
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  const input1 = document.getElementById("lookup-tag-input");
  const input2 = document.getElementById("lookup-tag-input-2");
  const btn = document.getElementById("lookup-btn");
  if (type === "compare") {
    input1.placeholder = "Player 1 Tag (#2PP)";
    input2.classList.remove("hidden");
    btn.textContent = "Battle";
  } else {
    input1.placeholder = type === "club" ? "Enter Clan Tag (e.g. #2PP)" : "Enter Player Tag (e.g. #2PP)";
    input2.classList.add("hidden");
    btn.textContent = "Search";
  }
}

function scoreColorClass(score) {
  if (score >= 7.8) return "score-elite";
  if (score >= 6.4) return "score-good";
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

function parseBattleTime(raw) {
  if (!raw) return null;
  // Supercell format: 20261122T183412.000Z
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/);
  if (!m) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatTimeAgo(raw) {
  const dt = parseBattleTime(raw);
  if (!dt) return "";
  const sec = Math.max(0, Math.floor((Date.now() - dt.getTime()) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function formatDuration(sec) {
  if (typeof sec !== "number" || sec <= 0) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, "0")}s` : `${s}s`;
}

function formatSignedTrophies(diff) {
  const abs = Math.abs(Math.round(diff)).toLocaleString();
  return diff >= 0 ? `+${abs} 🏆` : `-${abs} 🏆`;
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

// ============================================================================
// Strict 50k-Benchmark Rating Engine (Matches Pi Backend & Works Immediately)
// ============================================================================
function computeStrictPlayerRating(p) {
  const bs = p.battle_stats || {};
  const trophies = p.trophies || 0;
  const highest = p.highest_trophies || trophies;
  const v3 = p.victories_3v3 || 0;
  const soloV = p.solo_victories || 0;
  const duoV = p.duo_victories || 0;
  const p11 = p.power11_count || 0;
  const avgPower = p.avg_power || 1;
  const maxTier = p.max_tier_brawlers || 0;
  const sample = (bs.wins || 0) + (bs.losses || 0);
  const wr = bs.win_rate != null ? bs.win_rate / 100 : null;
  const spRate = bs.star_player_rate != null ? bs.star_player_rate / 100 : null;

  // 1. Trophies & Peak (0..2.5) — 50,000 = exact 1.25/2.5 (50% avg), 100,000+ = 2.5/2.5
  const effectiveTrophies = Math.max(trophies, Math.floor(highest * 0.94));
  const trophyScore = Math.min(2.5, (effectiveTrophies / 100000) * 2.5);

  // 2. 3v3 Experience (0..2.0) — ~7k avg, 18k+ max; penalized if Showdown-inflated (<55% 3v3)
  const rawExp = Math.min(2.0, Math.pow(v3 / 18000, 0.90) * 2.0);
  const totalAllWins = Math.max(1, v3 + soloV + duoV);
  const share3v3 = v3 / totalAllWins;
  const expScore = rawExp * (share3v3 < 0.55 ? 0.78 : 1.0);

  // 3. Lv 11 Roster Depth (0..2.0) — ~35-40 Lv11 avg, 65+ Lv11 max
  const p11Part = Math.min(1.5, (p11 / 65) * 1.5);
  const avgPPart = Math.min(0.5, Math.max(0, (avgPower - 7.0) / 4.0) * 0.5);
  const rosterScore = Math.min(2.0, p11Part + avgPPart);

  // 4. Recent Win Rate (0..2.0) — <=45% = 0, 55% = 0.67, 60% = 1.0, 75%+ = 2.0
  let wrScore = 0.85;
  if (wr != null && sample >= 3) {
    const conf = Math.min(1.0, sample / 15.0);
    const rawWr = Math.max(0, Math.min(2.0, ((wr - 0.45) / 0.30) * 2.0));
    wrScore = conf * rawWr + (1 - conf) * 0.85;
  }

  // 5. Carry & 1k+ Mastery (0..1.5) — 35% SP + 45 brawlers at 1k+ maxes category
  let spPart = 0.35;
  if (spRate != null && sample >= 3) {
    spPart = Math.min(0.75, (spRate / 0.35) * 0.75);
  }
  const tierPart = Math.min(0.75, (maxTier / 45) * 0.75);
  const carryScore = Math.min(1.5, spPart + tierPart);

  const total = Number(
    Math.min(10.0, Math.max(0.5, trophyScore + expScore + rosterScore + wrScore + carryScore)).toFixed(1)
  );

  let grade = "BEGINNER";
  if (total >= 9.0) grade = "ESPORTS / MASTERS";
  else if (total >= 7.8) grade = "LEGENDARY";
  else if (total >= 6.6) grade = "ABOVE AVERAGE";
  else if (total >= 5.2) grade = "AVERAGE (50K TIER)";
  else if (total >= 3.8) grade = "BELOW AVERAGE";
  else if (total >= 2.5) grade = "CASUAL / GRINDING";

  return {
    score: total,
    grade,
    benchmark_trophies: GAME_AVG_TROPHIES,
    share_3v3_pct: Math.round(share3v3 * 100),
    breakdown: [
      { label: "Trophies & Peak (50k Avg)", score: Number(trophyScore.toFixed(2)), max: 2.5 },
      { label: "3v3 Experience", score: Number(expScore.toFixed(2)), max: 2.0 },
      { label: "Lv 11 Roster Depth", score: Number(rosterScore.toFixed(2)), max: 2.0 },
      { label: "Recent Win Rate", score: Number(wrScore.toFixed(2)), max: 2.0 },
      { label: "Carry & 1k+ Mastery", score: Number(carryScore.toFixed(2)), max: 1.5 },
    ],
  };
}

function computeStrictClubRating(c) {
  const members = c.members || [];
  const count = c.member_count || members.length || 0;
  const avgTrophies = c.avg_trophies || 0;
  const top5 = members.slice(0, 5);
  const topAvg = top5.length ? top5.reduce((s, m) => s + m.trophies, 0) / top5.length : 0;

  const avgScore = Math.min(5.0, (avgTrophies / 100000) * 5.0);
  const fillScore = Math.min(2.5, Math.pow(count / 30, 1.4) * 2.5);
  const topScore = Math.min(2.5, (topAvg / 110000) * 2.5);
  const total = Number(Math.min(10.0, Math.max(0.5, avgScore + fillScore + topScore)).toFixed(1));

  let grade = "CASUAL / REBUILDING";
  if (total >= 8.8) grade = "ELITE / TOP LADDER";
  else if (total >= 7.4) grade = "COMPETITIVE";
  else if (total >= 6.0) grade = "ABOVE AVERAGE";
  else if (total >= 4.8) grade = "AVERAGE (50K TIER)";
  else if (total >= 3.5) grade = "BELOW AVERAGE";

  return {
    score: total,
    grade,
    benchmark_trophies: GAME_AVG_TROPHIES,
    breakdown: [
      { label: "Avg Trophies (50k Avg)", score: Number(avgScore.toFixed(2)), max: 5.0 },
      { label: "Roster Fill (/30)", score: Number(fillScore.toFixed(2)), max: 2.5 },
      { label: "Top 5 Aces", score: Number(topScore.toFixed(2)), max: 2.5 },
    ],
  };
}

// ============================================================================
// Deep Per-Match Enrichment & Judging
// ============================================================================
function enrichMatch(m) {
  const teams = m.teams || [];
  const players = m.players || [];
  const allP = teams.length ? teams.flat() : players;

  const selfP = allP.find((pl) => pl.is_self);
  const spP = allP.find((pl) => pl.is_star_player);

  const selfPower = m.brawler_power || selfP?.power || 0;
  const selfTrophies = m.brawler_trophies || selfP?.trophies || 0;
  const starPlayerName = m.star_player_name || spP?.name || "";
  const starPlayerBrawler = m.star_player_brawler || spP?.brawler || "";

  const validTr = allP.map((x) => x.trophies).filter((t) => t > 0);
  const lobbyAvgTrophies =
    m.lobby_avg_trophies ?? (validTr.length ? Math.round(validTr.reduce((a, b) => a + b, 0) / validTr.length) : null);

  let allyAvgTrophies = m.ally_avg_trophies ?? null;
  let enemyAvgTrophies = m.enemy_avg_trophies ?? null;
  let allyAvgPower = m.ally_avg_power ?? null;
  let enemyAvgPower = m.enemy_avg_power ?? null;
  let underleveledAllies = 0;
  let underleveledEnemies = 0;

  if (teams.length === 2) {
    const aTr = teams[0].map((x) => x.trophies).filter((t) => t > 0);
    const eTr = teams[1].map((x) => x.trophies).filter((t) => t > 0);
    const aPw = teams[0].map((x) => x.power).filter((pw) => pw > 0);
    const ePw = teams[1].map((x) => x.power).filter((pw) => pw > 0);
    if (allyAvgTrophies == null && aTr.length) allyAvgTrophies = Math.round(aTr.reduce((a, b) => a + b, 0) / aTr.length);
    if (enemyAvgTrophies == null && eTr.length) enemyAvgTrophies = Math.round(eTr.reduce((a, b) => a + b, 0) / eTr.length);
    if (allyAvgPower == null && aPw.length) allyAvgPower = Number((aPw.reduce((a, b) => a + b, 0) / aPw.length).toFixed(1));
    if (enemyAvgPower == null && ePw.length) enemyAvgPower = Number((ePw.reduce((a, b) => a + b, 0) / ePw.length).toFixed(1));
    underleveledAllies = teams[0].filter((x) => x.power > 0 && x.power < 11).length;
    underleveledEnemies = teams[1].filter((x) => x.power > 0 && x.power < 11).length;
  }

  const trophyDiff = allyAvgTrophies != null && enemyAvgTrophies != null ? enemyAvgTrophies - allyAvgTrophies : null;
  const powerDiff = allyAvgPower != null && enemyAvgPower != null ? Number((allyAvgPower - enemyAvgPower).toFixed(1)) : null;

  let lobbyTier = null;
  let lobbyTierCls = "lt-mid";
  if (lobbyAvgTrophies != null) {
    if (lobbyAvgTrophies >= 1000) {
      lobbyTier = "1K+ SWEAT LOBBY";
      lobbyTierCls = "lt-high";
    } else if (lobbyAvgTrophies >= 750) {
      lobbyTier = "HIGH LADDER";
      lobbyTierCls = "lt-good";
    } else if (lobbyAvgTrophies >= 450) {
      lobbyTier = "MID LADDER";
      lobbyTierCls = "lt-mid";
    } else {
      lobbyTier = "LOW / BOT LOBBY";
      lobbyTierCls = "lt-low";
    }
  }

  // Judge the individual match outcome
  let verdict = "";
  let verdictCls = "mv-neutral";
  let judgmentText = "";

  if (m.result === "victory") {
    if (lobbyAvgTrophies != null && lobbyAvgTrophies < 450) {
      verdict = "LOW LOBBY WIN";
      verdictCls = "mv-warn";
      judgmentText = `Easy win in a low ${lobbyAvgTrophies.toLocaleString()} 🏆 average lobby — doesn't prove much competitively.`;
    } else if (m.star_player && trophyDiff != null && trophyDiff >= 80) {
      verdict = "🔥 UPSET CARRY";
      verdictCls = "mv-elite";
      judgmentText = `You earned Star Player and beat enemies averaging +${trophyDiff} 🏆 more per brawler — huge carry.`;
    } else if (m.star_player) {
      verdict = "★ CARRY WIN";
      verdictCls = "mv-elite";
      judgmentText = `You carried the match as Star Player${lobbyAvgTrophies ? ` in a ${lobbyAvgTrophies.toLocaleString()} 🏆 lobby` : ""}.`;
    } else if ((trophyDiff != null && trophyDiff >= 100) || (powerDiff != null && powerDiff <= -0.6)) {
      verdict = "🔥 UPSET WIN";
      verdictCls = "mv-good";
      judgmentText = `Underdog win — enemy team had higher average ${trophyDiff != null && trophyDiff >= 100 ? `brawler trophies (+${trophyDiff} 🏆)` : `Power Level (${enemyAvgPower} vs ${allyAvgPower})`}.`;
    } else if (powerDiff != null && powerDiff >= 0.8) {
      verdict = "POWER ADV. WIN";
      verdictCls = "mv-neutral";
      judgmentText = `Expected win — your team out-leveled opponents (Avg Lv ${allyAvgPower} vs Lv ${enemyAvgPower}).`;
    } else {
      verdict = "SOLID WIN";
      verdictCls = "mv-good";
      judgmentText = `Clean victory${lobbyAvgTrophies ? ` in an even ${lobbyAvgTrophies.toLocaleString()} 🏆 lobby` : ""}.`;
    }
  } else if (m.result === "defeat") {
    if (m.star_player) {
      verdict = "👑 TEAM SOLD";
      verdictCls = "mv-warn";
      judgmentText = `You still won Star Player despite losing — your teammates couldn't close it out.`;
    } else if (powerDiff != null && powerDiff <= -0.7) {
      verdict = "⚠️ OUT-LEVELED";
      verdictCls = "mv-warn";
      judgmentText = `Tough power gap: your team averaged Lv ${allyAvgPower} vs enemy Lv ${enemyAvgPower} (${underleveledAllies} under-Lv11 ally).`;
    } else if ((trophyDiff != null && trophyDiff <= -100) || (powerDiff != null && powerDiff >= 0.7)) {
      verdict = "💀 THROWN GAME";
      verdictCls = "mv-bad";
      judgmentText = `Bad loss — your team had the advantage (${powerDiff >= 0.7 ? `Lv ${allyAvgPower} vs Lv ${enemyAvgPower}` : `higher brawler trophies`}) and still dropped it.`;
    } else if (lobbyAvgTrophies != null && lobbyAvgTrophies < 450) {
      verdict = "💀 LOW LOBBY LOSS";
      verdictCls = "mv-bad";
      judgmentText = `Losing in a ${lobbyAvgTrophies.toLocaleString()} 🏆 average lobby is rough — tighten positioning and draft picks.`;
    } else {
      verdict = "TOUGH LOSS";
      verdictCls = "mv-bad";
      judgmentText = `Lost a ${lobbyAvgTrophies ? `${lobbyAvgTrophies.toLocaleString()} 🏆 ` : ""}match${starPlayerName ? ` — enemy/lobby MVP was ${starPlayerName} (${starPlayerBrawler || "SP"})` : ""}.`;
    }
  } else {
    verdict = "DRAW";
    verdictCls = "mv-neutral";
    judgmentText = "Dead-even match ending in a draw.";
  }

  return {
    ...m,
    selfPower,
    selfTrophies,
    starPlayerName,
    starPlayerBrawler,
    lobbyAvgTrophies,
    allyAvgTrophies,
    enemyAvgTrophies,
    allyAvgPower,
    enemyAvgPower,
    trophyDiff,
    powerDiff,
    underleveledAllies,
    underleveledEnemies,
    lobbyTier,
    lobbyTierCls,
    verdict,
    verdictCls,
    judgmentText,
    timeAgo: formatTimeAgo(m.battle_time),
    durationLabel: formatDuration(m.duration),
  };
}

// ============================================================================
// Blunt Judging Verdict Builders (50,000 Trophy Benchmark)
// ============================================================================
function buildPlayerVerdict(p, rating, enrichedMatches) {
  const trophies = p.trophies || 0;
  const highest = p.highest_trophies || trophies;
  const diff50k = trophies - GAME_AVG_TROPHIES;
  const bs = p.battle_stats || {};
  const v3 = p.victories_3v3 || 0;
  const sd = (p.solo_victories || 0) + (p.duo_victories || 0);
  const share3v3 = Math.round((v3 / Math.max(1, v3 + sd)) * 100);
  const peakDrop = Math.max(0, highest - trophies);

  const validLobbies = enrichedMatches.map((m) => m.lobbyAvgTrophies).filter((x) => x != null);
  const avgLobby = validLobbies.length
    ? Math.round(validLobbies.reduce((a, b) => a + b, 0) / validLobbies.length)
    : null;

  let toneCls = "verdict-mid";
  let badge = "50K AVERAGE TIER";
  let headline = "";

  if (rating.score >= 8.5) {
    toneCls = "verdict-elite";
    badge = "CERTIFIED ELITE";
    headline = `Legit top-tier account (${trophies.toLocaleString()} 🏆) — comfortably clearing the 50k average across trophies, roster depth, and 3v3 mastery.`;
  } else if (rating.score >= 6.8) {
    toneCls = "verdict-good";
    badge = "ABOVE 50K AVG";
    headline = `Solid competitive account, clearly above the 50k game average — a few weak spots still separate you from true Masters/Esports territory.`;
  } else if (rating.score >= 5.2) {
    toneCls = "verdict-mid";
    badge = "DEAD AVERAGE";
    headline = `Right around the 50k game average. Playable in mid-ladder, nothing scary yet — push 70k+ trophies and 45+ Lv 11s to actually stand out.`;
  } else if (rating.score >= 3.5) {
    toneCls = "verdict-warn";
    badge = "BELOW 50K AVG";
    headline = `Harsh truth: this account is noticeably below the 50,000 🏆 active-player average. You have major gaps in trophies, 3v3 wins, or Lv 11 depth.`;
  } else {
    toneCls = "verdict-harsh";
    badge = "ROOKIE / CASUAL";
    headline = `Way below the 50,000 🏆 benchmark (${formatSignedTrophies(diff50k)}). Still in beginner/casual territory — focus on maxing meta brawlers and 3v3 fundamentals.`;
  }

  const callouts = [];

  // 1. Trophies vs 50k Benchmark
  if (trophies < 25000) {
    callouts.push({
      tone: "bad",
      text: `Trophies (${trophies.toLocaleString()} 🏆): ${Math.abs(diff50k).toLocaleString()} below the 50k average — most active players are already well past this.`,
    });
  } else if (trophies < 48000) {
    callouts.push({
      tone: "warn",
      text: `Trophies (${trophies.toLocaleString()} 🏆): still ${Math.abs(diff50k).toLocaleString()} short of the 50,000 🏆 average line.`,
    });
  } else if (trophies < 65000) {
    callouts.push({
      tone: "mid",
      text: `Trophies (${trophies.toLocaleString()} 🏆): sitting right in the 50k average pack (${formatSignedTrophies(diff50k)} vs 50k). Push 70k+ to separate yourself.`,
    });
  } else if (trophies < 90000) {
    callouts.push({
      tone: "good",
      text: `Trophies (${trophies.toLocaleString()} 🏆): ${formatSignedTrophies(diff50k)} above the 50k benchmark — strong ladder grind.`,
    });
  } else {
    callouts.push({
      tone: "good",
      text: `Trophies (${trophies.toLocaleString()} 🏆): massive ${formatSignedTrophies(diff50k)} above the 50k average — top-end trophy pusher.`,
    });
  }

  // 2. Showdown Inflation vs Real 3v3
  if (share3v3 < 50) {
    callouts.push({
      tone: "bad",
      text: `Showdown-inflated record: only ${share3v3}% of your wins are 3v3 (${v3.toLocaleString()} 3v3 vs ${sd.toLocaleString()} Solo/Duo). Bush-camping Solo/Duo doesn't translate to Ranked 3v3 skill.`,
    });
  } else if (v3 < 5000) {
    callouts.push({
      tone: "warn",
      text: `Light 3v3 experience: only ${v3.toLocaleString()} 3v3 wins (competitive 50k baseline is ~5,000+, elite is 15,000+).`,
    });
  } else if (v3 >= 12000) {
    callouts.push({
      tone: "good",
      text: `Battle-tested in 3v3: ${v3.toLocaleString()} 3v3 wins (${share3v3}% of all wins) — real team-mode experience.`,
    });
  }

  // 3. Lv 11 Roster check
  if (p.power11_count < 15) {
    callouts.push({
      tone: "bad",
      text: `Tiny Lv 11 pool (${p.power11_count} / ${p.brawlers_owned}): way too shallow for Mythic/Legendary drafts where 35–40+ maxed brawlers is the norm.`,
    });
  } else if (p.power11_count < 35) {
    callouts.push({
      tone: "warn",
      text: `Below-average Lv 11 depth (${p.power11_count} maxed, avg power ${p.avg_power}): you'll still get out-drafted on narrow map pools.`,
    });
  } else if (p.power11_count >= 55) {
    callouts.push({
      tone: "good",
      text: `Deep Ranked arsenal: ${p.power11_count} Level 11 brawlers (avg Lv ${p.avg_power}) — ready for any ban phase.`,
    });
  }

  // 4. Recent Form + Lobby Difficulty
  if (bs.win_rate != null) {
    const lobbyNote =
      avgLobby != null
        ? avgLobby < 500
          ? ` (and that's in soft ${avgLobby.toLocaleString()} 🏆 average lobbies)`
          : avgLobby >= 950
            ? ` against sweaty ${avgLobby.toLocaleString()} 🏆 lobbies`
            : ` in ${avgLobby.toLocaleString()} 🏆 average lobbies`
        : "";
    if (bs.win_rate < 48) {
      callouts.push({
        tone: "bad",
        text: `Bleeding games: ${bs.win_rate}% recent win rate (${bs.wins}W–${bs.losses}L)${lobbyNote}. You're losing more than you win right now.`,
      });
    } else if (bs.win_rate >= 65 && (avgLobby == null || avgLobby >= 700)) {
      callouts.push({
        tone: "good",
        text: `Hot form: ${bs.win_rate}% win rate (${bs.wins}W–${bs.losses}L)${lobbyNote} with ${bs.star_player_rate ?? 0}% Star Player rate.`,
      });
    } else if (avgLobby != null && avgLobby < 500 && bs.win_rate >= 60) {
      callouts.push({
        tone: "warn",
        text: `Inflated recent WR (${bs.win_rate}%): average opponent/lobby brawler is only ${avgLobby.toLocaleString()} 🏆 — low-trophy farming, not high-ladder proof.`,
      });
    } else if (bs.star_player_rate != null && bs.star_player_rate < 12) {
      callouts.push({
        tone: "warn",
        text: `Low carry impact: only ${bs.star_player_rate}% Star Player rate (${bs.star_players} awards) — teammates are doing the heavy lifting.`,
      });
    }
  }

  if (peakDrop >= 2500) {
    callouts.push({
      tone: "warn",
      text: `Down ${peakDrop.toLocaleString()} 🏆 from peak (${highest.toLocaleString()} 🏆) — either seasonal reset decay or a rough tilt streak.`,
    });
  }

  return {
    toneCls,
    badge,
    headline,
    diff50k,
    avgLobby,
    callouts: callouts.slice(0, 5),
  };
}

function buildClubVerdict(c, rating) {
  const members = c.members || [];
  const count = c.member_count || members.length || 0;
  const avg = c.avg_trophies || 0;
  const diff50k = avg - GAME_AVG_TROPHIES;

  const sortedTr = members.map((m) => m.trophies).sort((a, b) => a - b);
  const median = sortedTr.length ? sortedTr[Math.floor(sortedTr.length / 2)] : 0;
  const under30k = members.filter((m) => m.trophies < 30000).length;
  const t30to50 = members.filter((m) => m.trophies >= 30000 && m.trophies < 50000).length;
  const t50to65 = members.filter((m) => m.trophies >= 50000 && m.trophies < 65000).length;
  const t65to80 = members.filter((m) => m.trophies >= 65000 && m.trophies < 80000).length;
  const over80k = members.filter((m) => m.trophies >= 80000).length;
  const top5Avg = members.length
    ? Math.round(members.slice(0, 5).reduce((s, m) => s + m.trophies, 0) / Math.min(5, members.length))
    : 0;
  const bot5Avg = members.length
    ? Math.round(members.slice(-5).reduce((s, m) => s + m.trophies, 0) / Math.min(5, members.length))
    : 0;

  let toneCls = "verdict-mid";
  let badge = "50K AVERAGE CLAN";
  let headline = "";

  if (rating.score >= 8.2) {
    toneCls = "verdict-elite";
    badge = "ELITE CLAN";
    headline = `Legitimate powerhouse clan averaging ${avg.toLocaleString()} 🏆 (${formatSignedTrophies(diff50k)} vs the 50k benchmark).`;
  } else if (rating.score >= 6.4) {
    toneCls = "verdict-good";
    badge = "ABOVE 50K AVG";
    headline = `Above-average clan (${avg.toLocaleString()} 🏆 avg) — competitive core, just needs tighter bottom-end recruiting to break into elite tier.`;
  } else if (rating.score >= 4.8) {
    toneCls = "verdict-mid";
    badge = "AVERAGE CLAN";
    headline = `Sitting right around the 50,000 🏆 average mark. Fine for Mega Pig, not intimidating on leaderboards yet.`;
  } else {
    toneCls = "verdict-harsh";
    badge = "BELOW 50K AVG";
    headline = `Harsh truth: ${avg.toLocaleString()} 🏆 average is ${Math.abs(diff50k).toLocaleString()} below the 50k game average. Too many low-trophy or missing slots.`;
  }

  const callouts = [];
  if (avg < 50000) {
    callouts.push({
      tone: "bad",
      text: `Clan average is ${avg.toLocaleString()} 🏆 (${formatSignedTrophies(diff50k)} vs 50k game average) with a median member at ${median.toLocaleString()} 🏆.`,
    });
  } else {
    callouts.push({
      tone: "good",
      text: `Clan average beats the 50k benchmark (${formatSignedTrophies(diff50k)}) with a median member at ${median.toLocaleString()} 🏆.`,
    });
  }

  if (avg - median >= 6000) {
    callouts.push({
      tone: "warn",
      text: `Whale-carried average: mean is ${avg.toLocaleString()} 🏆 but median is only ${median.toLocaleString()} 🏆 — a few top accounts are masking a weaker bottom half.`,
    });
  }

  if (under30k > 0) {
    callouts.push({
      tone: under30k >= 5 ? "bad" : "warn",
      text: `Dead-weight alert: ${under30k} member${under30k === 1 ? "" : "s"} under 30,000 🏆 (${Math.round((under30k / Math.max(1, count)) * 100)}% of roster) pulling your clan rating down.`,
    });
  }

  if (count < 28) {
    callouts.push({
      tone: "bad",
      text: `Underfilled roster (${count}/30): leaving ${30 - count} empty slots wastes ${(30 - count) * 15} Mega Pig tickets every event.`,
    });
  }

  if (top5Avg - bot5Avg >= 25000) {
    callouts.push({
      tone: "warn",
      text: `Massive skill gap: Top 5 average ${top5Avg.toLocaleString()} 🏆 while Bottom 5 average ${bot5Avg.toLocaleString()} 🏆 (${(top5Avg - bot5Avg).toLocaleString()} 🏆 spread).`,
    });
  }

  return {
    toneCls,
    badge,
    headline,
    diff50k,
    median,
    top5Avg,
    bot5Avg,
    buckets: [
      { label: "80k+", count: over80k, cls: "tb-elite" },
      { label: "65k–80k", count: t65to80, cls: "tb-good" },
      { label: "50k–65k", count: t50to65, cls: "tb-avg" },
      { label: "30k–50k", count: t30to50, cls: "tb-warn" },
      { label: "<30k", count: under30k, cls: "tb-low" },
    ],
    callouts: callouts.slice(0, 5),
  };
}

function renderVerdictCard(title, verdict, extraHtml = "") {
  const diffCls = verdict.diff50k >= 0 ? "vdiff-pos" : "vdiff-neg";
  return `
    <section class="panel verdict-panel ${verdict.toneCls}">
      <div class="verdict-top">
        <div>
          <div class="verdict-eyebrow">${BV.esc(title)}</div>
          <h3 class="verdict-headline">${BV.esc(verdict.headline)}</h3>
        </div>
        <div class="verdict-badges">
          <span class="verdict-badge">${BV.esc(verdict.badge)}</span>
          <span class="verdict-diff ${diffCls}">${formatSignedTrophies(verdict.diff50k)} vs 50k avg</span>
        </div>
      </div>
      ${extraHtml}
      <ul class="verdict-list">
        ${verdict.callouts
          .map(
            (c) =>
              `<li class="v-item v-${c.tone}"><span class="v-dot"></span><span>${BV.esc(c.text)}</span></li>`
          )
          .join("")}
      </ul>
    </section>
  `;
}

// ============================================================================
// Deep Deterministic Coaching (Aligned to Strict 50k+ Benchmarks)
// ============================================================================
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

function generatePlayerCoaching(p, rating) {
  const tips = [];
  const bs = p.battle_stats || {};
  const brawlers = p.brawlers || [];

  // 1. Level 11 Roster Depth + Incomplete Kits
  const rosterItem = getBreakdownItem(rating, "Lv 11");
  const lv10s = brawlers.filter((b) => b.power === 10).sort((a, b) => b.trophies - a.trophies);
  const lv9s = brawlers.filter((b) => b.power === 9).sort((a, b) => b.trophies - a.trophies);
  const lvLow = brawlers.filter((b) => b.power <= 8);
  const nearMax = [...lv10s, ...lv9s];
  const incompleteLv11 = brawlers.filter(
    (b) => b.power >= 11 && ((b.star_powers || []).length === 0 || (b.gadgets || []).length === 0 || (b.gears || []).length < 2)
  );

  if (rosterItem.gap >= 0.1 || p.power11_count < 65 || incompleteLv11.length > 0) {
    const targetP11 = p.power11_count < 12 ? 12 : p.power11_count < 25 ? 25 : p.power11_count < 40 ? 40 : 65;
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
      steps.push(`No Lv 9–10 brawlers ready yet (${lvLow.length} brawlers are Lv 1–8). Focus resources on 1 S-tier brawler at a time instead of spreading coins thin.`);
    }
    if (incompleteLv11.length) {
      const missingList = incompleteLv11.slice(0, 4).map((b) => {
        const miss = [];
        if (!(b.star_powers || []).length) miss.push("SP");
        if (!(b.gadgets || []).length) miss.push("Gadget");
        if ((b.gears || []).length < 2) miss.push(`${2 - (b.gears || []).length} Gear`);
        return `${b.name} (needs ${miss.join(" + ")})`;
      }).join(", ");
      steps.push(`Incomplete Lv 11 builds (${incompleteLv11.length} found): ${missingList} — playing half-built Lv 11s costs free wins.`);
    }
    if (p.power11_count < 40) {
      steps.push(`Competitive baseline is ~40 Level 11 brawlers (max score at 65+). Need +${needed} more for your ${targetP11} milestone.`);
    } else if (needed > 0) {
      steps.push(`Push from ${p.power11_count} → ${targetP11} Level 11s (+${needed} more) to max out the 2.0-pt roster category.`);
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

    tips.push({
      impact: rosterItem.gap,
      category: "LV 11 ROSTER DEPTH",
      tag: rosterItem.gap >= 0.7 ? "HIGH IMPACT" : "QUICK WIN",
      title:
        p.power11_count >= 65
          ? (incompleteLv11.length ? `Finish Missing Kits on ${incompleteLv11.length} Lv 11s` : `Maxed Roster Maintained (${p.power11_count} Lv 11s)`)
          : `Grow Maxed Roster: ${p.power11_count} → ${targetP11} Level 11s`,
      summary: `Currently ${rosterItem.score}/${rosterItem.max} pts (${p.power11_count} Lv11, ${lv10s.length} Lv10, ${lv9s.length} Lv9, ${lvLow.length} Lv1–8).`,
      metrics,
      steps,
      ctaHref: "/upgrade/",
      ctaLabel: "Open Full Upgrade Guide & Builds →",
    });
  }

  // 2. Trophies & 50k Benchmark
  const trophyItem = getBreakdownItem(rating, "Trophies");
  const under300 = brawlers.filter((b) => b.trophies < 300);
  const mid300to599 = brawlers.filter((b) => b.trophies >= 300 && b.trophies < 600);
  const mid600to999 = brawlers.filter((b) => b.trophies >= 600 && b.trophies < 1000);
  const over1k = brawlers.filter((b) => b.trophies >= 1000);
  const easyFarm = brawlers
    .filter((b) => b.trophies < 700)
    .sort((a, b) => (b.power >= 9 ? 1 : 0) - (a.power >= 9 ? 1 : 0) || a.trophies - b.trophies);

  if (trophyItem.gap >= 0.1) {
    const milestones = [25000, 35000, 50000, 65000, 80000, 100000];
    const nextMs = milestones.find((m) => m > p.trophies) || p.trophies + 10000;
    const diff = nextMs - p.trophies;
    const farmTop5 = easyFarm.slice(0, 5);
    const estFarmGain = farmTop5.reduce((sum, b) => sum + Math.max(0, 700 - b.trophies), 0);
    const belowPeak = Math.max(0, p.highest_trophies - p.trophies);

    const steps = [];
    if (p.trophies < GAME_AVG_TROPHIES) {
      steps.push(`You're ${(GAME_AVG_TROPHIES - p.trophies).toLocaleString()} 🏆 under the 50,000 🏆 average benchmark — reaching 50k is your first real baseline.`);
    }
    if (farmTop5.length) {
      const picks = farmTop5.map((b) => `${b.name} (${b.trophies} → 700 🏆, Lv ${b.power})`).join(" • ");
      steps.push(`Fastest +${estFarmGain.toLocaleString()} 🏆 farm on your account: ${picks}.`);
    }
    if (belowPeak >= 1000) {
      steps.push(`You're ${belowPeak.toLocaleString()} 🏆 under your peak (${p.highest_trophies.toLocaleString()} 🏆). Reclaim lost trophies on comfort Lv 11 brawlers first.`);
    }
    steps.push(`Distribution: ${under300.length} under 300 🏆 • ${mid300to599.length} at 300–599 • ${mid600to999.length} at 600–999 • ${over1k.length} at 1,000+.`);

    tips.push({
      impact: trophyItem.gap,
      category: "TROPHIES VS 50K AVG",
      tag: p.trophies < GAME_AVG_TROPHIES ? "BELOW 50K AVG" : trophyItem.gap >= 0.8 ? "HIGH IMPACT" : "STEADY GAIN",
      title: `Push +${diff.toLocaleString()} 🏆 to Hit ${nextMs.toLocaleString()} Trophies`,
      summary: `Currently ${trophyItem.score}/${trophyItem.max} pts — 50,000 🏆 is average (1.25/2.5), maxes at 100,000+ 🏆.`,
      metrics: [
        { label: "Current", value: `🏆 ${p.trophies.toLocaleString()}` },
        { label: "vs 50k Avg", value: formatSignedTrophies(p.trophies - GAME_AVG_TROPHIES) },
        { label: "< 600 Pool", value: `${under300.length + mid300to599.length} brawlers` },
        { label: "Top 5 Farm", value: `+${estFarmGain.toLocaleString()} 🏆` },
        { label: "Score Room", value: `+${trophyItem.gap.toFixed(2)} pts` },
      ],
      steps,
    });
  }

  // 3. Recent Win Rate, Per-Mode & Per-Brawler Breakdown
  const wrItem = getBreakdownItem(rating, "Recent Win");
  const matches = bs.recent_matches || [];
  if (wrItem.gap >= 0.15 || (bs.win_rate != null && bs.win_rate < 65)) {
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
      steps.push(`Tilt alert (${streakLen} straight losses). Stop solo-queuing the same mode before it wrecks your 25-game win rate.`);
    }
    if (modeArr.length) {
      const modeSummary = modeArr.slice(0, 4).map((m) => `${BV.formatMode(m.mode)}: ${m.w}W-${m.l}L (${m.wr}%)`).join(" • ");
      steps.push(`Mode breakdown (last ${matches.length} games): ${modeSummary}.`);
    }
    if (worstMode && worstMode.wr < 50) {
      steps.push(`Stop bleeding games in ${BV.formatMode(worstMode.mode)} (${worstMode.wr}% WR) — switch maps or check the AI Tier List for stronger counters.`);
    }
    if (bestBrawler && worstBrawler && bestBrawler.name !== worstBrawler.name) {
      steps.push(`Hot hand: ${bestBrawler.name} (${bestBrawler.w}W-${bestBrawler.l}L, ${bestBrawler.wr}%) vs cold pick: ${worstBrawler.name} (${worstBrawler.w}W-${worstBrawler.l}L, ${worstBrawler.wr}%).`);
    }
    if ((bs.ranked_games || 0) === 0) {
      steps.push(`All ${matches.length} recent battles were Trophy/Event matches (0 Competitive Ranked games) — queue Ranked with BrawlVault Drafting to test real competitive skill.`);
    } else if (bs.ranked_win_rate != null) {
      steps.push(`Competitive Ranked form: ${bs.ranked_win_rate}% WR across ${bs.ranked_games} Ranked games.`);
    }

    const wrTarget = bs.win_rate == null ? "65%+" : bs.win_rate < 55 ? "60%+" : bs.win_rate < 65 ? "68%+" : "75%+";
    tips.push({
      impact: wrItem.gap,
      category: "RECENT WIN RATE & MODES",
      tag: streakType === "defeat" && streakLen >= 3 ? "FIX NOW" : (bs.win_rate != null && bs.win_rate < 52 ? "BLEEDING" : "HIGH IMPACT"),
      title: bs.win_rate != null ? `Push Recent Win Rate: ${bs.win_rate}% → ${wrTarget}` : "Build a 65%+ Recent Win Rate",
      summary: `Currently ${wrItem.score}/${wrItem.max} pts (${bs.wins || 0}W–${bs.losses || 0}L, W/L ${bs.wl_ratio ?? "N/A"} — <=45% scores 0, maxes at 75%+).`,
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
  const near1k = brawlers.filter((b) => b.trophies >= 750 && b.trophies < 1000).sort((a, b) => b.trophies - a.trophies);
  const under1k = brawlers.filter((b) => b.trophies < 1000).sort((a, b) => b.trophies - a.trophies);
  if (carryItem.gap >= 0.1) {
    const steps = [];
    const maxed1kPool = p.max_tier_brawlers >= 45;
    if (maxed1kPool) {
      const leaders = brawlers.slice(0, 3).map((b) => `${b.name} (${b.trophies.toLocaleString()} 🏆)`).join(" • ");
      steps.push(`Your 1,000+ pool is already maxed (${p.max_tier_brawlers} brawlers at 1k+, led by ${leaders}).`);
      steps.push(`Remaining +${carryItem.gap.toFixed(2)} pts come strictly from Star Player % (currently ${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"} — 35%+ maxes it).`);
    } else {
      if (near1k.length) {
        const list = near1k.slice(0, 4).map((b) => `${b.name} (${b.trophies} 🏆 — ${1000 - b.trophies} away)`).join(" • ");
        steps.push(`Closest to 1,000 🏆 (Max Tier): ${list}.`);
      } else if (p.max_tier_brawlers > 0 && under1k.length) {
        const nextUp = under1k.slice(0, 3).map((b) => `${b.name} (${b.trophies} 🏆, Lv ${b.power})`).join(" • ");
        steps.push(`You have ${p.max_tier_brawlers} brawlers at 1,000+ 🏆. Next best candidates under 1k: ${nextUp}.`);
      } else if (under1k.length) {
        const topB = under1k.slice(0, 3).map((b) => `${b.name} (${b.trophies} 🏆, Lv ${b.power})`).join(" • ");
        steps.push(`No brawlers at 750+ 🏆 yet. Push your top mains (${topB}) on their best maps from the AI Tier List.`);
      }
      if (bs.star_player_rate != null) {
        steps.push(
          bs.star_player_rate < 20
            ? `Star Player rate is only ${bs.star_player_rate}% (${bs.star_players || 0} awards) — play higher-impact carry brawlers and die less.`
            : `Strong ${bs.star_player_rate}% Star Player rate (${bs.star_players || 0} awards) — keep carrying while growing your 1k+ pool.`
        );
      }
      steps.push(`Reaching 45 brawlers at 1,000+ 🏆 (${Math.max(0, 45 - p.max_tier_brawlers)} more) and 35% Star Player rate maxes this 1.50-pt category.`);
    }

    const next1kTarget = p.max_tier_brawlers < 10 ? 10 : p.max_tier_brawlers < 25 ? 25 : 45;
    tips.push({
      impact: carryItem.gap,
      category: "CARRY & 1K+ MASTERY",
      tag: maxed1kPool ? "STAR PLAYER FOCUS" : near1k.length ? "ALMOST THERE" : "SKILL GROWTH",
      title: maxed1kPool
        ? `Raise Star Player Impact (${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"} → 35%+)`
        : `Expand 1,000+ Trophy Pool (${p.max_tier_brawlers} → ${next1kTarget})`,
      summary: `Currently ${carryItem.score}/${carryItem.max} pts (${p.max_tier_brawlers} at 1k+, ${bs.star_player_rate != null ? `${bs.star_player_rate}% Star Player` : "no recent team games"}).`,
      metrics: [
        { label: "1k+ Brawlers", value: `${p.max_tier_brawlers}${maxed1kPool ? " (MAX)" : " / 45"}` },
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
    const next3v3 = p.victories_3v3 < 1500 ? 1500 : p.victories_3v3 < 5000 ? 5000 : p.victories_3v3 < 10000 ? 10000 : 18000;
    const remain = Math.max(0, next3v3 - p.victories_3v3);
    const steps = [];
    if (share3v3 < 55) {
      steps.push(`Penalty active: only ${share3v3}% of your wins are 3v3 (${p.victories_3v3.toLocaleString()} 3v3 vs ${sdTotal.toLocaleString()} Solo/Duo). Raising 3v3 share above 55% removes the Showdown inflation penalty.`);
    } else {
      steps.push(`Clean ${share3v3}% 3v3 share — need +${remain.toLocaleString()} more 3v3 wins to reach ${next3v3.toLocaleString()} (maxes at 18,000).`);
    }
    steps.push(
      p.club
        ? `Queue 3v3 Brawl Ball / Knockout / Heist with your clan (${p.club.name}) instead of playing Solo Showdown.`
        : `Join an active 50k+ average clan for reliable 3v3 teammates and full Mega Pig rewards.`
    );

    tips.push({
      impact: expItem.gap,
      category: "3V3 EXPERIENCE",
      tag: share3v3 < 55 ? "SD PENALTY" : "LONG-TERM",
      title: `Grow 3v3 Victories (${p.victories_3v3.toLocaleString()} → ${next3v3.toLocaleString()})`,
      summary: `Currently ${expItem.score}/${expItem.max} pts (${share3v3}% 3v3 share — 7k avg, 18k max).`,
      metrics: [
        { label: "3v3 Wins", value: p.victories_3v3.toLocaleString() },
        { label: "Solo + Duo", value: sdTotal.toLocaleString() },
        { label: "3v3 Share", value: `${share3v3}%` },
        { label: "Score Room", value: `+${expItem.gap.toFixed(2)} pts` },
      ],
      steps,
    });
  }

  tips.sort((a, b) => b.impact - a.impact);
  return tips;
}

function generateClubCoaching(c, rating) {
  const tips = [];
  const members = c.members || [];
  const count = c.member_count || members.length;

  const t65k = members.filter((m) => m.trophies >= 65000).length;
  const t50k = members.filter((m) => m.trophies >= 50000 && m.trophies < 65000).length;
  const t30k = members.filter((m) => m.trophies >= 30000 && m.trophies < 50000).length;
  const tUnder30k = members.filter((m) => m.trophies < 30000).length;

  // 1. Roster Fill (/30)
  const fillItem = getBreakdownItem(rating, "Roster Fill");
  const openSlots = Math.max(0, 30 - count);
  if (openSlots > 0) {
    const recReq = Math.max(20000, Math.round((Math.max(c.avg_trophies, 40000) * 0.8) / 1000) * 1000);
    const projTrophyGain = openSlots * Math.max(c.avg_trophies, GAME_AVG_TROPHIES);
    tips.push({
      impact: fillItem.gap + 0.4,
      category: "ROSTER FILL (/30)",
      tag: openSlots >= 5 ? "HIGH IMPACT" : "QUICK WIN",
      title: `Fill ${openSlots} Open Clan Slot${openSlots === 1 ? "" : "s"} (${count}/30 → 30/30)`,
      summary: `Currently ${fillItem.score}/${fillItem.max} pts — empty slots heavily penalize Clan Rating & Mega Pig.`,
      metrics: [
        { label: "Members", value: `${count} / 30` },
        { label: "Open Slots", value: `${openSlots}` },
        { label: "Mega Pig Cap", value: `${count * 15} / 450` },
        { label: "Score Room", value: `+${fillItem.gap.toFixed(2)} pts` },
      ],
      steps: [
        `Recruit ${openSlots} active 50k+ players to add ~+${projTrophyGain.toLocaleString()} 🏆 total clan trophies and +${fillItem.gap.toFixed(2)} rating pts.`,
        c.type === "closed"
          ? `Clan is CLOSED — switch to "Invite Only" with Required Trophies at ${recReq.toLocaleString()} 🏆.`
          : `Set Required Trophies near ${recReq.toLocaleString()} 🏆 to attract active players who pull your average up.`,
      ],
    });
  }

  // 2. Average Trophies vs 50k Benchmark
  const avgItem = getBreakdownItem(rating, "Avg Trophies");
  if (avgItem.gap >= 0.15 && members.length >= 5) {
    const top5 = members.slice(0, 5);
    const bottom5 = members.slice(-5);
    const top5Avg = Math.round(top5.reduce((s, m) => s + m.trophies, 0) / top5.length);
    const bot5Avg = Math.round(bottom5.reduce((s, m) => s + m.trophies, 0) / bottom5.length);
    const spread = top5Avg - bot5Avg;
    const suggestedMin = Math.max(35000, Math.round((Math.max(c.avg_trophies, GAME_AVG_TROPHIES) * 0.9) / 1000) * 1000);
    const bot3 = members.slice(-3);
    const bot3Sum = bot3.reduce((s, m) => s + m.trophies, 0);
    const simNewAvg = Math.round((c.trophies - bot3Sum + 3 * suggestedMin) / Math.max(count, 1));
    const simGain = Math.max(0, simNewAvg - c.avg_trophies);
    const lowestNames = [...bot3].reverse().map((m) => `${m.name} (${m.trophies.toLocaleString()} 🏆)`).join(" • ");

    const nextAvgTarget = c.avg_trophies < 50000 ? 50000 : Math.min(100000, Math.round((c.avg_trophies + 10000) / 1000) * 1000);

    tips.push({
      impact: avgItem.gap,
      category: "AVG TROPHIES VS 50K BENCHMARK",
      tag: c.avg_trophies < 50000 ? "BELOW 50K AVG" : "CORE GROWTH",
      title: `Raise Clan Average (${c.avg_trophies.toLocaleString()} → ${nextAvgTarget.toLocaleString()} 🏆)`,
      summary: `Worth 5.0 / 10 of Clan Rating (50k = 2.5/5.0 avg, 100k = max) — currently ${avgItem.score}/${avgItem.max} pts.`,
      metrics: [
        { label: "Clan Avg", value: `${c.avg_trophies.toLocaleString()}` },
        { label: "vs 50k Avg", value: formatSignedTrophies(c.avg_trophies - GAME_AVG_TROPHIES) },
        { label: "Top 5 Avg", value: `${top5Avg.toLocaleString()}` },
        { label: "Bottom 5 Avg", value: `${bot5Avg.toLocaleString()}` },
        { label: "Score Room", value: `+${avgItem.gap.toFixed(2)} pts` },
      ],
      steps: [
        `Breakdown: ${t65k} at 65k+ • ${t50k} at 50k–65k • ${t30k} at 30k–50k • ${tUnder30k} under 30k.`,
        spread >= 15000
          ? `Lowest 3 members: ${lowestNames}. Replacing inactive bottom slots with ${suggestedMin.toLocaleString()}+ 🏆 recruits jumps clan avg from ${c.avg_trophies.toLocaleString()} → ${simNewAvg.toLocaleString()} 🏆 (+${simGain.toLocaleString()} 🏆).`
          : `Tight ${spread.toLocaleString()} 🏆 roster spread — run a weekly trophy push target together.`,
        `Raise Required Trophies toward ${suggestedMin.toLocaleString()} 🏆 so every new recruit pushes the clan above the 50k line.`,
      ],
    });
  }

  // 3. Top 5 Aces
  const topItem = getBreakdownItem(rating, "Top 5 Aces");
  if (topItem.gap >= 0.15 && members.length > 0) {
    const top5 = members.slice(0, 5);
    const top5Avg = Math.round(top5.reduce((s, m) => s + m.trophies, 0) / top5.length);
    const gapTo110k = Math.max(0, 110000 - top5Avg);
    tips.push({
      impact: topItem.gap,
      category: "TOP 5 ACES",
      tag: "RECRUITMENT",
      title: `Boost Top 5 Average (${top5Avg.toLocaleString()} → 110,000 🏆)`,
      summary: `Currently ${topItem.score}/${topItem.max} pts — ${gapTo110k.toLocaleString()} 🏆 average gap to max score.`,
      metrics: [
        { label: "Top 5 Avg", value: `${top5Avg.toLocaleString()}` },
        { label: "Target", value: "110,000 🏆" },
        { label: "Score Room", value: `+${topItem.gap.toFixed(2)} pts` },
      ],
      steps: [
        `Current Top 5: ${top5.map((m) => `${m.name} (${m.trophies.toLocaleString()})`).join(" • ")}.`,
        `Recruit 2–3 Masters / 80k+ 🏆 aces as captains — strong top accounts attract better applicants automatically.`,
      ],
    });
  }

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

// ============================================================================
// Rich Match Rendering (Summary Analytics, Filter Pills, Team Previews & Details)
// ============================================================================
function renderParticipantButton(pl) {
  const selfCls = pl.is_self ? "mp-self" : "";
  const powerTag = pl.power ? `<span class="mp-lv ${pl.power >= 11 ? "lv11" : "lv-low"}">LV ${pl.power}</span>` : "";
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

function renderMatchDetails(em) {
  const teams = em.teams || [];
  const players = em.players || [];

  const diffPowerText =
    em.allyAvgPower != null && em.enemyAvgPower != null
      ? `Lv ${em.allyAvgPower} vs Lv ${em.enemyAvgPower}`
      : "--";
  const diffTrophyText =
    em.allyAvgTrophies != null && em.enemyAvgTrophies != null
      ? `${em.allyAvgTrophies.toLocaleString()} vs ${em.enemyAvgTrophies.toLocaleString()}`
      : em.lobbyAvgTrophies != null
        ? `${em.lobbyAvgTrophies.toLocaleString()} 🏆`
        : "--";

  const statsStrip = `
    <div class="match-analysis-grid">
      <div class="ma-box"><span>Played</span><strong>${BV.esc(em.timeAgo || "Recent")}</strong></div>
      <div class="ma-box"><span>Duration</span><strong>${BV.esc(em.durationLabel || "--")}</strong></div>
      <div class="ma-box"><span>Lobby Avg 🏆</span><strong>${em.lobbyAvgTrophies != null ? `${em.lobbyAvgTrophies.toLocaleString()} 🏆` : "--"}</strong></div>
      <div class="ma-box"><span>Team Power</span><strong>${BV.esc(diffPowerText)}</strong></div>
      <div class="ma-box"><span>Team Avg 🏆</span><strong>${BV.esc(diffTrophyText)}</strong></div>
      <div class="ma-box"><span>Star Player</span><strong>${BV.esc(em.starPlayerName || "N/A")}</strong></div>
    </div>
    <div class="match-judge-banner ${em.verdictCls}">
      <strong>${BV.esc(em.verdict)}:</strong> ${BV.esc(em.judgmentText)}
    </div>
  `;

  if (teams.length >= 2) {
    const teamCards = teams
      .map((team, idx) => {
        const avgP = idx === 0 ? em.allyAvgPower : em.enemyAvgPower;
        const avgT = idx === 0 ? em.allyAvgTrophies : em.enemyAvgTrophies;
        const metaTxt = [avgP ? `Avg Lv ${avgP}` : "", avgT ? `Avg ${avgT.toLocaleString()} 🏆` : ""]
          .filter(Boolean)
          .join(" • ");
        const label = teams.length === 2 ? (idx === 0 ? "YOUR TEAM" : "OPPONENTS") : `TEAM ${idx + 1}`;
        const sideCls = teams.length === 2 ? (idx === 0 ? "md-blue" : "md-red") : "";
        return `
          <div class="match-team-col ${sideCls}">
            <div class="match-team-lbl">
              <span>${label}</span>
              ${metaTxt ? `<span class="match-team-avg">${BV.esc(metaTxt)}</span>` : ""}
            </div>
            <div class="match-team-list">${team.map(renderParticipantButton).join("")}</div>
          </div>
        `;
      })
      .join("");
    return `${statsStrip}<div class="match-teams-grid">${teamCards}</div><div class="match-detail-meta">Tap any player above to inspect &amp; judge their profile</div>`;
  }

  if (players.length) {
    return `${statsStrip}<div class="match-team-list">${players.map(renderParticipantButton).join("")}</div><div class="match-detail-meta">Tap any player above to inspect &amp; judge their profile</div>`;
  }

  return `${statsStrip}<div class="match-detail-meta">Detailed lobby roster is not available for this match.</div>`;
}

function renderTeamPreviewMini(em) {
  const teams = em.teams || [];
  if (teams.length !== 2) return "";
  const mkImgs = (t) =>
    t
      .slice(0, 3)
      .map((pl) =>
        pl.portrait
          ? `<img src="${pl.portrait}" alt="${BV.esc(pl.brawler)}" title="${BV.esc(`${pl.name} (${pl.brawler} Lv${pl.power})`)}" class="${pl.is_self ? "mini-self" : ""}" onerror="this.style.display='none'" />`
          : ""
      )
      .join("");
  return `
    <div class="match-mini-versus" aria-hidden="true">
      <div class="mmv-side mmv-ally">${mkImgs(teams[0])}</div>
      <span class="mmv-vs">VS</span>
      <div class="mmv-side mmv-enemy">${mkImgs(teams[1])}</div>
    </div>
  `;
}

function renderMatchesSummaryBlock(enriched) {
  const netTrophies = enriched.reduce((sum, m) => sum + (typeof m.trophy_change === "number" ? m.trophy_change : 0), 0);
  const lobbies = enriched.map((m) => m.lobbyAvgTrophies).filter((x) => x != null);
  const avgLobby = lobbies.length ? Math.round(lobbies.reduce((a, b) => a + b, 0) / lobbies.length) : null;
  const durations = enriched.map((m) => m.duration).filter((d) => typeof d === "number" && d > 0);
  const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : null;
  const high1kCount = enriched.filter((m) => m.lobbyAvgTrophies != null && m.lobbyAvgTrophies >= 1000).length;
  const upsetWins = enriched.filter((m) => m.verdict.includes("UPSET")).length;

  let streakType = enriched[0]?.result || "";
  let streakLen = 0;
  for (const m of enriched) {
    if (m.result === streakType) streakLen += 1;
    else break;
  }
  const streakTxt =
    streakType === "victory" ? `${streakLen}W 🔥` : streakType === "defeat" ? `${streakLen}L ❄️` : "--";

  // Top played brawlers in recent matches
  const bMap = new Map();
  enriched.forEach((m) => {
    if (!m.brawler) return;
    const cur = bMap.get(m.brawler) || { name: m.brawler, portrait: m.portrait, w: 0, l: 0, sp: 0 };
    if (m.result === "victory") cur.w += 1;
    else if (m.result === "defeat") cur.l += 1;
    if (m.star_player) cur.sp += 1;
    bMap.set(m.brawler, cur);
  });
  const topBrawlers = Array.from(bMap.values())
    .sort((a, b) => b.w + b.l - (a.w + a.l))
    .slice(0, 5);

  const modes = Array.from(new Set(enriched.map((m) => m.mode).filter(Boolean)));
  const winsCount = enriched.filter((m) => m.result === "victory").length;
  const lossCount = enriched.filter((m) => m.result === "defeat").length;
  const spCount = enriched.filter((m) => m.star_player).length;

  return `
    <div class="match-analytics-panel">
      <div class="ma-kpi-strip">
        <div class="ma-kpi">
          <span>Net Trophies</span>
          <strong class="${netTrophies >= 0 ? "green-text" : "red-text"}">${netTrophies >= 0 ? "+" : ""}${netTrophies} 🏆</strong>
        </div>
        <div class="ma-kpi">
          <span>Avg Lobby 🏆</span>
          <strong class="gold-text">${avgLobby != null ? `${avgLobby.toLocaleString()} 🏆` : "N/A"}</strong>
        </div>
        <div class="ma-kpi">
          <span>Avg Duration</span>
          <strong>${avgDur ? formatDuration(avgDur) : "N/A"}</strong>
        </div>
        <div class="ma-kpi">
          <span>Current Form</span>
          <strong>${streakTxt}</strong>
        </div>
        <div class="ma-kpi">
          <span>1k+ Lobbies</span>
          <strong>${high1kCount} / ${enriched.length}</strong>
        </div>
        <div class="ma-kpi">
          <span>Upset Wins</span>
          <strong class="gold-text">${upsetWins}</strong>
        </div>
      </div>

      ${
        topBrawlers.length
          ? `<div class="recent-brawlers-strip">
              <span class="rbs-label">RECENT PICKS:</span>
              ${topBrawlers
                .map((b) => {
                  const tot = Math.max(1, b.w + b.l);
                  const wr = Math.round((b.w / tot) * 100);
                  return `<span class="rbs-chip">
                    ${b.portrait ? `<img src="${b.portrait}" alt="" onerror="this.style.display='none'" />` : ""}
                    <strong>${BV.esc(b.name)}</strong>
                    <span class="${wr >= 55 ? "green-text" : wr < 45 ? "red-text" : ""}">${b.w}W-${b.l}L (${wr}%)</span>
                    ${b.sp ? `<span class="gold-text">★${b.sp}</span>` : ""}
                  </span>`;
                })
                .join("")}
            </div>`
          : ""
      }

      <div class="match-filter-bar">
        <div class="filter-pills">
          <button type="button" class="filter-pill ${LOOKUP_STATE.matchFilter === "all" ? "active" : ""}" data-mfilter="all">All (${enriched.length})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.matchFilter === "win" ? "active" : ""}" data-mfilter="win">Wins (${winsCount})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.matchFilter === "loss" ? "active" : ""}" data-mfilter="loss">Losses (${lossCount})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.matchFilter === "sp" ? "active" : ""}" data-mfilter="sp">★ Star Player (${spCount})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.matchFilter === "high" ? "active" : ""}" data-mfilter="high">1k+ Lobbies (${high1kCount})</button>
        </div>
        <select id="match-mode-filter" class="select-input match-mode-select">
          <option value="">All Modes</option>
          ${modes
            .map(
              (mo) =>
                `<option value="${BV.esc(mo)}" ${LOOKUP_STATE.matchMode === mo ? "selected" : ""}>${BV.esc(BV.formatMode(mo))}</option>`
            )
            .join("")}
        </select>
      </div>
    </div>
  `;
}

function renderPlayerSubTab() {
  const container = document.getElementById("player-sub-content");
  const p = LOOKUP_STATE.lastPlayer;
  if (!container || !p) return;

  if (LOOKUP_STATE.subTab === "matches") {
    const rawMatches = p.battle_stats?.recent_matches || [];
    if (!rawMatches.length) {
      container.innerHTML = `<div class="empty-card">No recent matches in battlelog.</div>`;
      return;
    }

    const enrichedAll = rawMatches.map(enrichMatch);
    const filtered = enrichedAll.filter((em) => {
      if (LOOKUP_STATE.matchFilter === "win" && em.result !== "victory") return false;
      if (LOOKUP_STATE.matchFilter === "loss" && em.result !== "defeat") return false;
      if (LOOKUP_STATE.matchFilter === "sp" && !em.star_player) return false;
      if (LOOKUP_STATE.matchFilter === "high" && !(em.lobbyAvgTrophies != null && em.lobbyAvgTrophies >= 1000)) return false;
      if (LOOKUP_STATE.matchMode && em.mode !== LOOKUP_STATE.matchMode) return false;
      return true;
    });

    const summaryHtml = renderMatchesSummaryBlock(enrichedAll);
    const listHtml = filtered.length
      ? `<div class="match-list">${filtered
          .map((em, idx) => {
            const resClass = em.result === "victory" ? "res-win" : em.result === "defeat" ? "res-loss" : "res-draw";
            const resLabel =
              em.rank != null
                ? `#${em.rank} ${em.result === "victory" ? "WIN" : "LOSS"}`
                : em.result === "victory"
                  ? "WIN"
                  : em.result === "defeat"
                    ? "LOSS"
                    : "DRAW";
            const trophyChip =
              typeof em.trophy_change === "number"
                ? `<span class="match-trophy ${em.trophy_change >= 0 ? "pos" : "neg"}">${em.trophy_change >= 0 ? "+" : ""}${em.trophy_change} 🏆</span>`
                : "";
            const selfMeta = [
              em.selfPower ? `LV ${em.selfPower}` : "",
              em.selfTrophies ? `${em.selfTrophies.toLocaleString()} 🏆` : "",
            ]
              .filter(Boolean)
              .join(" • ");

            return `
              <div class="match-card ${resClass}" data-match-idx="${idx}">
                <button type="button" class="match-row match-row-toggle" aria-expanded="false">
                  ${em.portrait ? `<img src="${em.portrait}" alt="${BV.esc(em.brawler)}" onerror="this.style.display='none'" />` : `<div class="match-img-empty">?</div>`}
                  <div class="match-info">
                    <div class="match-title">
                      <strong>${BV.esc(em.brawler || "Brawler")}</strong>
                      ${selfMeta ? `<span class="match-self-chip">${BV.esc(selfMeta)}</span>` : ""}
                      <span class="match-verdict-chip ${em.verdictCls}">${BV.esc(em.verdict)}</span>
                      ${em.lobbyTier ? `<span class="lobby-tier-chip ${em.lobbyTierCls}">${BV.esc(em.lobbyAvgTrophies.toLocaleString())} 🏆 avg</span>` : ""}
                    </div>
                    <div class="match-map">
                      <strong>${BV.esc(BV.formatMode(em.mode))}</strong> • ${BV.esc(em.map)} • ${BV.esc(formatBattleType(em.type))}
                      ${em.durationLabel ? ` • ⏱ ${BV.esc(em.durationLabel)}` : ""}
                      ${em.timeAgo ? ` • ${BV.esc(em.timeAgo)}` : ""}
                    </div>
                    ${renderTeamPreviewMini(em)}
                  </div>
                  <div class="match-right">
                    <span class="match-res-badge ${resClass}">${resLabel}</span>
                    ${trophyChip}
                    <span class="match-chevron">▾</span>
                  </div>
                </button>
                <div class="match-details hidden">${renderMatchDetails(em)}</div>
              </div>
            `;
          })
          .join("")}</div>`
      : `<div class="empty-card">No matches match this filter.</div>`;

    container.innerHTML = `${summaryHtml}${listHtml}`;

    container.querySelectorAll("[data-mfilter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        LOOKUP_STATE.matchFilter = btn.dataset.mfilter;
        renderPlayerSubTab();
      });
    });

    const modeSel = document.getElementById("match-mode-filter");
    if (modeSel) {
      modeSel.addEventListener("change", (e) => {
        LOOKUP_STATE.matchMode = e.target.value;
        renderPlayerSubTab();
      });
    }

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

// ============================================================================
// Personal Goal Roadmap ("What Should I Do Next?")
// ============================================================================
function renderGoalRoadmap(p, rating) {
  const trophies = p.trophies || 0;
  const p11 = p.power11_count || 0;
  const v3 = p.victories_3v3 || 0;
  const maxTier = p.max_tier_brawlers || 0;
  const bs = p.battle_stats || {};
  const wr = bs.win_rate ?? 0;
  const spRate = bs.star_player_rate ?? 0;
  const share3v3 = rating.share_3v3_pct ?? 50;
  const brawlers = p.brawlers || [];

  const stages = [
    {
      num: 1,
      name: "Stage 1: Competitive Foundation",
      tag: "25K • 12 LV11",
      goals: [
        { label: "Reach 25,000 🏆 Trophies", cur: trophies, target: 25000, done: trophies >= 25000, fmt: (v) => `${v.toLocaleString()} / 25,000` },
        { label: "Max 12 Level 11 Brawlers (Mythic+ pool)", cur: p11, target: 12, done: p11 >= 12, fmt: (v) => `${v} / 12` },
        { label: "Hit 1,500 3v3 Victories", cur: v3, target: 1500, done: v3 >= 1500, fmt: (v) => `${v.toLocaleString()} / 1,500` },
        { label: "55%+ of Wins from 3v3 (not Showdown)", cur: share3v3, target: 55, done: share3v3 >= 55, fmt: (v) => `${v}% / 55%` },
      ],
    },
    {
      num: 2,
      name: "Stage 2: Beat the 50k Game Average",
      tag: "50K • 35 LV11",
      goals: [
        { label: "Cross 50,000 🏆 (Game Average Line)", cur: trophies, target: 50000, done: trophies >= 50000, fmt: (v) => `${v.toLocaleString()} / 50,000` },
        { label: "Max 35 Level 11 Brawlers", cur: p11, target: 35, done: p11 >= 35, fmt: (v) => `${v} / 35` },
        { label: "Hit 5,000 3v3 Victories", cur: v3, target: 5000, done: v3 >= 5000, fmt: (v) => `${v.toLocaleString()} / 5,000` },
        { label: "Push 10 Brawlers to 1,000+ 🏆", cur: maxTier, target: 10, done: maxTier >= 10, fmt: (v) => `${v} / 10` },
      ],
    },
    {
      num: 3,
      name: "Stage 3: Competitive Legendary Tier",
      tag: "75K • 55 LV11",
      goals: [
        { label: "Reach 75,000 🏆 (+25k above avg)", cur: trophies, target: 75000, done: trophies >= 75000, fmt: (v) => `${v.toLocaleString()} / 75,000` },
        { label: "Max 55 Level 11 Brawlers", cur: p11, target: 55, done: p11 >= 55, fmt: (v) => `${v} / 55` },
        { label: "Hit 10,000 3v3 Victories", cur: v3, target: 10000, done: v3 >= 10000, fmt: (v) => `${v.toLocaleString()} / 10,000` },
        { label: "Push 25 Brawlers to 1,000+ 🏆", cur: maxTier, target: 25, done: maxTier >= 25, fmt: (v) => `${v} / 25` },
      ],
    },
    {
      num: 4,
      name: "Stage 4: Masters / Esports Ceiling",
      tag: "100K • 65 LV11",
      goals: [
        { label: "Reach 100,000 🏆 Trophies", cur: trophies, target: 100000, done: trophies >= 100000, fmt: (v) => `${v.toLocaleString()} / 100,000` },
        { label: "Max 65+ Level 11 Brawlers", cur: p11, target: 65, done: p11 >= 65, fmt: (v) => `${v} / 65` },
        { label: "Hit 15,000 3v3 Victories", cur: v3, target: 15000, done: v3 >= 15000, fmt: (v) => `${v.toLocaleString()} / 15,000` },
        { label: "45+ Brawlers at 1k+ & 25%+ Star Player", cur: maxTier, target: 45, done: maxTier >= 45 && spRate >= 25, fmt: (v) => `${v}/45 • ${spRate}% SP` },
      ],
    },
  ];

  // Determine active stage (first incomplete stage)
  let currentStageIdx = stages.findIndex((st) => st.goals.some((g) => !g.done));
  if (currentStageIdx === -1) currentStageIdx = stages.length - 1;

  // Build "This Week's 3-Step Checklist" from real brawlers on the account
  const nearMax = brawlers
    .filter((b) => b.power === 10 || b.power === 9)
    .sort((a, b) => b.power - a.power || b.trophies - a.trophies);
  const near1k = brawlers
    .filter((b) => b.trophies >= 750 && b.trophies < 1000)
    .sort((a, b) => b.trophies - a.trophies);
  const easyFarm = brawlers
    .filter((b) => b.trophies < 600)
    .sort((a, b) => (b.power >= 9 ? 1 : 0) - (a.power >= 9 ? 1 : 0) || a.trophies - b.trophies);

  const weeklyTasks = [];
  if (nearMax.length) {
    const pick = nearMax[0];
    const cost = calcCostTo11(pick.power);
    weeklyTasks.push(
      `<strong>Upgrade Priority:</strong> Finish <strong>${BV.esc(pick.name)}</strong> (Lv ${pick.power} → 11: ${cost.coins.toLocaleString()} Coins / ${cost.pp.toLocaleString()} PP) and equip its pro build.`
    );
  } else {
    weeklyTasks.push(`<strong>Upgrade Priority:</strong> Open the <a href="/upgrade/" style="color:var(--gold);">Upgrade Guide</a> and push your #1 S-tier brawler straight to Lv 11.`);
  }

  if (near1k.length) {
    const pick = near1k[0];
    weeklyTasks.push(
      `<strong>1,000 🏆 Push Target:</strong> Push <strong>${BV.esc(pick.name)}</strong> (${pick.trophies.toLocaleString()} → 1,000 🏆, only ${1000 - pick.trophies} trophies left) on its best map.`
    );
  } else if (easyFarm.length) {
    const names = easyFarm.slice(0, 3).map((b) => `${BV.esc(b.name)} (${b.trophies} 🏆)`).join(", ");
    weeklyTasks.push(`<strong>Fastest Trophy Gain:</strong> Farm ${names} up to 600 🏆 in 3v3 modes to climb toward ${trophies < 50000 ? "the 50k average" : "your next milestone"}.`);
  }

  if (share3v3 < 55) {
    weeklyTasks.push(`<strong>Fix 3v3 Ratio:</strong> Play 3v3 modes (Brawl Ball / Knockout / Hot Zone) instead of Showdown to raise 3v3 share from ${share3v3}% → 55%+ and remove your rating penalty.`);
  } else if (wr < 55) {
    weeklyTasks.push(`<strong>Stabilize Win Rate:</strong> Stop solo-queuing on tilt — pair up with a teammate and use <a href="/drafting/" style="color:var(--gold);">Ranked Drafting</a> to lift recent WR from ${wr}% → 60%+.`);
  } else {
    weeklyTasks.push(`<strong>Competitive Edge:</strong> Queue Ranked with <a href="/drafting/" style="color:var(--gold);">BrawlVault Drafting</a> &amp; <a href="/counters/" style="color:var(--gold);">Counter Picker</a> to maintain your ${wr}% win rate.`);
  }

  const stagesHtml = stages
    .map((st, idx) => {
      const doneCount = st.goals.filter((g) => g.done).length;
      const pct = Math.round((doneCount / st.goals.length) * 100);
      const isDone = doneCount === st.goals.length;
      const isActive = idx === currentStageIdx && !isDone;
      const statusCls = isDone ? "rm-done" : isActive ? "rm-active" : "rm-locked";
      const statusBadge = isDone ? "✓ COMPLETED" : isActive ? "★ CURRENT GOAL" : "UP NEXT";

      return `
        <div class="roadmap-stage ${statusCls}">
          <div class="rm-stage-head">
            <div>
              <div class="rm-stage-num">STAGE ${st.num} • ${st.tag}</div>
              <h4 class="rm-stage-title">${BV.esc(st.name)}</h4>
            </div>
            <span class="rm-status-pill">${statusBadge}</span>
          </div>
          <div class="rm-progress-row">
            <div class="rb-track"><div class="rb-fill" style="width:${pct}%"></div></div>
            <span>${doneCount}/${st.goals.length}</span>
          </div>
          <ul class="rm-checklist">
            ${st.goals
              .map(
                (g) => `
                  <li class="${g.done ? "rm-goal-done" : ""}">
                    <span class="rm-check">${g.done ? "✓" : "○"}</span>
                    <span class="rm-goal-lbl">${BV.esc(g.label)}</span>
                    <strong class="rm-goal-val">${BV.esc(g.fmt(g.cur))}</strong>
                  </li>
                `
              )
              .join("")}
          </ul>
        </div>
      `;
    })
    .join("");

  return `
    <section class="panel roadmap-panel">
      <div class="coaching-header">
        <div>
          <div class="verdict-eyebrow">PERSONAL GOAL ROADMAP • STEP-BY-STEP PROGRESSION</div>
          <h3 class="brawl-title coaching-heading">🗺 WHAT YOU SHOULD DO NEXT</h3>
        </div>
        <span class="stat-chip chip-pick">STAGE ${currentStageIdx + 1} OF 4</span>
      </div>

      <div class="weekly-focus-box">
        <div class="wf-title">⚡ THIS WEEK'S 3-STEP CHECKLIST FOR ${BV.esc(p.name.toUpperCase())}</div>
        <ol class="wf-list">
          ${weeklyTasks.map((t) => `<li>${t}</li>`).join("")}
        </ol>
      </div>

      <div class="roadmap-grid">${stagesHtml}</div>
    </section>
  `;
}

// ============================================================================
// Feature #6: Trophy & Rating Progress Tracker (SQLite + localStorage + SVG Chart)
// ============================================================================
function syncAndGetPlayerHistory(p, rating) {
  const norm = BV.normalizeTag(p.tag);
  const key = `bv_history_${norm}`;
  const today = new Date().toISOString().slice(0, 10);
  const currentSnap = {
    day: today,
    ts: Math.floor(Date.now() / 1000),
    trophies: p.trophies || 0,
    victories_3v3: p.victories_3v3 || 0,
    power11_count: p.power11_count || 0,
    max_tier_brawlers: p.max_tier_brawlers || 0,
    rating_score: rating.score,
  };

  let localList = [];
  try {
    const raw = localStorage.getItem(key);
    if (raw) localList = JSON.parse(raw) || [];
  } catch {
    localList = [];
  }

  // Merge Pi server snapshots + browser snapshots by day
  const byDay = new Map();
  (p.history || []).forEach((s) => s && s.day && byDay.set(s.day, s));
  localList.forEach((s) => s && s.day && byDay.set(s.day, s));
  byDay.set(today, currentSnap);

  const merged = Array.from(byDay.values())
    .sort((a, b) => String(a.day).localeCompare(String(b.day)))
    .slice(-30);

  try {
    localStorage.setItem(key, JSON.stringify(merged));
  } catch {
    // ignore storage quota errors
  }
  return merged;
}

function renderProgressTrackerSection(history, metric) {
  const cfg = {
    trophies: { label: "Trophies 🏆", key: "trophies", fmt: (v) => v.toLocaleString(), color: "#ffc928" },
    rating_score: { label: "Strict Rating /10", key: "rating_score", fmt: (v) => `${Number(v).toFixed(1)}`, color: "#2ee59d" },
    power11_count: { label: "Level 11 Brawlers", key: "power11_count", fmt: (v) => `${v}`, color: "#22b8ff" },
  }[metric] || { label: "Trophies 🏆", key: "trophies", fmt: (v) => v.toLocaleString(), color: "#ffc928" };

  const vals = history.map((h) => Number(h[cfg.key] ?? 0));
  const first = history[0];
  const last = history[history.length - 1];
  const delta = history.length >= 2 ? Number((vals[vals.length - 1] - vals[0]).toFixed(1)) : 0;
  const deltaStr =
    metric === "rating_score"
      ? `${delta >= 0 ? "+" : ""}${delta.toFixed(1)} pts`
      : `${delta >= 0 ? "+" : ""}${Math.round(delta).toLocaleString()}`;

  let chartSvg = "";
  if (history.length >= 2) {
    const w = 640;
    const h = 165;
    const padX = 36;
    const padY = 20;
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const span = Math.max(maxV - minV, metric === "rating_score" ? 0.5 : 50);

    const pts = vals.map((v, i) => {
      const x = padX + (i / (vals.length - 1)) * (w - padX * 2);
      const y = h - padY - ((v - minV) / span) * (h - padY * 2);
      return { x, y, v, day: history[i].day };
    });

    const linePath = pts.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
    const areaPath = `${linePath} L${pts[pts.length - 1].x.toFixed(1)},${h - padY} L${pts[0].x.toFixed(1)},${h - padY} Z`;

    chartSvg = `
      <svg class="progress-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${BV.esc(cfg.label)} history chart">
        <defs>
          <linearGradient id="progGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${cfg.color}" stop-opacity="0.35" />
            <stop offset="100%" stop-color="${cfg.color}" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="${padX}" y1="${padY}" x2="${w - padX}" y2="${padY}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4 4" />
        <line x1="${padX}" y1="${h - padY}" x2="${w - padX}" y2="${h - padY}" stroke="rgba(255,255,255,0.12)" />
        <path d="${areaPath}" fill="url(#progGrad)" />
        <path d="${linePath}" fill="none" stroke="${cfg.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        ${pts
          .map(
            (pt) =>
              `<circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${cfg.color}" stroke="#0b0f26" stroke-width="2"><title>${pt.day}: ${cfg.fmt(pt.v)}</title></circle>`
          )
          .join("")}
      </svg>
      <div class="progress-axis-row">
        <span>${BV.esc(first.day)} (${BV.esc(cfg.fmt(vals[0]))})</span>
        <span>Latest: <strong>${BV.esc(last.day)} (${BV.esc(cfg.fmt(vals[vals.length - 1]))})</strong></span>
      </div>
    `;
  } else {
    chartSvg = `
      <div class="progress-first-day">
        <strong>📍 Snapshot #1 saved for ${BV.esc(last?.day || "today")}!</strong>
        <span>Every time you check this tag on a new day, BrawlVault logs Trophies, Strict Rating, and Level 11s and plots your growth curve automatically.</span>
      </div>
    `;
  }

  return `
    <div class="progress-top-row">
      <div>
        <div class="verdict-eyebrow">DAILY PROGRESS TRACKER • ${history.length} SNAPSHOT${history.length === 1 ? "" : "S"}</div>
        <h3 class="brawl-title coaching-heading">📈 ACCOUNT PROGRESS OVER TIME</h3>
      </div>
      <div class="filter-pills">
        <button type="button" class="filter-pill ${metric === "trophies" ? "active" : ""}" data-hmetric="trophies">Trophies</button>
        <button type="button" class="filter-pill ${metric === "rating_score" ? "active" : ""}" data-hmetric="rating_score">Rating</button>
        <button type="button" class="filter-pill ${metric === "power11_count" ? "active" : ""}" data-hmetric="power11_count">Lv 11s</button>
      </div>
    </div>
    <div class="progress-kpis">
      <div class="ma-kpi"><span>Current ${BV.esc(cfg.label)}</span><strong>${BV.esc(cfg.fmt(vals[vals.length - 1] ?? 0))}</strong></div>
      <div class="ma-kpi"><span>Change (${history.length}d tracked)</span><strong class="${delta >= 0 ? "green-text" : "red-text"}">${BV.esc(deltaStr)}</strong></div>
      <div class="ma-kpi"><span>First Tracked</span><strong>${BV.esc(first?.day || "Today")}</strong></div>
    </div>
    ${chartSvg}
  `;
}

// ============================================================================
// Feature #1: 1v1 Player Account Battle / Compare
// ============================================================================
function renderCompareResult(p1, p2) {
  const r1 = computeStrictPlayerRating(p1);
  const r2 = computeStrictPlayerRating(p2);
  const bs1 = p1.battle_stats || {};
  const bs2 = p2.battle_stats || {};

  const rows = [
    { label: "Strict BrawlVault Rating", v1: r1.score, v2: r2.score, fmt: (v) => `${v.toFixed(1)} / 10` },
    { label: "Trophies (50k Avg)", v1: p1.trophies, v2: p2.trophies, fmt: (v) => `🏆 ${v.toLocaleString()}` },
    { label: "Peak Trophies", v1: p1.highest_trophies, v2: p2.highest_trophies, fmt: (v) => v.toLocaleString() },
    { label: "3v3 Victories", v1: p1.victories_3v3, v2: p2.victories_3v3, fmt: (v) => v.toLocaleString() },
    { label: "3v3 Share (%)", v1: r1.share_3v3_pct, v2: r2.share_3v3_pct, fmt: (v) => `${v}%` },
    { label: "Level 11 Brawlers", v1: p1.power11_count, v2: p2.power11_count, fmt: (v) => `${v}` },
    { label: "1,000+ Trophy Brawlers", v1: p1.max_tier_brawlers, v2: p2.max_tier_brawlers, fmt: (v) => `${v}` },
    { label: "Recent Win Rate", v1: bs1.win_rate ?? -1, v2: bs2.win_rate ?? -1, fmt: (v) => (v >= 0 ? `${v}%` : "N/A") },
    { label: "Star Player Rate", v1: bs1.star_player_rate ?? -1, v2: bs2.star_player_rate ?? -1, fmt: (v) => (v >= 0 ? `${v}%` : "N/A") },
  ];

  let p1Wins = 0;
  let p2Wins = 0;
  rows.forEach((row) => {
    if (row.v1 > row.v2) p1Wins += 1;
    else if (row.v2 > row.v1) p2Wins += 1;
  });

  const winner =
    r1.score > r2.score || (r1.score === r2.score && p1Wins >= p2Wins)
      ? { p: p1, r: r1, side: 1, margin: Number((r1.score - r2.score).toFixed(1)) }
      : { p: p2, r: r2, side: 2, margin: Number((r2.score - r1.score).toFixed(1)) };

  const shareUrl = `${window.location.origin}/lookup/?p1=${encodeURIComponent(p1.tag)}&p2=${encodeURIComponent(p2.tag)}`;

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <section class="panel compare-hero">
      <div class="compare-banner-top">
        <span class="verdict-eyebrow">⚔ 1V1 ACCOUNT BATTLE • 50K AVG BENCHMARK</span>
        <button type="button" id="copy-compare-link" class="btn btn-ghost btn-sm">🔗 Copy 1v1 Link</button>
      </div>

      <div class="compare-players-row">
        <button type="button" class="cmp-player-card ${winner.side === 1 ? "cmp-winner" : ""}" data-inspect-tag="${BV.esc(p1.tag)}">
          ${winner.side === 1 ? '<span class="cmp-crown">👑 WINNER</span>' : ""}
          <h3 class="brawl-title">${BV.esc(p1.name)}</h3>
          <div class="profile-tag">${BV.esc(p1.tag)}</div>
          <div class="cmp-big-score">${r1.score.toFixed(1)}<small>/10</small></div>
          <span class="rating-grade">${BV.esc(r1.grade)}</span>
        </button>

        <div class="cmp-vs-center">
          <div class="brawl-title cmp-vs-text">VS</div>
          <div class="cmp-tally">${p1Wins} – ${p2Wins}</div>
          <div class="muted-tag">Categories Won</div>
        </div>

        <button type="button" class="cmp-player-card ${winner.side === 2 ? "cmp-winner" : ""}" data-inspect-tag="${BV.esc(p2.tag)}">
          ${winner.side === 2 ? '<span class="cmp-crown">👑 WINNER</span>' : ""}
          <h3 class="brawl-title">${BV.esc(p2.name)}</h3>
          <div class="profile-tag">${BV.esc(p2.tag)}</div>
          <div class="cmp-big-score">${r2.score.toFixed(1)}<small>/10</small></div>
          <span class="rating-grade">${BV.esc(r2.grade)}</span>
        </button>
      </div>

      <div class="cmp-verdict-line">
        <strong>VERDICT:</strong> <strong>${BV.esc(winner.p.name)}</strong> wins this 1v1${
          winner.margin >= 1.5
            ? ` convincingly (+${winner.margin} rating pts ahead) — not even close.`
            : winner.margin >= 0.4
              ? ` by +${winner.margin} rating pts (${p1Wins}–${p2Wins} across categories).`
              : ` in a razor-close matchup (${p1Wins}–${p2Wins} across categories).`
        }
      </div>

      <div class="cmp-table">
        ${rows
          .map((row) => {
            const w1 = row.v1 > row.v2 ? "cmp-cell-win" : "";
            const w2 = row.v2 > row.v1 ? "cmp-cell-win" : "";
            return `
              <div class="cmp-row">
                <div class="cmp-val cmp-left ${w1}">${BV.esc(row.fmt(row.v1))}</div>
                <div class="cmp-cat">${BV.esc(row.label)}</div>
                <div class="cmp-val cmp-right ${w2}">${BV.esc(row.fmt(row.v2))}</div>
              </div>
            `;
          })
          .join("")}
      </div>
    </section>
  `;

  document.getElementById("copy-compare-link").addEventListener("click", async (e) => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      e.currentTarget.textContent = "✓ Link Copied!";
      setTimeout(() => { e.currentTarget.textContent = "🔗 Copy 1v1 Link"; }, 2200);
    } catch {
      prompt("Copy this 1v1 share link:", shareUrl);
    }
  });

  resultEl.querySelectorAll("[data-inspect-tag]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.inspectTag;
      setLookupType("player");
      document.getElementById("lookup-tag-input").value = tag;
      runLookup("player", tag);
    });
  });
}

// ============================================================================
// Render Player & Club Profiles
// ============================================================================
// ============================================================================
// Dynamic Brawler Explorer (Search, Filter, Sort & Live Inspect Drawer)
// ============================================================================
function renderBrawlerExplorer(p) {
  const all = p.brawlers || [];
  const q = LOOKUP_STATE.brawlerSearch.trim().toUpperCase();

  let list = all.filter((b) => {
    if (q && !b.name.toUpperCase().includes(q)) return false;
    if (LOOKUP_STATE.brawlerFilter === "lv11" && b.power < 11) return false;
    if (LOOKUP_STATE.brawlerFilter === "1k" && b.trophies < 1000) return false;
    if (LOOKUP_STATE.brawlerFilter === "near1k" && !(b.trophies >= 750 && b.trophies < 1000)) return false;
    if (LOOKUP_STATE.brawlerFilter === "upgrade" && !(b.power === 9 || b.power === 10)) return false;
    return true;
  });

  if (LOOKUP_STATE.brawlerSort === "power") {
    list = [...list].sort((a, b) => b.power - a.power || b.trophies - a.trophies);
  } else if (LOOKUP_STATE.brawlerSort === "highest") {
    list = [...list].sort((a, b) => b.highest_trophies - a.highest_trophies);
  } else if (LOOKUP_STATE.brawlerSort === "name") {
    list = [...list].sort((a, b) => a.name.localeCompare(b.name));
  } else {
    list = [...list].sort((a, b) => b.trophies - a.trophies || b.power - a.power);
  }

  const lv11Cnt = all.filter((b) => b.power >= 11).length;
  const k1Cnt = all.filter((b) => b.trophies >= 1000).length;
  const near1kCnt = all.filter((b) => b.trophies >= 750 && b.trophies < 1000).length;
  const upgCnt = all.filter((b) => b.power === 9 || b.power === 10).length;

  let drawerHtml = "";
  if (LOOKUP_STATE.selectedBrawler) {
    const sb = all.find((x) => x.name === LOOKUP_STATE.selectedBrawler);
    if (sb) {
      const cost = sb.power < 11 ? calcCostTo11(sb.power) : { coins: 0, pp: 0 };
      const spTxt = (sb.star_powers || []).join(", ") || "None owned";
      const gdTxt = (sb.gadgets || []).join(", ") || "None owned";
      const grTxt = (sb.gears || []).join(", ") || "None owned";
      drawerHtml = `
        <div class="brawler-inspect-drawer dyn-fade">
          <div class="bid-head">
            <div class="bid-ident">
              <img src="${BV.resolvePortraitUrl(sb.portrait, sb.id)}" alt="${BV.esc(sb.name)}" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${sb.id}.png'" />
              <div>
                <h4 class="brawl-title" style="font-size:18px;">${BV.esc(sb.name)}</h4>
                <span class="muted-tag">Level ${sb.power} • 🏆 ${sb.trophies.toLocaleString()} (Peak ${sb.highest_trophies.toLocaleString()})</span>
              </div>
            </div>
            <div style="display:flex;gap:6px;align-items:center;">
              <a href="/counters/?brawler=${encodeURIComponent(sb.name)}" class="btn btn-blue btn-sm" style="text-decoration:none;">⚔ Counters</a>
              <button type="button" id="close-brawler-drawer" class="btn btn-ghost btn-sm">✕</button>
            </div>
          </div>
          <div class="bid-grid">
            <div class="ma-box"><span>Star Powers</span><strong>${BV.esc(spTxt)}</strong></div>
            <div class="ma-box"><span>Gadgets</span><strong>${BV.esc(gdTxt)}</strong></div>
            <div class="ma-box"><span>Gears</span><strong>${BV.esc(grTxt)}</strong></div>
            <div class="ma-box"><span>To Level 11</span><strong>${sb.power >= 11 ? "✓ Maxed" : `🪙 ${cost.coins.toLocaleString()} / ${cost.pp.toLocaleString()} PP`}</strong></div>
          </div>
        </div>
      `;
    }
  }

  return `
    <div class="dyn-fade">
      <div class="explorer-toolbar">
        <div class="filter-pills">
          <button type="button" class="filter-pill ${LOOKUP_STATE.brawlerFilter === "all" ? "active" : ""}" data-bfilter="all">All (${all.length})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.brawlerFilter === "lv11" ? "active" : ""}" data-bfilter="lv11">Lv 11 (${lv11Cnt})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.brawlerFilter === "1k" ? "active" : ""}" data-bfilter="1k">1k+ (${k1Cnt})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.brawlerFilter === "near1k" ? "active" : ""}" data-bfilter="near1k">750–999 (${near1kCnt})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.brawlerFilter === "upgrade" ? "active" : ""}" data-bfilter="upgrade">Lv 9–10 (${upgCnt})</button>
        </div>
        <div class="explorer-controls">
          <input type="search" id="brawler-exp-search" class="search-input" placeholder="Search brawler..." value="${BV.esc(LOOKUP_STATE.brawlerSearch)}" />
          <select id="brawler-exp-sort" class="select-input">
            <option value="trophies" ${LOOKUP_STATE.brawlerSort === "trophies" ? "selected" : ""}>Sort: Trophies ↓</option>
            <option value="power" ${LOOKUP_STATE.brawlerSort === "power" ? "selected" : ""}>Sort: Power ↓</option>
            <option value="highest" ${LOOKUP_STATE.brawlerSort === "highest" ? "selected" : ""}>Sort: Peak 🏆 ↓</option>
            <option value="name" ${LOOKUP_STATE.brawlerSort === "name" ? "selected" : ""}>Sort: Name A–Z</option>
          </select>
        </div>
      </div>
      ${drawerHtml}
      <div class="player-brawler-grid">
        ${
          list.length
            ? list
                .map(
                  (b) => `
                    <button type="button" class="pb-card ${b.power >= 11 ? "tile-lv11" : ""} ${LOOKUP_STATE.selectedBrawler === b.name ? "cp-tile-active" : ""}" data-inspect-b="${BV.esc(b.name)}">
                      <span class="pb-power ${b.power >= 11 ? "lv11" : ""}">LV ${b.power}</span>
                      <img src="${BV.resolvePortraitUrl(b.portrait, b.id)}" alt="${BV.esc(b.name)}" loading="lazy" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${b.id}.png'" />
                      <div class="pb-name">${BV.esc(b.name)}</div>
                      <div class="pb-trophies">🏆 ${b.trophies.toLocaleString()}</div>
                    </button>
                  `
                )
                .join("")
            : `<div class="empty-card">No brawlers match this filter.</div>`
        }
      </div>
    </div>
  `;
}

function renderDynamicPlayerWorkspace() {
  const container = document.getElementById("player-sub-content");
  const p = LOOKUP_STATE.lastPlayer;
  const rating = LOOKUP_STATE.lastRating;
  const verdict = LOOKUP_STATE.lastVerdict;
  if (!container || !p || !rating) return;

  if (LOOKUP_STATE.subTab === "overview") {
    container.innerHTML = `
      <div class="overview-stack dyn-fade">
        ${renderVerdictCard("BRAWLVAULT JUDGE • 50,000 🏆 AVERAGE BENCHMARK", verdict)}
        <section class="panel progress-panel" id="progress-tracker-panel">
          ${renderProgressTrackerSection(LOOKUP_STATE.lastHistory, LOOKUP_STATE.historyMetric)}
        </section>
      </div>
    `;
    const bindProgress = () => {
      const panel = document.getElementById("progress-tracker-panel");
      if (!panel) return;
      panel.querySelectorAll("[data-hmetric]").forEach((btn) => {
        btn.addEventListener("click", () => {
          LOOKUP_STATE.historyMetric = btn.dataset.hmetric;
          panel.innerHTML = renderProgressTrackerSection(LOOKUP_STATE.lastHistory, LOOKUP_STATE.historyMetric);
          bindProgress();
        });
      });
    };
    bindProgress();
    return;
  }

  if (LOOKUP_STATE.subTab === "roadmap") {
    container.innerHTML = `
      <div class="overview-stack dyn-fade">
        ${renderGoalRoadmap(p, rating)}
        ${renderCoachingSection(
          "HOW TO RAISE YOUR SCORE",
          "Strict competitive benchmarks: 50k trophies = average (100k max), 18k 3v3 wins, 65 Lv 11s, 45 brawlers at 1k+.",
          generatePlayerCoaching(p, rating)
        )}
      </div>
    `;
    return;
  }

  if (LOOKUP_STATE.subTab === "brawlers") {
    container.innerHTML = renderBrawlerExplorer(p);
    container.querySelectorAll("[data-bfilter]").forEach((btn) => {
      btn.addEventListener("click", () => {
        LOOKUP_STATE.brawlerFilter = btn.dataset.bfilter;
        renderDynamicPlayerWorkspace();
      });
    });
    const sInput = document.getElementById("brawler-exp-search");
    if (sInput) {
      sInput.addEventListener("input", (e) => {
        LOOKUP_STATE.brawlerSearch = e.target.value;
        renderDynamicPlayerWorkspace();
        const fresh = document.getElementById("brawler-exp-search");
        if (fresh) {
          fresh.focus();
          fresh.setSelectionRange(fresh.value.length, fresh.value.length);
        }
      });
    }
    const sortSel = document.getElementById("brawler-exp-sort");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        LOOKUP_STATE.brawlerSort = e.target.value;
        renderDynamicPlayerWorkspace();
      });
    }
    container.querySelectorAll("[data-inspect-b]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const nm = btn.dataset.inspectB;
        LOOKUP_STATE.selectedBrawler = LOOKUP_STATE.selectedBrawler === nm ? null : nm;
        renderDynamicPlayerWorkspace();
      });
    });
    const closeDr = document.getElementById("close-brawler-drawer");
    if (closeDr) {
      closeDr.addEventListener("click", () => {
        LOOKUP_STATE.selectedBrawler = null;
        renderDynamicPlayerWorkspace();
      });
    }
    return;
  }

  // Default: "matches"
  renderPlayerSubTab();
}

function renderPlayerProfile(p) {
  LOOKUP_STATE.lastPlayer = p;
  LOOKUP_STATE.subTab = "overview";
  LOOKUP_STATE.matchFilter = "all";
  LOOKUP_STATE.matchMode = "";
  LOOKUP_STATE.brawlerSearch = "";
  LOOKUP_STATE.brawlerFilter = "all";
  LOOKUP_STATE.selectedBrawler = null;

  const rating = computeStrictPlayerRating(p);
  LOOKUP_STATE.lastRating = rating;
  const history = syncAndGetPlayerHistory(p, rating);
  LOOKUP_STATE.lastHistory = history;

  const bs = p.battle_stats || {};
  const enrichedMatches = (bs.recent_matches || []).map(enrichMatch);
  LOOKUP_STATE.lastEnrichedMatches = enrichedMatches;
  const verdict = buildPlayerVerdict(p, rating, enrichedMatches);
  LOOKUP_STATE.lastVerdict = verdict;

  saveRecentLookup("player", p.tag, p.name);

  const savedTag = BV.getSavedTag();
  const isSaved = savedTag === BV.normalizeTag(p.tag);

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

  const battleMeBtn =
    savedTag && !isSaved
      ? `<button type="button" id="battle-vs-me-btn" class="btn btn-blue btn-sm">⚔ Battle vs Me</button>`
      : "";

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <div class="profile-hero dyn-fade">
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
            ${battleMeBtn}
            <button type="button" id="save-my-tag-btn" class="btn ${isSaved ? "btn-blue" : "btn-gold"} btn-sm">
              ${isSaved ? "✓ Saved ID" : "★ Save ID"}
            </button>
            <a href="/upgrade/" class="btn btn-ghost btn-sm">Upgrade Guide →</a>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-tile"><span>Trophies</span><strong class="gold-text">🏆 ${p.trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>vs 50k Avg</span><strong class="${verdict.diff50k >= 0 ? "green-text" : "red-text"}">${formatSignedTrophies(verdict.diff50k)}</strong></div>
          <div class="stat-tile"><span>Peak Trophies</span><strong>${p.highest_trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>3v3 Wins (${rating.share_3v3_pct}%)</span><strong>${p.victories_3v3.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Recent WR</span><strong class="${(bs.win_rate ?? 50) >= 55 ? "green-text" : "red-text"}">${bs.win_rate != null ? `${bs.win_rate}%` : "N/A"}</strong></div>
          <div class="stat-tile"><span>Star Player</span><strong class="gold-text">${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"}</strong></div>
          <div class="stat-tile"><span>Level 11s</span><strong class="green-text">${p.power11_count} / ${p.brawlers_owned}</strong></div>
          <div class="stat-tile"><span>1,000+ Brawlers</span><strong>${p.max_tier_brawlers}</strong></div>
        </div>
      </div>

      <div class="rating-card ${scoreColorClass(rating.score)}">
        <div class="rating-label">STRICT RATING (50K BENCHMARK)</div>
        ${renderRatingRing(rating.score, rating.grade)}
        <div class="rating-breakdown">${breakdownHtml}</div>
      </div>
    </div>

    <!-- Dynamic Workspace Tabs -->
    <nav class="lookup-dyn-tabs" aria-label="Player sections">
      <button type="button" class="lookup-dyn-tab active" data-sub="overview">Overview &amp; Progress</button>
      <button type="button" class="lookup-dyn-tab" data-sub="matches">Matches <span class="lookup-dyn-count">${enrichedMatches.length}</span></button>
      <button type="button" class="lookup-dyn-tab" data-sub="roadmap">Goal Roadmap</button>
      <button type="button" class="lookup-dyn-tab" data-sub="brawlers">Brawlers <span class="lookup-dyn-count">${p.brawlers_owned}</span></button>
    </nav>

    <div id="player-sub-content"></div>
  `;

  document.getElementById("save-my-tag-btn").addEventListener("click", (e) => {
    BV.setSavedTag(p.tag);
    BV.setCachedProfile(p);
    e.currentTarget.textContent = "✓ Saved ID";
    e.currentTarget.className = "btn btn-blue btn-sm";
  });

  const battleBtn = document.getElementById("battle-vs-me-btn");
  if (battleBtn && savedTag) {
    battleBtn.addEventListener("click", () => {
      setLookupType("compare");
      document.getElementById("lookup-tag-input").value = savedTag;
      document.getElementById("lookup-tag-input-2").value = p.tag;
      runCompare(savedTag, p.tag);
    });
  }

  const clubBtn = document.getElementById("jump-club-btn");
  if (clubBtn && p.club) {
    clubBtn.addEventListener("click", () => {
      setLookupType("club");
      document.getElementById("lookup-tag-input").value = p.club.tag;
      runLookup("club", p.club.tag);
    });
  }

  document.querySelectorAll(".lookup-dyn-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      LOOKUP_STATE.subTab = btn.dataset.sub;
      document.querySelectorAll(".lookup-dyn-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderDynamicPlayerWorkspace();
    });
  });

  renderDynamicPlayerWorkspace();
}

function renderDynamicClubWorkspace() {
  const container = document.getElementById("club-sub-content");
  const c = LOOKUP_STATE.lastClub;
  const rating = LOOKUP_STATE.lastRating;
  const verdict = LOOKUP_STATE.lastVerdict;
  if (!container || !c || !rating || !verdict) return;

  const totalCount = Math.max(1, c.member_count || (c.members || []).length);

  if (LOOKUP_STATE.clubTab === "overview") {
    const tierBarHtml = `
      <div class="club-dist-wrap">
        <div class="club-dist-bar">
          ${verdict.buckets
            .filter((b) => b.count > 0)
            .map(
              (b) =>
                `<div class="club-dist-seg ${b.cls}" style="width:${(b.count / totalCount) * 100}%" title="${b.label}: ${b.count} members"></div>`
            )
            .join("")}
        </div>
        <div class="club-dist-legend">
          ${verdict.buckets
            .map((b) => `<span class="cdl-item ${b.cls}">${b.label}: <strong>${b.count}</strong></span>`)
            .join("")}
        </div>
      </div>
    `;
    container.innerHTML = `
      <div class="overview-stack dyn-fade">
        ${renderVerdictCard("CLAN JUDGE • 50,000 🏆 AVERAGE BENCHMARK", verdict, tierBarHtml)}
        ${renderCoachingSection(
          "HOW TO RAISE YOUR CLAN SCORE",
          "Strict recruiting, median vs average health, and trophy spread targets anchored to the 50k benchmark.",
          generateClubCoaching(c, rating)
        )}
      </div>
    `;
    return;
  }

  // Dynamic Members Explorer
  const all = c.members || [];
  const q = LOOKUP_STATE.clubSearch.trim().toLowerCase();
  let list = all.filter((m) => {
    if (q && !m.name.toLowerCase().includes(q) && !m.tag.toLowerCase().includes(q)) return false;
    if (LOOKUP_STATE.clubFilter === "80k" && m.trophies < 80000) return false;
    if (LOOKUP_STATE.clubFilter === "50k" && m.trophies < 50000) return false;
    if (LOOKUP_STATE.clubFilter === "under50" && m.trophies >= 50000) return false;
    if (LOOKUP_STATE.clubFilter === "under30" && m.trophies >= 30000) return false;
    if (LOOKUP_STATE.clubFilter === "leaders" && !["president", "vicePresident", "senior"].includes(m.role)) return false;
    return true;
  });

  if (LOOKUP_STATE.clubSort === "trophies_asc") {
    list = [...list].sort((a, b) => a.trophies - b.trophies);
  } else if (LOOKUP_STATE.clubSort === "role") {
    const order = { president: 0, vicePresident: 1, senior: 2, member: 3 };
    list = [...list].sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9) || b.trophies - a.trophies);
  } else {
    list = [...list].sort((a, b) => b.trophies - a.trophies);
  }

  const membersHtml = list.length
    ? list
        .map((m, idx) => {
          let mTag = `<span class="mj-pill mj-avg">50K TIER</span>`;
          if (m.trophies >= 80000) mTag = `<span class="mj-pill mj-elite">ACE 80K+</span>`;
          else if (m.trophies >= 60000) mTag = `<span class="mj-pill mj-good">ABOVE 50K</span>`;
          else if (m.trophies < 30000) mTag = `<span class="mj-pill mj-low">UNDER 30K</span>`;
          else if (m.trophies < 50000) mTag = `<span class="mj-pill mj-warn">BELOW 50K</span>`;
          return `
            <button type="button" class="club-member-row" data-tag="${BV.esc(m.tag)}">
              <span class="member-rank">#${idx + 1}</span>
              <div class="member-info">
                <div class="member-name-row">
                  <strong>${BV.esc(m.name)}</strong>
                  ${mTag}
                </div>
                <span class="member-meta">${BV.esc(m.tag)} • ${BV.esc(m.role)}</span>
              </div>
              <span class="member-trophies">🏆 ${m.trophies.toLocaleString()}</span>
            </button>
          `;
        })
        .join("")
    : `<div class="empty-card">No clan members match this filter.</div>`;

  container.innerHTML = `
    <div class="dyn-fade">
      <div class="explorer-toolbar">
        <div class="filter-pills">
          <button type="button" class="filter-pill ${LOOKUP_STATE.clubFilter === "all" ? "active" : ""}" data-cfilter="all">All (${all.length})</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.clubFilter === "80k" ? "active" : ""}" data-cfilter="80k">80k+</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.clubFilter === "50k" ? "active" : ""}" data-cfilter="50k">50k+</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.clubFilter === "under50" ? "active" : ""}" data-cfilter="under50">&lt;50k</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.clubFilter === "under30" ? "active" : ""}" data-cfilter="under30">&lt;30k</button>
          <button type="button" class="filter-pill ${LOOKUP_STATE.clubFilter === "leaders" ? "active" : ""}" data-cfilter="leaders">Leaders</button>
        </div>
        <div class="explorer-controls">
          <input type="search" id="club-exp-search" class="search-input" placeholder="Search member..." value="${BV.esc(LOOKUP_STATE.clubSearch)}" />
          <select id="club-exp-sort" class="select-input">
            <option value="trophies_desc" ${LOOKUP_STATE.clubSort === "trophies_desc" ? "selected" : ""}>Trophies ↓</option>
            <option value="trophies_asc" ${LOOKUP_STATE.clubSort === "trophies_asc" ? "selected" : ""}>Trophies ↑</option>
            <option value="role" ${LOOKUP_STATE.clubSort === "role" ? "selected" : ""}>Role</option>
          </select>
        </div>
      </div>
      <div class="club-member-list">${membersHtml}</div>
    </div>
  `;

  container.querySelectorAll("[data-cfilter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      LOOKUP_STATE.clubFilter = btn.dataset.cfilter;
      renderDynamicClubWorkspace();
    });
  });
  const sEl = document.getElementById("club-exp-search");
  if (sEl) {
    sEl.addEventListener("input", (e) => {
      LOOKUP_STATE.clubSearch = e.target.value;
      renderDynamicClubWorkspace();
      const fresh = document.getElementById("club-exp-search");
      if (fresh) {
        fresh.focus();
        fresh.setSelectionRange(fresh.value.length, fresh.value.length);
      }
    });
  }
  const sortEl = document.getElementById("club-exp-sort");
  if (sortEl) {
    sortEl.addEventListener("change", (e) => {
      LOOKUP_STATE.clubSort = e.target.value;
      renderDynamicClubWorkspace();
    });
  }
  container.querySelectorAll(".club-member-row").forEach((row) => {
    row.addEventListener("click", () => {
      const mTag = row.dataset.tag;
      setLookupType("player");
      document.getElementById("lookup-tag-input").value = mTag;
      runLookup("player", mTag);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderClubProfile(c) {
  LOOKUP_STATE.lastClub = c;
  LOOKUP_STATE.clubTab = "overview";
  LOOKUP_STATE.clubSearch = "";
  LOOKUP_STATE.clubFilter = "all";
  LOOKUP_STATE.clubSort = "trophies_desc";

  const rating = computeStrictClubRating(c);
  const verdict = buildClubVerdict(c, rating);
  LOOKUP_STATE.lastRating = rating;
  LOOKUP_STATE.lastVerdict = verdict;

  saveRecentLookup("club", c.tag, c.name);

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

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <div class="profile-hero dyn-fade">
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
          <div class="stat-tile"><span>Avg Member 🏆</span><strong>${c.avg_trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>vs 50k Avg</span><strong class="${verdict.diff50k >= 0 ? "green-text" : "red-text"}">${formatSignedTrophies(verdict.diff50k)}</strong></div>
          <div class="stat-tile"><span>Median 🏆</span><strong>${verdict.median.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Members</span><strong class="green-text">${c.member_count} / 30</strong></div>
          <div class="stat-tile"><span>Mega Pig Cap</span><strong>${c.member_count * 15} / 450</strong></div>
        </div>
      </div>

      <div class="rating-card ${scoreColorClass(rating.score)}">
        <div class="rating-label">STRICT CLAN RATING (50K AVG)</div>
        ${renderRatingRing(rating.score, rating.grade)}
        <div class="rating-breakdown">${breakdownHtml}</div>
      </div>
    </div>

    <nav class="lookup-dyn-tabs" aria-label="Clan sections">
      <button type="button" class="lookup-dyn-tab active" data-ctab="overview">Overview &amp; Recruiting</button>
      <button type="button" class="lookup-dyn-tab" data-ctab="members">Members <span class="lookup-dyn-count">${c.member_count} / 30</span></button>
    </nav>

    <div id="club-sub-content"></div>
  `;

  document.querySelectorAll("[data-ctab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      LOOKUP_STATE.clubTab = btn.dataset.ctab;
      document.querySelectorAll("[data-ctab]").forEach((b) => b.classList.toggle("active", b === btn));
      renderDynamicClubWorkspace();
    });
  });

  renderDynamicClubWorkspace();
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

async function runCompare(rawTag1, rawTag2) {
  const t1 = BV.normalizeTag(rawTag1);
  const t2 = BV.normalizeTag(rawTag2);
  const input1 = document.getElementById("lookup-tag-input");
  const input2 = document.getElementById("lookup-tag-input-2");
  const btn = document.getElementById("lookup-btn");
  const resultEl = document.getElementById("lookup-result");

  if (!t1 || t1.length < 4 || !t2 || t2.length < 4) {
    resultEl.innerHTML = `<div class="empty-card error-card">Enter two valid Brawl Stars player tags to start a 1v1 Battle (e.g. #2PP and #800).</div>`;
    return;
  }

  input1.value = t1;
  input2.value = t2;
  btn.disabled = true;
  btn.textContent = "Battling...";
  resultEl.innerHTML = `<div class="empty-card">Comparing ${BV.esc(t1)} vs ${BV.esc(t2)} live...</div>`;

  try {
    const [p1, p2] = await Promise.all([BV.fetchPlayer(t1, true), BV.fetchPlayer(t2, true)]);
    renderCompareResult(p1, p2);
  } catch (err) {
    resultEl.innerHTML = `<div class="empty-card error-card">${BV.esc(err.message || "Could not compare those two player tags.")}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Battle";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderRecentSearches();
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLookupType(btn.dataset.type));
  });

  document.getElementById("lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (LOOKUP_STATE.type === "compare") {
      runCompare(
        document.getElementById("lookup-tag-input").value,
        document.getElementById("lookup-tag-input-2").value
      );
    } else {
      runLookup(LOOKUP_STATE.type, document.getElementById("lookup-tag-input").value);
    }
  });

  const params = new URLSearchParams(window.location.search);
  const qClub = params.get("club");
  const qPlayer = params.get("player");
  const qP1 = params.get("p1");
  const qP2 = params.get("p2");
  const qMode = params.get("mode");

  if (qP1 && qP2) {
    setLookupType("compare");
    runCompare(qP1, qP2);
  } else if (qMode === "compare") {
    setLookupType("compare");
    const saved = BV.getSavedTag();
    if (saved) document.getElementById("lookup-tag-input").value = saved;
  } else if (qClub) {
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
