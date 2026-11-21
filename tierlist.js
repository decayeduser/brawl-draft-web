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
  `;
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

  // Load mode & map options from metadata
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
  } catch {
    // ignore metadata error, still load overall tierlist
  }

  fetchTierList();
});
