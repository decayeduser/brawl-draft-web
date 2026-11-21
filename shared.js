// ============================================================================
// BrawlVault Shared API & Session Utilities
// ============================================================================
window.BV = (() => {
  const API_BASE_URL = "https://dull.tailed6f04.ts.net";
  const API_KEY = "JmRP^Q!(uJ@,3Vmv]#~%EJSw--FzpC";
  const CLEAN_BASE_URL = API_BASE_URL.trim().replace(/\/+$/, "");

  const TAG_STORAGE_KEY = "bv_player_tag";
  const PROFILE_CACHE_KEY = "bv_player_profile_cache";
  const PROFILE_CACHE_MS = 5 * 60 * 1000;

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

  function setSavedTag(raw) {
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

  async function apiFetch(endpointPath, options = {}) {
    const fullUrl = `${CLEAN_BASE_URL}${endpointPath}`;
    const headers = Object.assign(
      {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY,
      },
      options.headers || {}
    );

    const resp = await fetch(fullUrl, {
      ...options,
      headers,
      mode: "cors",
    });

    if (!resp.ok) {
      let msg = `HTTP ${resp.status}`;
      try {
        const errJson = await resp.json();
        if (errJson.detail) msg = errJson.detail;
      } catch {
        // keep default message
      }
      throw new Error(msg);
    }
    return resp.json();
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
    apiFetch,
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
