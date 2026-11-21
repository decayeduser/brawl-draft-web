// ============================================================================
// CHANGE THESE 2 VALUES BEFORE PUSHING TO GITHUB:
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
  bans: [null, null, null, null, null, null],
  allyPicks: [null, null, null],
  enemyPicks: [null, null, null],
  searchQuery: "",
};

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
    label: isAlly ? `BLUE #${entry.teamSlot + 1}` : `RED #${entry.teamSlot + 1}`,
  };
}

function getBrawlerByName(name) {
  if (!name) return null;
  return STATE.brawlers.find((b) => b.name === name) || null;
}

function getUnavailableSet() {
  const set = new Set();
  STATE.bans.forEach((b) => b && set.add(b));
  STATE.allyPicks.forEach((b) => b && set.add(b));
  STATE.enemyPicks.forEach((b) => b && set.add(b));
  return set;
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
      `Pi 5 Online • ${stats.total_matches || 0} Matches • ${stats.tracked_top_players || 0} Pros • Model Updated ${trainedAt}`;

    renderAll();
    requestRecommendations();
  } catch (err) {
    console.warn("Pi 5 connection error, retrying in 10s:", err);
    document.getElementById("api-status-dot").className = "dot warn";
    document.getElementById("model-status-text").textContent =
      "Waiting for Raspberry Pi 5 Cloudflare Tunnel... (Retrying automatically)";
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
    opt.textContent = mp.toUpperCase();
    mapSelect.appendChild(opt);
  });
  STATE.map = maps[0] || "";
  mapSelect.value = STATE.map;
}

function renderTimelineAndBans() {
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
      STATE.activeSnakeSlot === slot ? "active-step" : ""
    }`;
    step.innerHTML = `
      <div>PICK #${slot}</div>
      <div style="font-size:11px; color:#ffd000;">${pickedName || mapping.label}</div>
    `;
    step.onclick = () => {
      STATE.activeSnakeSlot = slot;
      STATE.assignMode = "auto";
      syncAssignModeTabs();
      renderAll();
      requestRecommendations();
    };
    timelineEl.appendChild(step);
  }

  const banContainer = document.getElementById("ban-slots");
  banContainer.innerHTML = "";
  STATE.bans.forEach((bName, idx) => {
    const bObj = getBrawlerByName(bName);
    const slotEl = document.createElement("div");
    slotEl.className = `ban-slot ${bObj ? "filled" : ""}`;
    slotEl.title = bObj ? `Banned: ${bObj.name} (Click to clear)` : `Ban Slot #${idx + 1}`;
    if (bObj) {
      slotEl.innerHTML = `<img src="${bObj.portrait}" onerror="this.src='${bObj.cdnFallback}'" alt="${bObj.name}" />`;
    } else {
      slotEl.innerHTML = `<span style="font-size:11px; color:#7782b8; font-weight:900;">BAN ${idx + 1}</span>`;
    }
    slotEl.onclick = () => {
      if (STATE.bans[idx]) {
        STATE.bans[idx] = null;
        renderAll();
        requestRecommendations();
      } else {
        STATE.assignMode = "ban";
        syncAssignModeTabs();
      }
    };
    banContainer.appendChild(slotEl);
  });
}

function renderTeamPanels() {
  document.getElementById("blue-pick-badge").textContent = STATE.isFirstPickTeam ? "1ST PICK (1,4,5)" : "2ND PICK (2,3,6)";
  document.getElementById("red-pick-badge").textContent = STATE.isFirstPickTeam ? "2ND PICK (2,3,6)" : "1ST PICK (1,4,5)";

  const activeMap = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);

  const renderSide = (containerId, teamKey, picksArr) => {
    const el = document.getElementById(containerId);
    el.innerHTML = "";
    picksArr.forEach((bName, idx) => {
      const bObj = getBrawlerByName(bName);
      const isCurrentTarget = activeMap.team === teamKey && activeMap.teamSlot === idx;
      const card = document.createElement("div");
      card.className = `pick-slot ${isCurrentTarget ? "active-target" : ""}`;
      card.innerHTML = `
        ${
          bObj
            ? `<img src="${bObj.portrait}" onerror="this.src='${bObj.cdnFallback}'" alt="${bObj.name}" />`
            : `<div style="width:48px;height:48px;border-radius:8px;background:#0c102b;border:2px dashed #4a5699;display:flex;align-items:center;justify-content:center;font-weight:900;">?</div>`
        }
        <div class="slot-meta">
          <span class="slot-number">${teamKey === "ally" ? "ALLY" : "ENEMY"} SLOT #${idx + 1}</span>
          <span class="slot-brawler-name">${bObj ? bObj.name : "SELECT BRAWLER"}</span>
        </div>
      `;
      card.onclick = () => {
        if (picksArr[idx]) {
          picksArr[idx] = null;
          renderAll();
          requestRecommendations();
        }
      };
      el.appendChild(card);
    });
  };

  renderSide("ally-slots", "ally", STATE.allyPicks);
  renderSide("enemy-slots", "enemy", STATE.enemyPicks);
}

