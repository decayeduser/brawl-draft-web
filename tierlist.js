// ============================================================================
// BrawlVault AI Tier List Page
// ============================================================================

const TIER_STATE = {
  mapsByMode: {},
  mapMatchCounts: {},
  mode: "",
  map: "",
  search: "",
  tierData: null,
  playerLv11Set: new Set(),
};

const TIER_META = {
  S: { label: "S", desc: "Meta Defining • Must Pick / Ban" },
  A: { label: "A", desc: "Strong & Reliable Ranked Picks" },
  B: { label: "B", desc: "Solid Situational & Counter Picks" },
  C: { label: "C", desc: "Niche / Map-Dependent" },
  D: { label: "D", desc: "Out of Meta" },
};

function populateTierMaps() {
  const mapSelect = document.getElementById("tier-map-select");
  mapSelect.innerHTML = `<option value="">All Maps</option>`;
  const maps = TIER_STATE.mode
    ? TIER_STATE.mapsByMode[TIER_STATE.mode] || []
    : Object.values(TIER_STATE.mapsByMode).flat();
  const uniqueMaps = Array.from(new Set(maps));
  uniqueMaps.sort((a, b) => (TIER_STATE.mapMatchCounts[b] || 0) - (TIER_STATE.mapMatchCounts[a] || 0));

  uniqueMaps.forEach((mp) => {
    const cnt = TIER_STATE.mapMatchCounts[mp] || 0;
    const opt = document.createElement("option");
    opt.value = mp;
    opt.textContent = cnt > 0 ? `${mp} (${cnt})` : `${mp} (0)`;
    mapSelect.appendChild(opt);
  });
  TIER_STATE.map = "";
  mapSelect.value = "";
}

