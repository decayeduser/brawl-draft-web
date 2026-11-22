// ============================================================================
// BrawlVault Community Match Guides (Powered by Supabase Auth + RLS)
// ============================================================================
// Paste your Supabase Project URL and public anon key below after creating
// your free project at https://supabase.com
const SUPABASE_URL = "https://fbyawujjntnqeiebekbd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_A3dcfemnDJuiRcndoKerTA_s185fVRY";
// ============================================================================

const IS_CONFIGURED =
  !SUPABASE_URL.includes("REPLACE_WITH") && !SUPABASE_ANON_KEY.includes("REPLACE_WITH");

const sb =
  IS_CONFIGURED && window.supabase
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

const GUIDES_STATE = {
  user: null,
  profile: null,
  guides: [],
  guidesLoaded: false,
  myVotes: new Set(),
  brawlers: [],
  mapsByMode: {},
  sort: "top",
  modeFilter: "",
  brawlerFilter: "",
  search: "",
};

// ============================================================================
// Content Moderation (Blocks illegal/scam/XSS/links & censors/blocks profanity)
// ============================================================================
const PROHIBITED_PATTERNS = [
  // External URLs, phishing, scam invites
  /(?:https?:\/\/|www\.|discord\.gg\/|t\.me\/|bit\.ly\/|tinyurl\.com\/)/i,
  // Scams, account selling, hacks/cheats, cybercrime
  /\b(?:free\s*gems?|gem\s*generator|brawl\s*hack|mod\s*apk|cheat\s*engine|account\s*for\s*sale|sell(?:ing)?\s*account|buy\s*account|cracked\s*account|steal\s*account|hack\s*account|ip\s*grabber|ddos|doxx?(?:ing)?|swat(?:ting)?|carding|phishing|ransomware|keylogger)\b/i,
  // Severe illegal / harmful / self-harm / illicit sales / violence
  /\b(?:csam|cp\s*links?|child\s*porn|pedophile|kill\s*yourself|kys|commit\s*suicide|bomb\s*making|how\s*to\s*make\s*a\s*bomb|buy\s*cocaine|buy\s*heroin|buy\s*meth|buy\s*fentanyl|sell\s*drugs|buy\s*drugs|buy\s*illegal\s*guns?|mass\s*shooting|terrorism|terrorist\s*attack)\b/i,
  // Script / HTML injection attempts
  /<\s*script|javascript:|onerror\s*=|onload\s*=/i,
];

const PROFANITY_WORDS = [
  // English profanity & severe slurs (matched on whole word boundaries)
  "fuck", "fucker", "fucking", "fucked", "motherfucker", "shit", "bullshit", "shitty",
  "bitch", "bitches", "bastard", "asshole", "dickhead", "cunt", "whore", "slut",
  "cocksucker", "nigger", "nigga", "faggot", "fag", "retard", "retarded", "rape", "rapist",
  "nazi", "hitler", "porn", "pornhub", "xvideos", "hentai", "blowjob", "handjob",
  // Turkish profanity
  "amk", "aq", "amq", "orospu", "oruspu", "oç", "oc", "piç", "piçlik", "piclik",
  "siktir", "sikim", "sikeyim", "sikerim", "sikik", "yarrak", "yarak", "göt",
  "götveren", "gotveren", "kahpe", "pezevenk", "ibne", "gavat", "yavşak", "yavsak",
  "şerefsiz", "serefsiz", "ananı", "anani",
];

function normalizeForFilter(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/\u0307/g, "") // Strip combining dot from Turkish uppercase İ.toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/[0]/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/[7]/g, "t")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ş/g, "s")
    .replace(/ü/g, "u");
}

const PROFANITY_PATTERN_SRC = `(^|[^\\p{L}\\p{N}])(${PROFANITY_WORDS.join("|")})(?=$|[^\\p{L}\\p{N}])`;
const PROFANITY_TEST_REGEX = new RegExp(PROFANITY_PATTERN_SRC, "iu");
const PROFANITY_REPLACE_REGEX = new RegExp(PROFANITY_PATTERN_SRC, "giu");

