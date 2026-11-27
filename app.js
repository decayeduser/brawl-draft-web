// ============================================================================
// BrawlVault Ranked Drafting UI (with Level 11 Player Filter)
// ============================================================================

const STATE = {
  brawlers: [],
  mapsByMode: {},
  mapMatchCounts: {},
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
  playerProfile: null,
  playerLevel11Set: new Set(),
  playerPowerMap: new Map(),
  lv11Only: true,
};

let latestRequestId = 0;

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

function applyPlayerProfile(profile) {
  STATE.playerProfile = profile;
  STATE.playerLevel11Set = new Set((profile?.power11_brawlers || []).map((n) => n.toUpperCase()));
  STATE.playerPowerMap = new Map();
  (profile?.brawlers || []).forEach((b) => {
    STATE.playerPowerMap.set(b.name.toUpperCase(), b.power);
  });

  const statusEl = document.getElementById("draft-player-status");
  const toggleBtn = document.getElementById("lv11-only-toggle");
  const clearBtn = document.getElementById("draft-clear-tag-btn");

  if (profile) {
    statusEl.innerHTML = `<strong>${BV.esc(profile.name)}</strong> (${BV.esc(profile.tag)}) • <span class="lv11-inline">${profile.power11_count} Level 11 brawlers</span>`;
    toggleBtn.classList.remove("hidden");
    clearBtn.classList.remove("hidden");
    syncLv11ToggleUI();
  } else {
    statusEl.textContent = "Enter your Brawl Stars ID to recommend only your Level 11 brawlers";
    toggleBtn.classList.add("hidden");
    clearBtn.classList.add("hidden");
  }
}

function syncLv11ToggleUI() {
  const toggleBtn = document.getElementById("lv11-only-toggle");
  toggleBtn.dataset.active = String(STATE.lv11Only);
  toggleBtn.classList.toggle("active", STATE.lv11Only);
  toggleBtn.textContent = STATE.lv11Only ? "★ Lv 11 Only: ON" : "★ Lv 11 Only: OFF";
}

async function loadPlayerForDraft(rawTag, forceRefresh = false) {
  const norm = BV.normalizeTag(rawTag);
  const input = document.getElementById("draft-player-tag");
  const btn = document.getElementById("draft-load-tag-btn");
  const statusEl = document.getElementById("draft-player-status");

  if (!norm) return;
  input.value = norm;
  btn.disabled = true;
  btn.textContent = "...";
  statusEl.textContent = `Loading ${norm}...`;

  try {
    BV.setSavedTag(norm);
    const profile = await BV.fetchPlayer(norm, forceRefresh);
    BV.setCachedProfile(profile);
    applyPlayerProfile(profile);
    renderBrawlerGrid();
    requestRecommendations();
  } catch (err) {
    statusEl.textContent = err.message || "Could not load player profile.";
  } finally {
    btn.disabled = false;
    btn.textContent = "Load";
  }
}