function openBrawlerModal(b) {
  const modal = document.getElementById("brawler-modal");
  const content = document.getElementById("modal-content");
  const build = b.build || {};
  const isLv11 = TIER_STATE.playerLv11Set.has(b.name.toUpperCase());

  const mapsHtml = (b.best_maps || [])
    .map((m) => `<span class="mini-map-chip">${BV.esc(m.map)} (${m.win_rate}% WR)</span>`)
    .join("") || `<span class="muted-tag">Gathering map data...</span>`;

  const synHtml = (b.top_synergies || [])
    .map((s) => `<span class="stat-chip">${BV.esc(s)}</span>`)
    .join("") || `<span class="muted-tag">--</span>`;

  const cntHtml = (b.top_counters || [])
    .map((c) => `<span class="stat-chip chip-pick">${BV.esc(c)}</span>`)
    .join("") || `<span class="muted-tag">--</span>`;

  const spPct = build.star_power_pct ? ` (${build.star_power_pct}%)` : "";
  const gdPct = build.gadget_pct ? ` (${build.gadget_pct}%)` : "";

  content.innerHTML = `
    <div class="modal-head">
      <img
        src="${BV.resolvePortraitUrl(b.portrait, b.id)}"
        alt="${BV.esc(b.name)}"
        onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${b.id}.png'"
      />
      <div>
        <div class="upgrade-name-line">
          <h2 class="brawl-title modal-title">${BV.esc(b.name)}</h2>
          <span class="tier-pill tier-${b.tier.toLowerCase()}">${b.tier} TIER</span>
          ${isLv11 ? '<span class="lv11-chip">MY LV11</span>' : ""}
        </div>
        <div class="modal-rank-line">Rank #${b.rank} • AI Meta Score ${b.meta_score}</div>
      </div>
    </div>

    <div class="modal-stats">
      <div class="modal-stat-box"><span>Win Rate</span><strong>${b.win_rate}%</strong></div>
      <div class="modal-stat-box"><span>Pick Rate</span><strong>${b.pick_rate}%</strong></div>
      <div class="modal-stat-box"><span>AI Score</span><strong>${b.meta_score}</strong></div>
    </div>

    <div class="build-box">
      <div class="build-title">PRO META BUILD</div>
      <div class="build-row"><span class="build-key">★ Star Power</span><span class="build-val">${BV.esc(build.star_power || "N/A")}${spPct}</span></div>
      <div class="build-row"><span class="build-key">⚙ Gadget</span><span class="build-val">${BV.esc(build.gadget || "N/A")}${gdPct}</span></div>
      <div class="build-row"><span class="build-key">⛨ Gears</span><span class="build-val">${BV.esc((build.gears || []).join(" + ") || "DAMAGE + SHIELD")}</span></div>
    </div>

    <div class="modal-section">
      <div class="modal-sec-lbl">BEST MAPS</div>
      <div class="chip-wrap">${mapsHtml}</div>
    </div>

    <div class="modal-section">
      <div class="modal-sec-lbl">STRONG SYNERGIES (ALLIES)</div>
      <div class="chip-wrap">${synHtml}</div>
    </div>

    <div class="modal-section">
      <div class="modal-sec-lbl">STRONG AGAINST (COUNTERS)</div>
      <div class="chip-wrap">${cntHtml}</div>
    </div>

    <button type="button" id="modal-open-cp-btn" class="btn btn-gold btn-sm">⚔ Open Full Counter Picker for ${BV.esc(b.name)}</button>
  `;
  const cpBtn = document.getElementById("modal-open-cp-btn");
  if (cpBtn) {
    cpBtn.addEventListener("click", () => {
      modal.classList.add("hidden");
      const sel = document.getElementById("cp-brawler-select");
      if (sel) {
        sel.value = b.name;
        loadCounterPicker(b.name, document.getElementById("cp-map-select")?.value || "");
        document.getElementById("counters")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }
  modal.classList.remove("hidden");
}

function renderTierRows() {
  const container = document.getElementById("tier-rows");
  if (!TIER_STATE.tierData) return;

  const q = TIER_STATE.search.trim().toUpperCase();
  const tiers = TIER_STATE.tierData.tiers || {};
  container.innerHTML = "";

  let totalShown = 0;
  ["S", "A", "B", "C", "D"].forEach((tierKey) => {
    const items = (tiers[tierKey] || []).filter((b) => !q || b.name.includes(q));
    if (!items.length) return;
    totalShown += items.length;

    const row = document.createElement("div");
    row.className = `tier-row tier-row-${tierKey.toLowerCase()}`;

    const badge = document.createElement("div");
    badge.className = `tier-row-label tier-${tierKey.toLowerCase()}`;
    badge.innerHTML = `<span class="brawl-title tier-letter">${tierKey}</span><span class="tier-count">${items.length}</span>`;

    const grid = document.createElement("div");
    grid.className = "tier-row-grid";

    items.forEach((b) => {
      const isLv11 = TIER_STATE.playerLv11Set.has(b.name.toUpperCase());
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = `tier-tile ${isLv11 ? "tile-lv11" : ""}`;
      tile.innerHTML = `
        ${isLv11 ? '<span class="tile-badge badge-lv11">LV11</span>' : ""}
        <img
          src="${BV.resolvePortraitUrl(b.portrait, b.id)}"
          alt="${BV.esc(b.name)}"
          loading="lazy"
          onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${b.id}.png'"
        />
        <div class="tier-tile-name">${BV.esc(b.name)}</div>
        <div class="tier-tile-stats">${b.win_rate}% • ${b.pick_rate}%</div>
      `;
      tile.addEventListener("click", () => openBrawlerModal(b));
      grid.appendChild(tile);
    });

    row.append(badge, grid);
    container.appendChild(row);
  });

  if (!totalShown) {
    container.innerHTML = `<div class="empty-card">No brawlers matching "${BV.esc(TIER_STATE.search)}".</div>`;
  }
}

async function fetchTierList() {
  const container = document.getElementById("tier-rows");
  container.innerHTML = `<div class="empty-card">Calculating live AI Tier List...</div>`;
  const params = new URLSearchParams();
  if (TIER_STATE.mode) params.set("mode", TIER_STATE.mode);
  if (TIER_STATE.map) params.set("map", TIER_STATE.map);
  const qs = params.toString() ? `?${params.toString()}` : "";

  try {
    const data = await BV.apiFetch(`/api/v1/tierlist${qs}`);
    TIER_STATE.tierData = data;
    const scopeLabel =
      data.map !== "all"
        ? data.map
        : data.mode !== "all"
        ? BV.formatMode(data.mode)
        : "Overall Ranked";
    document.getElementById("tier-meta-sub").textContent =
      `${scopeLabel} • Based on ${(data.sample_matches || 0).toLocaleString()} live pro matches • Tap any brawler for build & matchups`;
    renderTierRows();
  } catch (err) {
    container.innerHTML = `<div class="empty-card error-card">${BV.esc(err.message || "Could not load Tier List.")}</div>`;
  }
}

function renderCounterPickerData(data) {
  const box = document.getElementById("cp-results");
  if (!box || !data) return;
  const t = data.target;
  const hard = data.hard_counters || [];
  const beats = data.beats_easily || [];
  const allies = data.best_allies || [];
  const bestMaps = data.best_maps || [];
  const worstMaps = data.worst_maps || [];

  const renderTileList = (arr, statKey, statSuffix, badgePrefix = "") =>
    arr.length
      ? arr
          .map((item) => {
            const isLv11 = TIER_STATE.playerLv11Set.has(item.name.toUpperCase());
            return `
              <button type="button" class="cp-chip-card ${isLv11 ? "tile-lv11" : ""}" data-cp-pick="${BV.esc(item.name)}">
                <img src="${BV.resolvePortraitUrl(item.portrait, item.id)}" alt="${BV.esc(item.name)}" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${item.id}.png'" />
                <div>
                  <strong>${BV.esc(item.name)}${isLv11 ? ' <span class="lv11-chip">LV11</span>' : ""}</strong>
                  <span>${badgePrefix}${item[statKey]}${statSuffix}</span>
                </div>
              </button>
            `;
          })
          .join("")
      : `<span class="muted-tag">Gathering matchup samples...</span>`;

  box.innerHTML = `
    <div class="cp-target-bar">
      <img src="${BV.resolvePortraitUrl(t.portrait, t.id)}" alt="${BV.esc(t.name)}" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${t.id}.png'" />
      <div>
        <div class="cp-target-name">HOW TO BEAT <strong>${BV.esc(t.name)}</strong>${data.map && data.map !== "all" ? ` ON ${BV.esc(data.map.toUpperCase())}` : ""}</div>
        <div class="muted-tag">Global WR: ${t.global_win_rate ?? "--"}% • Tap any counter below to inspect their matchups</div>
      </div>
    </div>

    <div class="cp-grid">
      <div class="cp-col cp-col-hard">
        <div class="cp-col-title">🛡 HARD COUNTERS (PICK THESE VS ${BV.esc(t.name)})</div>
        <div class="cp-card-list">${renderTileList(hard, "win_rate_vs", "% WR vs")}</div>
      </div>

      <div class="cp-col">
        <div class="cp-col-title">🤝 BEST TEAMMATES (SYNERGIES)</div>
        <div class="cp-card-list">${renderTileList(allies, "synergy_win_rate", "% duo WR")}</div>
      </div>

      <div class="cp-col">
        <div class="cp-col-title">🎯 ${BV.esc(t.name)} BEATS EASILY (AVOID PICKING)</div>
        <div class="cp-card-list">${renderTileList(beats, "target_win_rate", "% enemy WR")}</div>
      </div>
    </div>

    ${
      bestMaps.length || worstMaps.length
        ? `<div class="cp-maps-row">
            <div>
              <span class="modal-sec-lbl">STRONGEST MAPS: </span>
              ${bestMaps.map((m) => `<span class="mini-map-chip">${BV.esc(m.map)} (${m.win_rate}%)</span>`).join(" ") || "--"}
            </div>
            <div>
              <span class="modal-sec-lbl" style="color:#ff8aa6;">WEAKEST MAPS: </span>
              ${worstMaps.map((m) => `<span class="mini-map-chip">${BV.esc(m.map)} (${m.win_rate}%)</span>`).join(" ") || "--"}
            </div>
          </div>`
        : ""
    }
  `;

  box.querySelectorAll("[data-cp-pick]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextB = btn.dataset.cpPick;
      document.getElementById("cp-brawler-select").value = nextB;
      loadCounterPicker(nextB, document.getElementById("cp-map-select").value);
    });
  });
}