function checkGuideModeration(fields) {
  const combined = fields.filter(Boolean).join("\n");
  const normalized = normalizeForFilter(combined);
  // Collapse spaced-out evasion like "f u c k" or "f.u.c.k" inside short tokens
  const collapsed = normalized.replace(/(?<=\b[a-z])[\s._*-]+(?=[a-z]\b)/g, "");

  for (const pat of PROHIBITED_PATTERNS) {
    if (pat.test(combined) || pat.test(normalized)) {
      return "Your guide contains prohibited links, scam/hack terms, or illegal content and cannot be published.";
    }
  }
  if (
    PROFANITY_TEST_REGEX.test(combined) ||
    PROFANITY_TEST_REGEX.test(normalized) ||
    PROFANITY_TEST_REGEX.test(collapsed)
  ) {
    return "Please remove swear words or offensive language before publishing your guide.";
  }
  return null;
}

function censorDisplay(text) {
  if (!text) return "";
  return String(text).replace(
    PROFANITY_REPLACE_REGEX,
    (_m, lead, word) => `${lead}${"*".repeat(word.length)}`
  );
}

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const sec = Math.max(0, Math.floor((Date.now() - new Date(isoStr).getTime()) / 1000));
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function renderAuthBar() {
  const bar = document.getElementById("guides-auth-bar");
  const mineBtn = document.getElementById("filter-mine-btn");

  if (!sb) {
    bar.innerHTML = `<span class="stat-chip chip-pick">Connect Supabase to enable Google Login</span>`;
    mineBtn.classList.add("hidden");
    return;
  }

  if (!GUIDES_STATE.user) {
    mineBtn.classList.add("hidden");
    bar.innerHTML = `
      <button type="button" id="google-signin-btn" class="btn btn-google">
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.7 2.87c2.16-2 3.72-4.94 3.72-8.69z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.7-2.87c-.98.66-2.23 1.06-3.58 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        </svg>
        <span>Sign in with Google</span>
      </button>
    `;
    document.getElementById("google-signin-btn").addEventListener("click", signInWithGoogle);
    return;
  }

  mineBtn.classList.remove("hidden");
  const name = GUIDES_STATE.profile?.display_name || GUIDES_STATE.user.user_metadata?.full_name || "Player";
  const avatar = GUIDES_STATE.profile?.avatar_url || GUIDES_STATE.user.user_metadata?.avatar_url || "";
  const adminBadge = GUIDES_STATE.profile?.is_admin ? `<span class="lv11-chip">ADMIN</span>` : "";

  bar.innerHTML = `
    <div class="auth-user-pill">
      ${avatar ? `<img src="${BV.esc(avatar)}" alt="" class="auth-avatar" referrerpolicy="no-referrer" />` : ""}
      <span class="auth-user-name">${BV.esc(name)} ${adminBadge}</span>
    </div>
    <button type="button" id="open-write-btn" class="btn btn-gold btn-sm">+ Write Guide</button>
    <button type="button" id="signout-btn" class="btn btn-ghost btn-sm">Sign Out</button>
  `;

  document.getElementById("open-write-btn").addEventListener("click", openWriteModal);
  document.getElementById("signout-btn").addEventListener("click", async () => {
    await sb.auth.signOut();
    GUIDES_STATE.user = null;
    GUIDES_STATE.profile = null;
    GUIDES_STATE.myVotes.clear();
    if (GUIDES_STATE.sort === "mine") GUIDES_STATE.sort = "top";
    renderAuthBar();
    renderGuides();
  });
}

async function signInWithGoogle() {
  if (!sb) return;
  const redirectTo = `${window.location.origin}/guides/`;
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error) {
    alert(`Google sign-in failed: ${error.message}`);
  }
}

async function ensureUserProfile(user) {
  if (!sb || !user) return null;
  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || "Brawler";
  const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || "";
  const savedTag = BV.getSavedTag();

  const { data: existing } = await sb
    .from("profiles")
    .select("id, display_name, avatar_url, brawl_tag, is_admin")
    .eq("id", user.id)
    .maybeSingle();

  if (existing) {
    return existing;
  }

  const { data: created } = await sb
    .from("profiles")
    .insert({
      id: user.id,
      display_name: displayName,
      avatar_url: avatarUrl,
      brawl_tag: savedTag,
    })
    .select("id, display_name, avatar_url, brawl_tag, is_admin")
    .single();

  return created || { id: user.id, display_name: displayName, avatar_url: avatarUrl, is_admin: false };
}

async function fetchMyVotes() {
  GUIDES_STATE.myVotes.clear();
  if (!sb || !GUIDES_STATE.user) return;
  const { data } = await sb
    .from("guide_votes")
    .select("guide_id")
    .eq("user_id", GUIDES_STATE.user.id);
  (data || []).forEach((v) => GUIDES_STATE.myVotes.add(v.guide_id));
}

