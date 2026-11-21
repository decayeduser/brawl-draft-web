// ============================================================================
// Raspberry Pi 5 API Configuration (Tailscale Funnel)
// ============================================================================
const PI5_API_BASE_URL = "https://dull.tailed6f04.ts.net";
const PI5_API_KEY = "JmRP^Q!(uJ@,3Vmv]#~%EJSw--FzpC";
// ============================================================================

const CLEAN_BASE_URL = PI5_API_BASE_URL.trim().replace(/\/+$/, "");

const STATE = {
  brawlers: [],
  mapsByMode: {},
  mode: "gemGrab",
  map: "Hard Rock Mine",
  isFirstPickTeam: true,
  activeSnakeSlot: 1,
  assignMode: "auto",
  mobileView: "recs",
  bans: [null, null, null, null, null, null],
  allyPicks: [null, null, null],
  enemyPicks: [null, null, null],
  searchQuery: "",
};

let latestRequestId = 0;

function resolvePortraitUrl(portraitPath, brawlerId) {
  const cdnUrl = `https://cdn.brawlify.com/brawlers/borderless/${brawlerId}.png`;
  if (!portraitPath) return cdnUrl;
  if (portraitPath.startsWith("http://") || portraitPath.startsWith("https://")) {
    return portraitPath;
  }
  if (CLEAN_BASE_URL && portraitPath.startsWith("/")) {
    return `${CLEAN_BASE_URL}${portraitPath}`;
  }
  return cdnUrl;
}

function getSlotMapping(snakeSlot, blueIsFirst) {
  const fpTable = {
    1: { isFirstPickSide: true, teamSlot: 0 },
    2: { isFirstPickSide: false, teamSlot: 0 },
    3: { isFirstPickSide: false, teamSlot: 1 },
    4: { isFirstPickSide: true, teamSlot: 1 },
    5: { isFirstPickSide: true, teamSlot: 2 },
    6: { isFirstPickSide: false, teamSlot: 2 },
  };
  const entry = fpTable[snakeSlot];
  const isAlly = entry.isFirstPickSide === blueIsFirst;
  return {
    team: isAlly ? "ally" : "enemy",
    teamSlot: entry.teamSlot,
    isFirstPickSide: entry.isFirstPickSide,
    label: isAlly ? `BLUE #${entry.teamSlot + 1}` : `RED #${entry.teamSlot + 1}`,
  };
}

function getBrawlerByName(name) {
  if (!name) return null;
  return STATE.brawlers.find((b) => b.name === name) || null;
}

function getTakenMap() {
  const map = new Map();
  STATE.bans.forEach((b) => b && map.set(b, "ban"));
  STATE.allyPicks.forEach((b) => b && map.set(b, "ally"));
  STATE.enemyPicks.forEach((b) => b && map.set(b, "enemy"));
  return map;
}

function findNextEmptySnakeSlot(startSlot) {
  for (let s = startSlot; s <= 6; s++) {
    const m = getSlotMapping(s, STATE.isFirstPickTeam);
    const val = m.team === "ally" ? STATE.allyPicks[m.teamSlot] : STATE.enemyPicks[m.teamSlot];
    if (!val) return s;
  }
  for (let s = 1; s < startSlot; s++) {
    const m = getSlotMapping(s, STATE.isFirstPickTeam);
    const val = m.team === "ally" ? STATE.allyPicks[m.teamSlot] : STATE.enemyPicks[m.teamSlot];
    if (!val) return s;
  }
  return startSlot;
}

async function apiFetch(endpointPath, options = {}) {
  const fullUrl = `${CLEAN_BASE_URL}${endpointPath}`;
  const headers = Object.assign(
    {
      "Content-Type": "application/json",
      "X-API-Key": PI5_API_KEY,
    },
    options.headers || {}
  );

  const resp = await fetch(fullUrl, {
    ...options,
    headers,
    mode: "cors",
  });

  if (!resp.ok) {
    throw new Error(`HTTP ${resp.status}`);
  }
  return resp.json();
}

