/**
 * Shared, non-secret configuration helpers.
 *
 * API keys are stored in chrome.storage.local by options.js. This file contains
 * defaults and validation only, so it is safe to publish.
 *
 * This module is intentionally dependency-free (the unit tests load it on its
 * own), so the hosted-transcription preset table in asr.js is mirrored here as
 * a small id -> base URL map. settings.test.js asserts the two stay in sync.
 */
var YTD_SETTINGS = (() => {
  const STORAGE_KEY = "ytd_settings";

  // Mirrors BILI_ASR.PROVIDERS[*].baseUrl. Kept local so this file has no
  // load-order dependency; a unit test guards against drift.
  const ASR_BASE_URLS = Object.freeze({
    siliconflow: "https://api.siliconflow.cn/v1",
    openai: "https://api.openai.com/v1",
    groq: "https://api.groq.com/openai/v1",
  });

  const DEFAULT_ASR_PROVIDER = "siliconflow";
  const DEFAULT_ASR_MAX_BYTES = 24 * 1024 * 1024;

  const DEFAULTS = Object.freeze({
    provider: "deepseek",
    aiApiKey: "",
    aiBaseUrl: "https://api.deepseek.com",
    aiModel: "deepseek-v4-flash",
    // Speech-to-text fallback for videos with no subtitle track. Off by
    // default: it downloads audio and spends money at a hosted service, so it
    // only ever runs when the user turns it on AND clicks the button.
    asrEnabled: false,
    asrProvider: DEFAULT_ASR_PROVIDER,
    asrApiKey: "",
    asrBaseUrl: ASR_BASE_URLS[DEFAULT_ASR_PROVIDER],
    asrModel: "FunAudioLLM/SenseVoiceSmall",
    asrMaxBytes: DEFAULT_ASR_MAX_BYTES,
  });

  function isLegacyCustom(input) {
    return !!input && input.provider === "custom";
  }

  function trimmed(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  /** Accept only https endpoints; anything else falls back to the preset. */
  function httpsUrl(value) {
    const raw = trimmed(value);
    if (!/^https:\/\/[^\s]+$/i.test(raw)) return "";
    return raw;
  }

  function pickAsrProvider(value) {
    const id = trimmed(value);
    if (Object.prototype.hasOwnProperty.call(ASR_BASE_URLS, id)) return id;
    return id ? "custom" : DEFAULT_ASR_PROVIDER;
  }

  function clampAsrMaxBytes(value) {
    const n = Number(value);
    const MB = 1024 * 1024;
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_ASR_MAX_BYTES;
    return Math.min(Math.max(Math.round(n), MB), 100 * MB);
  }

  function normalize(input = {}) {
    const asrProvider = pickAsrProvider(input.asrProvider);
    // A custom endpoint with no usable URL stays empty on purpose. Inheriting
    // another provider's URL here would quietly send the user's key to a
    // service they never chose.
    const asrBaseUrl = httpsUrl(input.asrBaseUrl) || ASR_BASE_URLS[asrProvider] || "";

    return {
      provider: DEFAULTS.provider,
      aiApiKey: isLegacyCustom(input)
        ? ""
        : trimmed(input.aiApiKey),
      aiBaseUrl: DEFAULTS.aiBaseUrl,
      aiModel: DEFAULTS.aiModel,
      asrEnabled: input.asrEnabled === true,
      asrProvider: asrProvider,
      asrApiKey: trimmed(input.asrApiKey),
      asrBaseUrl: asrBaseUrl,
      asrModel: trimmed(input.asrModel),
      asrMaxBytes: clampAsrMaxBytes(input.asrMaxBytes),
    };
  }

  function migrateLegacyCustom(input = {}) {
    return {
      settings: normalize(input),
      migrated: isLegacyCustom(input),
    };
  }

  function chatCompletionsUrl() {
    return `${DEFAULTS.aiBaseUrl}/chat/completions`;
  }

  /**
   * True only when the fallback is both switched on and actually usable.
   * The side panel uses this to decide whether to offer the button at all.
   */
  function asrReady(settings = {}) {
    return (
      settings.asrEnabled === true &&
      trimmed(settings.asrApiKey) !== "" &&
      httpsUrl(settings.asrBaseUrl) !== ""
    );
  }

  return {
    STORAGE_KEY,
    ASR_BASE_URLS,
    DEFAULT_ASR_PROVIDER,
    DEFAULT_ASR_MAX_BYTES,
    DEFAULTS,
    isLegacyCustom,
    normalize,
    migrateLegacyCustom,
    chatCompletionsUrl,
    asrReady,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = YTD_SETTINGS;
}