async function fetchGuides() {
  const grid = document.getElementById("guides-grid");
  if (!sb) {
    grid.innerHTML = `
      <div class="empty-card">
        <strong>Match Guides is ready to connect!</strong><br />
        Create your free Supabase project, run <code>supabase-schema.sql</code>, enable Google Login, and paste your Supabase URL &amp; anon key into <code>guides.js</code>.
      </div>
    `;
    return;
  }

  grid.innerHTML = `<div class="empty-card">Loading community match guides...</div>`;

  let query = sb
    .from("guides")
    .select("*")
    .limit(80);

  if (GUIDES_STATE.sort === "new") {
    query = query.order("created_at", { ascending: false });
  } else {
    query = query.order("upvotes_count", { ascending: false }).order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) {
    GUIDES_STATE.guidesLoaded = false;
    grid.innerHTML = `<div class="empty-card error-card">Could not load guides: ${BV.esc(error.message)}</div>`;
    return;
  }

  GUIDES_STATE.guides = data || [];
  GUIDES_STATE.guidesLoaded = true;
  renderGuides();
}

function getFilteredGuides() {
  const q = GUIDES_STATE.search.trim().toLowerCase();
  return GUIDES_STATE.guides.filter((g) => {
    if (GUIDES_STATE.sort === "mine" && (!GUIDES_STATE.user || g.author_id !== GUIDES_STATE.user.id)) {
      return false;
    }
    if (GUIDES_STATE.modeFilter && g.mode !== GUIDES_STATE.modeFilter) return false;
    if (GUIDES_STATE.brawlerFilter && g.brawler !== GUIDES_STATE.brawlerFilter) return false;
    if (q) {
      const hay = `${g.title} ${g.brawler} ${g.map} ${g.body} ${g.author_name}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

async function toggleUpvote(guideId) {
  if (!sb) return;
  if (!GUIDES_STATE.user) {
    signInWithGoogle();
    return;
  }

  const guide = GUIDES_STATE.guides.find((g) => g.id === guideId);
  if (!guide) return;

  const already = GUIDES_STATE.myVotes.has(guideId);
  if (already) {
    GUIDES_STATE.myVotes.delete(guideId);
    guide.upvotes_count = Math.max(0, (guide.upvotes_count || 0) - 1);
    renderGuides();
    await sb.from("guide_votes").delete().eq("guide_id", guideId).eq("user_id", GUIDES_STATE.user.id);
  } else {
    GUIDES_STATE.myVotes.add(guideId);
    guide.upvotes_count = (guide.upvotes_count || 0) + 1;
    renderGuides();
    await sb.from("guide_votes").insert({ guide_id: guideId, user_id: GUIDES_STATE.user.id });
  }
}

async function deleteGuide(guideId) {
  if (!sb || !GUIDES_STATE.user) return;
  if (!confirm("Delete this guide permanently?")) return;
  const { error } = await sb.from("guides").delete().eq("id", guideId);
  if (error) {
    alert(`Could not delete guide: ${error.message}`);
    return;
  }
  GUIDES_STATE.guides = GUIDES_STATE.guides.filter((g) => g.id !== guideId);
  document.getElementById("read-guide-modal").classList.add("hidden");
  renderGuides();
}

function openReadModal(guide) {
  const modal = document.getElementById("read-guide-modal");
  const content = document.getElementById("read-modal-content");
  const canDelete =
    GUIDES_STATE.user &&
    (GUIDES_STATE.user.id === guide.author_id || GUIDES_STATE.profile?.is_admin);
  const voted = GUIDES_STATE.myVotes.has(guide.id);
  const portrait = guide.brawler_id
    ? `https://cdn.brawlify.com/brawlers/borderless/${guide.brawler_id}.png`
    : "";

  const buildParts = [];
  if (guide.star_power) buildParts.push(`<div class="build-row"><span class="build-key">★ Star Power</span><span class="build-val">${BV.esc(censorDisplay(guide.star_power))}</span></div>`);
  if (guide.gadget) buildParts.push(`<div class="build-row"><span class="build-key">⚙ Gadget</span><span class="build-val">${BV.esc(censorDisplay(guide.gadget))}</span></div>`);
  if (guide.gears) buildParts.push(`<div class="build-row"><span class="build-key">⛨ Gears</span><span class="build-val">${BV.esc(censorDisplay(guide.gears))}</span></div>`);

  content.innerHTML = `
    <div class="modal-head">
      ${portrait ? `<img src="${portrait}" alt="${BV.esc(guide.brawler)}" onerror="this.style.display='none'" />` : ""}
      <div>
        <div class="guide-pills-row">
          <span class="stat-chip chip-pick">${BV.esc(guide.brawler)}</span>
          <span class="stat-chip">${BV.esc(guide.mode === "all" ? "All Modes" : BV.formatMode(guide.mode))}</span>
          <span class="stat-chip">${BV.esc(guide.map || "Any Map")}</span>
        </div>
        <h2 class="guide-modal-title">${BV.esc(censorDisplay(guide.title))}</h2>
        <div class="guide-author-line">
          ${guide.author_avatar ? `<img src="${BV.esc(guide.author_avatar)}" alt="" class="mini-avatar" referrerpolicy="no-referrer" />` : ""}
          <span>by <strong>${BV.esc(censorDisplay(guide.author_name))}</strong> • ${timeAgo(guide.created_at)}</span>
        </div>
      </div>
    </div>

    ${buildParts.length ? `<div class="build-box"><div class="build-title">RECOMMENDED BUILD</div>${buildParts.join("")}</div>` : ""}

    ${
      guide.synergies || guide.counters
        ? `<div class="guide-matchup-chips">
            ${guide.synergies ? `<div class="gm-chip gm-syn"><strong>Best With:</strong> ${BV.esc(censorDisplay(guide.synergies))}</div>` : ""}
            ${guide.counters ? `<div class="gm-chip gm-cnt"><strong>Matchups:</strong> ${BV.esc(censorDisplay(guide.counters))}</div>` : ""}
          </div>`
        : ""
    }

    <div class="guide-full-body">${BV.esc(censorDisplay(guide.body))}</div>

    <div class="guide-modal-footer">
      <button type="button" id="modal-upvote-btn" class="btn ${voted ? "btn-gold" : "btn-ghost"} btn-sm">
        ▲ ${voted ? "Upvoted" : "Upvote"} (${guide.upvotes_count || 0})
      </button>
      ${canDelete ? `<button type="button" id="modal-delete-btn" class="btn btn-danger btn-sm">Delete Guide</button>` : ""}
    </div>
  `;

  document.getElementById("modal-upvote-btn").addEventListener("click", async () => {
    await toggleUpvote(guide.id);
    openReadModal(guide);
  });

  const delBtn = document.getElementById("modal-delete-btn");
  if (delBtn) {
    delBtn.addEventListener("click", () => deleteGuide(guide.id));
  }

  modal.classList.remove("hidden");
}

function renderGuides() {
  const grid = document.getElementById("guides-grid");
  if (!sb) return;

  const list = getFilteredGuides();
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-card">
        No match guides found for this filter yet.
        ${GUIDES_STATE.user ? "Click <strong>+ Write Guide</strong> to publish the first one!" : "Sign in with Google to write the first guide!"}
      </div>
    `;
    return;
  }

  grid.innerHTML = "";
  list.forEach((g) => {
    const voted = GUIDES_STATE.myVotes.has(g.id);
    const portrait = g.brawler_id
      ? `https://cdn.brawlify.com/brawlers/borderless/${g.brawler_id}.png`
      : "";
    const cleanBody = censorDisplay(g.body);
    const preview = cleanBody.length > 185 ? `${cleanBody.slice(0, 185).trim()}…` : cleanBody;

    const card = document.createElement("article");
    card.className = "guide-card";
    card.innerHTML = `
      <div class="guide-card-top">
        <div class="guide-card-brawler">
          ${portrait ? `<img src="${portrait}" alt="${BV.esc(g.brawler)}" loading="lazy" onerror="this.style.display='none'" />` : ""}
          <div class="guide-card-titles">
            <div class="guide-pills-row">
              <span class="stat-chip chip-pick">${BV.esc(g.brawler)}</span>
              <span class="stat-chip">${BV.esc(g.mode === "all" ? "All Modes" : BV.formatMode(g.mode))}</span>
              <span class="stat-chip">${BV.esc(g.map || "Any Map")}</span>
            </div>
            <h3 class="guide-card-title">${BV.esc(censorDisplay(g.title))}</h3>
          </div>
        </div>
        <button type="button" class="upvote-btn ${voted ? "voted" : ""}" data-id="${BV.esc(g.id)}">
          <span>▲</span>
          <strong>${g.upvotes_count || 0}</strong>
        </button>
      </div>

      ${
        g.star_power || g.gadget || g.gears
          ? `<div class="guide-mini-build">
              ${g.star_power ? `<span>★ ${BV.esc(censorDisplay(g.star_power))}</span>` : ""}
              ${g.gadget ? `<span>⚙ ${BV.esc(censorDisplay(g.gadget))}</span>` : ""}
              ${g.gears ? `<span>⛨ ${BV.esc(censorDisplay(g.gears))}</span>` : ""}
            </div>`
          : ""
      }

      <p class="guide-card-preview">${BV.esc(preview)}</p>

      <div class="guide-card-foot">
        <div class="guide-author-line">
          ${g.author_avatar ? `<img src="${BV.esc(g.author_avatar)}" alt="" class="mini-avatar" referrerpolicy="no-referrer" />` : ""}
          <span>${BV.esc(censorDisplay(g.author_name))} • ${timeAgo(g.created_at)}</span>
        </div>
        <button type="button" class="read-guide-link">Read Guide →</button>
      </div>
    `;

    card.querySelector(".upvote-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      toggleUpvote(g.id);
    });
    card.querySelector(".read-guide-link").addEventListener("click", () => openReadModal(g));
    card.addEventListener("click", (e) => {
      if (!e.target.closest("button")) openReadModal(g);
    });
    grid.appendChild(card);
  });
}

