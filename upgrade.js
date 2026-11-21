// ============================================================================
// BrawlVault Upgrade Guide Page
// ============================================================================

const UPGRADE_STATE = {
  data: null,
  filter: "unlocked",
  search: "",
};

function renderSummary(data) {
  const p = data.player;
  const el = document.getElementById("upgrade-player-summary");
  el.classList.remove("hidden");
  const under11 = data.recommendations.filter((r) => r.unlocked).length;
  el.innerHTML = `
    <div class="summary-kpi">
      <span class="summary-label">PLAYER</span>
      <strong class="summary-val">${BV.esc(p.name)} <span class="muted-tag">${BV.esc(p.tag)}</span></strong>
    </div>
    <div class="summary-kpi">
      <span class="summary-label">TROPHIES</span>
      <strong class="summary-val gold-text">🏆 ${p.trophies.toLocaleString()}</strong>
    </div>
    <div class="summary-kpi">
      <span class="summary-label">LEVEL 11 MAXED</span>
      <strong class="summary-val green-text">${p.power11_count} / ${p.brawlers_owned}</strong>
    </div>
    <div class="summary-kpi">
      <span class="summary-label">TO UPGRADE</span>
      <strong class="summary-val">${under11} Brawlers</strong>
    </div>
  `;
}

function renderUpgradeCards() {
  const listEl = document.getElementById("upgrade-list");
  if (!UPGRADE_STATE.data) return;

  const q = UPGRADE_STATE.search.trim().toUpperCase();
  const recs = UPGRADE_STATE.data.recommendations.filter((r) => {
    if (q && !r.name.includes(q)) return false;
    if (UPGRADE_STATE.filter === "unlocked") return r.unlocked;
    if (UPGRADE_STATE.filter === "close") return r.unlocked && r.current_power >= 9;
    if (UPGRADE_STATE.filter === "low") return r.unlocked && r.current_power <= 8;
    if (UPGRADE_STATE.filter === "locked") return !r.unlocked;
    return true;
  });

  if (!recs.length) {
    listEl.innerHTML = `<div class="empty-card">No brawlers match this filter!</div>`;
    return;
  }

  listEl.innerHTML = "";
  recs.forEach((item, idx) => {
    const b = item.build || {};
    const priorityClass =
      item.tier === "S" ? "prio-s" : item.tier === "A" ? "prio-a" : item.tier === "B" ? "prio-b" : "prio-c";
    const levelLabel = item.unlocked ? `LV ${item.current_power} → LV 11` : "LOCKED";
    const mapsHtml = (item.best_maps || [])
      .map((m) => `<span class="mini-map-chip">${BV.esc(m.map)}</span>`)
      .join("");

    const spNote = b.star_power_pct ? ` (${b.star_power_pct}% pros)` : "";
    const gdNote = b.gadget_pct ? ` (${b.gadget_pct}% pros)` : "";
    const gearsText = (b.gears || []).length ? b.gears.join(" + ") : "DAMAGE + SHIELD";

    const card = document.createElement("article");
    card.className = "upgrade-card";
    card.innerHTML = `
      <div class="upgrade-card-head">
        <div class="upgrade-identity">
          <div class="upgrade-rank">#${idx + 1}</div>
          <img
            src="${BV.resolvePortraitUrl(item.portrait, item.id)}"
            alt="${BV.esc(item.name)}"
            loading="lazy"
            onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${item.id}.png'"
          />
          <div>
            <div class="upgrade-name-line">
              <h3 class="upgrade-name">${BV.esc(item.name)}</h3>
              <span class="tier-pill tier-${item.tier.toLowerCase()}">${item.tier}</span>
            </div>
            <div class="upgrade-level-row">
              <span class="level-tag">${levelLabel}</span>
              <span class="prio-tag ${priorityClass}">${item.priority_label}</span>
            </div>
          </div>
        </div>

        <div class="upgrade-meta-nums">
          <div class="meta-num"><span>Win</span><strong>${item.win_rate}%</strong></div>
          <div class="meta-num"><span>Pick</span><strong>${item.pick_rate}%</strong></div>
        </div>
      </div>

      <div class="upgrade-cost-row">
        <span class="cost-chip cost-coins">🪙 ${item.coins_needed.toLocaleString()} Coins</span>
        <span class="cost-chip cost-pp">⚡ ${item.pp_needed.toLocaleString()} Power Pts</span>
        <span class="cost-chip cost-score">AI Score ${item.meta_score}</span>
      </div>

      <div class="build-box">
        <div class="build-title">
          RECOMMENDED PRO BUILD
          ${b.pro_samples ? `<span class="build-sample">from ${b.pro_samples} Lv11 pros</span>` : ""}
        </div>
        <div class="build-row">
          <span class="build-key">★ Star Power</span>
          <span class="build-val">
            ${BV.esc(b.star_power)}${spNote}
            ${b.owns_star_power ? '<span class="owned-badge">✓ Owned</span>' : ""}
          </span>
        </div>
        <div class="build-row">
          <span class="build-key">⚙ Gadget</span>
          <span class="build-val">
            ${BV.esc(b.gadget)}${gdNote}
            ${b.owns_gadget ? '<span class="owned-badge">✓ Owned</span>' : ""}
          </span>
        </div>
        <div class="build-row">
          <span class="build-key">⛨ Gears</span>
          <span class="build-val">${BV.esc(gearsText)}</span>
        </div>
      </div>

      ${mapsHtml ? `<div class="upgrade-maps"><span class="maps-lbl">Best Maps:</span> ${mapsHtml}</div>` : ""}
    `;
    listEl.appendChild(card);
  });
}

async function loadUpgradeGuide(rawTag) {
  const norm = BV.normalizeTag(rawTag);
  const input = document.getElementById("upgrade-tag-input");
  const btn = document.getElementById("upgrade-load-btn");
  const listEl = document.getElementById("upgrade-list");

  if (!norm || norm.length < 4) {
    listEl.innerHTML = `<div class="empty-card error-card">Please enter a valid Brawl Stars tag (e.g. #2PP).</div>`;
    return;
  }

  input.value = norm;
  BV.setSavedTag(norm);
  btn.disabled = true;
  btn.textContent = "Analyzing...";
  listEl.innerHTML = `<div class="empty-card">Loading account &amp; live pro builds for ${BV.esc(norm)}...</div>`;

  try {
    const data = await BV.apiFetch(`/api/v1/player/${encodeURIComponent(BV.tagForUrl(norm))}/upgrade-guide`);
    UPGRADE_STATE.data = data;
    renderSummary(data);
    document.getElementById("upgrade-controls").classList.remove("hidden");
    renderUpgradeCards();
  } catch (err) {
    listEl.innerHTML = `<div class="empty-card error-card">${BV.esc(err.message || "Failed to load upgrade guide.")}</div>`;
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze Account";
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("upgrade-tag-form").addEventListener("submit", (e) => {
    e.preventDefault();
    loadUpgradeGuide(document.getElementById("upgrade-tag-input").value);
  });

  document.querySelectorAll(".filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      UPGRADE_STATE.filter = pill.dataset.filter;
      document.querySelectorAll(".filter-pill").forEach((p) => p.classList.toggle("active", p === pill));
      renderUpgradeCards();
    });
  });

  document.getElementById("upgrade-search").addEventListener("input", (e) => {
    UPGRADE_STATE.search = e.target.value;
    renderUpgradeCards();
  });

  const saved = BV.getSavedTag();
  if (saved) {
    document.getElementById("upgrade-tag-input").value = saved;
    loadUpgradeGuide(saved);
  }
});