async function loadMetadata() {
  try {
    const data = await apiFetch("/api/v1/metadata");

    STATE.brawlers = (data.brawlers || []).map((b) => ({
      ...b,
      portrait: resolvePortraitUrl(b.portrait, b.id),
      cdnFallback: `https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`,
    }));

    STATE.mapsByMode = data.maps_by_mode || {};

    const modeSelect = document.getElementById("mode-select");
    modeSelect.innerHTML = "";
    Object.keys(STATE.mapsByMode).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = m.replace(/([A-Z])/g, " $1").toUpperCase();
      modeSelect.appendChild(opt);
    });

    if (!STATE.mapsByMode[STATE.mode]) {
      STATE.mode = Object.keys(STATE.mapsByMode)[0] || "gemGrab";
    }
    modeSelect.value = STATE.mode;
    populateMapsForMode();

    const stats = data.stats || {};
    const trainedAt = stats.last_model_update
      ? new Date(stats.last_model_update * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Warmup";
    const apiOk = stats.api_status?.ok !== false;
    document.getElementById("api-status-dot").className = apiOk ? "dot online" : "dot warn";
    document.getElementById("model-status-text").textContent =
      `Pi 5 Online • ${stats.total_matches || 0} Matches • ${stats.tracked_top_players || 0} Pros • ${trainedAt}`;

    renderAll();
    requestRecommendations();
  } catch (err) {
    console.warn("Pi 5 connection error, retrying in 10s:", err);
    document.getElementById("api-status-dot").className = "dot warn";
    document.getElementById("model-status-text").textContent =
      "Connecting to Pi 5... (Retrying)";
    setTimeout(loadMetadata, 10000);
  }
}

function populateMapsForMode() {
  const mapSelect = document.getElementById("map-select");
  mapSelect.innerHTML = "";
  const maps = STATE.mapsByMode[STATE.mode] || [];
  maps.forEach((mp) => {
    const opt = document.createElement("option");
    opt.value = mp;
    opt.textContent = mp;
    mapSelect.appendChild(opt);
  });
  STATE.map = maps[0] || "";
  mapSelect.value = STATE.map;
}

function renderTimelineAndBans() {
  const activeMap = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);
  const turnBadge = document.getElementById("active-turn-badge");
  turnBadge.textContent = `PICK #${STATE.activeSnakeSlot} • ${activeMap.team === "ally" ? "BLUE" : "RED"}`;
  turnBadge.className = `turn-pill ${activeMap.team === "ally" ? "blue-pill" : "red-pill"}`;

  const timelineEl = document.getElementById("snake-timeline");
  timelineEl.innerHTML = "";
  for (let slot = 1; slot <= 6; slot++) {
    const mapping = getSlotMapping(slot, STATE.isFirstPickTeam);
    const pickedName =
      mapping.team === "ally"
        ? STATE.allyPicks[mapping.teamSlot]
        : STATE.enemyPicks[mapping.teamSlot];

    const step = document.createElement("div");
    step.className = `snake-step ${mapping.team === "ally" ? "blue-step" : "red-step"} ${
      pickedName ? "filled-step" : ""
    } ${STATE.activeSnakeSlot === slot ? "active-step" : ""}`;

    const numEl = document.createElement("div");
    numEl.className = "snake-step-num";
    numEl.textContent = `#${slot}`;

    const valEl = document.createElement("div");
    valEl.className = "snake-step-val";
    valEl.textContent = pickedName || mapping.label;

    step.append(numEl, valEl);
    step.onclick = () => {
      STATE.activeSnakeSlot = slot;
      STATE.assignMode = "auto";
      syncAssignModeTabs();
      renderAll();
      requestRecommendations();
    };
    timelineEl.appendChild(step);
  }

  const banCount = STATE.bans.filter(Boolean).length;
  document.getElementById("ban-count-label").textContent = `${banCount} / 6`;

  const banContainer = document.getElementById("ban-slots");
  banContainer.innerHTML = "";
  STATE.bans.forEach((bName, idx) => {
    const bObj = getBrawlerByName(bName);
    const slotEl = document.createElement("div");
    slotEl.className = `ban-slot ${bObj ? "filled" : ""}`;
    slotEl.title = bObj ? `Banned: ${bObj.name} (Tap to remove)` : `Tap to assign Ban #${idx + 1}`;
    if (bObj) {
      const img = document.createElement("img");
      img.src = bObj.portrait;
      img.alt = bObj.name;
      img.onerror = () => { img.src = bObj.cdnFallback; };
      slotEl.appendChild(img);
    } else {
      const span = document.createElement("span");
      span.className = "ban-placeholder";
      span.textContent = `B${idx + 1}`;
      slotEl.appendChild(span);
    }
    slotEl.onclick = () => {
      if (STATE.bans[idx]) {
        STATE.bans[idx] = null;
        renderAll();
        requestRecommendations();
      } else {
        STATE.assignMode = "ban";
        syncAssignModeTabs();
        setMobileView("roster");
        renderAssignHint();
      }
    };
    banContainer.appendChild(slotEl);
  });
}

