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
  activeChatId: null,
  usage: null,
};

// ==================== PERSISTENT AI CHAT HISTORY ====================
function getChatStorageKey() {
  const uid = BV.getAuthUser()?.id || "anon";
  return `bv_coach_chats_v1_${uid}`;
}

function getSeenTargetKey(type, tag) {
  const uid = BV.getAuthUser()?.id || "anon";
  return `bv_coach_seen_v1_${uid}_${type}_${BV.normalizeTag(tag)}`;
}

function hasEverChattedTarget(type, tag) {
  try {
    return localStorage.getItem(getSeenTargetKey(type, tag)) === "1";
  } catch {
    return false;
  }
}

function markChattedTarget(type, tag) {
  try {
    localStorage.setItem(getSeenTargetKey(type, tag), "1");
  } catch {
    // ignore storage errors
  }
}

function loadAllChats() {
  try {
    const raw = localStorage.getItem(getChatStorageKey());
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAllChats(chats, skipCloud = false) {
  const trimmed = (chats || []).slice(0, 25);
  try {
    localStorage.setItem(getChatStorageKey(), JSON.stringify(trimmed));
  } catch {
    // ignore quota errors
  }
  if (!skipCloud && BV.getAuthUser()) {
    BV.apiFetch("/api/v1/coach/history", {
      method: "POST",
      body: JSON.stringify({ chats: trimmed }),
    }).catch(() => {});
  }
}

let _cloudChatsSyncedUid = null;
async function syncChatsFromCloud() {
  const user = BV.getAuthUser();
  if (!user || _cloudChatsSyncedUid === user.id) return;
  _cloudChatsSyncedUid = user.id;
  try {
    const res = await BV.apiFetch("/api/v1/coach/history");
    const remote = Array.isArray(res?.chats) ? res.chats : [];
    const local = loadAllChats();
    if (!remote.length && !local.length) return;

    const byId = new Map();
    for (const c of [...remote, ...local]) {
      if (!c || !c.id) continue;
      const prev = byId.get(c.id);
      if (!prev || (c.updatedAt || 0) > (prev.updatedAt || 0)) {
        byId.set(c.id, c);
      }
    }
    const merged = Array.from(byId.values())
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
      .slice(0, 25);

    saveAllChats(merged, true);
    if (local.length > remote.length) {
      saveAllChats(merged, false);
    }
    if (COACH_STATE.profile && !COACH_STATE.messages.length) {
      const targetChats = getChatsForTarget(COACH_STATE.type, COACH_STATE.profile.tag);
      if (targetChats.length) {
        COACH_STATE.activeChatId = targetChats[0].id;
        COACH_STATE.messages = targetChats[0].messages.map((m) => ({ ...m, loading: false }));
        renderCoachFeed();
      }
    }
    renderChatHistoryBar();
  } catch {
    // ignore offline/sync error
  }
}

function getChatsForTarget(type, tag) {
  const norm = BV.normalizeTag(tag);
  return loadAllChats()
    .filter((c) => c.type === type && c.tag === norm && Array.isArray(c.messages) && c.messages.length > 0)
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function persistActiveChat(questionHint = "") {
  if (!COACH_STATE.profile) return;
  const cleanMsgs = COACH_STATE.messages
    .filter((m) => !m.loading && (m.text || m.error))
    .slice(0, 20)
    .map((m) => ({
      title: m.title,
      text: m.text || "",
      error: m.error || "",
      ts: m.ts || Date.now(),
    }));
  if (!cleanMsgs.length) return;

  const chats = loadAllChats();
  const now = Date.now();
  const normTag = BV.normalizeTag(COACH_STATE.profile.tag);
  markChattedTarget(COACH_STATE.type, normTag);

  let chat = COACH_STATE.activeChatId ? chats.find((c) => c.id === COACH_STATE.activeChatId) : null;
  if (!chat) {
    const rawTitle = (questionHint || "").trim() || "Full Breakdown";
    const shortTitle = rawTitle.length > 34 ? `${rawTitle.slice(0, 34)}…` : rawTitle;
    chat = {
      id: `chat_${now}_${Math.random().toString(36).slice(2, 6)}`,
      type: COACH_STATE.type,
      tag: normTag,
      name: COACH_STATE.profile.name || normTag,
      title: shortTitle,
      createdAt: now,
      updatedAt: now,
      messages: cleanMsgs,
    };
    chats.unshift(chat);
    COACH_STATE.activeChatId = chat.id;
  } else {
    chat.messages = cleanMsgs;
    chat.updatedAt = now;
    chat.name = COACH_STATE.profile.name || chat.name;
  }

  chats.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  saveAllChats(chats);
  renderChatHistoryBar();
}

function formatRelTime(ts) {
  if (!ts) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return "just now";
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function startNewChat() {
  COACH_STATE.activeChatId = null;
  COACH_STATE.messages = [];
  const input = document.getElementById("coach-question-input");
  if (input) {
    input.value = "";
    input.focus();
  }
  const badge = document.getElementById("coach-status-badge");
  if (badge) badge.textContent = "NEW CHAT";
  renderChatHistoryBar();
  renderCoachFeed();
}

function openChatSession(chatId) {
  const chats = loadAllChats();
  const found = chats.find((c) => c.id === chatId);
  if (!found) return;
  COACH_STATE.activeChatId = found.id;
  COACH_STATE.messages = (found.messages || []).map((m) => ({ ...m, loading: false }));
  const badge = document.getElementById("coach-status-badge");
  if (badge) badge.textContent = "HISTORY";
  renderChatHistoryBar();
  renderCoachFeed();
}

function deleteChatSession(chatId) {
  const chats = loadAllChats().filter((c) => c.id !== chatId);
  saveAllChats(chats);
  if (COACH_STATE.activeChatId === chatId) {
    const remaining = COACH_STATE.profile ? getChatsForTarget(COACH_STATE.type, COACH_STATE.profile.tag) : [];
    if (remaining.length) {
      openChatSession(remaining[0].id);
    } else {
      startNewChat();
    }
  } else {
    renderChatHistoryBar();
  }
}

function renderChatHistoryBar() {
  const bar = document.getElementById("coach-history-bar");
  if (!bar || !COACH_STATE.profile) return;
  const chats = getChatsForTarget(COACH_STATE.type, COACH_STATE.profile.tag);
  if (!chats.length) {
    bar.innerHTML = "";
    bar.classList.add("hidden");
    return;
  }
  bar.classList.remove("hidden");
  bar.innerHTML = `
    <span class="coach-history-lbl">History:</span>
    <div class="coach-history-list">
      ${chats
        .slice(0, 8)
        .map((c) => {
          const active = c.id === COACH_STATE.activeChatId;
          return `
            <div class="coach-history-chip ${active ? "active" : ""}">
              <button type="button" class="coach-history-open" data-chat-id="${BV.esc(c.id)}" title="${BV.esc(c.title)}">
                <span class="coach-h-title">${BV.esc(c.title)}</span>
                <span class="coach-h-meta">${c.messages.length} • ${BV.esc(formatRelTime(c.updatedAt))}</span>
              </button>
              <button type="button" class="coach-history-del" data-del-chat="${BV.esc(c.id)}" aria-label="Delete chat" title="Delete chat">×</button>
            </div>
          `;
        })
        .join("")}
    </div>
  `;

  bar.querySelectorAll(".coach-history-open").forEach((btn) => {
    btn.addEventListener("click", () => openChatSession(btn.dataset.chatId));
  });
  bar.querySelectorAll(".coach-history-del").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChatSession(btn.dataset.delChat);
    });
  });
}