async function loadMetadata() {
  try {
    const data = await BV.apiFetch("/api/v1/metadata");

    STATE.brawlers = (data.brawlers || []).map((b) => ({
      ...b,
      portrait: BV.resolvePortraitUrl(b.portrait, b.id),
      cdnFallback: `https://cdn.brawlify.com/brawlers/borderless/${b.id}.png`,
    }));

    STATE.mapsByMode = data.maps_by_mode || {};
    STATE.mapMatchCounts = data.map_match_counts || {};

    const modeSelect = document.getElementById("mode-select");
    modeSelect.innerHTML = "";
    Object.keys(STATE.mapsByMode).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = BV.formatMode(m).toUpperCase();
      modeSelect.appendChild(opt);
    });

    if (!STATE.mapsByMode[STATE.mode]) {
      STATE.mode = Object.keys(STATE.mapsByMode)[0] || "gemGrab";
    }
    // Check URL deep-link (?mode=brawlBall&map=Backyard+Bowl) from Live Rotation
    const urlParams = new URLSearchParams(window.location.search);
    const qMode = urlParams.get("mode");
    const qMap = urlParams.get("map");
    if (qMode && STATE.mapsByMode[qMode]) {
      STATE.mode = qMode;
    }
    modeSelect.value = STATE.mode;
    populateMapsForMode();
    if (qMap && (STATE.mapsByMode[STATE.mode] || []).includes(qMap)) {
      STATE.map = qMap;
      document.getElementById("map-select").value = qMap;
    }

    // Restore shared draft state (?fp=0&bans=A,B&blue=C,D&red=E,F)
    const knownNames = new Set(STATE.brawlers.map((b) => b.name.toUpperCase()));
    const parseList = (param, maxLen) =>
      (urlParams.get(param) || "")
        .split(",")
        .map((s) => s.trim().toUpperCase())
        .filter((s) => s && knownNames.has(s))
        .slice(0, maxLen);

    const qFp = urlParams.get("fp");
    if (qFp === "0" || qFp === "1") {
      STATE.isFirstPickTeam = qFp === "1";
      const fpBtn = document.getElementById("first-pick-toggle");
      if (fpBtn) {
        fpBtn.textContent = STATE.isFirstPickTeam ? "BLUE 1ST" : "RED 1ST";
        fpBtn.className = STATE.isFirstPickTeam ? "btn btn-blue" : "btn btn-red";
      }
    }
    const qBans = parseList("bans", 6);
    qBans.forEach((b, i) => { STATE.bans[i] = b; });
    const qBlue = parseList("blue", 3);
    qBlue.forEach((b, i) => { STATE.allyPicks[i] = b; });
    const qRed = parseList("red", 3);
    qRed.forEach((b, i) => { STATE.enemyPicks[i] = b; });
    if (qBlue.length || qRed.length) {
      STATE.activeSnakeSlot = findNextEmptySnakeSlot(1);
    }

    const stats = data.stats || {};
    const trainedAt = stats.last_model_update
      ? new Date(stats.last_model_update * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "Warmup";
    const apiOk = stats.api_status?.ok !== false;
    document.getElementById("api-status-dot").className = apiOk ? "dot online" : "dot warn";
    document.getElementById("model-status-text").textContent =
      `BrawlVault Live • ${(stats.total_matches || 0).toLocaleString()} Matches • ${(stats.tracked_top_players || 0).toLocaleString()} Pros • ${trainedAt}`;

    renderAll();
    requestRecommendations();
  } catch (err) {
    console.warn("Connection error, retrying in 10s:", err);
    document.getElementById("api-status-dot").className = "dot warn";
    document.getElementById("model-status-text").textContent = "Reconnecting to BrawlVault...";
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
    const cnt = STATE.mapMatchCounts[mp];
    if (typeof cnt === "number") {
      opt.textContent = cnt > 0 ? `${mp} (${cnt})` : `${mp} (0 • off-rotation)`;
    } else {
      opt.textContent = mp;
    }
    mapSelect.appendChild(opt);
  });
  STATE.map = maps[0] || "";
  mapSelect.value = STATE.map;
}

function renderTimelineAndBans() {
  const allPicked = STATE.allyPicks.every(Boolean) && STATE.enemyPicks.every(Boolean);
  const activeMap = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);
  const turnBadge = document.getElementById("active-turn-badge");
  if (allPicked) {
    turnBadge.textContent = "DRAFT COMPLETE • 3V3";
    turnBadge.className = "turn-pill blue-pill";
  } else {
    turnBadge.textContent = `PICK #${STATE.activeSnakeSlot} • ${activeMap.team === "ally" ? "BLUE" : "RED"}`;
    turnBadge.className = `turn-pill ${activeMap.team === "ally" ? "blue-pill" : "red-pill"}`;
  }

  const mobRecTab = document.querySelector('.mobile-tab[data-view="recs"] span');
  if (mobRecTab) {
    mobRecTab.textContent = allPicked
      ? "✓ 3v3 Draft Complete"
      : `★ AI Picks • #${STATE.activeSnakeSlot} ${activeMap.team === "ally" ? "BLUE" : "RED"}`;
  }

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
    const isLv11 = STATE.playerLevel11Set.has(b.name.toUpperCase());
    const tile = document.createElement("div");
    tile.className = `brawler-tile ${status ? "unavailable" : ""} ${isLv11 ? "tile-lv11" : ""}`;

    const img = document.createElement("img");
    img.src = b.portrait;
    img.alt = b.name;
    img.loading = "lazy";
    img.decoding = "async";
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
      if (isLv11) {
        const lvBadge = document.createElement("span");
        lvBadge.className = "tile-badge badge-lv11";
        lvBadge.textContent = "LV11";
        tile.appendChild(lvBadge);
      }
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
    if (STATE.allyPicks.every(Boolean) && STATE.enemyPicks.every(Boolean)) return;
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