function renderTeamPanels() {
  document.getElementById("blue-pick-badge").textContent = STATE.isFirstPickTeam ? "1ST (1,4,5)" : "2ND (2,3,6)";
  document.getElementById("red-pick-badge").textContent = STATE.isFirstPickTeam ? "2ND (2,3,6)" : "1ST (1,4,5)";
  document.getElementById("mobile-blue-badge").textContent = STATE.isFirstPickTeam ? "1ST" : "2ND";
  document.getElementById("mobile-red-badge").textContent = STATE.isFirstPickTeam ? "2ND" : "1ST";

  const activeMap = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);

  const renderDesktopSide = (containerId, teamKey, picksArr) => {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    picksArr.forEach((bName, idx) => {
      const bObj = getBrawlerByName(bName);
      const isCurrentTarget = activeMap.team === teamKey && activeMap.teamSlot === idx;
      const card = document.createElement("div");
      card.className = `pick-slot ${isCurrentTarget ? "active-target" : ""}`;

      if (bObj) {
        const img = document.createElement("img");
        img.src = bObj.portrait;
        img.alt = bObj.name;
        img.onerror = () => { img.src = bObj.cdnFallback; };
        card.appendChild(img);
      } else {
        const empty = document.createElement("div");
        empty.className = "slot-empty-icon";
        empty.textContent = "?";
        card.appendChild(empty);
      }

      const meta = document.createElement("div");
      meta.className = "slot-meta";
      const num = document.createElement("span");
      num.className = "slot-number";
      num.textContent = `${teamKey === "ally" ? "BLUE" : "RED"} #${idx + 1}`;
      const nameSpan = document.createElement("span");
      nameSpan.className = "slot-brawler-name";
      nameSpan.textContent = bObj ? bObj.name : "Empty Slot";
      meta.append(num, nameSpan);
      card.appendChild(meta);

      if (bObj) {
        const clr = document.createElement("span");
        clr.className = "slot-clear";
        clr.textContent = "✕";
        card.appendChild(clr);
      }

      card.onclick = () => {
        if (picksArr[idx]) {
          picksArr[idx] = null;
          renderAll();
          requestRecommendations();
        } else {
          // Jump active snake slot to this team slot
          for (let s = 1; s <= 6; s++) {
            const m = getSlotMapping(s, STATE.isFirstPickTeam);
            if (m.team === teamKey && m.teamSlot === idx) {
              STATE.activeSnakeSlot = s;
              STATE.assignMode = "auto";
              syncAssignModeTabs();
              renderAll();
              requestRecommendations();
              break;
            }
          }
        }
      };
      el.appendChild(card);
    });
  };

  const renderMobileSide = (containerId, teamKey, picksArr) => {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    picksArr.forEach((bName, idx) => {
      const bObj = getBrawlerByName(bName);
      const isCurrentTarget = activeMap.team === teamKey && activeMap.teamSlot === idx;
      const slot = document.createElement("div");
      slot.className = `mini-slot ${bObj ? "filled" : ""} ${isCurrentTarget ? "active-target" : ""}`;
      slot.title = bObj ? `${bObj.name} (Tap to clear)` : `${teamKey === "ally" ? "Blue" : "Red"} #${idx + 1}`;
      if (bObj) {
        const img = document.createElement("img");
        img.src = bObj.portrait;
        img.alt = bObj.name;
        img.onerror = () => { img.src = bObj.cdnFallback; };
        slot.appendChild(img);
      } else {
        slot.textContent = idx + 1;
      }
      slot.onclick = () => {
        if (picksArr[idx]) {
          picksArr[idx] = null;
          renderAll();
          requestRecommendations();
        } else {
          for (let s = 1; s <= 6; s++) {
            const m = getSlotMapping(s, STATE.isFirstPickTeam);
            if (m.team === teamKey && m.teamSlot === idx) {
              STATE.activeSnakeSlot = s;
              STATE.assignMode = "auto";
              syncAssignModeTabs();
              renderAll();
              requestRecommendations();
              break;
            }
          }
        }
      };
      el.appendChild(slot);
    });
  };

  renderDesktopSide("ally-slots", "ally", STATE.allyPicks);
  renderDesktopSide("enemy-slots", "enemy", STATE.enemyPicks);
  renderMobileSide("mobile-ally-slots", "ally", STATE.allyPicks);
  renderMobileSide("mobile-enemy-slots", "enemy", STATE.enemyPicks);
}