function updateCoachQuotaBadge() {
  const el = document.getElementById("coach-quota-badge");
  if (!el) return;
  const u = COACH_STATE.usage;
  if (!u || typeof u.remaining !== "number") {
    el.textContent = "";
    el.classList.add("hidden");
    return;
  }
  el.classList.remove("hidden");
  el.textContent = `${u.remaining}/${u.limit} left today`;
  el.style.color = u.remaining === 0 ? "var(--red)" : u.remaining <= 5 ? "var(--gold)" : "var(--text-muted)";
}

async function refreshCoachUsage() {
  try {
    const res = await BV.fetchAiUsage();
    if (res && res.coach) {
      COACH_STATE.usage = res.coach;
      updateCoachQuotaBadge();
    }
  } catch {
    // ignore
  }
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

function formatCoachMarkdown(raw) {
  const safe = BV.esc(String(raw || "").trim());
  const lines = safe.split(/\r?\n/);
  const out = [];
  let inList = false;

  const inlineFmt = (s) =>
    s
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label, rawUrl) => {
        const url = rawUrl.replace(/&amp;/g, "&");
        const isYt = /^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url);
        const isLocal = /^\/[a-zA-Z0-9_\-\/?=&%#.]*$/.test(url);
        if (isYt) {
          // Never allow hallucinated watch?v= or youtu.be/ IDs — always route to live YouTube search for the pro + topic
          const isSearchOrChannel = /youtube\.com\/(results\?search_query=|@|c\/|channel\/)/i.test(url);
          const cleanLabel = label.replace(/[*_`]/g, "").trim();
          const finalUrl = isSearchOrChannel
            ? url
            : `https://www.youtube.com/results?search_query=${encodeURIComponent(`${cleanLabel} Brawl Stars`)}`;
          return `<a href="${finalUrl}" target="_blank" rel="noopener noreferrer" class="coach-link-yt">▶ ${label}</a>`;
        }
        if (isLocal) {
          return `<a href="${url}" class="coach-link-site">↗ ${label}</a>`;
        }
        return label;
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

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
  const metaTopRecs = (COACH_STATE.upgradeData?.recommendations || []).filter((r) => r.unlocked);

  const weekly = [];
  if (metaTopRecs.length) {
    const top = metaTopRecs[0];
    const spNote = top.build?.star_power ? ` • Pro SP: ${BV.esc(top.build.star_power)}` : "";
    weekly.push(
      `<strong>#1 Upgrade Priority (Synced with Upgrade Guide):</strong> Max <strong>${BV.esc(top.name)}</strong> (${BV.esc(top.tier)}-tier, Lv ${top.current_power} → 11: ${top.coins_needed.toLocaleString()} Coins / ${top.pp_needed.toLocaleString()} PP${spNote}).`
    );
  } else if (nearMax.length) {
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
  const metaTopRecs = (COACH_STATE.upgradeData?.recommendations || []).filter((r) => r.unlocked);
  const spikes = COACH_STATE.upgradeData?.cheap_power_spikes || [];
  const cards = [];

  cards.push({
    category: "ROSTER & UPGRADES",
    tag: p.power11_count < 35 ? "HIGH IMPACT" : "FINE-TUNE",
    title: `Grow Maxed Pool (${p.power11_count} Level 11s)`,
    summary: `Average Power Level: ${p.avg_power} across ${p.brawlers_owned} owned brawlers.`,
    steps: [
      metaTopRecs.length
        ? `Top Meta Upgrades (Synced): ${metaTopRecs.slice(0, 3).map((r, i) => `#${i + 1} ${r.name} (${r.tier}-tier, Lv ${r.current_power}→11)`).join(" • ")}.`
        : nearMax.length
          ? `Closest to Level 11: ${nearMax.slice(0, 4).map((b) => `${b.name} (Lv ${b.power})`).join(" • ")}.`
          : "Focus all coins & power points on 1 S-tier brawler at a time instead of leveling evenly.",
      spikes.length
        ? `Cheapest Power Spikes (${spikes.length} Lv 11s missing kit): Finish ${spikes.slice(0, 3).map((s) => `${s.name} (${s.coins_needed.toLocaleString()}c)`).join(" • ")} first.`
        : "Prioritize Star Power + Gadget + 2 Gears on your Ranked mains before starting a new upgrade.",
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

  // Cheap Power Spikes: already-Lv11 brawlers missing Star Power, Gadget, or Gears
  const spikes = Array.isArray(u.cheap_power_spikes)
    ? u.cheap_power_spikes
    : (COACH_STATE.profile?.brawlers || [])
        .filter((b) => b.power >= 11)
        .map((b) => {
          const missing = [];
          let coins = 0;
          if (!(b.star_powers || []).length) { missing.push("Star Power"); coins += 2000; }
          if (!(b.gadgets || []).length) { missing.push("Gadget"); coins += 1000; }
          const mg = Math.max(0, 2 - (b.gears || []).length);
          if (mg > 0) { missing.push(`${mg} Gear${mg > 1 ? "s" : ""}`); coins += mg * 1000; }
          return missing.length
            ? { id: b.id, name: b.name, tier: "A", trophies: b.trophies || 0, missing, coins_needed: coins, build: {} }
            : null;
        })
        .filter(Boolean);

  const spikesHtml = spikes.length
    ? `
      <section class="panel dyn-fade" style="margin-bottom:14px;">
        <div class="coaching-header" style="margin-bottom:10px;">
          <div>
            <div class="verdict-eyebrow">⚡ CHEAPEST RANKED POWER SPIKES • FINISH YOUR LV 11 KITS FIRST</div>
            <h3 class="brawl-title coaching-heading">${spikes.length} Level 11 Brawler${spikes.length === 1 ? "" : "s"} Missing Kit</h3>
          </div>
          <span class="stat-chip chip-pick">NO POWER POINTS NEEDED</span>
        </div>
        <div class="upgrade-grid">
          ${spikes
            .slice(0, 8)
            .map((sp) => {
              const b = sp.build || {};
              return `
                <article class="upgrade-card">
                  <div class="upgrade-card-head">
                    <div class="upgrade-identity">
                      <img src="${BV.resolvePortraitUrl(sp.portrait, sp.id)}" alt="${BV.esc(sp.name)}" loading="lazy" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${sp.id}.png'" />
                      <div>
                        <div class="upgrade-name-line">
                          <span class="upgrade-name">${BV.esc(sp.name)}</span>
                          ${sp.tier ? `<span class="tier-pill tier-${sp.tier.toLowerCase()}">${sp.tier}</span>` : ""}
                        </div>
                        <div class="upgrade-level-row">
                          <span class="level-tag">Lv 11 • ${(sp.trophies || 0).toLocaleString()} 🏆</span>
                        </div>
                      </div>
                    </div>
                    <span class="cost-chip cost-coins">🪙 ${sp.coins_needed.toLocaleString()}</span>
                  </div>
                  <div class="build-box">
                    <div class="build-title">MISSING: ${BV.esc(sp.missing.join(" + "))}</div>
                    ${b.star_power ? `<div class="build-row"><span class="build-key">★ SP</span><span class="build-val">${BV.esc(b.star_power)}${b.owns_star_power ? '<span class="owned-badge">✓</span>' : ""}</span></div>` : ""}
                    ${b.gadget ? `<div class="build-row"><span class="build-key">⚙ Gadget</span><span class="build-val">${BV.esc(b.gadget)}${b.owns_gadget ? '<span class="owned-badge">✓</span>' : ""}</span></div>` : ""}
                    ${(b.gears || []).length ? `<div class="build-row"><span class="build-key">⛨ Gears</span><span class="build-val">${BV.esc(b.gears.join(" + "))}</span></div>` : ""}
                  </div>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    `
    : "";

  box.innerHTML = `
    ${spikesHtml}
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
        { label: "Who Should I Upgrade Next?", q: "Based on my Lv 9-10 brawlers, exact Coin/PP costs, and the current S-tier meta, which exact 3 brawlers should I max to Lv 11 next and with what Pro Build?" },
        { label: "Ranked Role Gaps", q: "Audit my Level 11 role coverage (Tanks, Marksmen, Throwers, Assassins, Controllers, Support) and tell me which missing roles are hurting me most in Ranked." },
        { label: "Best 3 Brawlers to Push", q: "Which exact 3 brawlers on my account should I push to 1,000 trophies or farm first this week and why?" },
        { label: "Fix My Recent Losses", q: "Break down my recent mode W-L and most-lost brawlers to tell me exactly why I am losing games and what to stop doing." },
        { label: "Honest Roast", q: "Roast my account brutally using my real stats vs the 50k average, then give me 2 fast fixes." },
      ];

  slot.innerHTML = `
    <section class="panel ai-coach-panel dyn-fade">
      <div class="coaching-header">
        <div>
          <div class="verdict-eyebrow">✦ INTERACTIVE VAULT AI COACH</div>
          <h3 class="brawl-title coaching-heading">Ask About ${BV.esc(p.name)}</h3>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <button type="button" id="coach-new-chat-btn" class="btn btn-ghost btn-sm">+ New Chat</button>
          <span id="coach-quota-badge" class="stat-chip hidden"></span>
          <span id="coach-status-badge" class="stat-chip">READY</span>
        </div>
      </div>

      <div id="coach-history-bar" class="coach-history-bar hidden"></div>

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
          maxlength="380"
          placeholder="Ask anything — e.g. 'Should I max Surge or Piper next?' or follow up on the last answer..."
        />
        <button type="submit" id="coach-ask-btn" class="btn btn-gold">Ask AI Coach</button>
      </form>

      <div id="coach-feed" class="overview-stack"></div>
    </section>
  `;

  document.getElementById("coach-new-chat-btn").addEventListener("click", startNewChat);
  document.getElementById("coach-ask-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = document.getElementById("coach-question-input");
    const q = input.value.trim();
    input.value = "";
    askAiCoach(q);
  });
  document.querySelectorAll(".coach-prompt-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const q = btn.dataset.q || "";
      askAiCoach(q);
    });
  });

  renderChatHistoryBar();
  renderCoachFeed();
  updateCoachQuotaBadge();
  if (!COACH_STATE.usage) refreshCoachUsage();
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
    feed.innerHTML = `<div class="ai-coach-output"><div class="muted-tag">New chat — pick a quick prompt above or ask any question below.</div></div>`;
    return;
  }
  feed.innerHTML = COACH_STATE.messages
    .map(
      (msg) => `
        <div class="ai-coach-output dyn-fade">
          <div class="coach-msg-head">
            <div class="verdict-eyebrow">${BV.esc(msg.title)}</div>
            ${msg.ts ? `<span class="coach-msg-time">${BV.esc(formatRelTime(msg.ts))}</span>` : ""}
          </div>
          ${
            msg.loading
              ? `<div class="muted-tag">Analyzing live stats &amp; meta with Vault AI...</div>`
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

  // Build multi-turn conversation history (oldest -> newest) from completed turns before adding the new one
  const historyTurns = [];
  const completedPrior = COACH_STATE.messages
    .filter((m) => !m.loading && m.text)
    .slice(0, 4)
    .reverse();
  for (const m of completedPrior) {
    const qText = (m.title || "").replace(/^Q:\s*/, "").trim() || "Full Coaching Breakdown";
    historyTurns.push({ role: "user", text: qText });
    historyTurns.push({ role: "model", text: String(m.text).slice(0, 1400) });
  }

  const entry = {
    title: question ? `Q: ${question}` : "✦ FULL COACHING BREAKDOWN",
    loading: true,
    text: "",
    error: "",
    ts: Date.now(),
  };
  COACH_STATE.messages.unshift(entry);
  COACH_STATE.messages = COACH_STATE.messages.slice(0, 20);
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
        history: historyTurns,
      }),
    });
    entry.loading = false;
    if (res.usage) {
      COACH_STATE.usage = res.usage;
      updateCoachQuotaBadge();
    }
    if (res.ai_enabled && res.response) {
      entry.text = res.response;
      if (badge) badge.textContent = "AI LIVE";
      persistActiveChat(question || "Full Breakdown");
    } else {
      entry.error = res.message || "AI Coach could not generate a response right now.";
      if (badge) badge.textContent = "UNAVAILABLE";
    }
  } catch (err) {
    entry.loading = false;
    entry.error = err.message || "Could not reach AI Coach.";
    if (badge) badge.textContent = err.status === 429 ? "LIMIT REACHED" : "ERROR";
    if (err.status === 429) refreshCoachUsage();
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
      "Get personalized Vault AI coaching, your 4-stage Goal Roadmap, Action Plan, and Level 11 Upgrade Guide — 100% free with a Google account."
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
    let data = null;
    let upgradeData = null;
    if (type === "club") {
      data = await BV.apiFetch(`/api/v1/club/${encodeURIComponent(BV.tagForUrl(norm))}`);
    } else {
      const [pData, uData] = await Promise.all([
        BV.fetchPlayer(norm, true),
        BV.apiFetch(`/api/v1/player/${encodeURIComponent(BV.tagForUrl(norm))}/upgrade-guide`).catch(() => null),
      ]);
      data = pData;
      upgradeData = uData;
    }
    COACH_STATE.type = type;
    COACH_STATE.tag = norm;
    const urlTab = new URLSearchParams(window.location.search).get("tab");
    COACH_STATE.subTab = urlTab && ["chat", "roadmap", "plan", "upgrade"].includes(urlTab) ? urlTab : "chat";
    COACH_STATE.profile = data;
    COACH_STATE.upgradeData = upgradeData;

    const savedChats = getChatsForTarget(type, norm);
    const isFirstTime = savedChats.length === 0 && !hasEverChattedTarget(type, norm);
    if (savedChats.length > 0) {
      COACH_STATE.activeChatId = savedChats[0].id;
      COACH_STATE.messages = savedChats[0].messages.map((m) => ({ ...m, loading: false }));
    } else {
      COACH_STATE.activeChatId = null;
      COACH_STATE.messages = [];
    }

    renderCoachWorkspace();
    if (isFirstTime && COACH_STATE.subTab === "chat") {
      markChattedTarget(type, norm);
      askAiCoach("");
    }
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
        "Get personalized Vault AI coaching, your 4-stage Goal Roadmap, Action Plan, and Level 11 Upgrade Guide — 100% free with a Google account."
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
  await syncChatsFromCloud();
  initCoachView();
  BV.onAuthChange(async () => {
    await syncChatsFromCloud();
    initCoachView();
  });
});
