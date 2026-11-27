// ============================================================================
// BrawlVault Personal Training Hub (1-on-1 Ranked Training Ground)
// ============================================================================

const TRAINING_STATS_KEY = "bv_training_draft_quiz_v1";

const TR_STATE = {
  drill: "ai-coach",
  mode: "all",
  question: null,
  answered: false,
  selectedName: null,
  loading: false,
  quizInitialized: false,
  stats: loadTrainingStats(),
  recentAttempts: [],
  weakModes: [],
};

async function syncTrainingStatsFromServer() {
  try {
    const res = await BV.apiFetch("/api/v1/training/stats");
    if (res && typeof res.total === "number") {
      if (res.total >= TR_STATE.stats.total) {
        TR_STATE.stats = {
          streak: res.streak || 0,
          best: Math.max(res.best || 0, TR_STATE.stats.best || 0),
          correct: res.correct || 0,
          total: res.total || 0,
        };
        saveTrainingStats();
      }
      TR_STATE.recentAttempts = Array.isArray(res.recent_attempts) ? res.recent_attempts : [];
      TR_STATE.weakModes = Array.isArray(res.weak_modes) ? res.weak_modes : [];
      renderTrainingWorkspace();
    }
  } catch {
    // keep local stats if offline
  }
}

function loadTrainingStats() {
  try {
    const raw = localStorage.getItem(TRAINING_STATS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      streak: Number(parsed.streak || 0),
      best: Number(parsed.best || 0),
      correct: Number(parsed.correct || 0),
      total: Number(parsed.total || 0),
    };
  } catch {
    return { streak: 0, best: 0, correct: 0, total: 0 };
  }
}

function saveTrainingStats() {
  try {
    localStorage.setItem(TRAINING_STATS_KEY, JSON.stringify(TR_STATE.stats));
  } catch {
    // ignore storage errors
  }
  updateScoreHeader();
}

function updateScoreHeader() {
  const s = TR_STATE.stats;
  const stEl = document.getElementById("tr-streak");
  const bEl = document.getElementById("tr-best");
  const aEl = document.getElementById("tr-acc");
  if (stEl) stEl.textContent = String(s.streak);
  if (bEl) bEl.textContent = String(s.best);
  if (aEl) aEl.textContent = s.total > 0 ? `${Math.round((s.correct / s.total) * 100)}%` : "--%";
}

const QUIZ_MODES = [
  { id: "all", label: "All Modes" },
  { id: "gemGrab", label: "Gem Grab" },
  { id: "brawlBall", label: "Brawl Ball" },
  { id: "knockout", label: "Knockout" },
  { id: "bounty", label: "Bounty" },
  { id: "hotZone", label: "Hot Zone" },
  { id: "heist", label: "Heist" },
];

async function loadNextDraftQuestion() {
  TR_STATE.loading = true;
  TR_STATE.answered = false;
  TR_STATE.selectedName = null;
  renderTrainingWorkspace();

  try {
    const qs = TR_STATE.mode && TR_STATE.mode !== "all" ? `?mode=${encodeURIComponent(TR_STATE.mode)}` : "";
    const q = await BV.apiFetch(`/api/v1/training/draft-quiz${qs}`);
    TR_STATE.question = q;
  } catch (err) {
    TR_STATE.question = { error: err.message || "Could not load a verified pro draft right now." };
  } finally {
    TR_STATE.loading = false;
    renderTrainingWorkspace();
  }
}

function handleQuizAnswer(brawlerName) {
  if (TR_STATE.answered || !TR_STATE.question) return;
  TR_STATE.answered = true;
  TR_STATE.selectedName = brawlerName;

  const isRight = brawlerName === TR_STATE.question.correct_brawler;
  TR_STATE.stats.total += 1;
  if (isRight) {
    TR_STATE.stats.correct += 1;
    TR_STATE.stats.streak += 1;
    if (TR_STATE.stats.streak > TR_STATE.stats.best) {
      TR_STATE.stats.best = TR_STATE.stats.streak;
    }
  } else {
    TR_STATE.stats.streak = 0;
  }
  saveTrainingStats();
  renderTrainingWorkspace();

  BV.apiFetch("/api/v1/training/attempt", {
    method: "POST",
    body: JSON.stringify({
      drill: TR_STATE.drill,
      map: TR_STATE.question.map,
      mode: TR_STATE.question.mode,
      picked_brawler: brawlerName,
      correct_brawler: TR_STATE.question.correct_brawler,
      is_correct: isRight,
    }),
  })
    .then((res) => {
      if (res && typeof res.total === "number") {
        TR_STATE.stats = {
          streak: res.streak || 0,
          best: res.best || 0,
          correct: res.correct || 0,
          total: res.total || 0,
        };
        TR_STATE.recentAttempts = Array.isArray(res.recent_attempts) ? res.recent_attempts : [];
        TR_STATE.weakModes = Array.isArray(res.weak_modes) ? res.weak_modes : [];
        saveTrainingStats();
        renderTrainingWorkspace();
      }
    })
    .catch(() => {});
}