function renderAssignHint() {
  const hint = document.getElementById("assign-hint");
  if (STATE.assignMode === "ban") {
    const count = STATE.bans.filter(Boolean).length;
    hint.innerHTML = `Tap a brawler to <strong>BAN</strong> (${count}/6 used)`;
  } else if (STATE.assignMode === "ally") {
    hint.innerHTML = `Tap a brawler to assign to <strong>BLUE TEAM</strong>`;
  } else if (STATE.assignMode === "enemy") {
    hint.innerHTML = `Tap a brawler to assign to <strong>RED TEAM</strong>`;
  } else {
    const mapping = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);
    hint.innerHTML = `Tap a brawler to fill <strong>PICK #${STATE.activeSnakeSlot} (${mapping.label})</strong>`;
  }
}

function renderBrawlerGrid() {
  renderAssignHint();
  const grid = document.getElementById("brawler-grid");
  grid.innerHTML = "";
  const takenMap = getTakenMap();
  const q = STATE.searchQuery.trim().toUpperCase();

  const filtered = STATE.brawlers.filter((b) => !q || b.name.includes(q));
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.style.gridColumn = "1 / -1";
    empty.textContent = STATE.brawlers.length ? `No brawlers matching "${STATE.searchQuery}"` : "Loading brawlers...";
    grid.appendChild(empty);
    return;
  }

  filtered.forEach((b) => {
    const status = takenMap.get(b.name);
    const tile = document.createElement("div");
    tile.className = `brawler-tile ${status ? "unavailable" : ""}`;

    const img = document.createElement("img");
    img.src = b.portrait;
    img.alt = b.name;
    img.loading = "lazy";
    img.onerror = () => { img.src = b.cdnFallback; };

    const nameEl = document.createElement("div");
    nameEl.className = "brawler-tile-name";
    nameEl.textContent = b.name;

    tile.append(img, nameEl);

    if (status) {
      const badge = document.createElement("span");
      badge.className = `tile-badge badge-${status}`;
      badge.textContent = status === "ban" ? "BAN" : status === "ally" ? "BLUE" : "RED";
      tile.appendChild(badge);
    } else {
      tile.onclick = () => assignBrawler(b.name);
    }
    grid.appendChild(tile);
  });
}