function renderBrawlerGrid() {
  const grid = document.getElementById("brawler-grid");
  grid.innerHTML = "";
  const unavailable = getUnavailableSet();
  const q = STATE.searchQuery.trim().toUpperCase();

  STATE.brawlers
    .filter((b) => !q || b.name.includes(q))
    .forEach((b) => {
      const isTaken = unavailable.has(b.name);
      const tile = document.createElement("div");
      tile.className = `brawler-tile ${isTaken ? "unavailable" : ""}`;
      tile.innerHTML = `
        <img src="${b.portrait}" onerror="this.src='${b.cdnFallback}'" alt="${b.name}" loading="lazy" />
        <div class="brawler-tile-name">${b.name}</div>
      `;
      tile.onclick = () => assignBrawler(b.name);
      grid.appendChild(tile);
    });
}

function assignBrawler(brawlerName) {
  const unavailable = getUnavailableSet();
  if (unavailable.has(brawlerName)) return;

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
    if (STATE.activeSnakeSlot < 6) {
      STATE.activeSnakeSlot += 1;
    }
  }

  renderAll();
  requestRecommendations();
}

async function requestRecommendations() {
  const recList = document.getElementById("recommendations-list");
  const mapping = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);
  document.getElementById("rec-subtitle").textContent =
    `Snake Pick #${STATE.activeSnakeSlot} (${mapping.label}) • ${STATE.map}`;

  const payload = {
    map: STATE.map,
    mode: STATE.mode,
    banned_brawlers: STATE.bans.filter(Boolean),
    ally_picks: STATE.allyPicks.filter(Boolean),
    enemy_picks: STATE.enemyPicks.filter(Boolean),
    next_pick_slot: STATE.activeSnakeSlot,
    is_first_pick_team: STATE.isFirstPickTeam,
  };

  try {
    const data = await apiFetch("/api/v1/draft/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    recList.innerHTML = "";
    (data.recommendations || []).forEach((rec) => {
      const portraitSrc = resolvePortraitUrl(rec.portrait, rec.brawler_id);
      const fallbackSrc = `https://cdn.brawlify.com/brawlers/borderless/${rec.brawler_id}.png`;
      const card = document.createElement("div");
      card.className = `rec-card ${rec.rank === 1 ? "rank-1" : ""}`;
      card.innerHTML = `
        <div class="rec-rank">#${rec.rank}</div>
        <img src="${portraitSrc}" onerror="this.src='${fallbackSrc}'" alt="${rec.brawler}" />
        <div class="rec-info">
          <div class="rec-name-row">
            <span class="rec-brawler-name">${rec.brawler}</span>
            <span class="rec-winrate">${rec.win_probability}% WIN</span>
          </div>
          <div class="rec-bar-bg">
            <div class="rec-bar-fill" style="width:${Math.min(100, Math.max(20, rec.win_probability))}%"></div>
          </div>
          <div class="rec-reason">${rec.reason_tag}</div>
        </div>
        <button class="brawl-btn gold" style="padding:6px 10px; font-size:12px;">PICK</button>
      `;
      card.querySelector("button").onclick = () => assignBrawler(rec.brawler);
      recList.appendChild(card);
    });
  } catch (err) {
    console.error("Failed to fetch recommendations:", err);
  }
}

function syncAssignModeTabs() {
  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.target === STATE.assignMode);
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
      btn.textContent = "BLUE (ALLY) 1ST PICK";
      btn.className = "brawl-btn blue-toggle";
    } else {
      btn.textContent = "RED (ENEMY) 1ST PICK";
      btn.className = "brawl-btn red-toggle";
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

  document.getElementById("brawler-search").addEventListener("input", (e) => {
    STATE.searchQuery = e.target.value;
    renderBrawlerGrid();
  });

  document.querySelectorAll(".mode-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      STATE.assignMode = btn.dataset.target;
      syncAssignModeTabs();
    });
  });

  loadMetadata();
});