function renderWinProbBar(blueProb) {
  const bPct = Math.max(15, Math.min(85, Number(blueProb ?? 50)));
  const rPct = Number((100 - bPct).toFixed(1));
  const blueEl = document.getElementById("blue-win-pct");
  const redEl = document.getElementById("red-win-pct");
  const fillEl = document.getElementById("winprob-blue-fill");
  const verdictEl = document.getElementById("winprob-verdict");
  if (!blueEl || !redEl || !fillEl || !verdictEl) return;

  blueEl.textContent = `${bPct.toFixed(1)}%`;
  redEl.textContent = `${rPct.toFixed(1)}%`;
  fillEl.style.width = `${bPct}%`;

  const totalPicked = STATE.allyPicks.filter(Boolean).length + STATE.enemyPicks.filter(Boolean).length;
  if (totalPicked === 0) {
    verdictEl.textContent = "EVEN DRAFT • PICK BRAWLERS TO EVALUATE";
    verdictEl.className = "wp-verdict";
  } else if (bPct >= 56) {
    verdictEl.textContent = `BLUE ADVANTAGE (+${(bPct - 50).toFixed(1)}%)`;
    verdictEl.className = "wp-verdict wp-v-blue";
  } else if (rPct >= 56) {
    verdictEl.textContent = `RED ADVANTAGE (+${(rPct - 50).toFixed(1)}%)`;
    verdictEl.className = "wp-verdict wp-v-red";
  } else {
    verdictEl.textContent = "CLOSE / SKILL MATCHUP";
    verdictEl.className = "wp-verdict";
  }
}

function renderRecommendedBans(recBans) {
  const container = document.getElementById("rec-bans-list");
  if (!container) return;
  const taken = getTakenMap();
  const list = (recBans || []).filter((b) => !taken.has(b.brawler)).slice(0, 6);
  const banSlotsLeft = STATE.bans.filter((x) => !x).length;

  if (!list.length) {
    container.innerHTML = `<span class="muted-tag">All top threats already banned or picked.</span>`;
    return;
  }

  container.innerHTML = list
    .map((b) => {
      const portraitSrc = BV.resolvePortraitUrl(b.portrait, b.brawler_id);
      const fallbackSrc = `https://cdn.brawlify.com/brawlers/borderless/${b.brawler_id}.png`;
      return `
        <button type="button" class="rec-ban-chip" data-ban-name="${BV.esc(b.brawler)}" ${banSlotsLeft === 0 ? "disabled" : ""} title="${BV.esc(b.reason || "Top map threat")}">
          <img src="${portraitSrc}" alt="${BV.esc(b.brawler)}" onerror="this.src='${fallbackSrc}'" />
          <div class="rbc-info">
            <strong>${BV.esc(b.brawler)}</strong>
            <span>${b.map_win_rate}% WR${b.pick_rate ? ` • ${b.pick_rate}% PR` : ""}</span>
          </div>
          <span class="rbc-act">${banSlotsLeft > 0 ? "BAN" : "FULL"}</span>
        </button>
      `;
    })
    .join("");

  container.querySelectorAll(".rec-ban-chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.banName;
      const emptyBan = STATE.bans.indexOf(null);
      if (!name || emptyBan === -1 || getTakenMap().has(name)) return;
      STATE.bans[emptyBan] = name;
      renderAll();
      requestRecommendations();
    });
  });
}