function assignBrawler(brawlerName) {
  if (getTakenMap().has(brawlerName)) return;

  if (STATE.assignMode === "ban") {
    const emptyBan = STATE.bans.indexOf(null);
    if (emptyBan !== -1) STATE.bans[emptyBan] = brawlerName;
  } else if (STATE.assignMode === "ally") {
    const emptyAlly = STATE.allyPicks.indexOf(null);
    if (emptyAlly !== -1) STATE.allyPicks[emptyAlly] = brawlerName;
  } else if (STATE.assignMode === "enemy") {
    const emptyEnemy = STATE.enemyPicks.indexOf(null);
    if (emptyEnemy !== -1) STATE.enemyPicks[emptyEnemy] = brawlerName;
  } else {
    const mapping = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);
    if (mapping.team === "ally") {
      STATE.allyPicks[mapping.teamSlot] = brawlerName;
    } else {
      STATE.enemyPicks[mapping.teamSlot] = brawlerName;
    }
    STATE.activeSnakeSlot = findNextEmptySnakeSlot(Math.min(6, STATE.activeSnakeSlot + 1));
  }

  renderAll();
  requestRecommendations();
}

async function requestRecommendations() {
  const reqId = ++latestRequestId;
  const recList = document.getElementById("recommendations-list");
  const spinner = document.getElementById("rec-loading");
  const mapping = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);

  document.getElementById("rec-subtitle").textContent =
    `Pick #${STATE.activeSnakeSlot} (${mapping.label}) • ${STATE.map}`;
  spinner.classList.remove("hidden");

  // Match trainer.py perspective: ally_picks = team currently picking, enemy_picks = opposing team
  const pickingIsAlly = mapping.team === "ally";
  const payload = {
    map: STATE.map,
    mode: STATE.mode,
    banned_brawlers: STATE.bans.filter(Boolean),
    ally_picks: (pickingIsAlly ? STATE.allyPicks : STATE.enemyPicks).filter(Boolean),
    enemy_picks: (pickingIsAlly ? STATE.enemyPicks : STATE.allyPicks).filter(Boolean),
    next_pick_slot: STATE.activeSnakeSlot,
    is_first_pick_team: mapping.isFirstPickSide,
  };

  try {
    const data = await apiFetch("/api/v1/draft/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (reqId !== latestRequestId) return;
    spinner.classList.add("hidden");

    recList.innerHTML = "";
    const recs = data.recommendations || [];
    if (!recs.length) {
      recList.innerHTML = `<div class="empty-state">No available brawlers left to recommend.</div>`;
      return;
    }

    recs.forEach((rec) => {
      const portraitSrc = resolvePortraitUrl(rec.portrait, rec.brawler_id);
      const fallbackSrc = `https://cdn.brawlify.com/brawlers/borderless/${rec.brawler_id}.png`;

      const card = document.createElement("div");
      card.className = `rec-card ${rec.rank <= 3 ? `rank-${rec.rank}` : ""}`;

      const rankEl = document.createElement("div");
      rankEl.className = "rec-rank";
      rankEl.textContent = `#${rec.rank}`;

      const img = document.createElement("img");
      img.src = portraitSrc;
      img.alt = rec.brawler;
      img.onerror = () => { img.src = fallbackSrc; };

      const info = document.createElement("div");
      info.className = "rec-info";

      const nameRow = document.createElement("div");
      nameRow.className = "rec-name-row";
      const bName = document.createElement("span");
      bName.className = "rec-brawler-name";
      bName.textContent = rec.brawler;
      const winRate = document.createElement("span");
      winRate.className = "rec-winrate";
      winRate.textContent = `${rec.win_probability}%`;
      nameRow.append(bName, winRate);

      const barBg = document.createElement("div");
      barBg.className = "rec-bar-bg";
      const barFill = document.createElement("div");
      barFill.className = "rec-bar-fill";
      barFill.style.width = `${Math.min(100, Math.max(15, rec.win_probability))}%`;
      barBg.appendChild(barFill);

      const reason = document.createElement("div");
      reason.className = "rec-reason";
      reason.textContent = rec.reason_tag;

      const statsRow = document.createElement("div");
      statsRow.className = "rec-stats-row";
      statsRow.innerHTML = `
        <span class="stat-chip">Map ${rec.map_win_rate}%</span>
        <span class="stat-chip">Syn ${rec.synergy_score}%</span>
        <span class="stat-chip">Ctr ${rec.counter_score}%</span>
      `;

      info.append(nameRow, barBg, reason, statsRow);

      const pickBtn = document.createElement("button");
      pickBtn.className = "btn btn-gold rec-pick-btn";
      pickBtn.textContent = "PICK";
      pickBtn.onclick = () => {
        STATE.assignMode = "auto";
        syncAssignModeTabs();
        assignBrawler(rec.brawler);
      };

      card.append(rankEl, img, info, pickBtn);
      recList.appendChild(card);
    });
  } catch (err) {
    if (reqId !== latestRequestId) return;
    spinner.classList.add("hidden");
    console.error("Failed to fetch recommendations:", err);
    recList.innerHTML = `<div class="empty-state">Could not reach Raspberry Pi 5 API. Check that the Pi is online.</div>`;
  }
}

