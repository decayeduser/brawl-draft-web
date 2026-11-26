// ============================================================================
// BrawlVault Dedicated AI Coach Page (Powered by Gemini + Live Brawl Data)
// ============================================================================

const COACH_STATE = {
  type: "player",
  tag: "",
  profile: null,
  messages: [],
};

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
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      continue;
    }
    if (/^#{1,3}\s+/.test(t)) {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
      out.push(`<h4 class="ai-coach-h">${inlineFmt(t.replace(/^#{1,3}\s+/, ""))}</h4>`);
    } else if (/^[-*•]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      if (!inList) {
        out.push('<ul class="ai-coach-ul">');
        inList = true;
      }
      out.push(`<li>${inlineFmt(t.replace(/^([-*•]|\d+\.)\s+/, ""))}</li>`);
    } else {
      if (inList) {
        out.push("</ul>");
        inList = false;
      }
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

  const prompts = isClub
    ? [
        { label: "Full Clan Audit", q: "" },
        { label: "Recruiting & Kick Plan", q: "Give a concrete recruiting & kick plan to push this clan above the 50k trophy average." },
        { label: "Mega Pig & Roles", q: "How should we organize Mega Pig and leadership roles based on our roster?" },
        { label: "Brutal Clan Roast", q: "Roast this clan honestly using its real trophy stats, then give 2 fast fixes." },
      ]
    : [
        { label: "Full Breakdown", q: "" },
        { label: "Best 3 Brawlers to Push", q: "Which exact 3 brawlers on my account should I push or upgrade first this week and why?" },
        { label: "Fix My Recent Losses", q: "Analyze my recent match history and tell me why I am losing games and what to change." },
        { label: "Ranked Draft Tips", q: "Based on my Level 11 brawlers and the current S-tier meta, what should my Ranked draft strategy be?" },
        { label: "Honest Roast", q: "Roast my account brutally using my real stats vs the 50k average, then tell me how to fix it." },
      ];

  const lookupHref = isClub
    ? `/lookup/?club=${encodeURIComponent(p.tag)}`
    : `/lookup/?player=${encodeURIComponent(p.tag)}`;

  ws.innerHTML = `
    <div class="panel dyn-fade">
      <div class="profile-top-row" style="margin-bottom:12px;">
        <div>
          <h2 class="brawl-title profile-name">${isClub ? "🛡 " : ""}${BV.esc(p.name)}</h2>
          <span class="profile-tag">${BV.esc(p.tag)}</span>
        </div>
        <div class="profile-actions">
          <a href="${lookupHref}" class="btn btn-ghost btn-sm">Full Stats &amp; Roadmap →</a>
        </div>
      </div>
      <div class="stats-grid">${kpis}</div>
    </div>

    <section class="panel ai-coach-panel dyn-fade">
      <div class="coaching-header">
        <div>
          <div class="verdict-eyebrow">✦ INTERACTIVE AI COACH</div>
          <h3 class="brawl-title coaching-heading">Ask About ${BV.esc(p.name)}</h3>
        </div>
        <span id="coach-status-badge" class="stat-chip">READY</span>
      </div>

      <div class="ai-coach-prompts">
        ${prompts
          .map(
            (pr) =>
              `<button type="button" class="filter-pill coach-prompt-btn" data-q="${BV.esc(pr.q)}">${BV.esc(pr.label)}</button>`
          )
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
    const inp = document.getElementById("coach-question-input");
    const q = inp.value.trim();
    askAiCoach(q);
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
      if (badge) badge.textContent = `AI LIVE (${res.model || "GEMINI"})`;
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
      "Get personalized Gemini AI breakdowns, match analysis, and custom coaching for your account or clan — 100% free with a Google account."
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
    COACH_STATE.profile = data;
    COACH_STATE.messages = [];
    renderCoachWorkspace();
    askAiCoach("");
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
        "Get personalized Gemini AI breakdowns, match analysis, and custom coaching for your account or clan — 100% free with a Google account."
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
        ws.innerHTML = `<div class="empty-card">You're signed in! Enter your Brawl Stars Player Tag or Clan Tag above to start AI Coaching.</div>`;
      }
    }
  };

  await BV.authReady;
  initCoachView();
  BV.onAuthChange(() => initCoachView());
});
