// ============================================================================
// BrawlVault Shared API, Global Google Auth & Cloud Tag Sync
// ============================================================================
window.BV = (() => {
  const API_BASE_URL = "https://dull-1.tailed6f04.ts.net";
  const API_KEY = "JmRP^Q!(uJ@,3Vmv]#~%EJSw--FzpC";
  const CLEAN_BASE_URL = API_BASE_URL.trim().replace(/\/+$/, "");

  const SUPABASE_URL = "https://fbyawujjntnqeiebekbd.supabase.co";
  const SUPABASE_ANON_KEY = "sb_publishable_A3dcfemnDJuiRcndoKerTA_s185fVRY";

  const TAG_STORAGE_KEY = "bv_player_tag";
  const PROFILE_CACHE_KEY = "bv_player_profile_cache";
  const PROFILE_CACHE_MS = 5 * 60 * 1000;

  const sb =
    typeof window !== "undefined" && window.supabase
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
      : null;

  let currentUser = null;
  let currentProfile = null;
  const authListeners = new Set();

  function normalizeTag(raw) {
    if (!raw) return "";
    const cleaned = String(raw)
      .trim()
      .toUpperCase()
      .replace(/O/g, "0")
      .replace(/^#+/, "")
      .replace(/[^A-Z0-9]/g, "");
    return cleaned ? `#${cleaned}` : "";
  }

  function tagForUrl(raw) {
    return normalizeTag(raw).replace(/^#/, "");
  }

  function getSavedTag() {
    try {
      return normalizeTag(localStorage.getItem(TAG_STORAGE_KEY) || "");
    } catch {
      return "";
    }
  }

  async function syncTagToCloud(normTag) {
    if (!sb || !currentUser) return;
    try {
      await sb
        .from("profiles")
        .update({ brawl_tag: normTag })
        .eq("id", currentUser.id);
      if (currentProfile) currentProfile.brawl_tag = normTag;
      renderGlobalNavAuth();
    } catch {
      // ignore cloud sync error
    }
  }

  function setSavedTag(raw, skipCloud = false) {
    const norm = normalizeTag(raw);
    try {
      if (norm) {
        localStorage.setItem(TAG_STORAGE_KEY, norm);
      } else {
        localStorage.removeItem(TAG_STORAGE_KEY);
        localStorage.removeItem(PROFILE_CACHE_KEY);
      }
    } catch {
      // ignore storage errors
    }
    if (!skipCloud && currentUser) {
      syncTagToCloud(norm);
    } else {
      renderGlobalNavAuth();
    }
    return norm;
  }

  function getCachedProfile(tag) {
    const norm = normalizeTag(tag);
    if (!norm) return null;
    try {
      const raw = localStorage.getItem(PROFILE_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.tag === norm && Date.now() - parsed.ts < PROFILE_CACHE_MS) {
        return parsed.data;
      }
    } catch {
      // ignore
    }
    return null;
  }

  function setCachedProfile(profile) {
    if (!profile || !profile.tag) return;
    try {
      localStorage.setItem(
        PROFILE_CACHE_KEY,
        JSON.stringify({
          tag: normalizeTag(profile.tag),
          ts: Date.now(),
          data: profile,
        })
      );
    } catch {
      // ignore
    }
  }

  async function ensureCloudProfile(user) {
    if (!sb || !user) return null;
    const displayName = user.user_metadata?.full_name || user.user_metadata?.name || "Player";
    const avatarUrl = user.user_metadata?.avatar_url || user.user_metadata?.picture || "";
    const localTag = getSavedTag();

    try {
      const { data: existing } = await sb
        .from("profiles")
        .select("id, display_name, avatar_url, brawl_tag, is_admin")
        .eq("id", user.id)
        .maybeSingle();

      if (existing) {
        const cloudTag = normalizeTag(existing.brawl_tag || "");
        if (cloudTag) {
          setSavedTag(cloudTag, true);
        } else if (localTag) {
          await sb.from("profiles").update({ brawl_tag: localTag }).eq("id", user.id);
          existing.brawl_tag = localTag;
        }
        return existing;
      }

      const { data: created } = await sb
        .from("profiles")
        .insert({
          id: user.id,
          display_name: displayName,
          avatar_url: avatarUrl,
          brawl_tag: localTag,
        })
        .select("id, display_name, avatar_url, brawl_tag, is_admin")
        .single();

      return (
        created || {
          id: user.id,
          display_name: displayName,
          avatar_url: avatarUrl,
          brawl_tag: localTag,
          is_admin: false,
        }
      );
    } catch {
      return {
        id: user.id,
        display_name: displayName,
        avatar_url: avatarUrl,
        brawl_tag: localTag,
        is_admin: false,
      };
    }
  }

  function notifyAuthListeners() {
    renderGlobalNavAuth();
    authListeners.forEach((fn) => {
      try {
        fn(currentUser, currentProfile);
      } catch {
        // ignore listener error
      }
    });
  }

  async function signInWithGoogle() {
    if (!sb) {
      alert("Google sign-in is loading — please refresh and try again.");
      return;
    }
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await sb.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      alert(`Google sign-in failed: ${error.message}`);
    }
  }

  async function signOut() {
    if (!sb) return;
    await sb.auth.signOut();
    currentUser = null;
    currentProfile = null;
    notifyAuthListeners();
  }

  function onAuthChange(cb) {
    if (typeof cb === "function") authListeners.add(cb);
    return () => authListeners.delete(cb);
  }

  const GOOGLE_SVG = `<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58l3.7 2.87c2.16-2 3.72-4.94 3.72-8.69z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.7-2.87c-.98.66-2.23 1.06-3.58 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/></svg>`;

  function renderGlobalNavAuth() {
    const nav = document.querySelector(".site-nav");
    if (!nav || !sb) return;

    let slot = document.getElementById("bv-nav-auth");
    if (!slot) {
      slot = document.createElement("div");
      slot.id = "bv-nav-auth";
      slot.className = "nav-auth-slot";
      nav.appendChild(slot);
    }

    if (!currentUser) {
      slot.innerHTML = `
        <button type="button" class="nav-google-btn" id="bv-nav-signin">
          ${GOOGLE_SVG}
          <span>Sign in</span>
          <small>FREE</small>
        </button>
      `;
      document.getElementById("bv-nav-signin").addEventListener("click", signInWithGoogle);
      return;
    }

    const fullName = currentProfile?.display_name || currentUser.user_metadata?.full_name || "Player";
    const firstName = fullName.split(" ")[0];
    const avatar = currentProfile?.avatar_url || currentUser.user_metadata?.avatar_url || "";
    const tag = getSavedTag();

    slot.innerHTML = `
      <button type="button" class="nav-user-pill" id="bv-nav-profile-btn" title="Account Settings &amp; Brawl Stars ID">
        ${avatar ? `<img src="${esc(avatar)}" alt="" class="nav-user-avatar" referrerpolicy="no-referrer" />` : ""}
        <span class="nav-user-name">${esc(firstName)}</span>
        ${tag ? `<span class="nav-user-tag">${esc(tag)}</span>` : `<span class="nav-user-tag nav-tag-empty">Set #TAG</span>`}
        <span class="nav-user-gear" aria-hidden="true">⚙</span>
      </button>
    `;
    document.getElementById("bv-nav-profile-btn").addEventListener("click", openProfileSettingsModal);
  }

  function openProfileSettingsModal() {
    if (!currentUser) {
      signInWithGoogle();
      return;
    }

    let modal = document.getElementById("bv-account-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "bv-account-modal";
      modal.className = "modal-backdrop hidden";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      document.body.appendChild(modal);
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.add("hidden");
      });
    }

    const fullName = currentProfile?.display_name || currentUser.user_metadata?.full_name || "Player";
    const email = currentUser.email || "";
    const avatar = currentProfile?.avatar_url || currentUser.user_metadata?.avatar_url || "";
    const savedTag = getSavedTag();

    modal.innerHTML = `
      <div class="modal-card acct-modal-card dyn-fade">
        <button type="button" id="bv-acct-close" class="modal-close" aria-label="Close">✕</button>
        <div class="acct-modal-head">
          ${avatar ? `<img src="${esc(avatar)}" alt="" class="acct-modal-avatar" referrerpolicy="no-referrer" />` : ""}
          <div>
            <h3 class="brawl-title" style="font-size:18px;">${esc(fullName)}</h3>
            <div class="muted-tag">${esc(email)}</div>
          </div>
        </div>

        <div class="acct-section">
          <label for="bv-acct-tag-input" class="acct-lbl">BRAWL STARS ACCOUNT ID (#TAG)</label>
          <p class="acct-hint">Synced to your Google account across all tabs and devices.</p>
          <form id="bv-acct-tag-form" class="tag-input-row">
            <input
              type="text"
              id="bv-acct-tag-input"
              class="search-input tag-field"
              value="${esc(savedTag)}"
              placeholder="Enter Tag (e.g. #2PP)"
              autocomplete="off"
              autocapitalize="characters"
              spellcheck="false"
            />
            <button type="submit" id="bv-acct-save-btn" class="btn btn-gold btn-sm">Save ID</button>
          </form>
          <div id="bv-acct-status" class="acct-status hidden"></div>
        </div>

        <div class="acct-quick-links">
          <a href="/lookup/" class="btn btn-ghost btn-sm">My Stats</a>
          <a href="/coach/" class="btn btn-ghost btn-sm">AI Coach</a>
          <a href="/coach/?tab=upgrade" class="btn btn-ghost btn-sm">Upgrade Guide</a>
        </div>

        <div id="bv-acct-usage" class="acct-hint" style="margin-top:10px;">Loading today's AI usage...</div>

        <div class="acct-footer">
          ${savedTag ? `<button type="button" id="bv-acct-clear-tag" class="btn btn-ghost btn-sm">Unlink #TAG</button>` : `<span></span>`}
          <button type="button" id="bv-acct-signout" class="btn btn-danger btn-sm">Sign Out</button>
        </div>
      </div>
    `;

    modal.classList.remove("hidden");
    document.getElementById("bv-acct-close").addEventListener("click", () => modal.classList.add("hidden"));

    document.getElementById("bv-acct-tag-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById("bv-acct-tag-input");
      const saveBtn = document.getElementById("bv-acct-save-btn");
      const statusEl = document.getElementById("bv-acct-status");
      const norm = normalizeTag(input.value);
      if (!norm || norm.length < 4) {
        statusEl.className = "acct-status acct-err";
        statusEl.textContent = "Please enter a valid Brawl Stars tag (e.g. #2PP).";
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      statusEl.className = "acct-status";
      statusEl.textContent = `Verifying & syncing ${norm}...`;

      try {
        const profile = await fetchPlayer(norm, true);
        setSavedTag(norm);
        setCachedProfile(profile);
        await syncTagToCloud(norm);
        statusEl.className = "acct-status acct-ok";
        statusEl.textContent = `✓ Linked ${profile.name} (${norm}) • 🏆 ${profile.trophies.toLocaleString()} — synced!`;
        notifyAuthListeners();
      } catch (err) {
        statusEl.className = "acct-status acct-err";
        statusEl.textContent = err.message || "Could not verify that Brawl Stars tag.";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save ID";
      }
    });

    const clearBtn = document.getElementById("bv-acct-clear-tag");
    if (clearBtn) {
      clearBtn.addEventListener("click", async () => {
        setSavedTag("");
        await syncTagToCloud("");
        modal.classList.add("hidden");
        notifyAuthListeners();
      });
    }

    document.getElementById("bv-acct-signout").addEventListener("click", async () => {
      modal.classList.add("hidden");
      await signOut();
    });

    fetchAiUsage()
      .then((u) => {
        const el = document.getElementById("bv-acct-usage");
        if (!el || !u) return;
        el.innerHTML = `Daily AI Quota: <strong>${u.coach.remaining}/${u.coach.limit}</strong> AI Coach • <strong>${u.draft.remaining}/${u.draft.limit}</strong> Drafting AI left today`;
      })
      .catch(() => {
        const el = document.getElementById("bv-acct-usage");
        if (el) el.textContent = "";
      });
  }

  function renderAiAuthGate(title, desc) {
    return `
      <div class="ai-auth-gate dyn-fade">
        <div class="ai-gate-badge">✦ 100% FREE GOOGLE ACCOUNT</div>
        <h3 class="brawl-title ai-gate-title">${esc(title)}</h3>
        <p class="ai-gate-desc">${esc(desc)}</p>
        <button type="button" class="btn btn-google ai-gate-btn" data-bv-google-signin>
          ${GOOGLE_SVG}
          <span>Continue with Google — It's Free</span>
        </button>
        <div class="ai-gate-perks">
          <span>✓ 100% Free Forever</span>
          <span>✓ Syncs your #TAG across all tabs &amp; devices</span>
        </div>
      </div>
    `;
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-bv-google-signin]")) {
      signInWithGoogle();
    }
  });

  const authReady = (async () => {
    if (!sb) return { user: null, profile: null };
    try {
      const { data } = await sb.auth.getSession();
      currentUser = data?.session?.user || null;
      if (currentUser) {
        currentProfile = await ensureCloudProfile(currentUser);
      }
      sb.auth.onAuthStateChange(async (_event, session) => {
        const nextUser = session?.user || null;
        const changed = (nextUser?.id || null) !== (currentUser?.id || null);
        currentUser = nextUser;
        if (currentUser) {
          currentProfile = await ensureCloudProfile(currentUser);
        } else {
          currentProfile = null;
        }
        if (changed) notifyAuthListeners();
        else renderGlobalNavAuth();
      });
    } catch {
      currentUser = null;
      currentProfile = null;
    }
    notifyAuthListeners();
    return { user: currentUser, profile: currentProfile };
  })();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderGlobalNavAuth);
  } else {
    renderGlobalNavAuth();
  }

  async function apiFetch(endpointPath, options = {}) {
    const fullUrl = `${CLEAN_BASE_URL}${endpointPath}`;
    const baseHeaders = {
      "Content-Type": "application/json",
      "X-API-Key": API_KEY,
    };
    if (currentUser && currentUser.id) {
      baseHeaders["X-User-Id"] = currentUser.id;
    }
    const headers = Object.assign(baseHeaders, options.headers || {});

    const resp = await fetch(fullUrl, {
      ...options,
      headers,
      mode: "cors",
    });

    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const errJson = await resp.json();
        if (errJson.detail) {
          msg = errJson.detail;
        } else if (errJson.error) {
          msg = resp.status === 429
            ? "Slow down a bit — too many requests per minute. Please wait a few seconds and try again."
            : errJson.error;
        }
      } catch {
        // keep default message
      }
      const err = new Error(msg);
      err.status = resp.status;
      throw err;
    }
    return resp.json();
  }

  async function fetchAiUsage() {
    return apiFetch("/api/v1/ai/usage");
  }

  async function fetchPlayer(rawTag, forceRefresh = false) {
    const norm = normalizeTag(rawTag);
    if (!norm || norm.length < 4) {
      throw new Error("Enter a valid Brawl Stars tag (e.g. #2PP)");
    }
    if (!forceRefresh) {
      const cached = getCachedProfile(norm);
      if (cached) return cached;
    }
    const data = await apiFetch(`/api/v1/player/${encodeURIComponent(tagForUrl(norm))}`);
    if (getSavedTag() === norm) {
      setCachedProfile(data);
    }
    return data;
  }

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

  function formatMode(mode) {
    if (!mode) return "";
    return String(mode)
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  function esc(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  return {
    CLEAN_BASE_URL,
    sb,
    authReady,
    getAuthUser: () => currentUser,
    getAuthProfile: () => currentProfile,
    signInWithGoogle,
    signOut,
    onAuthChange,
    renderAiAuthGate,
    apiFetch,
    fetchAiUsage,
    fetchPlayer,
    normalizeTag,
    tagForUrl,
    getSavedTag,
    setSavedTag,
    getCachedProfile,
    setCachedProfile,
    resolvePortraitUrl,
    formatMode,
    esc,
  };
})();