function syncAssignModeTabs() {
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === STATE.assignMode);
  });
}

function setMobileView(view) {
  STATE.mobileView = view;
  const arena = document.querySelector(".draft-arena");
  if (arena) arena.dataset.mobileView = view;
  document.querySelectorAll(".mobile-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.view === view);
  });
}

function renderAll() {
  renderTimelineAndBans();
  renderTeamPanels();
  renderBrawlerGrid();
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("mode-select").addEventListener("change", (e) => {
    STATE.mode = e.target.value;
    populateMapsForMode();
    requestRecommendations();
  });

  document.getElementById("map-select").addEventListener("change", (e) => {
    STATE.map = e.target.value;
    requestRecommendations();
  });

  document.getElementById("first-pick-toggle").addEventListener("click", (e) => {
    STATE.isFirstPickTeam = !STATE.isFirstPickTeam;
    const btn = e.currentTarget;
    if (STATE.isFirstPickTeam) {
      btn.textContent = "BLUE 1ST";
      btn.className = "btn btn-blue";
    } else {
      btn.textContent = "RED 1ST";
      btn.className = "btn btn-red";
    }
    renderAll();
    requestRecommendations();
  });

  document.getElementById("reset-draft-btn").addEventListener("click", () => {
    STATE.bans = [null, null, null, null, null, null];
    STATE.allyPicks = [null, null, null];
    STATE.enemyPicks = [null, null, null];
    STATE.activeSnakeSlot = 1;
    STATE.assignMode = "auto";
    syncAssignModeTabs();
    renderAll();
    requestRecommendations();
  });

  const searchInput = document.getElementById("brawler-search");
  const clearBtn = document.getElementById("clear-search-btn");
  searchInput.addEventListener("input", (e) => {
    STATE.searchQuery = e.target.value;
    clearBtn.classList.toggle("hidden", !STATE.searchQuery);
    renderBrawlerGrid();
  });

  clearBtn.addEventListener("click", () => {
    STATE.searchQuery = "";
    searchInput.value = "";
    clearBtn.classList.add("hidden");
    renderBrawlerGrid();
    searchInput.focus();
  });

  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.assignMode = btn.dataset.target;
      syncAssignModeTabs();
      renderAssignHint();
    });
  });

  document.querySelectorAll(".mobile-tab").forEach((btn) => {
    btn.addEventListener("click", () => setMobileView(btn.dataset.view));
  });

  loadMetadata();
});
