/**
 * Shared platform helpers for bilibili.
 *
 * Loaded in three contexts, mirroring settings.js:
 *   - background.js   via importScripts("platform.js")
 *   - content.js      via manifest content_scripts js array
 *   - sidepanel.js    via <script src="platform.js"> in sidepanel.html
 *
 * No secrets here — only URL/ID parsing and domain constants.
 */
var BILI_PLATFORM = (() => {
  const ORIGIN = "https://www.bilibili.com";
  const API_ORIGIN = "https://api.bilibili.com";

  // bvid format: "BV" + 10 alphanumeric chars (e.g. BV1Fg411D7Jy)
  const BVID_RE = /BV[0-9A-Za-z]{10}/;

  /** Extract bvid from a bilibili video URL, or null if not a video page. */
  function extractBvid(url) {
    const input = String(url || "").trim();
    if (!input) return null;
    try {
      const u = new URL(input);
      const m = u.pathname.match(/\/video\/(BV[0-9A-Za-z]{10})/);
      return m ? m[1] : null;
    } catch (_) {
      // Fall back to plain substring match for non-URL inputs.
      const m = input.match(BVID_RE);
      return m ? m[0] : null;
    }
  }

  /** True when the URL is a standard bilibili video watch page. */
  function isBilibiliVideoPage(url) {
    return extractBvid(url) !== null;
  }

  /** Canonical watch URL for a bvid. Throws on invalid id. */
  function canonicalBilibiliUrl(bvid) {
    const normalized = String(bvid || "").trim();
    if (!BVID_RE.test(normalized)) {
      throw new Error("Invalid bilibili video ID (bvid).");
    }
    return `${ORIGIN}/video/${normalized}`;
  }

  /**
   * Map bilibili subtitle/API failure modes to a stable, UI-friendly code.
   * Returned so background/sidepanel share one vocabulary.
   */
  const ERROR_CODES = Object.freeze({
    NOT_LOGGED_IN: "not_logged_in",
    NO_SUBTITLE: "no_subtitle",
    RATE_LIMITED: "rate_limited", // API code -412 or 429
    VIP_ONLY: "vip_only",
    NETWORK: "network",
    UNKNOWN: "unknown",
  });

  /** Subtitle track language constants (bilibili `lan` values). */
  const LANG = Object.freeze({
    ZH_CN: "zh-CN",
    ZH_HANS: "zh-Hans",
    AI_ZH: "ai-zh",
    EN: "en",
  });

  return {
    ORIGIN,
    API_ORIGIN,
    BVID_RE,
    extractBvid,
    isBilibiliVideoPage,
    canonicalBilibiliUrl,
    ERROR_CODES,
    LANG,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BILI_PLATFORM;
}