async function requestRecommendations() {
  const reqId = ++latestRequestId;
  const recList = document.getElementById("recommendations-list");
  const spinner = document.getElementById("rec-loading");
  const mapping = getSlotMapping(STATE.activeSnakeSlot, STATE.isFirstPickTeam);

  const allPicked = STATE.allyPicks.every(Boolean) && STATE.enemyPicks.every(Boolean);

  document.getElementById("rec-subtitle").textContent = allPicked
    ? `3v3 Draft Complete • ${STATE.map}`
    : `Pick #${STATE.activeSnakeSlot} (${mapping.label}) • ${STATE.map}`;
  spinner.classList.remove("hidden");

  const pickingIsAlly = mapping.team === "ally";
  const useLv11Filter = Boolean(STATE.playerProfile && STATE.lv11Only && pickingIsAlly);

  const payload = {
    map: STATE.map,
    mode: STATE.mode,
    banned_brawlers: STATE.bans.filter(Boolean),
    ally_picks: (pickingIsAlly ? STATE.allyPicks : STATE.enemyPicks).filter(Boolean),
    enemy_picks: (pickingIsAlly ? STATE.enemyPicks : STATE.allyPicks).filter(Boolean),
    blue_picks: STATE.allyPicks.filter(Boolean),
    red_picks: STATE.enemyPicks.filter(Boolean),
    blue_is_first_pick: STATE.isFirstPickTeam,
    next_pick_slot: STATE.activeSnakeSlot,
    is_first_pick_team: mapping.isFirstPickSide,
    allowed_brawlers: useLv11Filter ? Array.from(STATE.playerLevel11Set) : null,
  };

  try {
    const data = await BV.apiFetch("/api/v1/draft/recommend", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    if (reqId !== latestRequestId) return;
    spinner.classList.add("hidden");

    // Live Win-Chance Meter & Recommended Bans (with seamless fallback if Pi hasn't updated yet)
    const recs = data.recommendations || [];
    if (typeof data.blue_win_probability === "number") {
      renderWinProbBar(data.blue_win_probability);
    } else {
      const blueCnt = STATE.allyPicks.filter(Boolean).length;
      const redCnt = STATE.enemyPicks.filter(Boolean).length;
      if (blueCnt === 0 && redCnt === 0) {
        renderWinProbBar(50.0);
      } else {
        const topWr = recs[0]?.win_probability ?? 50;
        const estBlue = pickingIsAlly ? topWr : 100 - topWr;
        renderWinProbBar(50 + (estBlue - 50) * 0.45);
      }
    }

    const banStratEl = document.getElementById("rec-bans-strategy");
    if (banStratEl) {
      banStratEl.textContent = data.ban_strategy_label
        ? `🚫 ${data.ban_strategy_label}`
        : STATE.isFirstPickTeam
          ? "🚫 BLUE 1ST PICK • BAN COUNTERS & CHEESE"
          : "🚫 BLUE LAST PICK • BAN META 1ST PICKS";
    }

    if (Array.isArray(data.recommended_bans) && data.recommended_bans.length) {
      renderRecommendedBans(data.recommended_bans);
    } else if (recs.length) {
      renderRecommendedBans(
        recs.slice(0, 5).map((r) => ({
          brawler: r.brawler,
          brawler_id: r.brawler_id,
          portrait: r.portrait,
          map_win_rate: r.map_win_rate,
          pick_rate: r.pick_rate,
          reason: r.reason_tag,
        }))
      );
    }

    const mapMatches = typeof data.map_matches === "number" ? data.map_matches : STATE.mapMatchCounts[STATE.map];
    const filterNote = useLv11Filter ? ` • My Lv 11 (${STATE.playerLevel11Set.size})` : "";
    if (allPicked) {
      document.getElementById("rec-subtitle").textContent = `3v3 Draft Complete • ${STATE.map}`;
      const bPct = typeof data.blue_win_probability === "number" ? data.blue_win_probability.toFixed(1) : "50.0";
      const rPct = (100 - Number(bPct)).toFixed(1);
      recList.innerHTML = `
        <div class="empty-card dyn-fade" style="text-align:left;padding:18px;">
          <div class="verdict-eyebrow" style="margin-bottom:6px;">✓ ALL 6 PICKS LOCKED (3V3)</div>
          <h3 class="brawl-title" style="font-size:18px;margin-bottom:8px;">Blue ${bPct}% vs Red ${rPct}%</h3>
          <p class="muted-tag" style="margin-bottom:14px;line-height:1.5;">
            Tap any picked brawler on the left to swap it, or run <strong>Vault AI Review</strong> for lane assignments, win conditions, and counterplay.
          </p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" id="complete-review-btn" class="btn btn-gold btn-sm">✦ Vault AI Gameplan</button>
            <button type="button" id="complete-share-btn" class="btn btn-ghost btn-sm">🔗 Share Draft</button>
          </div>
        </div>
      `;
      document.getElementById("complete-review-btn")?.addEventListener("click", openAiDraftReview);
      document.getElementById("complete-share-btn")?.addEventListener("click", copyShareDraftLink);
      return;
    }
    if (typeof mapMatches === "number") {
      document.getElementById("rec-subtitle").textContent =
        `Pick #${STATE.activeSnakeSlot} (${mapping.label}) • ${STATE.map} (${mapMatches} pro games)${filterNote}`;
    }

    recList.innerHTML = "";
    if (useLv11Filter && STATE.playerLevel11Set.size === 0) {
      recList.innerHTML = `<div class="empty-state">No Level 11 brawlers found on ${BV.esc(STATE.playerProfile.name)}. Turn off "Lv 11 Only" or check the Upgrade Guide!</div>`;
      return;
    }

    if (typeof mapMatches === "number" && mapMatches < 15) {
      const notice = document.createElement("div");
      notice.className = "low-data-notice";
      notice.textContent =
        mapMatches === 0
          ? "0 live Ranked games on this map (likely off-rotation) — using mode meta."
          : `Only ${mapMatches} pro games on this map so far — blending with mode meta.`;
      recList.appendChild(notice);
    }

    if (!recs.length) {
      recList.innerHTML = `<div class="empty-state">No available brawlers left to recommend.</div>`;
      return;
    }

    recs.forEach((rec) => {
      const portraitSrc = BV.resolvePortraitUrl(rec.portrait, rec.brawler_id);
      const fallbackSrc = `https://cdn.brawlify.com/brawlers/borderless/${rec.brawler_id}.png`;
      const isMyLv11 = STATE.playerLevel11Set.has(rec.brawler.toUpperCase());

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
      bName.innerHTML = `${BV.esc(rec.brawler)}${isMyLv11 ? ' <span class="lv11-chip">LV11</span>' : ""}`;
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
      const pickChip = typeof rec.pick_rate === "number" && rec.pick_rate > 0
        ? `<span class="stat-chip chip-pick">Pick ${rec.pick_rate}%</span>`
        : "";
      statsRow.innerHTML = `
        ${pickChip}
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
    recList.innerHTML = `<div class="empty-state">Unable to load recommendations right now. Please try again.</div>`;
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

function formatDraftReviewMarkdown(raw) {
  const safe = BV.esc(String(raw || "").trim());
  const lines = safe.split(/\r?\n/);
  const out = [];
  let inList = false;
  const fmt = (s) =>
    s
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
      out.push(`<h4 class="ai-coach-h">${fmt(t.replace(/^#{1,3}\s+/, ""))}</h4>`);
    } else if (/^[-*•]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      if (!inList) { out.push('<ul class="ai-coach-ul">'); inList = true; }
      out.push(`<li>${fmt(t.replace(/^([-*•]|\d+\.)\s+/, ""))}</li>`);
    } else {
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(`<p class="ai-coach-p">${fmt(t)}</p>`);
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

async function openAiDraftReview() {
  const modal = document.getElementById("draft-review-modal");
  const titleEl = document.getElementById("draft-review-title");
  const bodyEl = document.getElementById("draft-review-body");
  if (!modal || !bodyEl) return;

  const blue = STATE.allyPicks.filter(Boolean);
  const red = STATE.enemyPicks.filter(Boolean);
  const bans = STATE.bans.filter(Boolean);

  titleEl.textContent = `${STATE.map} • ${BV.formatMode(STATE.mode)}`;
  modal.classList.remove("hidden");

  if (!blue.length && !red.length) {
    bodyEl.innerHTML = `<div class="muted-tag">Pick at least 1 brawler on Blue or Red team first, then click <strong>✦ AI Review</strong> for lane assignments &amp; win conditions.</div>`;
    return;
  }

  bodyEl.innerHTML = `<div class="muted-tag">Analyzing ${blue.length}v${red.length} matchup on ${BV.esc(STATE.map)} with Vault AI...</div>`;

  try {
    const res = await BV.apiFetch("/api/v1/draft/review", {
      method: "POST",
      body: JSON.stringify({
        map: STATE.map,
        mode: STATE.mode,
        blue_picks: blue,
        red_picks: red,
        banned_brawlers: bans,
        blue_is_first_pick: STATE.isFirstPickTeam,
      }),
    });
    if (res.ai_enabled && res.response) {
      const quotaNote = res.usage ? `<div class="muted-tag" style="margin-top:12px;">AI Quota: ${res.usage.remaining}/${res.usage.limit} left today</div>` : "";
      bodyEl.innerHTML = `${formatDraftReviewMarkdown(res.response)}${quotaNote}`;
    } else {
      bodyEl.innerHTML = `<div class="muted-tag">${BV.esc(res.message || "Could not generate AI Draft Review right now.")}</div>`;
    }
  } catch (err) {
    bodyEl.innerHTML = `<div class="muted-tag">${BV.esc(err.message || "Could not reach AI Draft Review.")}</div>`;
  }
}

function copyShareDraftLink() {
  const btn = document.getElementById("share-draft-btn");
  const params = new URLSearchParams();
  params.set("mode", STATE.mode);
  params.set("map", STATE.map);
  params.set("fp", STATE.isFirstPickTeam ? "1" : "0");
  const bans = STATE.bans.filter(Boolean);
  const blue = STATE.allyPicks.filter(Boolean);
  const red = STATE.enemyPicks.filter(Boolean);
  if (bans.length) params.set("bans", bans.join(","));
  if (blue.length) params.set("blue", blue.join(","));
  if (red.length) params.set("red", red.join(","));

  const shareUrl = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  const done = () => {
    if (!btn) return;
    const prev = btn.textContent;
    btn.textContent = "✓ Copied!";
    setTimeout(() => { btn.textContent = prev; }, 2000);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(shareUrl).then(done).catch(() => {
      window.prompt("Copy this draft link:", shareUrl);
    });
  } else {
    window.prompt("Copy this draft link:", shareUrl);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const reviewBtn = document.getElementById("ai-draft-review-btn");
  if (reviewBtn) reviewBtn.addEventListener("click", openAiDraftReview);

  const shareBtn = document.getElementById("share-draft-btn");
  if (shareBtn) shareBtn.addEventListener("click", copyShareDraftLink);

  const reviewModal = document.getElementById("draft-review-modal");
  const reviewClose = document.getElementById("draft-review-close");
  if (reviewClose && reviewModal) {
    reviewClose.addEventListener("click", () => reviewModal.classList.add("hidden"));
    reviewModal.addEventListener("click", (e) => {
      if (e.target === reviewModal) reviewModal.classList.add("hidden");
    });
  }

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

  document.getElementById("draft-tag-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadPlayerForDraft(document.getElementById("draft-player-tag").value, true);
  });

  document.getElementById("draft-clear-tag-btn").addEventListener("click", () => {
    BV.setSavedTag("");
    document.getElementById("draft-player-tag").value = "";
    applyPlayerProfile(null);
    renderBrawlerGrid();
    requestRecommendations();
  });

  document.getElementById("lv11-only-toggle").addEventListener("click", () => {
    STATE.lv11Only = !STATE.lv11Only;
    syncLv11ToggleUI();
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

  const savedTag = BV.getSavedTag();
  if (savedTag) {
    document.getElementById("draft-player-tag").value = savedTag;
    loadPlayerForDraft(savedTag, false);
  }

  BV.onAuthChange(() => {
    const synced = BV.getSavedTag();
    if (synced && (!STATE.playerProfile || BV.normalizeTag(STATE.playerProfile.tag) !== synced)) {
      document.getElementById("draft-player-tag").value = synced;
      loadPlayerForDraft(synced, false);
    }
    requestRecommendations();
  });

  loadMetadata();
});
