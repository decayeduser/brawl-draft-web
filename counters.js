// ============================================================================
// BrawlVault Dedicated Counter Picker ("Who Beats Who?")
// ============================================================================

const CP_STATE = {
  brawlers: [],
  mapsByMode: {},
  mapMatchCounts: {},
  selectedBrawler: "",
  selectedMap: "",
  search: "",
  tierFallback: null,
  playerLv11Set: new Set(),
};

function renderQuickBrawlerGrid() {
  const grid = document.getElementById("cp-brawler-grid");
  if (!grid) return;
  const q = CP_STATE.search.trim().toUpperCase();
  const list = CP_STATE.brawlers.filter((b) => !q || b.name.includes(q));

  if (!list.length) {
    grid.innerHTML = `<div class="muted-tag" style="grid-column:1/-1;">No brawlers matching "${BV.esc(CP_STATE.search)}".</div>`;
    return;
  }

  grid.innerHTML = list
    .map((b) => {
      const isActive = b.name === CP_STATE.selectedBrawler;
      const isLv11 = CP_STATE.playerLv11Set.has(b.name.toUpperCase());
      return `
        <button type="button" class="tier-tile ${isLv11 ? "tile-lv11" : ""} ${isActive ? "cp-tile-active" : ""}" data-quick-b="${BV.esc(b.name)}">
          ${isLv11 ? '<span class="tile-badge badge-lv11">LV11</span>' : ""}
          <img
            src="${BV.resolvePortraitUrl(b.portrait, b.id)}"
            alt="${BV.esc(b.name)}"
            loading="lazy"
            onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${b.id}.png'"
          />
          <div class="tier-tile-name">${BV.esc(b.name)}</div>
        </button>
      `;
    })
    .join("");

  grid.querySelectorAll("[data-quick-b]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const name = btn.dataset.quickB;
      CP_STATE.selectedBrawler = name;
      document.getElementById("cp-brawler-select").value = name;
      renderQuickBrawlerGrid();
      loadCounterPicker(name, CP_STATE.selectedMap);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
}

function renderCounterResults(data) {
  const box = document.getElementById("cp-results");
  if (!box || !data) return;
  const t = data.target;
  const hard = data.hard_counters || [];
  const beats = data.beats_easily || [];
  const allies = data.best_allies || [];
  const bestMaps = data.best_maps || [];
  const worstMaps = data.worst_maps || [];
  const build = t.build || {};

  const renderCards = (arr, statKey, statSuffix) =>
    arr.length
      ? arr
          .map((item) => {
            const isLv11 = CP_STATE.playerLv11Set.has(item.name.toUpperCase());
            return `
              <button type="button" class="cp-chip-card ${isLv11 ? "tile-lv11" : ""}" data-cp-pick="${BV.esc(item.name)}">
                <img src="${BV.resolvePortraitUrl(item.portrait, item.id)}" alt="${BV.esc(item.name)}" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${item.id}.png'" />
                <div>
                  <strong>${BV.esc(item.name)}${isLv11 ? ' <span class="lv11-chip">LV11</span>' : ""}</strong>
                  <span>${item[statKey]}${statSuffix}</span>
                </div>
              </button>
            `;
          })
          .join("")
      : `<span class="muted-tag">Gathering more matchup samples...</span>`;

  box.innerHTML = `
    <div class="cp-target-bar">
      <img src="${BV.resolvePortraitUrl(t.portrait, t.id)}" alt="${BV.esc(t.name)}" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${t.id}.png'" />
      <div style="flex:1;min-width:0;">
        <div class="cp-target-name">HOW TO COUNTER <strong>${BV.esc(t.name)}</strong>${data.map && data.map !== "all" ? ` ON ${BV.esc(data.map.toUpperCase())}` : ""}</div>
        <div class="muted-tag">
          Global WR: ${t.global_win_rate ?? "--"}%
          ${build.star_power ? ` • Pro Build: ${BV.esc(build.star_power)} + ${BV.esc(build.gadget || "")}` : ""}
        </div>
      </div>
      ${data.map && data.map !== "all" ? `<span class="stat-chip chip-pick">${(data.map_matches || 0).toLocaleString()} map matches</span>` : ""}
    </div>

    <div class="cp-grid">
      <div class="cp-col cp-col-hard">
        <div class="cp-col-title">🛡 HARD COUNTERS (PICK THESE VS ${BV.esc(t.name)})</div>
        <div class="cp-card-list">${renderCards(hard, "win_rate_vs", "% WR vs")}</div>
      </div>

      <div class="cp-col">
        <div class="cp-col-title">🤝 BEST TEAMMATES (SYNERGIES WITH ${BV.esc(t.name)})</div>
        <div class="cp-card-list">${renderCards(allies, "synergy_win_rate", "% duo WR")}</div>
      </div>

      <div class="cp-col">
        <div class="cp-col-title">🎯 ${BV.esc(t.name)} BEATS EASILY (AVOID PICKING)</div>
        <div class="cp-card-list">${renderCards(beats, "target_win_rate", "% enemy WR")}</div>
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
      CP_STATE.selectedBrawler = nextB;
      document.getElementById("cp-brawler-select").value = nextB;
      renderQuickBrawlerGrid();
      loadCounterPicker(nextB, CP_STATE.selectedMap);
    });
  });
}

async function loadCounterPicker(brawlerName, mapName = "") {
  const box = document.getElementById("cp-results");
  if (!brawlerName) {
    box.innerHTML = `<div class="empty-card">Select any enemy brawler above or tap one below to see their hardest counters, best allies, and worst maps.</div>`;
    return;
  }

  box.innerHTML = `<div class="empty-card">Analyzing live matchups against ${BV.esc(brawlerName)}...</div>`;
  try {
    const qs = mapName ? `?map=${encodeURIComponent(mapName)}` : "";
    const data = await BV.apiFetch(`/api/v1/counters/${encodeURIComponent(brawlerName)}${qs}`);
    renderCounterResults(data);
  } catch {
    // Fallback from /api/v1/tierlist if Pi hasn't updated yet
    try {
      if (!CP_STATE.tierFallback) {
        CP_STATE.tierFallback = await BV.apiFetch("/api/v1/tierlist");
      }
      const allItems = Object.values(CP_STATE.tierFallback?.tiers || {}).flat();
      const target = allItems.find((x) => x.name === brawlerName);
      if (!target) throw new Error("not found");
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
      renderCounterResults({
        target: { id: target.id, name: target.name, portrait: target.portrait, global_win_rate: target.win_rate, build: target.build },
        map: mapName || "all",
        map_matches: mapName ? (CP_STATE.mapMatchCounts[mapName] || 0) : 0,
        hard_counters: counters,
        best_allies: allies,
        beats_easily: beats,
        best_maps: target.best_maps || [],
        worst_maps: [],
      });
    } catch {
      box.innerHTML = `<div class="empty-card error-card">Could not load matchups for ${BV.esc(brawlerName)}.</div>`;
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const bSel = document.getElementById("cp-brawler-select");
  const mSel = document.getElementById("cp-map-select");
  const searchEl = document.getElementById("cp-search");

  bSel.addEventListener("change", () => {
    CP_STATE.selectedBrawler = bSel.value;
    renderQuickBrawlerGrid();
    loadCounterPicker(CP_STATE.selectedBrawler, CP_STATE.selectedMap);
  });

  mSel.addEventListener("change", () => {
    CP_STATE.selectedMap = mSel.value;
    if (CP_STATE.selectedBrawler) {
      loadCounterPicker(CP_STATE.selectedBrawler, CP_STATE.selectedMap);
    }
  });

  searchEl.addEventListener("input", (e) => {
    CP_STATE.search = e.target.value;
    renderQuickBrawlerGrid();
  });

  const savedTag = BV.getSavedTag();
  if (savedTag) {
    BV.fetchPlayer(savedTag, false)
      .then((prof) => {
        CP_STATE.playerLv11Set = new Set((prof.power11_brawlers || []).map((n) => n.toUpperCase()));
        const bar = document.getElementById("cp-lv11-bar");
        bar.classList.remove("hidden");
        bar.innerHTML = `★ Highlighting <strong>${BV.esc(prof.name)}</strong>'s <strong>${prof.power11_count} Level 11</strong> counters in gold`;
        renderQuickBrawlerGrid();
        if (CP_STATE.selectedBrawler) loadCounterPicker(CP_STATE.selectedBrawler, CP_STATE.selectedMap);
      })
      .catch(() => {});
  }

  try {
    const meta = await BV.apiFetch("/api/v1/metadata");
    CP_STATE.brawlers = meta.brawlers || [];
    CP_STATE.mapsByMode = meta.maps_by_mode || {};
    CP_STATE.mapMatchCounts = meta.map_match_counts || {};

    CP_STATE.brawlers.forEach((b) => {
      const o = document.createElement("option");
      o.value = b.name;
      o.textContent = b.name;
      bSel.appendChild(o);
    });

    const allMaps = Array.from(new Set(Object.values(CP_STATE.mapsByMode).flat()));
    allMaps.sort((a, b) => (CP_STATE.mapMatchCounts[b] || 0) - (CP_STATE.mapMatchCounts[a] || 0));
    allMaps.forEach((mp) => {
      const cnt = CP_STATE.mapMatchCounts[mp] || 0;
      const o = document.createElement("option");
      o.value = mp;
      o.textContent = cnt > 0 ? `${mp} (${cnt})` : mp;
      mSel.appendChild(o);
    });

    const params = new URLSearchParams(window.location.search);
    const qBrawler = (params.get("brawler") || "").toUpperCase();
    const qMap = params.get("map") || "";

    if (qMap && allMaps.includes(qMap)) {
      CP_STATE.selectedMap = qMap;
      mSel.value = qMap;
    }

    const defaultBrawler =
      (qBrawler && CP_STATE.brawlers.find((b) => b.name === qBrawler)?.name) ||
      CP_STATE.brawlers.find((b) => b.name === "MORTIS" || b.name === "PIPER")?.name ||
      CP_STATE.brawlers[0]?.name ||
      "";

    CP_STATE.selectedBrawler = defaultBrawler;
    bSel.value = defaultBrawler;
    renderQuickBrawlerGrid();
    loadCounterPicker(defaultBrawler, CP_STATE.selectedMap);
  } catch (err) {
    document.getElementById("cp-results").innerHTML = `<div class="empty-card error-card">${BV.esc(err.message || "Could not load brawler list.")}</div>`;
  }
});