function populateFormMaps() {
  const mode = document.getElementById("gf-mode").value;
  const mapSel = document.getElementById("gf-map");
  mapSel.innerHTML = `<option value="Any Map">Any Map</option>`;
  const maps =
    mode === "all"
      ? Array.from(new Set(Object.values(GUIDES_STATE.mapsByMode).flat()))
      : GUIDES_STATE.mapsByMode[mode] || [];
  maps.forEach((mp) => {
    const opt = document.createElement("option");
    opt.value = mp;
    opt.textContent = mp;
    mapSel.appendChild(opt);
  });
}

function openWriteModal() {
  if (!GUIDES_STATE.user) {
    signInWithGoogle();
    return;
  }
  document.getElementById("gf-error").classList.add("hidden");
  document.getElementById("write-guide-modal").classList.remove("hidden");
}

async function handlePublishGuide(e) {
  e.preventDefault();
  if (!sb || !GUIDES_STATE.user) return;

  const errEl = document.getElementById("gf-error");
  const submitBtn = document.getElementById("gf-submit-btn");
  errEl.classList.add("hidden");

  const brawlerName = document.getElementById("gf-brawler").value;
  const bObj = GUIDES_STATE.brawlers.find((b) => b.name === brawlerName);
  const title = document.getElementById("gf-title").value.trim();
  const body = document.getElementById("gf-body").value.trim();
  const starPower = document.getElementById("gf-sp").value.trim();
  const gadget = document.getElementById("gf-gadget").value.trim();
  const gears = document.getElementById("gf-gears").value.trim();
  const synergies = document.getElementById("gf-synergies").value.trim();
  const counters = document.getElementById("gf-counters").value.trim();

  if (title.length < 4 || body.length < 20) {
    errEl.textContent = "Title must be at least 4 characters and strategy tips at least 20 characters.";
    errEl.classList.remove("hidden");
    return;
  }

  const modError = checkGuideModeration([title, starPower, gadget, gears, synergies, counters, body]);
  if (modError) {
    errEl.textContent = modError;
    errEl.classList.remove("hidden");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Publishing...";

  try {
    const authorName =
      GUIDES_STATE.profile?.display_name || GUIDES_STATE.user.user_metadata?.full_name || "Player";
    const authorAvatar =
      GUIDES_STATE.profile?.avatar_url || GUIDES_STATE.user.user_metadata?.avatar_url || "";

    const { data, error } = await sb
      .from("guides")
      .insert({
        author_id: GUIDES_STATE.user.id,
        author_name: authorName,
        author_avatar: authorAvatar,
        title,
        brawler: brawlerName,
        brawler_id: bObj ? bObj.id : 0,
        mode: document.getElementById("gf-mode").value,
        map: document.getElementById("gf-map").value || "Any Map",
        star_power: starPower,
        gadget,
        gears,
        synergies,
        counters,
        body,
      })
      .select("*")
      .single();

    if (error) throw error;

    GUIDES_STATE.guides.unshift(data);
    document.getElementById("write-guide-form").reset();
    document.getElementById("gf-char-count").textContent = "0 / 4000";
    document.getElementById("write-guide-modal").classList.add("hidden");
    renderGuides();
  } catch (err) {
    errEl.textContent = err.message.includes("row-level security")
      ? "Daily limit reached (max 5 guides per 24h) or session expired."
      : err.message || "Could not publish guide.";
    errEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Publish Guide";
  }
}

async function loadBrawlerMetadata() {
  try {
    const meta = await BV.apiFetch("/api/v1/metadata");
    GUIDES_STATE.brawlers = meta.brawlers || [];
    GUIDES_STATE.mapsByMode = meta.maps_by_mode || {};

    const filterSel = document.getElementById("guide-filter-brawler");
    const formSel = document.getElementById("gf-brawler");
    filterSel.innerHTML = `<option value="">All Brawlers</option>`;
    formSel.innerHTML = "";

    GUIDES_STATE.brawlers.forEach((b) => {
      const o1 = document.createElement("option");
      o1.value = b.name;
      o1.textContent = b.name;
      filterSel.appendChild(o1);

      const o2 = document.createElement("option");
      o2.value = b.name;
      o2.textContent = b.name;
      formSel.appendChild(o2);
    });
    populateFormMaps();
  } catch {
    // Fallback if metadata temporarily unavailable
    const formSel = document.getElementById("gf-brawler");
    formSel.innerHTML = `<option value="GENERAL">GENERAL</option>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  // Modals close bindings
  const writeModal = document.getElementById("write-guide-modal");
  const readModal = document.getElementById("read-guide-modal");
  document.getElementById("write-modal-close").addEventListener("click", () => writeModal.classList.add("hidden"));
  document.getElementById("gf-cancel-btn").addEventListener("click", () => writeModal.classList.add("hidden"));
  document.getElementById("read-modal-close").addEventListener("click", () => readModal.classList.add("hidden"));
  writeModal.addEventListener("click", (e) => { if (e.target === writeModal) writeModal.classList.add("hidden"); });
  readModal.addEventListener("click", (e) => { if (e.target === readModal) readModal.classList.add("hidden"); });

  // Form bindings
  document.getElementById("gf-mode").addEventListener("change", populateFormMaps);
  document.getElementById("gf-body").addEventListener("input", (e) => {
    document.getElementById("gf-char-count").textContent = `${e.target.value.length} / 4000`;
  });
  document.getElementById("write-guide-form").addEventListener("submit", handlePublishGuide);

  // Filter bindings
  document.querySelectorAll(".guides-filter-bar .filter-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      GUIDES_STATE.sort = pill.dataset.sort;
      document.querySelectorAll(".guides-filter-bar .filter-pill").forEach((p) => p.classList.toggle("active", p === pill));
      if (GUIDES_STATE.sort === "top" || GUIDES_STATE.sort === "new") {
        fetchGuides();
      } else {
        renderGuides();
      }
    });
  });

  document.getElementById("guide-filter-mode").addEventListener("change", (e) => {
    GUIDES_STATE.modeFilter = e.target.value;
    renderGuides();
  });
  document.getElementById("guide-filter-brawler").addEventListener("change", (e) => {
    GUIDES_STATE.brawlerFilter = e.target.value;
    renderGuides();
  });
  document.getElementById("guide-search").addEventListener("input", (e) => {
    GUIDES_STATE.search = e.target.value;
    renderGuides();
  });

  loadBrawlerMetadata();
  renderAuthBar();
  // Always load public guides immediately so logged-out visitors see them right away
  fetchGuides();

  if (sb) {
    try {
      const { data: sessionData } = await sb.auth.getSession();
      GUIDES_STATE.user = sessionData?.session?.user || null;
      if (GUIDES_STATE.user) {
        GUIDES_STATE.profile = await ensureUserProfile(GUIDES_STATE.user);
        await fetchMyVotes();
      }
      renderAuthBar();
      if (GUIDES_STATE.guidesLoaded) renderGuides();
    } catch {
      // Keep browsing anonymously if session lookup fails
    }

    sb.auth.onAuthStateChange(async (_event, session) => {
      GUIDES_STATE.user = session?.user || null;
      if (GUIDES_STATE.user) {
        GUIDES_STATE.profile = await ensureUserProfile(GUIDES_STATE.user);
        await fetchMyVotes();
      } else {
        GUIDES_STATE.profile = null;
        GUIDES_STATE.myVotes.clear();
      }
      renderAuthBar();
      if (GUIDES_STATE.guidesLoaded) renderGuides();
    });
  }
});
