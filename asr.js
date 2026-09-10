/**
 * Hosted speech-to-text helpers for bilibili videos with no subtitle track.
 *
 * Bilibili only exposes subtitles that the uploader or bilibili itself has
 * already produced. Videos without one used to be a dead end. This module
 * carries the pure, testable half of the fallback: which hosted services we
 * can talk to, how to shape their responses into the same transcript structure
 * the rest of the extension already consumes, and the failure vocabulary.
 *
 * Everything here is pure and dependency-free so it can be loaded in the
 * service worker, the options page, and the unit tests. The network half lives
 * in background.js.
 *
 * Loaded in three contexts, mirroring platform.js:
 *   - background.js   via importScripts("asr.js")
 *   - options.html    via <script src="asr.js">
 *   - tests           via vm / require
 */
var BILI_ASR = (() => {
  const MB = 1024 * 1024;

  /**
   * Hosted transcription presets.
   *
   * All of them speak the OpenAI `/audio/transcriptions` dialect (multipart
   * upload), which keeps one request path for every provider. `timestamps`
   * describes the model's best-known response shape; it only decides which
   * response_format we ask for FIRST, never whether we can recover timings.
   */
  const PROVIDERS = Object.freeze({
    siliconflow: {
      id: "siliconflow",
      label: "SiliconFlow",
      hint: "OpenAI-compatible, reachable from mainland China.",
      docsUrl: "https://cloud.siliconflow.cn/account/ak",
      baseUrl: "https://api.siliconflow.cn/v1",
      defaultModel: "FunAudioLLM/SenseVoiceSmall",
      models: [
        { id: "FunAudioLLM/SenseVoiceSmall", timestamps: false },
        { id: "whisper-large-v3", timestamps: true },
      ],
      maxBytes: 24 * MB,
    },
    openai: {
      id: "openai",
      label: "OpenAI",
      hint: "Whisper endpoints. Requires network access to api.openai.com.",
      docsUrl: "https://platform.openai.com/api-keys",
      baseUrl: "https://api.openai.com/v1",
      defaultModel: "whisper-1",
      models: [
        { id: "whisper-1", timestamps: true },
        { id: "gpt-4o-mini-transcribe", timestamps: false },
      ],
      maxBytes: 24 * MB,
    },
    groq: {
      id: "groq",
      label: "Groq",
      hint: "Fast Whisper endpoints. Requires network access to api.groq.com.",
      docsUrl: "https://console.groq.com/keys",
      baseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "whisper-large-v3",
      models: [
        { id: "whisper-large-v3", timestamps: true },
        { id: "whisper-large-v3-turbo", timestamps: true },
      ],
      maxBytes: 24 * MB,
    },
    custom: {
      id: "custom",
      label: "Custom endpoint",
      hint: "Any OpenAI-compatible /audio/transcriptions endpoint.",
      docsUrl: "",
      baseUrl: "",
      defaultModel: "",
      models: [],
      maxBytes: 24 * MB,
    },
  });

  const PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));
  const DEFAULT_PROVIDER_ID = "siliconflow";
  const DEFAULT_MAX_BYTES = 24 * MB;
  const MAX_MAX_BYTES = 100 * MB;

  /** Stable failure vocabulary shared by background.js and the side panel. */
  const ERROR_CODES = Object.freeze({
    ASR_DISABLED: "asr_disabled",
    ASR_NOT_CONFIGURED: "asr_not_configured",
    ASR_AUTH: "asr_auth",
    ASR_RATE_LIMITED: "asr_rate_limited",
    ASR_REJECTED: "asr_rejected",
    ASR_NETWORK: "asr_network",
    AUDIO_TOO_LARGE: "audio_too_large",
    AUDIO_UNAVAILABLE: "audio_unavailable",
  });

  function resolveProvider(id) {
    const key = String(id || "");
    return PROVIDERS[key] || PROVIDERS.custom;
  }

  function isKnownProvider(id) {
    return Object.prototype.hasOwnProperty.call(PROVIDERS, String(id || ""));
  }

  /** Models offered for a provider id (empty for custom endpoints). */
  function modelsFor(id) {
    return resolveProvider(id).models.slice();
  }

  /**
   * Whether the configured model is known to return timings. Unknown models
   * (custom endpoints) are assumed capable so we try verbose_json first.
   */
  function modelSupportsTimestamps(providerId, model) {
    const provider = resolveProvider(providerId);
    const name = String(model || "").trim();
    if (!name) return false;
    const known = provider.models.find((entry) => entry.id === name);
    return known ? known.timestamps === true : true;
  }

  /**
   * Order in which response formats are attempted. `verbose_json` is exact,
   * `srt` is accepted by most Whisper-style servers, and plain `json` is the
   * universal floor (timings are then estimated from the audio duration).
   */
  function responseFormatPlan(supportsTimestamps) {
    return supportsTimestamps
      ? ["verbose_json", "srt", "json"]
      : ["json"];
  }

  /** Strip trailing slashes; tolerate a user pasting the full endpoint. */
  function transcriptionsUrl(baseUrl) {
    const raw = String(baseUrl || "").trim().replace(/\/+$/, "");
    if (!raw) return "";
    if (/\/audio\/transcriptions$/i.test(raw)) return raw;
    return raw + "/audio/transcriptions";
  }

  /**
   * The Chrome match pattern for the endpoint's origin, or "" when the URL is
   * unusable. The endpoint is an optional host permission: the options page
   * requests this pattern, the service worker checks it.
   */
  function endpointOriginPattern(baseUrl) {
    const endpoint = transcriptionsUrl(baseUrl);
    if (!endpoint) return "";
    try {
      return new URL(endpoint).origin + "/*";
    } catch (_error) {
      return "";
    }
  }

  /** "https://api.example.com/*" -> "api.example.com" (for user-facing copy). */
  function endpointHost(baseUrl) {
    const pattern = endpointOriginPattern(baseUrl);
    const match = pattern.match(/^https:\/\/(.+)\/\*$/);
    return match ? match[1] : "";
  }

  /**
   * Normalize a model response into cues.
   *
   * `format` is the response_format we asked for; the parsers are tolerant
   * because providers disagree about shapes (some return segments for plain
   * `json` too).
   */
  function parseTranscriptionResponse(body, format, durationSeconds) {
    if (format === "verbose_json" || format === "json") {
      const fromSegments = cuesFromSegments(body && body.segments);
      if (fromSegments) return { cues: fromSegments, estimated: false };
      const text = typeof body === "string" ? body : String((body && body.text) || "");
      return cuesFromText(text, durationSeconds);
    }

    if (format === "srt" || format === "vtt") {
      const fromSrt = typeof body === "string" ? cuesFromSrt(body) : null;
      if (fromSrt) return { cues: fromSrt, estimated: false };
      const text = typeof body === "string" ? body : String((body && body.text) || "");
      return cuesFromText(text, durationSeconds);
    }

    return null;
  }

  function cuesFromSegments(segments) {
    if (!Array.isArray(segments)) return null;
    const cues = [];
    for (const segment of segments) {
      if (!segment) continue;
      const text = String(segment.text == null ? "" : segment.text).trim();
      if (!text) continue;
      cues.push({
        text: text,
        start: numberOrZero(segment.start),
        end: numberOrZero(segment.end),
      });
    }
    return cues.length ? cues : null;
  }

  const SRT_TIME =
    /(\d{1,3}):(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[.,](\d{1,3})/;

  /** Parse SRT or WebVTT (WebVTT cues use the same time line shape). */
  function cuesFromSrt(raw) {
    const text = String(raw || "").replace(/\r\n?/g, "\n");
    if (!text.includes("-->")) return null;

    const cues = [];
    for (const block of text.split(/\n{2,}/)) {
      const lines = block.split("\n").filter((line) => line.trim() !== "");
      if (!lines.length) continue;
      const timeIndex = lines.findIndex((line) => line.includes("-->"));
      if (timeIndex === -1) continue;
      const match = lines[timeIndex].match(SRT_TIME);
      if (!match) continue;
      const content = lines
        .slice(timeIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (!content) continue;
      cues.push({
        text: content,
        start: clockToSeconds(match[1], match[2], match[3], match[4]),
        end: clockToSeconds(match[5], match[6], match[7], match[8]),
      });
    }
    return cues.length ? cues : null;
  }

  function clockToSeconds(hours, minutes, seconds, fraction) {
    const ms = fraction.length === 1 ? Number(fraction) * 100 : Number(fraction);
    return (
      Number(hours) * 3600 +
      Number(minutes) * 60 +
      Number(seconds) +
      (Number.isFinite(ms) ? ms / 1000 : 0)
    );
  }

  function numberOrZero(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  /** Split a paragraph into subtitle-sized lines, keeping the punctuation. */
  function splitSentences(text) {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    if (!normalized) return [];

    const chunks = normalized.match(/[^。！？!?；;]+[。！？!?；;]?/g) || [];
    const sentences = [];
    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (trimmed) sentences.push(trimmed);
    }
    return sentences.length ? sentences : [normalized];
  }

  /**
   * Fallback for providers that return plain text: spread the sentences evenly
   * across the known audio duration so click-to-seek still lands nearby.
   */
  function cuesFromText(text, durationSeconds) {
    const sentences = splitSentences(text);
    if (!sentences.length) return null;

    const total = Number(durationSeconds) > 0 ? Number(durationSeconds) : 0;
    const span = total > 0 ? total : sentences.length * 5;
    const per = span / sentences.length;

    const cues = sentences.map((sentence, index) => ({
      text: sentence,
      start: index * per,
      end: (index + 1) * per,
    }));
    return { cues: cues, estimated: true };
  }

  /**
   * Shape cues into the exact transcript contract produced by
   * normalizeBilibiliSubtitle(), so every downstream feature (overview, notes,
   * search, click-to-seek, selection explain) works without changes.
   */
  function cuesToTranscript(cues, language, needsTranslation) {
    const transcript = [];
    let plain = "";
    let timestamped = "";

    for (const cue of cues || []) {
      const text = String((cue && cue.text) || "").trim();
      if (!text) continue;
      const start = Math.max(0, Math.floor(numberOrZero(cue.start)));
      const end = Math.max(start, Math.floor(numberOrZero(cue.end) || start));
      const duration = end - start;
      const minutes = Math.floor(start / 60);
      const seconds = start % 60;
      const ts = minutes + ":" + String(seconds).padStart(2, "0");

      transcript.push({
        text: text,
        start: start,
        duration: duration,
        language: language,
        needsTranslation: !!needsTranslation,
      });
      plain += text + " ";
      timestamped += "[" + ts + "] " + text + "\n";
    }

    return {
      transcript: transcript,
      transcriptText: plain.trim(),
      transcriptTextTimestamped: timestamped.trim(),
    };
  }

  /** Human label for the manual "transcribe" button, e.g. "12 min". */
  function audioMinutes(durationSeconds) {
    const total = Math.round(Number(durationSeconds) || 0);
    if (total <= 0) return 0;
    return Math.max(1, Math.round(total / 60));
  }

  function formatBytes(bytes) {
    const value = Number(bytes) || 0;
    if (value < MB) return Math.max(1, Math.round(value / 1024)) + " KB";
    return (value / MB).toFixed(1) + " MB";
  }

  /**
   * Estimate the download size before we spend it. DASH audio is CBR-ish, so
   * bandwidth (bits/s) times duration is accurate to a few percent.
   */
  function estimateAudioBytes(bandwidth, durationSeconds) {
    const bits = Number(bandwidth) || 0;
    const seconds = Number(durationSeconds) || 0;
    if (bits <= 0 || seconds <= 0) return 0;
    return Math.round((bits / 8) * seconds);
  }

  /** Clamp a user-provided size ceiling into a sane range. */
  function clampMaxBytes(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return DEFAULT_MAX_BYTES;
    return Math.min(Math.max(Math.round(n), 1 * MB), MAX_MAX_BYTES);
  }

  return {
    MB,
    PROVIDERS,
    PROVIDER_IDS,
    DEFAULT_PROVIDER_ID,
    DEFAULT_MAX_BYTES,
    MAX_MAX_BYTES,
    ERROR_CODES,
    resolveProvider,
    isKnownProvider,
    modelsFor,
    modelSupportsTimestamps,
    responseFormatPlan,
    transcriptionsUrl,
    endpointOriginPattern,
    endpointHost,
    parseTranscriptionResponse,
    cuesFromSegments,
    cuesFromSrt,
    cuesFromText,
    splitSentences,
    cuesToTranscript,
    audioMinutes,
    formatBytes,
    estimateAudioBytes,
    clampMaxBytes,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BILI_ASR;
}
