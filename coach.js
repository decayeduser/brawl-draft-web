// ============================================================================
// BrawlVault AI Coach Hub (AI Chat + Goal Roadmap + Action Plan + Upgrade Guide)
// ============================================================================

const COACH_STATE = {
  type: "player",
  tag: "",
  subTab: "chat",
  upgradeFilter: "unlocked",
  upgradeSearch: "",
  profile: null,
  upgradeData: null,
  messages: [],
};

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

function formatCoachMarkdown(raw) {
  const safe = BV.esc(String(raw || "").trim());
  const lines = safe.split(/\r?\n/);
  const out = [];
  let inList = false;

  const inlineFmt = (s) =>
    s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      if (inList) { out.push("</ul>"); inList = false; }
      continue;
    }
    if (/^#{1,3}\s+/.test(t)) {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<h4 class="ai-coach-h">${inlineFmt(t.replace(/^#{1,3}\s+/, ""))}</h4>`);
    } else if (/^[-*•]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      if (!inList) { out.push('<ul class="ai-coach-ul">'); inList = true; }
      out.push(`<li>${inlineFmt(t.replace(/^([-*•]|\d+\.)\s+/, ""))}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p class="ai-coach-p">${inlineFmt(t)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

function setCoachType(type) {
  COACH_STATE.type = type;
  document.querySelectorAll("[data-ctype]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.ctype === type);
  });
  const input = document.getElementById("coach-tag-input");
  input.placeholder = type === "club" ? "Enter Clan Tag (e.g. #2PP)" : "Enter Player Tag (e.g. #2PP)";
}

// ==================== GOAL ROADMAP ====================
function renderGoalRoadmap(p) {
  const trophies = p.trophies || 0;
  const p11 = p.power11_count || 0;
  const v3 = p.victories_3v3 || 0;
  const sd = (p.solo_victories || 0) + (p.duo_victories || 0);
  const share3v3 = Math.round((v3 / Math.max(1, v3 + sd)) * 100);
  const maxTier = p.max_tier_brawlers || 0;
  const bs = p.battle_stats || {};
  const wr = bs.win_rate ?? 0;
  const spRate = bs.star_player_rate ?? 0;
  const brawlers = p.brawlers || [];

  const stages = [
    {
      num: 1,
      name: "Stage 1: Competitive Foundation",
      tag: "25K • 12 LV11",
      goals: [
        { label: "Reach 25,000 🏆 Trophies", cur: trophies, done: trophies >= 25000, fmt: (v) => `${v.toLocaleString()} / 25,000` },
        { label: "Max 12 Level 11 Brawlers", cur: p11, done: p11 >= 12, fmt: (v) => `${v} / 12` },
        { label: "Hit 1,500 3v3 Victories", cur: v3, done: v3 >= 1500, fmt: (v) => `${v.toLocaleString()} / 1,500` },
        { label: "55%+ Wins from 3v3", cur: share3v3, done: share3v3 >= 55, fmt: (v) => `${v}% / 55%` },
      ],
    },
    {
      num: 2,
      name: "Stage 2: Beat the 50k Game Average",
      tag: "50K • 35 LV11",
      goals: [
        { label: "Cross 50,000 🏆 (Average Line)", cur: trophies, done: trophies >= 50000, fmt: (v) => `${v.toLocaleString()} / 50,000` },
        { label: "Max 35 Level 11 Brawlers", cur: p11, done: p11 >= 35, fmt: (v) => `${v} / 35` },
        { label: "Hit 5,000 3v3 Victories", cur: v3, done: v3 >= 5000, fmt: (v) => `${v.toLocaleString()} / 5,000` },
        { label: "Push 10 Brawlers to 1,000+ 🏆", cur: maxTier, done: maxTier >= 10, fmt: (v) => `${v} / 10` },
      ],
    },
    {
      num: 3,
      name: "Stage 3: Competitive Legendary Tier",
      tag: "75K • 55 LV11",
      goals: [
        { label: "Reach 75,000 🏆 (+25k above avg)", cur: trophies, done: trophies >= 75000, fmt: (v) => `${v.toLocaleString()} / 75,000` },
        { label: "Max 55 Level 11 Brawlers", cur: p11, done: p11 >= 55, fmt: (v) => `${v} / 55` },
        { label: "Hit 10,000 3v3 Victories", cur: v3, done: v3 >= 10000, fmt: (v) => `${v.toLocaleString()} / 10,000` },
        { label: "Push 25 Brawlers to 1,000+ 🏆", cur: maxTier, done: maxTier >= 25, fmt: (v) => `${v} / 25` },
      ],
    },
    {
      num: 4,
      name: "Stage 4: Masters / Esports Ceiling",
      tag: "100K • 65 LV11",
      goals: [
        { label: "Reach 100,000 🏆 Trophies", cur: trophies, done: trophies >= 100000, fmt: (v) => `${v.toLocaleString()} / 100,000` },
        { label: "Max 65+ Level 11 Brawlers", cur: p11, done: p11 >= 65, fmt: (v) => `${v} / 65` },
        { label: "Hit 15,000 3v3 Victories", cur: v3, done: v3 >= 15000, fmt: (v) => `${v.toLocaleString()} / 15,000` },
        { label: "45+ at 1k+ & 25%+ Star Player", cur: maxTier, done: maxTier >= 45 && spRate >= 25, fmt: (v) => `${v}/45 • ${spRate}% SP` },
      ],
    },
  ];

  let currentIdx = stages.findIndex((st) => st.goals.some((g) => !g.done));
  if (currentIdx === -1) currentIdx = stages.length - 1;

  const nearMax = brawlers.filter((b) => b.power === 10 || b.power === 9).sort((a, b) => b.power - a.power || b.trophies - a.trophies);
  const near1k = brawlers.filter((b) => b.trophies >= 750 && b.trophies < 1000).sort((a, b) => b.trophies - a.trophies);
  const easyFarm = brawlers.filter((b) => b.trophies < 600).sort((a, b) => (b.power >= 9 ? 1 : 0) - (a.power >= 9 ? 1 : 0) || a.trophies - b.trophies);

  const weekly = [];
  if (nearMax.length) {
    const pick = nearMax[0];
    const c = calcCostTo11(pick.power);
    weekly.push(`<strong>Upgrade Priority:</strong> Finish <strong>${BV.esc(pick.name)}</strong> (Lv ${pick.power} → 11: ${c.coins.toLocaleString()} Coins / ${c.pp.toLocaleString()} PP).`);
  } else {
    weekly.push(`<strong>Upgrade Priority:</strong> Check the <strong>Upgrade Guide</strong> tab here and max your #1 S-tier brawler.`);
  }
  if (near1k.length) {
    const pick = near1k[0];
    weekly.push(`<strong>1,000 🏆 Push Target:</strong> Push <strong>${BV.esc(pick.name)}</strong> (${pick.trophies.toLocaleString()} → 1,000 🏆, ${1000 - pick.trophies} away).`);
  } else if (easyFarm.length) {
    weekly.push(`<strong>Fastest Trophy Gain:</strong> Farm ${easyFarm.slice(0, 3).map((b) => `${BV.esc(b.name)} (${b.trophies} 🏆)`).join(", ")} up to 600 🏆 in 3v3.`);
  }
  if (share3v3 < 55) {
    weekly.push(`<strong>Fix 3v3 Share:</strong> Queue 3v3 modes instead of Showdown to lift 3v3 ratio from ${share3v3}% → 55%+.`);
  } else if (wr < 55) {
    weekly.push(`<strong>Stabilize Form:</strong> Pair up with a teammate and use <a href="/drafting/" style="color:var(--gold);">Ranked Drafting</a> to lift recent WR (${wr}% → 60%+).`);
  } else {
    weekly.push(`<strong>Maintain Edge:</strong> Use <a href="/drafting/" style="color:var(--gold);">Ranked Drafting</a> &amp; <a href="/counters/" style="color:var(--gold);">Counter Picker</a> to keep your ${wr}% WR climbing.`);
  }

  const stagesHtml = stages
    .map((st, idx) => {
      const doneCnt = st.goals.filter((g) => g.done).length;
      const pct = Math.round((doneCnt / st.goals.length) * 100);
      const isDone = doneCnt === st.goals.length;
      const isActive = idx === currentIdx && !isDone;
      const cls = isDone ? "rm-done" : isActive ? "rm-active" : "rm-locked";
      const badge = isDone ? "✓ COMPLETED" : isActive ? "★ CURRENT GOAL" : "UP NEXT";
      return `
        <div class="roadmap-stage ${cls}">
          <div class="rm-stage-head">
            <div>
              <div class="rm-stage-num">STAGE ${st.num} • ${st.tag}</div>
              <h4 class="rm-stage-title">${BV.esc(st.name)}</h4>
            </div>
            <span class="rm-status-pill">${badge}</span>
          </div>
          <div class="rm-progress-row">
            <div class="rb-track"><div class="rb-fill" style="width:${pct}%"></div></div>
            <span>${doneCnt}/${st.goals.length}</span>
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
    <section class="panel roadmap-panel dyn-fade">
      <div class="coaching-header">
        <div>
          <div class="verdict-eyebrow">PERSONAL GOAL ROADMAP • STEP-BY-STEP</div>
          <h3 class="brawl-title coaching-heading">🗺 What You Should Do Next</h3>
        </div>
        <span class="stat-chip chip-pick">STAGE ${currentIdx + 1} OF 4</span>
      </div>
      <div class="weekly-focus-box">
        <div class="wf-title">⚡ THIS WEEK'S 3-STEP CHECKLIST FOR ${BV.esc(p.name.toUpperCase())}</div>
        <ol class="wf-list">${weekly.map((w) => `<li>${w}</li>`).join("")}</ol>
      </div>
      <div class="roadmap-grid">${stagesHtml}</div>
    </section>
  `;
}

// ==================== ACTION PLAN CARDS ====================
function renderActionPlanCards(title, subtitle, cards) {
  return `
    <section class="panel coaching-panel dyn-fade">
      <div class="coaching-header">
        <div>
          <h3 class="brawl-title coaching-heading">${BV.esc(title)}</h3>
          <p class="coaching-sub">${BV.esc(subtitle)}</p>
        </div>
        <span class="stat-chip chip-pick">ACTION PLAN</span>
      </div>
      <div class="coaching-grid">
        ${cards
          .map(
            (t) => `
              <article class="coach-card">
                <div class="coach-head">
                  <span class="coach-cat">${BV.esc(t.category)}</span>
                  <span class="coach-tag">${BV.esc(t.tag)}</span>
                </div>
                <h4 class="coach-title">${BV.esc(t.title)}</h4>
                <p class="coach-summary">${BV.esc(t.summary)}</p>
                <ul class="coach-steps">${t.steps.map((s) => `<li>${BV.esc(s)}</li>`).join("")}</ul>
                ${t.ctaHref ? `<a href="${t.ctaHref}" class="coach-cta">${BV.esc(t.ctaLabel)}</a>` : ""}
              </article>
            `
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildPlayerActionPlan(p) {
  const brawlers = p.brawlers || [];
  const bs = p.battle_stats || {};
  const v3 = p.victories_3v3 || 0;
  const sd = (p.solo_victories || 0) + (p.duo_victories || 0);
  const share3v3 = Math.round((v3 / Math.max(1, v3 + sd)) * 100);
  const nearMax = brawlers.filter((b) => b.power === 10 || b.power === 9).sort((a, b) => b.power - a.power || b.trophies - a.trophies);
  const near1k = brawlers.filter((b) => b.trophies >= 750 && b.trophies < 1000).sort((a, b) => b.trophies - a.trophies);
  const under600 = brawlers.filter((b) => b.trophies < 600).sort((a, b) => a.trophies - b.trophies);
  const cards = [];

  cards.push({
    category: "ROSTER & UPGRADES",
    tag: p.power11_count < 35 ? "HIGH IMPACT" : "FINE-TUNE",
    title: `Grow Maxed Pool (${p.power11_count} Level 11s)`,
    summary: `Average Power Level: ${p.avg_power} across ${p.brawlers_owned} owned brawlers.`,
    steps: [
      nearMax.length
        ? `Closest to Level 11: ${nearMax.slice(0, 4).map((b) => `${b.name} (Lv ${b.power})`).join(" • ")}.`
        : "Focus all coins & power points on 1 S-tier brawler at a time instead of leveling evenly.",
      "Prioritize Star Power + Gadget + 2 Gears on your Ranked mains before starting a new upgrade.",
    ],
    ctaHref: "#upgrade-tab",
    ctaLabel: "Open Upgrade Guide Tab →",
  });

  cards.push({
    category: "TROPHIES VS 50K AVG",
    tag: p.trophies < 50000 ? "BELOW 50K AVG" : "ABOVE 50K",
    title: p.trophies < 50000 ? `Climb ${(50000 - p.trophies).toLocaleString()} 🏆 to 50k Average` : `Push Past ${p.trophies.toLocaleString()} 🏆`,
    summary: `Peak: ${p.highest_trophies.toLocaleString()} 🏆 • ${p.max_tier_brawlers} brawlers at 1,000+ 🏆.`,
    steps: [
      under600.length
        ? `Fastest trophy farm (${under600.length} under 600 🏆): ${under600.slice(0, 4).map((b) => `${b.name} (${b.trophies} 🏆)`).join(" • ")}.`
        : "Your whole roster is 600+ 🏆 — push your strongest Lv 11 comfort picks to 1,000+ 🏆.",
      near1k.length
        ? `Almost 1,000 🏆: ${near1k.slice(0, 3).map((b) => `${b.name} (${b.trophies} 🏆)`).join(" • ")}.`
        : "Stack win streaks in fast 3v3 modes (Brawl Ball / Knockout / Heist).",
    ],
  });

  cards.push({
    category: "RECENT FORM & 3V3",
    tag: (bs.win_rate ?? 50) < 52 ? "FIX NOW" : "COMPETITIVE",
    title: `Recent Form: ${bs.win_rate != null ? `${bs.win_rate}% WR` : "N/A"} • ${share3v3}% 3v3 Share`,
    summary: `${bs.wins || 0}W–${bs.losses || 0}L in last ${bs.matches_analyzed || 0} games • ${bs.star_player_rate ?? 0}% Star Player.`,
    steps: [
      share3v3 < 55
        ? `Only ${share3v3}% of your wins are 3v3 — play 3v3 modes to build real Ranked skill.`
        : `Strong ${share3v3}% 3v3 focus (${v3.toLocaleString()} 3v3 wins).`,
      "Use BrawlVault Drafting & Counter Picker before Ranked matches to avoid getting counter-picked.",
    ],
    ctaHref: "/drafting/",
    ctaLabel: "Open Ranked Drafting AI →",
  });

  return renderActionPlanCards("PLAYER COACHING ACTION PLAN", "Direct data-backed steps tailored to your live stats.", cards);
}

function buildClubActionPlan(c) {
  const members = c.members || [];
  const count = c.member_count || members.length;
  const openSlots = Math.max(0, 30 - count);
  const under30k = members.filter((m) => m.trophies < 30000).length;
  const top5Avg = members.length ? Math.round(members.slice(0, 5).reduce((s, m) => s + m.trophies, 0) / Math.min(5, members.length)) : 0;
  const cards = [];

  if (openSlots > 0) {
    cards.push({
      category: "ROSTER FILL",
      tag: "HIGH IMPACT",
      title: `Fill ${openSlots} Open Slot${openSlots === 1 ? "" : "s"} (${count}/30)`,
      summary: `Missing ${openSlots * 15} Mega Pig tickets every event.`,
      steps: [
        `Recruit ${openSlots} active 50k+ players to raise total trophies and fill Mega Pig.`,
        c.type === "closed" ? "Switch clan type from CLOSED to Invite Only so players can apply." : "Keep Required Trophies near 80–90% of your clan average.",
      ],
    });
  }

  cards.push({
    category: "AVG TROPHIES VS 50K",
    tag: c.avg_trophies < 50000 ? "BELOW 50K AVG" : "ABOVE 50K",
    title: `Clan Average: ${c.avg_trophies.toLocaleString()} 🏆`,
    summary: `Top 5 Average: ${top5Avg.toLocaleString()} 🏆 • ${under30k} members under 30k.`,
    steps: [
      under30k > 0
        ? `Replace inactive accounts among the ${under30k} members under 30,000 🏆 with 50k+ recruits.`
        : "Zero members under 30k — strong baseline roster.",
      "Set a clear weekly inactivity & Mega Pig ticket minimum in your clan description.",
    ],
  });

  return renderActionPlanCards("CLAN COACHING ACTION PLAN", "Recruiting, trophy health, and Mega Pig targets anchored to 50k average.", cards);
}

// ==================== FULL INTEGRATED UPGRADE GUIDE ====================
function renderEmbeddedUpgradeGuide() {
  const box = document.getElementById("coach-upgrade-slot");
  if (!box) return;
  const u = COACH_STATE.upgradeData;
  if (!u) {
    box.innerHTML = `<div class="empty-card">Loading personalized Level 11 Upgrade Guide &amp; Pro Builds...</div>`;
    return;
  }

  const all = u.recommendations || [];
  const q = COACH_STATE.upgradeSearch.trim().toUpperCase();
  const filtered = all.filter((r) => {
    if (q && !r.name.toUpperCase().includes(q)) return false;
    if (COACH_STATE.upgradeFilter === "unlocked") return r.unlocked;
    if (COACH_STATE.upgradeFilter === "close") return r.unlocked && (r.current_power === 9 || r.current_power === 10);
    if (COACH_STATE.upgradeFilter === "low") return r.unlocked && r.current_power <= 8;
    if (COACH_STATE.upgradeFilter === "locked") return !r.unlocked;
    return true;
  });

  const unlockedCnt = all.filter((r) => r.unlocked).length;
  const closeCnt = all.filter((r) => r.unlocked && (r.current_power === 9 || r.current_power === 10)).length;
  const lowCnt = all.filter((r) => r.unlocked && r.current_power <= 8).length;
  const lockedCnt = all.filter((r) => !r.unlocked).length;

  box.innerHTML = `
    <div class="explorer-toolbar">
      <div class="filter-pills">
        <button type="button" class="filter-pill ${COACH_STATE.upgradeFilter === "unlocked" ? "active" : ""}" data-ufilter="unlocked">All Under Lv 11 (${unlockedCnt})</button>
        <button type="button" class="filter-pill ${COACH_STATE.upgradeFilter === "close" ? "active" : ""}" data-ufilter="close">Lv 9–10 (${closeCnt})</button>
        <button type="button" class="filter-pill ${COACH_STATE.upgradeFilter === "low" ? "active" : ""}" data-ufilter="low">Lv 1–8 (${lowCnt})</button>
        <button type="button" class="filter-pill ${COACH_STATE.upgradeFilter === "locked" ? "active" : ""}" data-ufilter="locked">Locked (${lockedCnt})</button>
      </div>
      <div class="explorer-controls">
        <input type="search" id="coach-upgrade-search" class="search-input" placeholder="Filter brawler..." value="${BV.esc(COACH_STATE.upgradeSearch)}" />
      </div>
    </div>

    <div class="upgrade-grid">
      ${
        filtered.length
          ? filtered
              .map((r, idx) => {
                const b = r.build || {};
                const mapsHtml = (r.best_maps || [])
                  .slice(0, 3)
                  .map((m) => `<span class="mini-map-chip">${BV.esc(m.map)}</span>`)
                  .join("");
                return `
                  <article class="upgrade-card">
                    <div class="upgrade-card-head">
                      <div class="upgrade-identity">
                        <span class="upgrade-rank">#${idx + 1}</span>
                        <img src="${BV.resolvePortraitUrl(r.portrait, r.id)}" alt="${BV.esc(r.name)}" loading="lazy" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${r.id}.png'" />
                        <div>
                          <div class="upgrade-name-line">
                            <span class="upgrade-name">${BV.esc(r.name)}</span>
                            <span class="tier-pill tier-${r.tier.toLowerCase()}">${r.tier}</span>
                          </div>
                          <div class="upgrade-level-row">
                            <span class="level-tag">${r.unlocked ? `Lv ${r.current_power} → 11` : "Not Unlocked"}</span>
                            <span class="prio-tag prio-${r.tier.toLowerCase()}">${BV.esc(r.priority_label)}</span>
                          </div>
                        </div>
                      </div>
                      <div class="upgrade-meta-nums">
                        <div class="meta-num"><span>WR</span><strong>${r.win_rate}%</strong></div>
                        <div class="meta-num"><span>Pick</span><strong>${r.pick_rate}%</strong></div>
                      </div>
                    </div>
                    <div class="upgrade-cost-row">
                      <span class="cost-chip cost-coins">🪙 ${r.coins_needed.toLocaleString()}</span>
                      <span class="cost-chip cost-pp">⚡ ${r.pp_needed.toLocaleString()} PP</span>
                    </div>
                    <div class="build-box">
                      <div class="build-title">PRO META BUILD${b.pro_samples ? `<span class="build-sample">${b.pro_samples} pros</span>` : ""}</div>
                      <div class="build-row"><span class="build-key">★ SP</span><span class="build-val">${BV.esc(b.star_power || "N/A")}${b.owns_star_power ? '<span class="owned-badge">✓</span>' : ""}</span></div>
                      <div class="build-row"><span class="build-key">⚙ Gadget</span><span class="build-val">${BV.esc(b.gadget || "N/A")}${b.owns_gadget ? '<span class="owned-badge">✓</span>' : ""}</span></div>
                      <div class="build-row"><span class="build-key">⛨ Gears</span><span class="build-val">${BV.esc((b.gears || []).join(" + "))}</span></div>
                    </div>
                    ${mapsHtml ? `<div class="upgrade-maps"><span class="maps-lbl">Best maps:</span>${mapsHtml}</div>` : ""}
                  </article>
                `;
              })
              .join("")
          : `<div class="empty-card">No brawlers match this filter.</div>`
      }
    </div>
  `;

  box.querySelectorAll("[data-ufilter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      COACH_STATE.upgradeFilter = btn.dataset.ufilter;
      renderEmbeddedUpgradeGuide();
    });
  });
  const sEl = document.getElementById("coach-upgrade-search");
  if (sEl) {
    sEl.addEventListener("input", (e) => {
      COACH_STATE.upgradeSearch = e.target.value;
      renderEmbeddedUpgradeGuide();
      const fresh = document.getElementById("coach-upgrade-search");
      if (fresh) {
        fresh.focus();
        fresh.setSelectionRange(fresh.value.length, fresh.value.length);
      }
    });
  }
}

async function ensureUpgradeGuideLoaded() {
  if (COACH_STATE.type !== "player" || !COACH_STATE.profile || COACH_STATE.upgradeData) {
    renderEmbeddedUpgradeGuide();
    return;
  }
  try {
    COACH_STATE.upgradeData = await BV.apiFetch(
      `/api/v1/player/${encodeURIComponent(BV.tagForUrl(COACH_STATE.profile.tag))}/upgrade-guide`
    );
  } catch {
    COACH_STATE.upgradeData = { recommendations: [] };
  }
  renderEmbeddedUpgradeGuide();
}

// ==================== MAIN WORKSPACE & TABS ====================
function renderCoachTabContent() {
  const slot = document.getElementById("coach-tab-content");
  const p = COACH_STATE.profile;
  if (!slot || !p) return;
  const isClub = COACH_STATE.type === "club";

  if (COACH_STATE.subTab === "roadmap" && !isClub) {
    slot.innerHTML = renderGoalRoadmap(p);
    return;
  }

  if (COACH_STATE.subTab === "plan") {
    slot.innerHTML = isClub ? buildClubActionPlan(p) : buildPlayerActionPlan(p);
    slot.querySelectorAll('a[href="#upgrade-tab"]').forEach((lnk) => {
      lnk.addEventListener("click", (e) => {
        e.preventDefault();
        COACH_STATE.subTab = "upgrade";
        renderCoachWorkspace();
      });
    });
    return;
  }

  if (COACH_STATE.subTab === "upgrade" && !isClub) {
    slot.innerHTML = `<div id="coach-upgrade-slot" class="dyn-fade"><div class="empty-card">Loading Priority Level 11 Upgrades...</div></div>`;
    ensureUpgradeGuideLoaded();
    return;
  }

  // Default: "chat" (Live Gemini AI Coach)
  const prompts = isClub
    ? [
        { label: "Full Clan Audit", q: "" },
        { label: "Recruiting & Kick Plan", q: "Give a concrete recruiting & kick plan to push this clan above the 50k trophy average." },
        { label: "Mega Pig & Roles", q: "How should we organize Mega Pig and leadership roles based on our roster?" },
        { label: "Brutal Clan Roast", q: "Roast this clan honestly using its real trophy stats, then give 2 fast fixes." },
      ]
    : [
        { label: "Full Breakdown", q: "" },
        { label: "Who Should I Upgrade Next?", q: "Based on my Lv 9-10 brawlers and the current S-tier meta, which exact 3 brawlers should I max to Lv 11 next?" },
        { label: "Best 3 Brawlers to Push", q: "Which exact 3 brawlers on my account should I push to 1,000 trophies first this week and why?" },
        { label: "Fix My Recent Losses", q: "Analyze my recent match history and tell me why I am losing games and what to change." },
        { label: "Honest Roast", q: "Roast my account brutally using my real stats vs the 50k average, then tell me how to fix it." },
      ];

  slot.innerHTML = `
    <section class="panel ai-coach-panel dyn-fade">
      <div class="coaching-header">
        <div>
          <div class="verdict-eyebrow">✦ INTERACTIVE GEMINI AI COACH</div>
          <h3 class="brawl-title coaching-heading">Ask About ${BV.esc(p.name)}</h3>
        </div>
        <span id="coach-status-badge" class="stat-chip">READY</span>
      </div>

      <div class="ai-coach-prompts">
        ${prompts
          .map((pr) => `<button type="button" class="filter-pill coach-prompt-btn" data-q="${BV.esc(pr.q)}">${BV.esc(pr.label)}</button>`)
          .join("")}
      </div>

      <form id="coach-ask-form" class="tag-input-row">
        <input
          type="text"
          id="coach-question-input"
          class="search-input tag-field"
          style="text-transform:none;"
          maxlength="240"
          placeholder="Ask anything — e.g. 'Should I max Surge or Piper next?' or 'Why am I stuck under 50k?'"
        />
        <button type="submit" id="coach-ask-btn" class="btn btn-gold">Ask AI Coach</button>
      </form>

      <div id="coach-feed" class="overview-stack"></div>
    </section>
  `;

  document.getElementById("coach-ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    askAiCoach(document.getElementById("coach-question-input").value.trim());
  });
  document.querySelectorAll(".coach-prompt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.dataset.q || "";
      document.getElementById("coach-question-input").value = q;
      askAiCoach(q);
    });
  });

  renderCoachFeed();
}

function renderCoachWorkspace() {
  const ws = document.getElementById("coach-workspace");
  const p = COACH_STATE.profile;
  if (!ws || !p) return;

  const isClub = COACH_STATE.type === "club";
  const diff50k = (isClub ? p.avg_trophies : p.trophies) - 50000;
  const diffTxt = `${diff50k >= 0 ? "+" : "-"}${Math.abs(diff50k).toLocaleString()} 🏆`;
  const bs = p.battle_stats || {};

  const kpis = isClub
    ? `
      <div class="stat-tile"><span>Avg Member 🏆</span><strong class="gold-text">🏆 ${p.avg_trophies.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>vs 50k Avg</span><strong class="${diff50k >= 0 ? "green-text" : "red-text"}">${diffTxt}</strong></div>
      <div class="stat-tile"><span>Members</span><strong>${p.member_count} / 30</strong></div>
      <div class="stat-tile"><span>Strict Rating</span><strong class="gold-text">${p.rating?.score ?? "--"} / 10</strong></div>
    `
    : `
      <div class="stat-tile"><span>Trophies</span><strong class="gold-text">🏆 ${p.trophies.toLocaleString()}</strong></div>
      <div class="stat-tile"><span>vs 50k Avg</span><strong class="${diff50k >= 0 ? "green-text" : "red-text"}">${diffTxt}</strong></div>
      <div class="stat-tile"><span>Recent WR</span><strong class="${(bs.win_rate ?? 50) >= 55 ? "green-text" : "red-text"}">${bs.win_rate != null ? `${bs.win_rate}%` : "N/A"}</strong></div>
      <div class="stat-tile"><span>Level 11s</span><strong class="green-text">${p.power11_count} / ${p.brawlers_owned}</strong></div>
      <div class="stat-tile"><span>Strict Rating</span><strong class="gold-text">${p.rating?.score ?? "--"} / 10</strong></div>
    `;

  const lookupHref = isClub
    ? `/lookup/?club=${encodeURIComponent(p.tag)}`
    : `/lookup/?player=${encodeURIComponent(p.tag)}`;

  const tabsHtml = isClub
    ? `
      <button type="button" class="lookup-dyn-tab ${COACH_STATE.subTab === "chat" ? "active" : ""}" data-ctab="chat">✦ AI Chat</button>
      <button type="button" class="lookup-dyn-tab ${COACH_STATE.subTab === "plan" ? "active" : ""}" data-ctab="plan">📋 Clan Action Plan</button>
    `
    : `
      <button type="button" class="lookup-dyn-tab ${COACH_STATE.subTab === "chat" ? "active" : ""}" data-ctab="chat">✦ AI Chat</button>
      <button type="button" class="lookup-dyn-tab ${COACH_STATE.subTab === "roadmap" ? "active" : ""}" data-ctab="roadmap">🗺 Goal Roadmap</button>
      <button type="button" class="lookup-dyn-tab ${COACH_STATE.subTab === "plan" ? "active" : ""}" data-ctab="plan">📋 Action Plan</button>
      <button type="button" class="lookup-dyn-tab ${COACH_STATE.subTab === "upgrade" ? "active" : ""}" data-ctab="upgrade">⬆ Upgrade Guide</button>
    `;

  ws.innerHTML = `
    <div class="panel dyn-fade">
      <div class="profile-top-row" style="margin-bottom:12px;">
        <div>
          <h2 class="brawl-title profile-name">${isClub ? "🛡 " : ""}${BV.esc(p.name)}</h2>
          <span class="profile-tag">${BV.esc(p.tag)}</span>
        </div>
        <div class="profile-actions">
          <a href="${lookupHref}" class="btn btn-ghost btn-sm">Stats &amp; Matches →</a>
        </div>
      </div>
      <div class="stats-grid">${kpis}</div>
    </div>

    <nav class="lookup-dyn-tabs" aria-label="AI Coach sections">${tabsHtml}</nav>
    <div id="coach-tab-content"></div>
  `;

  ws.querySelectorAll("[data-ctab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      COACH_STATE.subTab = btn.dataset.ctab;
      ws.querySelectorAll("[data-ctab]").forEach((b) => b.classList.toggle("active", b === btn));
      renderCoachTabContent();
    });
  });

  renderCoachTabContent();
}

function renderCoachFeed() {
  const feed = document.getElementById("coach-feed");
  if (!feed) return;
  if (!COACH_STATE.messages.length) {
    feed.innerHTML = `<div class="ai-coach-output"><div class="muted-tag">Pick a quick prompt above or ask any question to start coaching.</div></div>`;
    return;
  }
  feed.innerHTML = COACH_STATE.messages
    .map(
      (msg) => `
        <div class="ai-coach-output dyn-fade">
          <div class="verdict-eyebrow" style="margin-bottom:6px;">${BV.esc(msg.title)}</div>
          ${
            msg.loading
              ? `<div class="muted-tag">Analyzing live stats &amp; meta with Gemini AI...</div>`
              : msg.error
                ? `<div class="muted-tag">${BV.esc(msg.error)}</div>`
                : `<div class="ai-coach-prose">${formatCoachMarkdown(msg.text)}</div>`
          }
        </div>
      `
    )
    .join("");
}

async function askAiCoach(question = "") {
  const badge = document.getElementById("coach-status-badge");
  const btn = document.getElementById("coach-ask-btn");
  if (!COACH_STATE.profile) return;

  const entry = {
    title: question ? `Q: ${question}` : "✦ FULL COACHING BREAKDOWN",
    loading: true,
    text: "",
    error: "",
  };
  COACH_STATE.messages.unshift(entry);
  COACH_STATE.messages = COACH_STATE.messages.slice(0, 6);
  renderCoachFeed();

  if (badge) badge.textContent = "THINKING...";
  if (btn) btn.disabled = true;

  try {
    const res = await BV.apiFetch("/api/v1/coach", {
      method: "POST",
      body: JSON.stringify({
        target_type: COACH_STATE.type,
        tag: COACH_STATE.profile.tag,
        question,
      }),
    });
    entry.loading = false;
    if (res.ai_enabled && res.response) {
      entry.text = res.response;
      if (badge) badge.textContent = "AI LIVE";
    } else {
      entry.error = res.message || "AI Coach could not generate a response right now.";
      if (badge) badge.textContent = "UNAVAILABLE";
    }
  } catch (err) {
    entry.loading = false;
    entry.error = err.message || "Could not reach AI Coach.";
    if (badge) badge.textContent = "ERROR";
  } finally {
    if (btn) btn.disabled = false;
    renderCoachFeed();
  }
}

async function loadCoachTarget(type, rawTag) {
  await BV.authReady;
  const ws = document.getElementById("coach-workspace");
  if (!BV.getAuthUser()) {
    ws.innerHTML = BV.renderAiAuthGate(
      "Sign in with Google to Use AI Coach",
      "Get personalized Gemini AI coaching, your 4-stage Goal Roadmap, Action Plan, and Level 11 Upgrade Guide — 100% free with a Google account."
    );
    return;
  }

  const norm = BV.normalizeTag(rawTag);
  const btn = document.getElementById("coach-load-btn");
  if (!norm || norm.length < 4) {
    ws.innerHTML = `<div class="empty-card error-card">Enter a valid Brawl Stars tag (e.g. #2PP).</div>`;
    return;
  }

  document.getElementById("coach-tag-input").value = norm;
  btn.disabled = true;
  btn.textContent = "Loading...";
  ws.innerHTML = `<div class="empty-card">Loading live ${type} profile for ${BV.esc(norm)}...</div>`;

  try {
    const data =
      type === "club"
        ? await BV.apiFetch(`/api/v1/club/${encodeURIComponent(BV.tagForUrl(norm))}`)
        : await BV.fetchPlayer(norm, true);
    COACH_STATE.type = type;
    COACH_STATE.tag = norm;
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    COACH_STATE.subTab = urlTab && ["chat", "roadmap", "plan", "upgrade"].includes(urlTab) ? urlTab : "chat";
    COACH_STATE.profile = data;
    COACH_STATE.upgradeData = null;
    COACH_STATE.messages = [];
    renderCoachWorkspace();
    if (COACH_STATE.subTab === "chat") askAiCoach("");
  } catch (err) {
    ws.innerHTML = `<div class="empty-card error-card">${BV.esc(err.message || "Could not load tag.")}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Load";
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  document.querySelectorAll("[data-ctype]").forEach((btn) => {
    btn.addEventListener("click", () => setCoachType(btn.dataset.ctype));
  });

  document.getElementById("coach-load-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadCoachTarget(COACH_STATE.type, document.getElementById("coach-tag-input").value);
  });

  const ws = document.getElementById("coach-workspace");
  const initCoachView = () => {
    if (!BV.getAuthUser()) {
      ws.innerHTML = BV.renderAiAuthGate(
        "Sign in with Google to Use AI Coach",
        "Get personalized Gemini AI coaching, your 4-stage Goal Roadmap, Action Plan, and Level 11 Upgrade Guide — 100% free with a Google account."
      );
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const qPlayer = params.get("player");
    const qClub = params.get("club");
    if (qClub) {
      setCoachType("club");
      loadCoachTarget("club", qClub);
    } else if (qPlayer) {
      setCoachType("player");
      loadCoachTarget("player", qPlayer);
    } else {
      const saved = BV.getSavedTag();
      if (saved) {
        document.getElementById("coach-tag-input").value = saved;
        loadCoachTarget("player", saved);
      } else {
        ws.innerHTML = `<div class="empty-card">You're signed in! Click your profile pill at the top right to save your #TAG, or enter any tag above to start AI Coaching.</div>`;
      }
    }
  };

  await BV.authReady;
  initCoachView();
  BV.onAuthChange(() => initCoachView());
});
