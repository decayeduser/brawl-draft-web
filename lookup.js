// ============================================================================
// BrawlVault Player & Club Lookup (with Rating out of 10)
// ============================================================================

const LOOKUP_STATE = {
  type: "player",
  subTab: "matches",
  lastPlayer: null,
};

function setLookupType(type) {
  LOOKUP_STATE.type = type;
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.type === type);
  });
  const input = document.getElementById("lookup-tag-input");
  input.placeholder = type === "club" ? "Enter Club Tag (e.g. #2PP)" : "Enter Player Tag (e.g. #2PP)";
}

function scoreColorClass(score) {
  if (score >= 8.0) return "score-elite";
  if (score >= 6.5) return "score-good";
  if (score >= 5.0) return "score-mid";
  return "score-low";
}

function renderPlayerSubTab() {
  const container = document.getElementById("player-sub-content");
  const p = LOOKUP_STATE.lastPlayer;
  if (!container || !p) return;

  if (LOOKUP_STATE.subTab === "matches") {
    const matches = p.battle_stats?.recent_matches || [];
    if (!matches.length) {
      container.innerHTML = `<div class="empty-card">No recent matches in battlelog.</div>`;
      return;
    }
    container.innerHTML = `<div class="match-list">${matches
      .map((m) => {
        const resClass = m.result === "victory" ? "res-win" : m.result === "defeat" ? "res-loss" : "res-draw";
        const resLabel = m.result === "victory" ? "WIN" : m.result === "defeat" ? "LOSS" : "DRAW";
        const trophyChip =
          typeof m.trophy_change === "number"
            ? `<span class="match-trophy ${m.trophy_change >= 0 ? "pos" : "neg"}">${m.trophy_change >= 0 ? "+" : ""}${m.trophy_change} 🏆</span>`
            : "";
        return `
          <div class="match-row ${resClass}">
            ${m.portrait ? `<img src="${m.portrait}" alt="${BV.esc(m.brawler)}" onerror="this.style.display='none'" />` : `<div class="match-img-empty">?</div>`}
            <div class="match-info">
              <div class="match-title">
                <strong>${BV.esc(m.brawler || "Brawler")}</strong>
                <span class="match-mode-tag">${BV.esc(BV.formatMode(m.mode))}</span>
                ${m.star_player ? '<span class="sp-badge">★ STAR PLAYER</span>' : ""}
              </div>
              <div class="match-map">${BV.esc(m.map)} • ${BV.esc(m.type)}</div>
            </div>
            <div class="match-right">
              <span class="match-res-badge ${resClass}">${resLabel}</span>
              ${trophyChip}
            </div>
          </div>
        `;
      })
      .join("")}</div>`;
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

function renderPlayerProfile(p) {
  LOOKUP_STATE.lastPlayer = p;
  LOOKUP_STATE.subTab = "matches";

  const rating = p.rating || { score: 5.0, grade: "PLAYER", breakdown: [] };
  const bs = p.battle_stats || {};
  const isSaved = BV.getSavedTag() === BV.normalizeTag(p.tag);

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

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <div class="profile-hero">
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
            <button type="button" id="save-my-tag-btn" class="btn ${isSaved ? "btn-blue" : "btn-gold"} btn-sm">
              ${isSaved ? "✓ Saved as My ID" : "★ Set as My ID"}
            </button>
            <a href="../upgrade/" class="btn btn-ghost btn-sm">Upgrade Guide →</a>
          </div>
        </div>

        <div class="stats-grid">
          <div class="stat-tile"><span>Trophies</span><strong class="gold-text">🏆 ${p.trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Highest Trophies</span><strong>${p.highest_trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>3v3 Victories</span><strong>${p.victories_3v3.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Recent Win Rate</span><strong class="green-text">${bs.win_rate != null ? `${bs.win_rate}%` : "N/A"}</strong></div>
          <div class="stat-tile"><span>W/L Ratio (Last ${bs.matches_analyzed || 0})</span><strong>${bs.wl_ratio != null ? `${bs.wl_ratio} (${bs.wins}W-${bs.losses}L)` : "N/A"}</strong></div>
          <div class="stat-tile"><span>Star Player Rate</span><strong class="gold-text">${bs.star_player_rate != null ? `${bs.star_player_rate}%` : "N/A"}</strong></div>
          <div class="stat-tile"><span>Ranked Win Rate</span><strong>${bs.ranked_win_rate != null ? `${bs.ranked_win_rate}% (${bs.ranked_games}g)` : "No recent Ranked"}</strong></div>
          <div class="stat-tile"><span>Level 11 Brawlers</span><strong class="green-text">${p.power11_count} / ${p.brawlers_owned}</strong></div>
          <div class="stat-tile"><span>1,000+ Trophy Brawlers</span><strong>${p.max_tier_brawlers}</strong></div>
          <div class="stat-tile"><span>Avg Power Level</span><strong>${p.avg_power}</strong></div>
        </div>
        <div class="api-note">
          Note: Supercell's official API provides Win Rate, W/L Ratio, and Star Player % from the last 25 battles (raw K/D is not exposed by the official API).
        </div>
      </div>

      <div class="rating-card ${scoreColorClass(rating.score)}">
        <div class="rating-label">BRAWLVAULT RATING</div>
        <div class="rating-score-big">
          <span class="brawl-title">${rating.score.toFixed(1)}</span>
          <small>/ 10</small>
        </div>
        <div class="rating-grade">${BV.esc(rating.grade)}</div>
        <div class="rating-breakdown">${breakdownHtml}</div>
      </div>
    </div>

    <div class="sub-tabs-bar">
      <button type="button" class="sub-tab active" data-sub="matches">Recent Matches (${(bs.recent_matches || []).length})</button>
      <button type="button" class="sub-tab" data-sub="brawlers">All Brawlers (${p.brawlers_owned})</button>
    </div>
    <div id="player-sub-content"></div>
  `;

  document.getElementById("save-my-tag-btn").addEventListener("click", (e) => {
    BV.setSavedTag(p.tag);
    BV.setCachedProfile(p);
    e.currentTarget.textContent = "✓ Saved as My ID";
    e.currentTarget.className = "btn btn-blue btn-sm";
  });

  const clubBtn = document.getElementById("jump-club-btn");
  if (clubBtn && p.club) {
    clubBtn.addEventListener("click", () => {
      setLookupType("club");
      document.getElementById("lookup-tag-input").value = p.club.tag;
      runLookup("club", p.club.tag);
    });
  }

  document.querySelectorAll(".sub-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      LOOKUP_STATE.subTab = btn.dataset.sub;
      document.querySelectorAll(".sub-tab").forEach((b) => b.classList.toggle("active", b === btn));
      renderPlayerSubTab();
    });
  });

  renderPlayerSubTab();
}

function renderClubProfile(c) {
  const rating = c.rating || { score: 5.0, grade: "CLUB", breakdown: [] };
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

  const membersHtml = (c.members || [])
    .map(
      (m, idx) => `
        <button type="button" class="club-member-row" data-tag="${BV.esc(m.tag)}">
          <span class="member-rank">#${idx + 1}</span>
          <div class="member-info">
            <strong>${BV.esc(m.name)}</strong>
            <span class="member-meta">${BV.esc(m.tag)} • ${BV.esc(m.role)}</span>
          </div>
          <span class="member-trophies">🏆 ${m.trophies.toLocaleString()}</span>
        </button>
      `
    )
    .join("");

  const resultEl = document.getElementById("lookup-result");
  resultEl.innerHTML = `
    <div class="profile-hero">
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
          <div class="stat-tile"><span>Avg Member Trophies</span><strong>${c.avg_trophies.toLocaleString()}</strong></div>
          <div class="stat-tile"><span>Members</span><strong class="green-text">${c.member_count} / 30</strong></div>
          <div class="stat-tile"><span>Required Trophies</span><strong>${c.required_trophies.toLocaleString()}</strong></div>
        </div>
      </div>

      <div class="rating-card ${scoreColorClass(rating.score)}">
        <div class="rating-label">CLUB RATING</div>
        <div class="rating-score-big">
          <span class="brawl-title">${rating.score.toFixed(1)}</span>
          <small>/ 10</small>
        </div>
        <div class="rating-grade">${BV.esc(rating.grade)}</div>
        <div class="rating-breakdown">${breakdownHtml}</div>
      </div>
    </div>

    <div class="panel">
      <div class="section-bar-title">CLUB MEMBERS (TAP ANY MEMBER TO INSPECT &amp; RATE)</div>
      <div class="club-member-list">${membersHtml}</div>
    </div>
  `;

  document.querySelectorAll(".club-member-row").forEach((row) => {
    row.addEventListener("click", () => {
      const mTag = row.dataset.tag;
      setLookupType("player");
      document.getElementById("lookup-tag-input").value = mTag;
      runLookup("player", mTag);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  });
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

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".lookup-type-btn").forEach((btn) => {
    btn.addEventListener("click", () => setLookupType(btn.dataset.type));
  });

  document.getElementById("lookup-form").addEventListener("submit", (e) => {
    e.preventDefault();
    runLookup(LOOKUP_STATE.type, document.getElementById("lookup-tag-input").value);
  });

  const params = new URLSearchParams(window.location.search);
  const qClub = params.get("club");
  const qPlayer = params.get("player");

  if (qClub) {
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