async function loadCounterPicker(brawlerName, mapName = "") {
  const box = document.getElementById("cp-results");
  if (!brawlerName) {
    box.innerHTML = `<div class="muted-tag">Pick an annoying enemy brawler above to see their hardest counters, best allies, and worst maps.</div>`;
    return;
  }
  box.innerHTML = `<div class="muted-tag">Analyzing matchups against ${BV.esc(brawlerName)}...</div>`;
  try {
    const qs = mapName ? `?map=${encodeURIComponent(mapName)}` : "";
    const data = await BV.apiFetch(`/api/v1/counters/${encodeURIComponent(brawlerName)}${qs}`);
    renderCounterPickerData(data);
  } catch {
    // Graceful client-side fallback from loaded Tier List data if Pi hasn't updated yet
    const allItems = Object.values(TIER_STATE.tierData?.tiers || {}).flat();
    const target = allItems.find((x) => x.name === brawlerName);
    if (!target) {
      box.innerHTML = `<div class="muted-tag">Could not load matchups for ${BV.esc(brawlerName)}.</div>`;
      return;
    }
    const counters = allItems
      .filter((x) => x.name !== brawlerName && (x.top_counters || []).includes(brawlerName))
      .slice(0, 8)
      .map((x) => ({ id: x.id, name: x.name, portrait: x.portrait, win_rate_vs: x.win_rate }));
    const allies = (target.top_synergies || [])
      .map((n) => allItems.find((x) => x.name === n))
      .filter(Boolean)
      .map((x) => ({ id: x.id, name: x.name, portrait: x.portrait, synergy_win_rate: x.win_rate }));
    const beats = (target.top_counters || [])
      .map((n) => allItems.find((x) => x.name === n))
      .filter(Boolean)
      .map((x) => ({ id: x.id, name: x.name, portrait: x.portrait, target_win_rate: target.win_rate }));
    renderCounterPickerData({
      target: { id: target.id, name: target.name, portrait: target.portrait, global_win_rate: target.win_rate },
      map: mapName || "all",
      hard_counters: counters,
      best_allies: allies,
      beats_easily: beats,
      best_maps: target.best_maps || [],
      worst_maps: [],
    });
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const modal = document.getElementById("brawler-modal");
  document.getElementById("modal-close-btn").addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  document.getElementById("tier-mode-select").addEventListener("change", (e) => {
    TIER_STATE.mode = e.target.value;
    populateTierMaps();
    fetchTierList();
  });

  document.getElementById("tier-map-select").addEventListener("change", (e) => {
    TIER_STATE.map = e.target.value;
    fetchTierList();
  });

  document.getElementById("tier-search").addEventListener("input", (e) => {
    TIER_STATE.search = e.target.value;
    renderTierRows();
  });

  const cpBrawlerSel = document.getElementById("cp-brawler-select");
  const cpMapSel = document.getElementById("cp-map-select");
  cpBrawlerSel.addEventListener("change", () => loadCounterPicker(cpBrawlerSel.value, cpMapSel.value));
  cpMapSel.addEventListener("change", () => {
    if (cpBrawlerSel.value) loadCounterPicker(cpBrawlerSel.value, cpMapSel.value);
  });

  // Load saved player's Lv 11 highlight in background
  const savedTag = BV.getSavedTag();
  if (savedTag) {
    BV.fetchPlayer(savedTag, false)
      .then((prof) => {
        TIER_STATE.playerLv11Set = new Set((prof.power11_brawlers || []).map((n) => n.toUpperCase()));
        const bar = document.getElementById("tier-lv11-bar");
        bar.classList.remove("hidden");
        bar.innerHTML = `★ Highlighting <strong>${BV.esc(prof.name)}</strong>'s <strong>${prof.power11_count} Level 11</strong> brawlers in gold`;
        renderTierRows();
      })
      .catch(() => {});
  }

  // Load mode, map, and brawler options from metadata
  try {
    const meta = await BV.apiFetch("/api/v1/metadata");
    TIER_STATE.mapsByMode = meta.maps_by_mode || {};
    TIER_STATE.mapMatchCounts = meta.map_match_counts || {};

    const modeSel = document.getElementById("tier-mode-select");
    Object.keys(TIER_STATE.mapsByMode).forEach((m) => {
      const opt = document.createElement("option");
      opt.value = m;
      opt.textContent = BV.formatMode(m);
      modeSel.appendChild(opt);
    });
    populateTierMaps();

    (meta.brawlers || []).forEach((b) => {
      const o = document.createElement("option");
      o.value = b.name;
      o.textContent = b.name;
      cpBrawlerSel.appendChild(o);
    });

    const allMaps = Array.from(new Set(Object.values(TIER_STATE.mapsByMode).flat()));
    allMaps.sort((a, b) => (TIER_STATE.mapMatchCounts[b] || 0) - (TIER_STATE.mapMatchCounts[a] || 0));
    allMaps.forEach((mp) => {
      const o = document.createElement("option");
      o.value = mp;
      o.textContent = mp;
      cpMapSel.appendChild(o);
    });
  } catch {
    // ignore metadata error, still load overall tierlist
  }

  await fetchTierList();
  // Auto-preview a popular brawler in Counter Picker so the section is immediately alive
  if (cpBrawlerSel.options.length > 1) {
    const defaultPick = Array.from(cpBrawlerSel.options).find((o) => o.value === "MORTIS" || o.value === "PIPER")?.value || cpBrawlerSel.options[1].value;
    cpBrawlerSel.value = defaultPick;
    loadCounterPicker(defaultPick, "");
  }
});