function renderTeamPill(b, sideClass) {
  return `
    <div class="quiz-pick-chip ${sideClass}">
      <img src="${BV.resolvePortraitUrl(b.portrait, b.id)}" alt="${BV.esc(b.name)}" loading="lazy" decoding="async" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${b.id}.png'" />
      <div>
        <strong>${BV.esc(b.name)}</strong>
        <span>${BV.esc(b.class_name || "")}</span>
      </div>
    </div>
  `;
}

function renderTrainingWorkspace() {
  const ws = document.getElementById("training-workspace");
  if (!ws) return;

  if (TR_STATE.drill === "coming-soon") {
    ws.innerHTML = `
      <section class="panel dyn-fade">
        <div class="verdict-eyebrow">⚡ EXPANDING 1-ON-1 TRAINING GROUND</div>
        <h3 class="brawl-title coaching-heading" style="margin-top:4px;">Upcoming Personal Training Drills</h3>
        <p class="coaching-sub" style="margin:8px 0 14px;">
          Personal Training is your dedicated hub to practice Ranked decision-making between games. More 1-on-1 drills will be added here next:
        </p>
        <div class="coaching-grid">
          <article class="coach-card">
            <div class="coach-head"><span class="coach-cat">DRILL #2</span><span class="coach-tag">PLANNED</span></div>
            <h4 class="coach-title">⚔ Speed Counter Drill</h4>
            <p class="coach-summary">Enemy locks a carry brawler on a random map — pick the hardest counter before a 10-second timer expires.</p>
          </article>
          <article class="coach-card">
            <div class="coach-head"><span class="coach-cat">DRILL #3</span><span class="coach-tag">PLANNED</span></div>
            <h4 class="coach-title">🚫 Ban Phase Trainer</h4>
            <p class="coach-summary">Practice choosing the right bans based on whether your team has 1st Pick or Last Pick.</p>
          </article>
          <article class="coach-card">
            <div class="coach-head"><span class="coach-cat">DRILL #4</span><span class="coach-tag">PLANNED</span></div>
            <h4 class="coach-title">✦ Vault AI Sparring Review</h4>
            <p class="coach-summary">Get personalized 1-on-1 feedback on the exact draft mistakes you miss most often.</p>
          </article>
        </div>
      </section>
    `;
    return;
  }

  const modePills = QUIZ_MODES.map(
    (m) => `<button type="button" class="filter-pill ${TR_STATE.mode === m.id ? "active" : ""}" data-qmode="${m.id}">${BV.esc(m.label)}</button>`
  ).join("");

  if (TR_STATE.loading) {
    ws.innerHTML = `
      <div class="ai-coach-prompts">${modePills}</div>
      <div class="empty-card">Finding a verified pro Ranked match (filtering out troll picks)...</div>
    `;
    bindModePills();
    return;
  }

  const q = TR_STATE.question;
  if (!q || q.error) {
    ws.innerHTML = `
      <div class="ai-coach-prompts">${modePills}</div>
      <div class="empty-card error-card">
        ${BV.esc(q?.error || "Could not load draft question.")}
        <div style="margin-top:10px;"><button type="button" id="quiz-retry-btn" class="btn btn-gold btn-sm">Try Again</button></div>
      </div>
    `;
    bindModePills();
    document.getElementById("quiz-retry-btn")?.addEventListener("click", loadNextDraftQuestion);
    return;
  }

  const isCorrectAnswer = TR_STATE.answered && TR_STATE.selectedName === q.correct_brawler;
  const correctOpt = (q.options || []).find((o) => o.is_correct);
  const openInDraftUrl = `/drafting/?mode=${encodeURIComponent(q.mode)}&map=${encodeURIComponent(q.map)}&fp=0&blue=${encodeURIComponent(q.ally_picks.map((a) => a.name).join(","))}&red=${encodeURIComponent(q.enemy_picks.map((e) => e.name).join(","))}`;

  const optionsHtml = (q.options || [])
    .map((opt) => {
      let stateCls = "";
      if (TR_STATE.answered) {
        if (opt.is_correct) stateCls = "quiz-opt-correct";
        else if (opt.name === TR_STATE.selectedName) stateCls = "quiz-opt-wrong";
        else stateCls = "quiz-opt-dim";
      }
      const statsReveal = TR_STATE.answered
        ? `<div class="quiz-opt-stats"><span>${opt.map_win_rate}% Map WR</span><span>•</span><span>${opt.pick_rate}% PR</span></div>`
        : "";
      return `
        <button type="button" class="quiz-option-card ${stateCls}" data-opt="${BV.esc(opt.name)}" ${TR_STATE.answered ? "disabled" : ""}>
          <img src="${BV.resolvePortraitUrl(opt.portrait, opt.id)}" alt="${BV.esc(opt.name)}" loading="lazy" decoding="async" onerror="this.src='https://cdn.brawlify.com/brawlers/borderless/${opt.id}.png'" />
          <div class="quiz-opt-info">
            <strong class="quiz-opt-name">${BV.esc(opt.name)}</strong>
            <span class="quiz-opt-cls">${BV.esc(opt.class_name)}</span>
            ${statsReveal}
          </div>
          ${TR_STATE.answered && opt.is_correct ? `<span class="quiz-badge-ok">✓ PRO PICK</span>` : ""}
          ${TR_STATE.answered && !opt.is_correct && opt.name === TR_STATE.selectedName ? `<span class="quiz-badge-no">✕ YOUR PICK</span>` : ""}
        </button>
      `;
    })
    .join("");

  const verdictHtml = TR_STATE.answered
    ? `
      <div class="quiz-verdict ${isCorrectAnswer ? "qv-ok" : "qv-bad"} dyn-fade">
        <div>
          <div class="verdict-eyebrow">${isCorrectAnswer ? "✓ SPOT ON • PRO-LEVEL READ" : "✕ NOT QUITE • REVIEW THE MATCHUP"}</div>
          <p class="ai-coach-p" style="margin-top:4px;">
            The winning pro locked <strong>${BV.esc(q.correct_brawler)}</strong> (${correctOpt ? `${correctOpt.ai_win_prob}% AI win chance • ${correctOpt.map_win_rate}% map WR` : ""}) — <strong>${BV.esc(q.correct_reason)}</strong>.
            ${q.ai_top_pick && q.ai_top_pick !== q.correct_brawler ? ` (Vault AI's #1 overall suggestion here was <strong>${BV.esc(q.ai_top_pick)}</strong>.)` : ""}
          </p>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;flex-shrink:0;">
          <a href="${openInDraftUrl}" class="btn btn-ghost btn-sm" style="text-decoration:none;">Inspect in Drafting →</a>
          <button type="button" id="quiz-next-btn" class="btn btn-gold btn-sm">Next Pro Draft →</button>
        </div>
      </div>
    `
    : "";

  ws.innerHTML = `
    <div class="ai-coach-prompts">${modePills}</div>

    <section class="panel quiz-arena dyn-fade">
      <div class="coaching-header" style="margin-bottom:12px;">
        <div>
          <div class="verdict-eyebrow">${BV.esc(BV.formatMode(q.mode).toUpperCase())} • ${q.map_matches.toLocaleString()} PRO GAMES</div>
          <h2 class="brawl-title coaching-heading">${BV.esc(q.map)} — Pick #6 (Last Pick)</h2>
        </div>
        <button type="button" id="quiz-skip-btn" class="btn btn-ghost btn-sm">Skip ↻</button>
      </div>

      <div class="quiz-teams-grid">
        <div class="quiz-team-box quiz-blue">
          <div class="team-header"><span>YOUR TEAM (BLUE)</span><span class="pick-order-tag">LAST PICK</span></div>
          <div class="quiz-picks-col">
            ${q.ally_picks.map((a) => renderTeamPill(a, "qp-blue")).join("")}
            <div class="quiz-pick-chip qp-mystery">
              <div class="qp-qmark">${TR_STATE.answered ? "✓" : "?"}</div>
              <div>
                <strong>${TR_STATE.answered ? BV.esc(q.correct_brawler) : "YOUR 6TH PICK"}</strong>
                <span>${TR_STATE.answered ? "Verified Pro Winner" : "Choose the best closer below"}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="quiz-team-box quiz-red">
          <div class="team-header"><span>ENEMY TEAM (RED)</span><span class="pick-order-tag">3 LOCKED</span></div>
          <div class="quiz-picks-col">
            ${q.enemy_picks.map((e) => renderTeamPill(e, "qp-red")).join("")}
          </div>
        </div>
      </div>

      <div class="rot-comp-label" style="margin:14px 0 8px;">WHICH BRAWLER COMPLETES BLUE'S COMP &amp; WINS THIS MATCHUP?</div>
      <div class="quiz-options-grid">${optionsHtml}</div>

      ${verdictHtml}
    </section>

    ${
      TR_STATE.recentAttempts.length
        ? `
      <section class="panel dyn-fade">
        <div class="coaching-header" style="margin-bottom:10px;">
          <div>
            <div class="verdict-eyebrow">📊 SAVED 1-ON-1 TRAINING DATA</div>
            <h3 class="brawl-title coaching-heading">Recent Drills &amp; Mode Accuracy</h3>
          </div>
          <span class="stat-chip">${TR_STATE.stats.correct}/${TR_STATE.stats.total} CORRECT</span>
        </div>
        ${
          TR_STATE.weakModes.length
            ? `<div class="ai-coach-prompts" style="margin-bottom:10px;">${TR_STATE.weakModes
                .map(
                  (m) =>
                    `<span class="stat-chip">${BV.esc(BV.formatMode(m.mode))}: ${m.accuracy}% (${m.correct}/${m.total})</span>`
                )
                .join("")}</div>`
            : ""
        }
        <div class="quiz-options-grid">
          ${TR_STATE.recentAttempts
            .slice(0, 6)
            .map(
              (a) => `
                <div class="quiz-pick-chip" style="justify-content:space-between;">
                  <div>
                    <strong>${BV.esc(a.map)} (${BV.esc(BV.formatMode(a.mode))})</strong>
                    <span>Picked: ${BV.esc(a.picked_brawler)} ${a.is_correct ? "" : `• Pro: ${BV.esc(a.correct_brawler)}`}</span>
                  </div>
                  <span class="${a.is_correct ? "quiz-badge-ok" : "quiz-badge-no"}">${a.is_correct ? "✓" : "✕"}</span>
                </div>
              `
            )
            .join("")}
        </div>
      </section>
    `
        : ""
    }
  `;

  bindModePills();
  ws.querySelectorAll(".quiz-option-card").forEach((btn) => {
    btn.addEventListener("click", () => handleQuizAnswer(btn.dataset.opt));
  });
  document.getElementById("quiz-next-btn")?.addEventListener("click", loadNextDraftQuestion);
  document.getElementById("quiz-skip-btn")?.addEventListener("click", loadNextDraftQuestion);
}

function bindModePills() {
  document.querySelectorAll("[data-qmode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      TR_STATE.mode = btn.dataset.qmode;
      loadNextDraftQuestion();
    });
  });
}

function setActiveTrainingDrill(drillName) {
  TR_STATE.drill = drillName;
  document.querySelectorAll("[data-drill]").forEach((b) => {
    b.classList.toggle("active", b.dataset.drill === drillName);
  });
  const coachPanel = document.getElementById("training-coach-panel");
  const quizPanel = document.getElementById("training-workspace");
  if (drillName === "ai-coach") {
    coachPanel?.classList.remove("hidden");
    quizPanel?.classList.add("hidden");
  } else {
    coachPanel?.classList.add("hidden");
    quizPanel?.classList.remove("hidden");
    if (drillName === "draft-quiz" && !TR_STATE.quizInitialized) {
      TR_STATE.quizInitialized = true;
      loadNextDraftQuestion();
    } else {
      renderTrainingWorkspace();
    }
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  updateScoreHeader();
  document.querySelectorAll("[data-drill]").forEach((btn) => {
    btn.addEventListener("click", () => setActiveTrainingDrill(btn.dataset.drill));
  });

  const params = new URLSearchParams(window.location.search);
  const qTab = (params.get("tab") || "").toLowerCase();
  if (qTab === "quiz" || qTab === "draft-quiz") {
    setActiveTrainingDrill("draft-quiz");
  } else {
    setActiveTrainingDrill("ai-coach");
  }

  await BV.authReady;
  syncTrainingStatsFromServer();
  BV.onAuthChange(() => syncTrainingStatsFromServer());
});
