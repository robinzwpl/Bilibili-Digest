/**
 * BACKGROUND SERVICE WORKER
 *
 * This is the "brain" of the extension. It runs in the background and handles:
 * 1. Opening the side panel when the user clicks the extension icon
 * 2. Fetching bilibili subtitles via the bilibili API
 * 3. Calling DeepSeek to analyze the transcript
 * 4. Sending results back to the side panel
 *
 * Think of it like a backend server — it does the heavy lifting
 * so the UI (side panel) can stay fast and responsive.
 */

// Import safe defaults and validation helpers. Secret keys live in
// chrome.storage.local and are never part of the extension source.
// asr.js must be available in the service worker because the hosted
// speech-to-text fallback is handled here.
importScripts("settings.js", "platform.js", "wbi.js", "asr.js");

const DEBUG = false;
const AI_PROVIDER_IDLE_TIMEOUT_MS = 50_000;
const AI_PROVIDER_HARD_TIMEOUT_MS = 120_000;
const AI_PROVIDER_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

// Prevent the bilibili content script from reading API keys or cached data.
// Side panel, options, and service-worker contexts remain trusted.
chrome.storage.local
  .setAccessLevel({ accessLevel: "TRUSTED_CONTEXTS" })
  .catch((error) =>
    console.warn("[Bilibili Digest] Could not restrict storage access:", error),
  );

async function getSettings() {
  const stored = await chrome.storage.local.get(YTD_SETTINGS.STORAGE_KEY);
  return YTD_SETTINGS.normalize(stored[YTD_SETTINGS.STORAGE_KEY]);
}

const promptFileCache = new Map();

async function loadPromptSection(fileName, heading, variables = {}) {
  let markdown = promptFileCache.get(fileName);
  if (!markdown) {
    const response = await fetch(chrome.runtime.getURL(`prompts/${fileName}`));
    if (!response.ok) {
      throw new Error(`Could not load prompt file: ${fileName}`);
    }
    markdown = await response.text();
    promptFileCache.set(fileName, markdown);
  }

  const marker = `## ${heading}`;
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex === -1) {
    throw new Error(`Prompt section not found: ${fileName}#${heading}`);
  }
  const sectionStart = markerIndex + marker.length;
  const nextSection = markdown.indexOf("\n## ", sectionStart);
  const section = markdown.slice(
    sectionStart,
    nextSection === -1 ? markdown.length : nextSection,
  );
  const fenceMatch = section.match(
    /```(?:[A-Za-z0-9_-]+)?\r?\n([\s\S]*?)\r?\n```/,
  );
  if (!fenceMatch) {
    throw new Error(`Prompt section not found: ${fileName}#${heading}`);
  }

  let prompt = fenceMatch[1];
  for (const [key, value] of Object.entries(variables)) {
    prompt = prompt.split(`{${key}}`).join(String(value ?? ""));
  }
  return prompt;
}

async function requestAiCompletion({
  messages,
  maxTokens,
  temperature,
  responseFormat,
}) {
  const settings = await getSettings();
  if (!settings.aiApiKey) {
    const error = new Error(
      "DeepSeek API key not configured. Open Bilibili Digest Settings.",
    );
    error.code = "NO_AI_KEY";
    throw error;
  }
  const body = {
    model: settings.aiModel,
    max_tokens: maxTokens,
    messages,
  };
  if (typeof temperature === "number") body.temperature = temperature;
  if (responseFormat) {
    body.response_format = responseFormat;
  }
  // Product features need bounded, predictable latency rather than reasoning traces.
  body.thinking = { type: "disabled" };

  const controller = new AbortController();
  let timeoutKind = "";
  let idleTimeoutId;
  let hardTimeoutId;
  const abortForTimeout = (kind) => {
    if (controller.signal.aborted) return;
    timeoutKind = kind;
    controller.abort();
  };
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeoutId);
    idleTimeoutId = setTimeout(
      () => abortForTimeout("idle"),
      AI_PROVIDER_IDLE_TIMEOUT_MS,
    );
  };

  hardTimeoutId = setTimeout(
    () => abortForTimeout("hard"),
    AI_PROVIDER_HARD_TIMEOUT_MS,
  );
  resetIdleTimeout();
  try {
    const response = await fetch(
      YTD_SETTINGS.chatCompletionsUrl(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.aiApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );
    // Receiving headers proves DeepSeek is still making progress. DeepSeek
    // may then send blank-line body chunks while a non-streaming request queues.
    resetIdleTimeout();

    const data = await readBoundedAiResponse(response, resetIdleTimeout);
    if (!response.ok) {
      const errorData = data && typeof data === "object" ? data : {};
      const error = new Error(
        errorData.error?.message ||
          errorData.message ||
          `DeepSeek error: ${response.status}`,
      );
      error.status = response.status;
      throw error;
    }

    const text = data.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) {
      const error = new Error("DeepSeek returned an empty response.");
      error.code = "EMPTY_AI_RESPONSE";
      throw error;
    }

    return { text, settings };
  } catch (error) {
    if (timeoutKind === "idle") {
      const timeoutError = new Error(
        "DeepSeek request was inactive for 50 seconds. Please Retry.",
      );
      timeoutError.code = "AI_IDLE_TIMEOUT";
      throw timeoutError;
    }
    if (timeoutKind === "hard") {
      const timeoutError = new Error(
        "DeepSeek request exceeded the 120-second limit. Please Retry.",
      );
      timeoutError.code = "AI_HARD_TIMEOUT";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(idleTimeoutId);
    clearTimeout(hardTimeoutId);
  }
}

async function readBoundedAiResponse(response, onActivity) {
  const reader = response.body?.getReader?.();
  if (reader) {
    const decoder = new TextDecoder();
    let responseText = "";
    let responseBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      // Every received chunk is activity, including DeepSeek's blank lines.
      onActivity();
      const byteLength = value?.byteLength ?? 0;
      responseBytes += byteLength;
      if (responseBytes > AI_PROVIDER_MAX_RESPONSE_BYTES) {
        await reader.cancel?.().catch(() => {});
        const error = new Error("DeepSeek response exceeded the 2 MiB limit.");
        error.code = "AI_RESPONSE_TOO_LARGE";
        throw error;
      }
      responseText += decoder.decode(value, { stream: true });
    }
    responseText += decoder.decode();
    return JSON.parse(responseText.trimStart());
  }

  // Some fetch implementations do not expose a readable stream. Preserve a
  // bounded body read for that case.
  if (typeof response.text === "function") {
    const responseText = await response.text();
    onActivity();
    const byteLength = new TextEncoder().encode(responseText).byteLength;
    if (byteLength > AI_PROVIDER_MAX_RESPONSE_BYTES) {
      const error = new Error("DeepSeek response exceeded the 2 MiB limit.");
      error.code = "AI_RESPONSE_TOO_LARGE";
      throw error;
    }
    return JSON.parse(responseText.trimStart());
  }

  // Legacy/test fetch shims may expose only json(). The hard and idle timers
  // still bound this fallback even though chunk-level activity is unavailable.
  const data = await response.json();
  onActivity();
  return data;
}

// ============================================================
// SIDE PANEL SETUP
// ============================================================

/**
 * When the user clicks the extension icon, open the side panel.
 * Chrome's Side Panel API lets us show a persistent panel alongside the page.
 */
chrome.action.onClicked.addListener((tab) => {
  if (!BILI_PLATFORM.isBilibiliVideoPage(tab.url)) {
    void updatePanelForTab(tab.id, tab.url, tab.windowId);
    return;
  }

  // Re-enable + open without awaiting — preserves user gesture context
  chrome.sidePanel.setOptions({
    tabId: tab.id,
    path: "sidepanel.html",
    enabled: true,
  });
  chrome.sidePanel.open({ tabId: tab.id });
});

/**
 * Allow the side panel to open on any page, but it's designed for bilibili.
 */
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === "install") chrome.runtime.openOptionsPage();
});

/**
 * Keep the side panel scoped to bilibili video tabs only.
 *
 * Chrome side panels are "global" by default: once opened, the panel follows
 * you to every tab. To make Bilibili Digest behave like a bilibili-only tool, we
 * enable the panel on bilibili video tabs and disable it everywhere else. Disabling
 * on a tab makes Chrome hide/close the panel for that tab, so it never lingers
 * on a new tab or some other website.
 *
 * We have to react to BOTH things that can change "what tab you're looking at":
 *   - onUpdated: the current tab navigates to a new URL
 *   - onActivated: you switch to (or open) a different tab
 * The original code only handled onUpdated, which is why the panel stayed
 * visible when switching to an already-loaded non-bilibili tab.
 */
async function closePanelForTab(tabId, windowId) {
  // Chrome 141 added an explicit close API. On older supported versions,
  // disabling the tab-specific panel below remains the compatibility path.
  if (typeof chrome.sidePanel.close !== "function") return;

  try {
    // This closes the tab-specific panel used by Bilibili Digest.
    await chrome.sidePanel.close({ tabId });
    return;
  } catch (error) {
    // Chrome 145+ rejects tabId when the visible instance is global. Close
    // that instance by window instead.
  }

  if (Number.isInteger(windowId)) {
    await chrome.sidePanel.close({ windowId }).catch(() => {});
  }
}

async function updatePanelForTab(tabId, url, windowId) {
  const isBilibili = BILI_PLATFORM.isBilibiliVideoPage(url);
  if (!isBilibili) {
    // Close the visible instance first. Then disable this tab so Chrome cannot
    // reopen the global default panel as navigation settles.
    await closePanelForTab(tabId, windowId);
    await chrome.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
    return;
  }

  // setOptions can reject if the tab just closed. Ignore that harmlessly.
  await chrome.sidePanel
    .setOptions({ tabId, path: "sidepanel.html", enabled: true })
    .catch(() => {});
}

/**
 * Gets the best URL from a tab update that can change panel availability.
 * Chrome can apply tab-specific side-panel state before a navigation commits,
 * then reset it during the commit. Handling loading and complete gives the
 * first non-bilibili navigation a reliable second reconciliation.
 */
function getNavigationUrl(changeInfo, tab) {
  if (changeInfo.url) return changeInfo.url;
  if (changeInfo.status !== "loading" && changeInfo.status !== "complete") {
    return "";
  }
  return tab.pendingUrl || tab.url || "";
}

// A tab started or completed navigation. Reconcile at both stages because
// Chrome can replace per-tab side-panel options while the page commits.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  const url = getNavigationUrl(changeInfo, tab);
  if (!url) return; // Ignore title and favicon-only updates.
  void updatePanelForTab(tabId, url, tab.windowId);
});

// The user switched to a different tab (or opened a new one).
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    void updatePanelForTab(tabId, tab.url || tab.pendingUrl, windowId);
  } catch (e) {
    // Tab vanished before we could read it — nothing to do.
  }
});

// ============================================================
// MESSAGE HANDLING
// ============================================================

/**
 * Listen for messages from the side panel and content script.
 * This is like a switchboard — different "actions" trigger different handlers.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // We need to return true to indicate we'll respond asynchronously
  if (message.action === "fetchTranscript") {
    handleFetchTranscript(message.videoId, message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true; // Keep the message channel open for async response
  }

  if (message.action === "probeAudio") {
    // Size/duration pre-flight for the speech-to-text button. Never
    // downloads and never calls a paid service.
    handleProbeAudio(message.videoId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "transcribeTranscript") {
    // The user explicitly asked for speech-to-text on a video with no
    // subtitle track. This is the only path that spends money.
    handleTranscribe(message.videoId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "analyzeTranscript") {
    // Pass video duration to help the AI validate timestamps
    handleAnalyzeTranscript(
      message.transcriptText,
      message.videoTitle,
      message.channelName,
      message.videoDescription,
      message.videoDuration,
    )
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "explainSelection") {
    // Explain selected text using DeepSeek.
    handleExplainSelection(
      message.selectedText,
      message.transcriptContext,
      message.videoTitle,
    )
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message.action === "saveNote") {
    // Save a note at the current timestamp, or save exact selected transcript
    // text when the side panel supplies it.
    handleSaveNote(
      message.videoId,
      message.timestamp,
      message.videoTitle,
      message.channelName,
      message.selectedText,
    )
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "getNotes") {
    // Get all saved notes
    handleGetNotes(message.videoId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "deleteNote") {
    // Delete a specific note
    handleDeleteNote(message.noteId)
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "getVideoInfo") {
    handleGetVideoInfo(message.tabId)
      .then(sendResponse)
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  // Translation: send content to DeepSeek.
  if (message.action === "translateContent") {
    handleTranslateContent(
      message.content,
      message.contentType,
      message.targetLanguage,
      message.videoTitle,
    )
      .then(sendResponse)
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (message.action === "checkConfig") {
    getSettings()
      .then((settings) =>
        sendResponse({
          hasAiKey: !!settings.aiApiKey,
        }),
      )
      .catch((error) => sendResponse({ error: error.message }));
    return true;
  }

  if (message.action === "openOptions") {
    chrome.runtime.openOptionsPage();
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "openSidePanel") {
    const tabId = sender.tab?.id;
    debugLog("[Bilibili Digest BG] openSidePanel requested from tab:", tabId);

    // Re-enable the panel (it may have been disabled by auto-close) and open it.
    // IMPORTANT: we call setOptions + open synchronously (no await between them)
    // to preserve the user gesture context. Chrome requires sidePanel.open()
    // to be called within a user gesture — awaiting anything first can expire it.
    if (tabId) {
      chrome.sidePanel.setOptions({
        tabId,
        path: "sidepanel.html",
        enabled: true,
      });
      chrome.sidePanel
        .open({ tabId })
        .then(() => {
          // Broadcast to side panel to start digest (in case it's already open)
          setTimeout(() => {
            chrome.runtime
              .sendMessage({ action: "startDigestFromButton" })
              .catch(() => {});
          }, 300);
        })
        .catch((err) => {
          console.error("[Bilibili Digest BG] openSidePanel error:", err);
        });
    } else {
      // Fallback: find the active tab
      chrome.tabs
        .query({ active: true, lastFocusedWindow: true })
        .then((tabs) => {
          if (tabs[0]) {
            chrome.sidePanel.setOptions({
              tabId: tabs[0].id,
              path: "sidepanel.html",
              enabled: true,
            });
            chrome.sidePanel.open({ tabId: tabs[0].id }).catch((err) => {
              console.error(
                "[Bilibili Digest BG] openSidePanel fallback error:",
                err,
              );
            });
          }
        });
    }

    sendResponse({ success: true });
    return false;
  }

  // Relay messages from side panel to content script
  if (message.action === "relayToContent") {
    debugLog("[Bilibili Digest BG] Relay request:", message.payload?.action);
    (async () => {
      try {
        // Query specifically for bilibili tabs to avoid side panel context issues
        // Try multiple query strategies to find the right tab
        let tabs = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        debugLog(
          "[Bilibili Digest BG] Active tab in last focused window:",
          tabs.length,
          tabs[0]?.url,
        );

        // If no bilibili tab found, try broader query
        if (!tabs[0] || !tabs[0].url?.includes("bilibili.com")) {
          tabs = await chrome.tabs.query({
            url: "https://www.bilibili.com/*",
            active: true,
          });
          debugLog("[Bilibili Digest BG] Active bilibili tabs:", tabs.length);
        }

        // Still nothing? Try any bilibili tab
        if (!tabs[0]) {
          tabs = await chrome.tabs.query({ url: "https://www.bilibili.com/*" });
          debugLog("[Bilibili Digest BG] Any bilibili tabs:", tabs.length);
        }

        if (tabs[0]) {
          debugLog(
            "[Bilibili Digest BG] Sending to tab:",
            tabs[0].id,
            "URL:",
            tabs[0].url,
          );
          const response = await chrome.tabs.sendMessage(
            tabs[0].id,
            message.payload,
          );

          debugLog("[Bilibili Digest BG] Got response from content:", response);
          sendResponse({ success: true, response });
        } else {
          debugLog("[Bilibili Digest BG] No bilibili tab found");
          sendResponse({ success: false, error: "No bilibili tab found" });
        }
      } catch (err) {
        console.error("[Bilibili Digest BG] Relay error:", err.message);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true; // Keep channel open for async response
  }
});

// ============================================================
// BILIBILI SUBTITLE FETCHING
// ============================================================

// Bilibili subtitle JSON is served from a CDN behind anti-abuse checks that
// require a browser-like User-Agent and Referer. No API key is needed; the
// login state (SESSDATA cookie) gates the subtitle-track list endpoint.
const BILI_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/** Build a Cookie header from the user's bilibili cookies (requires "cookies"). */
async function getBilibiliCookieHeader() {
  try {
    const cookies = await chrome.cookies.getAll({ domain: ".bilibili.com" });
    return cookies.map((c) => c.name + "=" + c.value).join("; ");
  } catch (e) {
    return "";
  }
}

/**
 * Read the video identity from the page's MAIN world.
 *
 * This is the FALLBACK path only. The view endpoint keyed by the URL's `?p=`
 * is the primary source, because the player lags behind a playlist-part
 * switch: right after the user picks a new part, `window.player` can still
 * report the previous part's cid, and using it silently served the wrong
 * subtitles. Reach for this only when the API lookup failed.
 *
 * Runs in the MAIN world so it can touch the page's own `window.player` and
 * `window.__INITIAL_STATE__`. This function must stay self-contained: it is
 * serialized and executed in the page, so it cannot close over outer vars.
 */
async function readPlayInfoFromTab(tabId) {
  if (!tabId) return null;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      world: "MAIN",
      func: () => {
        const out = { bvid: null, aid: null, cid: null, page: null };

        // 1. The player instance is the most accurate source.
        try {
          const player = window.player;
          if (player && typeof player.getVideoMessage === "function") {
            const msg = player.getVideoMessage();
            if (msg) {
              if (msg.aid) out.aid = Number(msg.aid);
              if (msg.cid) out.cid = Number(msg.cid);
              if (msg.p) out.page = Number(msg.p);
              if (msg.bvid) out.bvid = String(msg.bvid);
            }
          }
        } catch (_) {}

        // 2. Page state gives us aid/bvid even when the player isn't ready.
        try {
          const state = window.__INITIAL_STATE__;
          const vd = state && state.videoData;
          if (vd) {
            if (!out.aid && vd.aid) out.aid = Number(vd.aid);
            if (!out.bvid && vd.bvid) out.bvid = String(vd.bvid);
          }
        } catch (_) {}

        // 3. Last resort: bilibili CDN URLs embed the cid as a path segment.
        try {
          const video = document.querySelector("video");
          const src = (video && (video.currentSrc || video.src)) || "";
          if (src && !out.cid) {
            const m = src.match(/\/(\d{6,})\//);
            if (m) out.cid = Number(m[1]);
          }
        } catch (_) {}

        return out.cid || out.aid ? out : null;
      },
    });
    const result = results && results[0] && results[0].result;
    return result || null;
  } catch (e) {
    debugLog("[Bilibili Digest BG] readPlayInfoFromTab failed:", e && e.message);
    return null;
  }
}

/**
 * Fetch bilibili video metadata for a bvid via the view endpoint.
 *
 * The `?p=` page number is the user's selection (bilibili writes it into the
 * URL on every playlist-part switch), so it is the authoritative input. We ask
 * for that page and then prefer `data.pages[p-1].cid`, which is the cid of
 * that exact part — `data.cid` alone is only reliable for page 1.
 *
 * Returns { aid, cid, page, pages, title, ownerName } or { error }.
 */
async function fetchBilibiliView(bvid, page) {
  let url = "https://api.bilibili.com/x/web-interface/view?bvid=" + encodeURIComponent(bvid);
  const p = Number(page) || 1;
  if (p > 1) url += "&p=" + p;
  const res = await fetch(url, {
    headers: { "User-Agent": BILI_UA, Referer: "https://www.bilibili.com/" },
  });
  if (!res.ok) {
    return { error: "VIEW_FAILED", message: "view request failed: " + res.status };
  }
  const json = await res.json();
  if (json.code !== 0 || !json.data) {
    return {
      error: json.code === -404 ? "NOT_FOUND" : "VIEW_FAILED",
      message: json.message || "view request error",
    };
  }
  const d = json.data;
  const pages = (Array.isArray(d.pages) ? d.pages : []).map(function (entry) {
    return {
      page: Number(entry.page) || 0,
      cid: Number(entry.cid) || 0,
      part: entry.part || "",
      duration: Number(entry.duration) || 0,
    };
  });

  // Resolve the cid for the requested part explicitly. `pages` is the ground
  // truth for multi-part videos; `d.cid` is the fallback for single-part ones
  // or when the requested page is out of range.
  let cid = Number(d.cid) || 0;
  const match = pages.find(function (entry) { return entry.page === p; });
  if (match && match.cid) cid = match.cid;

  return {
    aid: d.aid,
    cid: cid,
    page: p,
    pages: pages,
    // Per-part run time, used to size the speech-to-text job before we pay for
    // it. `d.duration` is the whole-video total, so prefer the part's own value.
    duration: (match && match.duration) || Number(d.duration) || 0,
    title: d.title || "",
    ownerName: d.owner ? d.owner.name : "",
  };
}

/**
 * Fetch the subtitle-track list for a video (aid/cid), WBI-signed, with cookies.
 * Returns { subtitles, hasCookie } or { error }.
 */
async function fetchBilibiliSubtitleList(aid, cid) {
  const cookie = await getBilibiliCookieHeader();
  const signed = await BILI_WBI.signParams({
    aid: aid,
    cid: cid,
    platform: "web",
    web_location: 1550101,
  });
  const url =
    "https://api.bilibili.com/x/player/wbi/v2?aid=" + aid + "&cid=" + cid +
    "&platform=web&web_location=1550101&w_rid=" + signed.w_rid + "&wts=" + signed.wts;
  const headers = {
    "User-Agent": BILI_UA,
    Referer: "https://www.bilibili.com/",
  };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(url, { headers: headers });
  if (res.status === 412) return { error: "RATE_LIMITED" };
  const json = await res.json().catch(function () { return {}; });
  if (json.code === -412) return { error: "RATE_LIMITED" };
  if (json.code !== 0) {
    return { error: "PLAYER_FAILED", message: json.message || "player request error" };
  }
  const subtitle = json.data ? json.data.subtitle : null;
  return { subtitles: (subtitle && subtitle.subtitles) || [], hasCookie: !!cookie };
}

/**
 * Pick the best track: CC Chinese > AI Chinese > foreign CC (needs translation).
 * Bilibili AI tracks use `lan` like "ai-zh"; manual CC use "zh-CN"/"zh-Hans"/"en".
 */
function pickSubtitleTrack(subtitles) {
  const isZh = function (lan) {
    return ["zh-CN", "zh-Hans", "zh-Hant", "zh"].includes(lan);
  };

  const ccZh = subtitles.find(function (s) { return isZh(s.lan); });
  if (ccZh) return { track: ccZh, needsTranslation: false, isAi: false };

  const aiZh = subtitles.find(function (s) { return s.lan === "ai-zh"; });
  if (aiZh) return { track: aiZh, needsTranslation: false, isAi: true };

  const foreign = subtitles.find(function (s) { return !s.lan.startsWith("ai-") && !isZh(s.lan); });
  if (foreign) return { track: foreign, needsTranslation: true, isAi: false };

  const aiOther = subtitles.find(function (s) { return s.lan.startsWith("ai-"); });
  if (aiOther) return { track: aiOther, needsTranslation: true, isAi: true };

  return null;
}

/** Download and parse a bilibili subtitle JSON (CDN, no auth). */
async function fetchBilibiliSubtitleJson(subtitleUrl) {
  const fullUrl = subtitleUrl.startsWith("//") ? "https:" + subtitleUrl : subtitleUrl;
  const res = await fetch(fullUrl, {
    headers: { "User-Agent": BILI_UA, Referer: "https://www.bilibili.com/" },
  });
  if (!res.ok) throw new Error("subtitle fetch failed: " + res.status);
  return res.json();
}

/**
 * Normalize bilibili subtitle body[] into the shared transcript format.
 *
 * The shaping itself lives in asr.js (cuesToTranscript) so that speech-to-text
 * results — which arrive as cues too — produce a byte-identical structure and
 * inherit every downstream feature for free.
 */
function normalizeBilibiliSubtitle(json, language, needsTranslation) {
  const body = Array.isArray(json && json.body) ? json.body : [];
  const cues = [];

  for (const item of body) {
    const text = String(item.content || "").trim();
    if (!text) continue;
    cues.push({
      text: text,
      start: Number(item.from) || 0,
      end: Number(item.to) || 0,
    });
  }

  return BILI_ASR.cuesToTranscript(cues, language, needsTranslation);
}

/**
 * Fetch subtitles for a bilibili video using the official API chain:
 * view -> wbi/v2 (signed, cookie) -> subtitle CDN JSON.
 *
 * The requested part is identified by `pageId` (bvid + `?p=` page number).
 * We resolve its cid through the view endpoint FIRST, because that lookup is
 * purely a function of the page number the user actually selected. The live
 * player used to be the primary source, but `window.player` can still report
 * the previous part for a while after a switch, which silently served the
 * wrong part's subtitles. It is now only a fallback for when the view request
 * itself fails.
 *
 * @param {string} pageId - e.g. "BV1Fg411D7Jy" or "BV1Fg411D7Jy_p2"
 * @param {number} [tabId] - active tab, used to read the live cid as a fallback
 * @returns {Object} - { success, transcript, transcriptText, ... } or { success:false, error }
 */
async function handleFetchTranscript(pageId, tabId) {
  const split = BILI_PLATFORM.splitPageId(pageId);
  const bvid = split.bvid;
  const page = split.page;

  try {
    let aid = null;
    let cid = null;
    let cidSource = null;

    // 1. Authoritative: the cid of the selected page, straight from the view
    //    endpoint. Deterministic, and independent of how far the player has
    //    got with swapping the media source.
    if (bvid) {
      const view = await fetchBilibiliView(bvid, page);
      if (view.error) {
        // Only a hard "this video does not exist" is fatal; anything else may
        // still be recoverable from the live player below.
        if (view.error === "NOT_FOUND") {
          return {
            success: false,
            error: view.error,
            message: view.message || "Video not found.",
          };
        }
      } else {
        aid = view.aid;
        cid = view.cid;
        cidSource = "view";
      }
    }

    // 2. Fallback: ask the page's player which cid is actually loaded.
    if (!cid) {
      const live = await readPlayInfoFromTab(tabId);
      if (live && live.cid) {
        aid = live.aid;
        cid = live.cid;
        cidSource = "live";
      }
    }

    if (!cid) {
      return {
        success: false,
        error: bvid ? "VIEW_FAILED" : "INVALID_ID",
        message: bvid
          ? "Failed to resolve this video part. Please reload the page and try again."
          : "Invalid bilibili video ID.",
      };
    }

    const list = await fetchBilibiliSubtitleList(aid, cid);
    if (list.error === "RATE_LIMITED") {
      return {
        success: false,
        error: "RATE_LIMITED",
        message: "Bilibili rate limit reached. Please wait a moment and try again.",
      };
    }
    if (list.error) {
      return {
        success: false,
        error: list.error,
        message: list.message || "Failed to load subtitle list.",
      };
    }

    const picked = pickSubtitleTrack(list.subtitles);
    if (!picked) {
      return {
        success: false,
        error: list.hasCookie ? "NO_SUBTITLE" : "NOT_LOGGED_IN",
        message: list.hasCookie
          ? "This video has no Chinese subtitles."
          : "Please log in to bilibili to access subtitles.",
      };
    }

    const json = await fetchBilibiliSubtitleJson(picked.track.subtitle_url);
    const norm = normalizeBilibiliSubtitle(json, picked.track.lan, picked.needsTranslation);

    if (norm.transcript.length === 0) {
      return {
        success: false,
        error: "EMPTY_TRANSCRIPT",
        message: "The subtitle track is empty for this video.",
      };
    }

    return {
      success: true,
      transcript: norm.transcript,
      transcriptText: norm.transcriptText,
      transcriptTextTimestamped: norm.transcriptTextTimestamped,
      language: picked.track.lan || null,
      needsTranslation: picked.needsTranslation,
      isAiSubtitle: picked.isAi,
      cid: cid,
      aid: aid,
      page: page,
      cidSource: cidSource,
    };
  } catch (error) {
    console.error("Transcript fetch error:", error);
    return {
      success: false,
      error: error.message || "Failed to fetch transcript",
    };
  }
}


// ============================================================
// HOSTED SPEECH-TO-TEXT FALLBACK
// ============================================================
//
// Only for videos bilibili has no subtitle for. The extension downloads the
// DASH audio track itself and uploads it to an OpenAI-compatible
// /audio/transcriptions endpoint that the user configured (see asr.js).
//
// Two hard-won facts drive this code:
//   1. The audio CDN (bilivideo.com) answers 403 unless the request carries a
//      bilibili Referer. An extension-origin fetch has no Referer and Chrome's
//      fetch() refuses to set that header, so a declarativeNetRequest rule
//      supplies it instead.
//   2. Bilibili serves its DASH audio as a single complete MP4 (ftyp/moov/...),
//      not as byte-chunked segments, so one GET yields a file we can upload
//      as-is. Speech recognition does not need bandwidth, so we always pick the
//      smallest stream.

const BILI_MEDIA_RULE_ID = 9001;
const BILI_MEDIA_ANY_RULE_ID = 9002;
const BILI_REFERER = "https://www.bilibili.com/";

// One vocabulary for this whole section: the shared BILI_ASR.ERROR_CODES
// values. Internal helpers and the side panel must agree on the same strings,
// otherwise a failure gets reported but is never recognised.
const ASR_ERRORS = BILI_ASR.ERROR_CODES;

let mediaRefererRuleInstalled = false;

/**
 * Install (once) the request-header rules that make the audio CDN happy.
 *
 * Rule 9001 is scoped to requests this extension initiates, which is the
 * precise thing we need. Rule 9002 is the same rewrite without the initiator
 * filter: it exists because Chrome has historically been inconsistent about
 * matching extension-initiated requests, and the value it writes is byte for
 * byte the Referer the bilibili player already sends for its own media
 * requests, so widening it changes nothing for the page.
 */
async function installMediaRefererRule() {
  if (mediaRefererRuleInstalled) return;
  const dnr = chrome.declarativeNetRequest;
  if (!dnr || typeof dnr.updateDynamicRules !== "function") return;

  const requestHeaders = [
    { header: "Referer", operation: "set", value: BILI_REFERER },
  ];

  try {
    await dnr.updateDynamicRules({
      removeRuleIds: [BILI_MEDIA_RULE_ID, BILI_MEDIA_ANY_RULE_ID],
      addRules: [
        {
          id: BILI_MEDIA_RULE_ID,
          priority: 2,
          action: { type: "modifyHeaders", requestHeaders: requestHeaders },
          condition: {
            initiatorDomains: [chrome.runtime.id],
            urlFilter: "||bilivideo.com",
            resourceTypes: ["xmlhttprequest", "other"],
          },
        },
        {
          id: BILI_MEDIA_ANY_RULE_ID,
          priority: 1,
          action: { type: "modifyHeaders", requestHeaders: requestHeaders },
          condition: {
            urlFilter: "||bilivideo.com",
            resourceTypes: ["xmlhttprequest", "other"],
          },
        },
      ],
    });
    mediaRefererRuleInstalled = true;
  } catch (error) {
    debugLog(
      "[Bilibili Digest BG] media referer rule failed:",
      error && error.message,
    );
  }
}

/** Push a status line into the side panel's ASR progress view (best effort). */
function sendAsrProgress(title, subtitle, percent) {
  try {
    const pending = chrome.runtime.sendMessage({
      action: "asrProgress",
      title: title,
      subtitle: subtitle || "",
      percent: Number(percent) || 0,
    });
    if (pending && typeof pending.catch === "function") pending.catch(() => {});
  } catch (_) {}
}

/**
 * Resolve the DASH audio streams for a video part.
 * Returns { urls, bandwidth, duration } or { error }.
 */
async function fetchBilibiliPlayUrl(aid, cid) {
  const cookie = await getBilibiliCookieHeader();
  const signed = await BILI_WBI.signParams({
    avid: aid,
    cid: cid,
    qn: 64,
    fnver: 0,
    fnval: 16,
    fourk: 1,
  });
  const url =
    "https://api.bilibili.com/x/player/wbi/playurl?avid=" + aid +
    "&cid=" + cid +
    "&qn=64&fnver=0&fnval=16&fourk=1" +
    "&w_rid=" + signed.w_rid + "&wts=" + signed.wts;

  const headers = { "User-Agent": BILI_UA, Referer: BILI_REFERER };
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(url, { headers: headers });
  if (res.status === 412) return { error: ASR_ERRORS.RATE_LIMITED };

  const json = await res.json().catch(function () { return {}; });
  if (json.code === -412) return { error: ASR_ERRORS.RATE_LIMITED };
  if (json.code !== 0 || !json.data) {
    return {
      error: ASR_ERRORS.AUDIO_UNAVAILABLE,
      message: json.message || "Could not load this video's audio stream.",
    };
  }

  const dash = json.data.dash;
  const tracks = dash && Array.isArray(dash.audio) ? dash.audio : [];
  if (!tracks.length) {
    return {
      error: ASR_ERRORS.AUDIO_UNAVAILABLE,
      message: "This video has no separate audio stream to transcribe.",
    };
  }

  // Smallest bandwidth first: a 64 kbps mono track is plenty for ASR and keeps
  // the upload (which the user pays for) small.
  const sorted = tracks.slice().sort(function (a, b) {
    return (Number(a.bandwidth) || 0) - (Number(b.bandwidth) || 0);
  });
  const track = sorted[0];
  const urls = [track.baseUrl || track.base_url]
    .concat(track.backupUrl || track.backup_url || [])
    .filter(Boolean);

  if (!urls.length) {
    return {
      error: ASR_ERRORS.AUDIO_UNAVAILABLE,
      message: "Audio stream URL missing.",
    };
  }

  return {
    urls: urls,
    bandwidth: Number(track.bandwidth) || 0,
    duration: Number(dash.duration) || Number(json.data.timelength) / 1000 || 0,
    mimeType: track.mimeType || "audio/mp4",
  };
}

/**
 * Download the audio file, trying each mirror in turn.
 * Returns { buffer } or { error, bytes }.
 *
 * `onProgress(percent)` is called as bytes arrive. The download phase maps to
 * 5-100 percent; the caller sends an initial 5% before this function runs.
 */
async function downloadBilibiliAudio(urls, maxBytes, onProgress) {
  await installMediaRefererRule();
  let lastStatus = 0;

  for (const url of urls) {
    let res;
    try {
      // No cookies: the CDN is public, and omitting credentials keeps this a
      // simple (preflight-free) request.
      res = await fetch(url, { credentials: "omit", cache: "no-store" });
    } catch (error) {
      debugLog("[Bilibili Digest BG] audio fetch failed:", error && error.message);
      continue;
    }

    if (!res.ok) {
      lastStatus = res.status;
      continue;
    }

    const declared = Number(res.headers.get("content-length")) || 0;
    if (maxBytes && declared && declared > maxBytes) {
      return { error: ASR_ERRORS.AUDIO_TOO_LARGE, bytes: declared };
    }

    try {
      // If the environment doesn't expose a ReadableStream body (unit-test
      // mocks, older fetch implementations), fall back to arrayBuffer().
      if (!res.body || typeof res.body.getReader !== "function") {
        const buffer = await res.arrayBuffer();
        if (!buffer || !buffer.byteLength) {
          lastStatus = 0;
          continue;
        }
        if (maxBytes && buffer.byteLength > maxBytes) {
          return { error: ASR_ERRORS.AUDIO_TOO_LARGE, bytes: buffer.byteLength };
        }
        return { buffer: buffer };
      }

      const reader = res.body.getReader();
      const chunks = [];
      let received = 0;
      const total = declared || 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        if (maxBytes && received > maxBytes) {
          return { error: ASR_ERRORS.AUDIO_TOO_LARGE, bytes: received };
        }
        if (total > 0 && typeof onProgress === "function") {
          // 5% headroom before download, cap at 100% while reading.
          const percent = Math.min(100, 5 + Math.round((received / total) * 95));
          onProgress(percent);
        }
      }

      const buffer = new ArrayBuffer(received);
      const view = new Uint8Array(buffer);
      let offset = 0;
      for (const chunk of chunks) {
        view.set(chunk, offset);
        offset += chunk.byteLength;
      }

      if (!buffer.byteLength) {
        lastStatus = 0;
        continue;
      }
      if (maxBytes && buffer.byteLength > maxBytes) {
        return { error: ASR_ERRORS.AUDIO_TOO_LARGE, bytes: buffer.byteLength };
      }
      return { buffer: buffer };
    } catch (error) {
      debugLog("[Bilibili Digest BG] audio stream read failed:", error && error.message);
      continue;
    }
  }

  return { error: ASR_ERRORS.AUDIO_UNAVAILABLE, status: lastStatus };
}

/**
 * POST one multipart transcription request.
 * Returns { body } (parsed JSON or raw text) or { error, status, detail }.
 */
async function postTranscriptionRequest(options) {
  const endpoint = BILI_ASR.transcriptionsUrl(options.baseUrl);
  if (!endpoint) {
    return {
      error: ASR_ERRORS.ASR_NOT_CONFIGURED,
      message: "Transcription endpoint is not set.",
    };
  }

  const form = new FormData();
  // Providers sniff the container, and our bytes are a plain MP4 file; ".mp4"
  // is on every Whisper-compatible allowlist.
  form.append(
    "file",
    new Blob([options.buffer], { type: options.mimeType || "audio/mp4" }),
    "audio.mp4",
  );
  form.append("model", options.model);
  form.append("response_format", options.format);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { Authorization: "Bearer " + options.apiKey },
      body: form,
    });
  } catch (error) {
    return { error: ASR_ERRORS.ASR_NETWORK, message: error && error.message };
  }

  if (res.status === 401 || res.status === 403) return { error: ASR_ERRORS.ASR_AUTH };
  if (res.status === 429) return { error: ASR_ERRORS.ASR_RATE_LIMITED };
  if (res.status === 413) return { error: ASR_ERRORS.AUDIO_TOO_LARGE };

  const raw = await res.text().catch(function () { return ""; });
  if (!res.ok) {
    return {
      error: ASR_ERRORS.ASR_REJECTED,
      status: res.status,
      detail: String(raw || "").slice(0, 300),
    };
  }

  if (options.format === "srt") return { body: raw };

  try {
    return { body: JSON.parse(raw) };
  } catch (_) {
    return { body: { text: raw } };
  }
}

/**
 * Transcribe a downloaded buffer, degrading gracefully when the endpoint
 * refuses a richer response format. Returns the transcript contract or
 * { error }.
 */
async function transcribeAudioBuffer(buffer, settings, durationSeconds) {
  const plan = BILI_ASR.responseFormatPlan(
    BILI_ASR.modelSupportsTimestamps(settings.asrProvider, settings.asrModel),
  );

  let lastError = null;

  for (const format of plan) {
    const attempt = await postTranscriptionRequest({
      baseUrl: settings.asrBaseUrl,
      apiKey: settings.asrApiKey,
      model: settings.asrModel,
      mimeType: "audio/mp4",
      format: format,
      buffer: buffer,
    });

    if (attempt.error) {
      // Credentials, quota and size problems are terminal. A rejected format
      // is not: fall through and try the next one.
      if (
        attempt.error === ASR_ERRORS.ASR_AUTH ||
        attempt.error === ASR_ERRORS.ASR_RATE_LIMITED ||
        attempt.error === ASR_ERRORS.AUDIO_TOO_LARGE
      ) {
        return attempt;
      }
      lastError = attempt;
      continue;
    }

    const parsed = BILI_ASR.parseTranscriptionResponse(
      attempt.body,
      format,
      durationSeconds,
    );
    if (!parsed || !parsed.cues || !parsed.cues.length) {
      lastError = { error: ASR_ERRORS.ASR_REJECTED, detail: "empty result" };
      continue;
    }

    const shaped = BILI_ASR.cuesToTranscript(parsed.cues, "asr", false);
    if (!shaped.transcript.length) {
      lastError = { error: ASR_ERRORS.ASR_REJECTED, detail: "empty result" };
      continue;
    }

    return {
      transcript: shaped.transcript,
      transcriptText: shaped.transcriptText,
      transcriptTextTimestamped: shaped.transcriptTextTimestamped,
      estimated: parsed.estimated === true,
    };
  }

  return lastError || { error: ASR_ERRORS.ASR_REJECTED };
}

/** Match pattern for the user's transcription endpoint, or "" if unusable. */
function endpointOriginPattern(baseUrl) {
  const endpoint = BILI_ASR.transcriptionsUrl(baseUrl);
  if (!endpoint) return "";
  try {
    return new URL(endpoint).origin + "/*";
  } catch (_) {
    return "";
  }
}

/**
 * The transcription endpoint is a third-party origin that is not part of the
 * install-time host permissions; the options page asks for it on demand. A
 * service worker can only reach it once that grant exists.
 */
async function hasEndpointPermission(baseUrl) {
  const pattern = BILI_ASR.endpointOriginPattern(baseUrl);
  if (!pattern) return false;
  try {
    if (!chrome.permissions || !chrome.permissions.contains) return false;
    return (await chrome.permissions.contains({ origins: [pattern] })) === true;
  } catch (_) {
    return false;
  }
}

/** Cheap pre-flight so the panel can label the button and warn on size. */
async function handleProbeAudio(pageId) {
  const settings = await getSettings();
  if (!YTD_SETTINGS.asrReady(settings)) {
    return { success: false, error: "ASR_NOT_CONFIGURED", permissionMissing: false };
  }

  // Surfaced so the panel can point at Settings instead of offering a button
  // that is guaranteed to fail.
  const permissionMissing = !(await hasEndpointPermission(settings.asrBaseUrl));

  const split = BILI_PLATFORM.splitPageId(pageId);
  if (!split.bvid) return { success: false, error: "INVALID_ID" };

  const view = await fetchBilibiliView(split.bvid, split.page);
  if (view.error) {
    return { success: false, error: view.error, message: view.message };
  }

  const play = await fetchBilibiliPlayUrl(view.aid, view.cid);
  if (play.error) {
    return { success: false, error: play.error, message: play.message };
  }

  const duration = view.duration || play.duration || 0;
  const estimatedBytes = BILI_ASR.estimateAudioBytes(play.bandwidth, duration);

  return {
    success: true,
    duration: duration,
    minutes: BILI_ASR.audioMinutes(duration),
    estimatedBytes: estimatedBytes,
    maxBytes: settings.asrMaxBytes,
    tooLarge: estimatedBytes > settings.asrMaxBytes,
    permissionMissing: permissionMissing,
    endpointHost: BILI_ASR.endpointHost(settings.asrBaseUrl),
  };
}

/**
 * Full fallback for a video part with no subtitle track: resolve the audio,
 * download it, transcribe it, and return the standard transcript contract plus
 * `source: "asr"`.
 */
async function handleTranscribe(pageId) {
  const settings = await getSettings();

  if (!settings.asrEnabled) {
    return {
      success: false,
      error: BILI_ASR.ERROR_CODES.ASR_DISABLED,
      message: "Speech-to-text is turned off in Bilibili Digest Settings.",
    };
  }
  if (!YTD_SETTINGS.asrReady(settings)) {
    return {
      success: false,
      error: BILI_ASR.ERROR_CODES.ASR_NOT_CONFIGURED,
      message: "Add a speech-to-text API key in Bilibili Digest Settings.",
    };
  }
  if (!(await hasEndpointPermission(settings.asrBaseUrl))) {
    return {
      success: false,
      error: BILI_ASR.ERROR_CODES.ASR_NOT_CONFIGURED,
      message:
        "Bilibili Digest is not allowed to call " +
        (BILI_ASR.endpointHost(settings.asrBaseUrl) || "your transcription service") +
        ". Open Bilibili Digest Settings and save again to grant access.",
    };
  }

  const split = BILI_PLATFORM.splitPageId(pageId);
  if (!split.bvid) {
    return { success: false, error: "INVALID_ID", message: "Invalid bilibili video ID." };
  }

  try {
    const view = await fetchBilibiliView(split.bvid, split.page);
    if (view.error) {
      return { success: false, error: view.error, message: view.message };
    }

    const play = await fetchBilibiliPlayUrl(view.aid, view.cid);
    if (play.error) {
      return { success: false, error: play.error, message: play.message };
    }

    const duration = view.duration || play.duration || 0;

    sendAsrProgress("正在下载音频…", "", 5);
    const download = await downloadBilibiliAudio(play.urls, settings.asrMaxBytes, (p) =>
      sendAsrProgress("正在下载音频…", "", p),
    );
    if (download.error) {
      if (download.error === ASR_ERRORS.AUDIO_TOO_LARGE) {
        return {
          success: false,
          error: BILI_ASR.ERROR_CODES.AUDIO_TOO_LARGE,
          bytes: download.bytes,
          maxBytes: settings.asrMaxBytes,
          message:
            "This audio track is " + BILI_ASR.formatBytes(download.bytes) +
            ", over the " + BILI_ASR.formatBytes(settings.asrMaxBytes) +
            " limit set for the transcription service.",
        };
      }
      return {
        success: false,
        error: BILI_ASR.ERROR_CODES.AUDIO_UNAVAILABLE,
        message:
          "Could not download this video's audio" +
          (download.status ? " (HTTP " + download.status + ")" : "") + ".",
      };
    }

    const minutes = BILI_ASR.audioMinutes(duration);
    sendAsrProgress(
      "正在转写音频…",
      minutes ? "约 " + minutes + " 分钟音频" : "",
      100,
    );

    const result = await transcribeAudioBuffer(download.buffer, settings, duration);
    if (result.error) {
      return {
        success: false,
        error: result.error,
        status: result.status,
        detail: result.detail,
        message: asrFailureMessage(result, settings),
      };
    }

    return {
      success: true,
      transcript: result.transcript,
      transcriptText: result.transcriptText,
      transcriptTextTimestamped: result.transcriptTextTimestamped,
      language: "asr",
      needsTranslation: false,
      isAiSubtitle: false,
      source: "asr",
      timingEstimated: result.estimated === true,
      cid: view.cid,
      aid: view.aid,
      page: split.page,
    };
  } catch (error) {
    console.error("Transcription error:", error);
    return {
      success: false,
      error: error.message || "Transcription failed",
    };
  }
}

/** Turn an internal failure code into something a person can act on. */
function asrFailureMessage(result, settings) {
  const provider = BILI_ASR.resolveProvider(settings.asrProvider).label;
  switch (result.error) {
    case BILI_ASR.ERROR_CODES.ASR_AUTH:
      return (
        provider +
        " rejected the API key. Check the speech-to-text key in Bilibili Digest Settings."
      );
    case BILI_ASR.ERROR_CODES.ASR_RATE_LIMITED:
      return provider + " is rate limiting this key. Try again in a moment.";
    case BILI_ASR.ERROR_CODES.AUDIO_TOO_LARGE:
      return "The audio track is larger than the configured limit.";
    case BILI_ASR.ERROR_CODES.ASR_NETWORK:
      return "Could not reach " + provider + ". Check your network connection.";
    default:
      return (
        provider +
        " could not transcribe this audio" +
        (result.status ? " (HTTP " + result.status + ")" : "") + "."
      );
  }
}

// ============================================================
// JSON HELPER
// ============================================================

/**
 * Parses JSON returned by an LLM, tolerating the small mistakes they sometimes
 * make. Some models occasionally emit a trailing
 * comma before a ] or }, or wraps the JSON in prose / code fences. Plain
 * JSON.parse throws on those, which is what caused the "Unexpected token ']'"
 * error on the Overview tab. This function strips fences, isolates the outer
 * JSON object, removes trailing commas, and only then parses.
 *
 * @param {string} text - The raw text from the model
 * @returns {Object} - The parsed object (throws if still unparseable)
 */
function parseLooseJson(text) {
  let cleaned = (text || "").trim();

  // Strip ```json ... ``` style code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  }

  // Isolate the outermost { ... } in case the model added a sentence around it
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (firstError) {
    // Most common LLM slip: a trailing comma right before a } or ].
    // e.g. ["a", "b", ]  ->  ["a", "b" ]
    const repaired = cleaned.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(repaired);
  }
}

// ============================================================
// DEEPSEEK ANALYSIS
// ============================================================

/**
 * Sends the transcript to DeepSeek for analysis.
 *
 * The prompt asks the model to produce chapters covering the whole video
 * and 3-5 key quotes with timestamps.
 *
 * @param {string} transcriptText - The full transcript as plain text
 * @param {string} videoTitle - The video title
 * @param {string} channelName - The channel name
 * @returns {Object} - { success, analysis } or { success: false, error }
 */
async function handleAnalyzeTranscript(
  transcriptText,
  videoTitle,
  channelName,
  videoDescription,
  videoDuration,
) {
  try {
    const settings = await getSettings();
    if (!settings.aiApiKey) {
      return {
        success: false,
        error: "NO_AI_KEY",
        message: "DeepSeek API key not configured. Open Bilibili Digest Settings.",
      };
    }

    // Convert duration to MM:SS format for context
    // The transcript text is already prefixed with [M:SS] markers. Its LAST
    // marker is the most reliable signal of where the content actually ends —
    // more trustworthy than the duration metadata, which is sometimes missing
    // or wrong. We use the larger of (metadata duration, last transcript stamp).
    let lastTranscriptSeconds = 0;
    const stampMatches = transcriptText.match(/\[(\d+):(\d{2})\]/g) || [];
    if (stampMatches.length) {
      const last =
        stampMatches[stampMatches.length - 1].match(/\[(\d+):(\d{2})\]/);
      lastTranscriptSeconds = parseInt(last[1]) * 60 + parseInt(last[2]);
    }

    const effectiveSeconds = Math.max(
      Math.floor(videoDuration || 0),
      lastTranscriptSeconds,
    );
    const durationMinutes = Math.floor(effectiveSeconds / 60);
    const durationSeconds = Math.floor(effectiveSeconds % 60);
    const durationFormatted = `${durationMinutes}:${String(durationSeconds).padStart(2, "0")}`;
    const maxTimestampSeconds = effectiveSeconds;

    // The "last chapter must be after" threshold (75% in) forces the model to
    // cover the WHOLE video instead of front-loading chapters near the start.
    // We do NOT prescribe a chapter count — the model picks the natural splits.
    const lateThresholdSeconds = Math.floor(effectiveSeconds * 0.75);
    const lateThreshold = `${Math.floor(lateThresholdSeconds / 60)}:${String(
      lateThresholdSeconds % 60,
    ).padStart(2, "0")}`;

    const promptVariables = {
      durationFormatted,
      lateThreshold,
      maxTimestampSeconds,
      videoTitle: videoTitle || "Unknown",
      channelName: channelName || "Unknown",
      videoDescription: videoDescription || "No description available",
      transcriptText,
    };
    const systemPrompt = await loadPromptSection(
      "analysis.md",
      "System prompt",
      promptVariables,
    );
    const userPrompt = await loadPromptSection(
      "analysis.md",
      "User prompt",
      promptVariables,
    );

    debugLog("[Bilibili Digest] Requesting video analysis", settings.aiModel);
    const { text: responseText } = await requestAiCompletion({
      maxTokens: 8192,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    // Parse the JSON, tolerating trailing commas / stray prose
    let analysis = parseLooseJson(responseText);

    // Treat every model response as untrusted data. Rebuild the supported
    // schema and derive display timestamps from validated numeric seconds.
    analysis = validateAndFixTimestamps(analysis, maxTimestampSeconds);

    return {
      success: true,
      analysis: analysis,
    };
  } catch (error) {
    console.error("Analysis error:", error);
    if (error.status === 401) {
      return {
        success: false,
        error: "INVALID_AI_KEY",
        message: "DeepSeek rejected the API key.",
      };
    }
    if (error.status === 429) {
      return {
        success: false,
        error: "RATE_LIMITED",
        message: "DeepSeek rate-limited this request. Try again shortly.",
      };
    }
    return {
      success: false,
      error: error.message || "Failed to analyze transcript",
    };
  }
}

/**
 * Validates all timestamps in the analysis and fixes any that exceed video duration.
 * This is a safety net to prevent hallucinated timestamps from reaching the UI.
 *
 * @param {Object} analysis - The parsed analysis from DeepSeek
 * @param {number} maxSeconds - Maximum valid timestamp in seconds
 * @returns {Object} - Analysis with validated timestamps
 */
function validateAndFixTimestamps(analysis, maxSeconds) {
  const safeMax =
    Number.isFinite(Number(maxSeconds)) && Number(maxSeconds) > 0
      ? Number(maxSeconds)
      : Number.MAX_SAFE_INTEGER;

  // Helper to format seconds as MM:SS
  const formatTimestamp = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, "0")}`;
  };

  const safeString = (value, maxLength) =>
    typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  const safeSeconds = (value) => {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds < 0 || seconds > safeMax) {
      return null;
    }
    return Math.floor(seconds);
  };

  const chapters = (Array.isArray(analysis?.chapters) ? analysis.chapters : [])
    .slice(0, 100)
    .map((chapter) => {
      const seconds = safeSeconds(chapter?.timestampSeconds);
      const title = safeString(chapter?.title, 300);
      if (seconds === null || !title) return null;
      return {
        title,
        summary: safeString(chapter?.summary, 1500),
        timestampSeconds: seconds,
        timestamp: formatTimestamp(seconds),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  const keyQuotes = (
    Array.isArray(analysis?.keyQuotes) ? analysis.keyQuotes : []
  )
    .slice(0, 50)
    .map((quote) => {
      const seconds = safeSeconds(quote?.timestampSeconds);
      const text = safeString(quote?.quote, 3000);
      if (seconds === null || !text) return null;
      return {
        quote: text,
        timestampSeconds: seconds,
        timestamp: formatTimestamp(seconds),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.timestampSeconds - b.timestampSeconds);

  const keyMoments = (
    Array.isArray(analysis?.keyMoments) ? analysis.keyMoments : []
  )
    .map(safeSeconds)
    .filter((seconds) => seconds !== null)
    .slice(0, 100);

  return { chapters, keyQuotes, keyMoments };
}

// ============================================================
// VIDEO INFO EXTRACTION
// ============================================================

/**
 * Gets video info (title, channel, description) from the active bilibili tab.
 * We do this by asking the content script to read the page.
 */
async function handleGetVideoInfo(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, {
      action: "getVideoInfo",
    });
    return response;
  } catch (error) {
    return { title: "", channelName: "", description: "" };
  }
}

// ============================================================
// EXPLAIN SELECTION
// ============================================================

/**
 * Explains selected text using DeepSeek.
 * Provides context, definitions, and clarification for complex terms.
 *
 * @param {string} selectedText - The text the user selected
 * @param {string} transcriptContext - Surrounding transcript for context
 * @param {string} videoTitle - Video title for additional context
 * @returns {Object} - { success, explanation } or { success: false, error }
 */
// ============================================================
// NOTE MANAGEMENT
// ============================================================

/**
 * Saves a note at a timestamp. Exact selected text is stored directly.
 * Other note requests find the relevant transcript line and clean it up.
 */
async function handleSaveNote(
  videoId,
  timestamp,
  videoTitle,
  channelName,
  selectedText,
) {
  try {
    const canonicalVideoUrl = BILI_PLATFORM.canonicalBilibiliUrl(videoId);
    const safeTimestamp = Math.max(0, Math.floor(Number(timestamp) || 0));
    const exactSelectedText =
      typeof selectedText === "string"
        ? selectedText.replace(/\s+/g, " ").trim().slice(0, 3000)
        : "";

    // A selected transcript note is already the exact text the user wants.
    // Save it directly without a transcript fetch or an AI cleanup request.
    if (exactSelectedText) {
      const minutes = Math.floor(safeTimestamp / 60);
      const seconds = safeTimestamp % 60;
      const note = {
        id: `note_${Date.now()}`,
        videoId,
        videoTitle:
          typeof videoTitle === "string"
            ? videoTitle.slice(0, 500)
            : "Untitled Video",
        channelName:
          typeof channelName === "string" ? channelName.slice(0, 300) : "",
        timestamp: `${minutes}:${String(seconds).padStart(2, "0")}`,
        timestampSeconds: safeTimestamp,
        timestampedUrl: `${canonicalVideoUrl}?t=${safeTimestamp}`,
        text: exactSelectedText,
        rawText: exactSelectedText,
        createdAt: Date.now(),
      };

      await saveNoteToStorage(note);
      chrome.runtime.sendMessage({ action: "noteSaved", note }).catch(() => {});
      return { success: true, note };
    }

    // First, try to get the transcript from the digest cache. The side panel
    // saves digests to chrome.storage.LOCAL — this used to look in
    // storage.session (the wrong store), so it missed every time and
    // refetched the transcript from bilibili on every saved note.
    let transcript = null;
    try {
      const cached = await chrome.storage.local.get(`digest_${videoId}`);
      if (cached[`digest_${videoId}`]?.transcript) {
        transcript = cached[`digest_${videoId}`].transcript;
        debugLog("[Bilibili Digest] Using cached transcript for note");
      }
    } catch (e) {
      debugLog("[Bilibili Digest] No cached transcript, fetching...");
    }

    // If no cached transcript, fetch it
    if (!transcript) {
      const transcriptResult = await handleFetchTranscript(videoId);
      if (!transcriptResult.success) {
        return { success: false, error: "Could not fetch transcript" };
      }
      transcript = transcriptResult.transcript;
    }

    // Find the transcript line at the current timestamp
    // Look for the line that contains this timestamp (or the closest one before)
    let matchedLine = null;
    let matchedIndex = 0;
    let contextLines = [];
    let beforeLine = null; // a few sentences before
    let afterLine = null; // a few sentences after

    for (let i = 0; i < transcript.length; i++) {
      const line = transcript[i];
      if (
        line.start <= safeTimestamp &&
        (!transcript[i + 1] || transcript[i + 1].start > safeTimestamp)
      ) {
        matchedLine = line;
        matchedIndex = i;

        // Build a buffer of 2 lines before and 4 lines after the target.
        // This gives the model enough text to find a natural sentence boundary
        // and complete a thought that spans multiple short caption chunks.
        const beforeLines = [];
        for (let j = 1; j <= 2 && i - j >= 0; j++) {
          beforeLines.unshift(transcript[i - j].text);
        }
        if (beforeLines.length > 0) {
          beforeLine = beforeLines.join(" ");
        }

        const afterLines = [];
        for (let j = 1; j <= 4 && i + j < transcript.length; j++) {
          afterLines.push(transcript[i + j].text);
        }
        if (afterLines.length > 0) {
          afterLine = afterLines.join(" ");
        }

        // Get broader context (8 lines before and 12 lines after) for understanding
        const startIdx = Math.max(0, i - 8);
        const endIdx = Math.min(transcript.length - 1, i + 12);
        for (let j = startIdx; j <= endIdx; j++) {
          contextLines.push(transcript[j].text);
        }
        break;
      }
    }

    if (!matchedLine) {
      // Fallback: use the last line if timestamp is beyond transcript
      matchedLine = transcript[transcript.length - 1];
      matchedIndex = transcript.length - 1;

      // Get buffer sentence (only before, since we're at the end)
      const beforeLines = [];
      for (let j = 1; j <= 2 && matchedIndex - j >= 0; j++) {
        beforeLines.unshift(transcript[matchedIndex - j].text);
      }
      if (beforeLines.length > 0) {
        beforeLine = beforeLines.join(" ");
      }

      const startIdx = Math.max(0, matchedIndex - 8);
      for (let j = startIdx; j <= matchedIndex; j++) {
        contextLines.push(transcript[j].text);
      }
    }

    // Clean up the text with DeepSeek.
    const cleanedText = await cleanupNoteText(
      matchedLine.text,
      beforeLine,
      afterLine,
      contextLines.join(" "),
      videoTitle,
    );

    // Format timestamp as MM:SS
    const minutes = Math.floor(safeTimestamp / 60);
    const seconds = safeTimestamp % 60;
    const formattedTimestamp = `${minutes}:${String(seconds).padStart(2, "0")}`;

    // Create timestamped URL
    const timestampedUrl = `${canonicalVideoUrl}?t=${safeTimestamp}`;

    // Create the note object
    const note = {
      id: `note_${Date.now()}`,
      videoId: videoId,
      videoTitle:
        typeof videoTitle === "string"
          ? videoTitle.slice(0, 500)
          : "Untitled Video",
      channelName:
        typeof channelName === "string" ? channelName.slice(0, 300) : "",
      timestamp: formattedTimestamp,
      timestampSeconds: safeTimestamp,
      timestampedUrl: timestampedUrl,
      text: cleanedText,
      rawText: matchedLine.text,
      createdAt: Date.now(),
    };

    // Save to storage
    await saveNoteToStorage(note);

    // Notify side panel to refresh notes list
    chrome.runtime.sendMessage({ action: "noteSaved", note }).catch(() => {});

    return { success: true, note };
  } catch (error) {
    console.error("[Bilibili Digest] Save note error:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Cleans up transcript lines using DeepSeek.
 * Takes the target line plus buffer sentences (1 before, 1 after).
 * Uses JSON output to prevent any preambles from appearing.
 */
async function cleanupNoteText(
  targetText,
  beforeText,
  afterText,
  fullContext,
  videoTitle,
) {
  const settings = await getSettings();
  if (!settings.aiApiKey) {
    return [beforeText, targetText, afterText].filter(Boolean).join(" ");
  }

  try {
    debugLog("[Bilibili Digest] Requesting note cleanup");
    const variables = {
      videoTitle: videoTitle || "Unknown",
      fullContext,
      beforeText: beforeText || "(none)",
      targetText,
      afterText: afterText || "(none)",
    };
    const systemPrompt = await loadPromptSection(
      "note-cleanup.md",
      "System prompt",
      variables,
    );
    const userPrompt = await loadPromptSection(
      "note-cleanup.md",
      "User prompt",
      variables,
    );
    const { text: resultText } = await requestAiCompletion({
      maxTokens: 512,
      responseFormat: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    let result = resultText.trim() || targetText;

    // Parse the JSON response (tolerating trailing commas / fences).
    try {
      const parsed = parseLooseJson(result);
      if (typeof parsed.quote === "string" && parsed.quote.trim()) {
        return parsed.quote.trim().slice(0, 3000);
      }
    } catch (parseError) {
      console.warn(
        "[Bilibili Digest] JSON parse failed for note, stripping preambles:",
        parseError,
      );
      result = result.replace(
        /^(Here'?s?( the)?( cleaned)?( version)?:?\s*)/i,
        "",
      );
      result = result.replace(
        /^(The cleaned (quote|text|version)( is)?:?\s*)/i,
        "",
      );
      result = result.replace(/^(I will.*?:?\s*)/i, "");
      result = result.replace(/^(Cleaned:?\s*)/i, "");
      result = result.replace(/^["']|["']$/g, "");
    }

    return result.slice(0, 3000);
  } catch (e) {
    console.error("[Bilibili Digest] Cleanup error:", e);
  }

  // Return combined raw text if cleanup fails
  return [beforeText, targetText, afterText].filter(Boolean).join(" ");
}

/**
 * Saves a note to chrome.storage.local
 */
async function saveNoteToStorage(note) {
  const result = await chrome.storage.local.get("ytd_notes");
  const notes = result.ytd_notes || [];
  notes.unshift(note); // Add to beginning (newest first)

  // Keep only last 100 notes to prevent storage bloat
  if (notes.length > 100) {
    notes.splice(100);
  }

  await chrome.storage.local.set({ ytd_notes: notes });
}

/**
 * Gets notes from storage, optionally filtered by video ID
 */
async function handleGetNotes(videoId) {
  try {
    const result = await chrome.storage.local.get("ytd_notes");
    let notes = result.ytd_notes || [];

    if (videoId) {
      notes = notes.filter((n) => n.videoId === videoId);
    }

    return { success: true, notes };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Deletes a note by ID
 */
async function handleDeleteNote(noteId) {
  try {
    const result = await chrome.storage.local.get("ytd_notes");
    let notes = result.ytd_notes || [];
    notes = notes.filter((n) => n.id !== noteId);
    await chrome.storage.local.set({ ytd_notes: notes });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function handleExplainSelection(
  selectedText,
  transcriptContext,
  videoTitle,
) {
  try {
    const settings = await getSettings();
    if (!settings.aiApiKey) {
      return {
        success: false,
        error: "NO_AI_KEY",
        message: "DeepSeek API key not configured.",
      };
    }

    const variables = {
      videoTitle: videoTitle || "Unknown",
      selectedText,
      transcriptContext: transcriptContext || "None",
    };
    const systemPrompt = await loadPromptSection(
      "explain.md",
      "System prompt",
      variables,
    );
    const userPrompt = await loadPromptSection(
      "explain.md",
      "User prompt",
      variables,
    );

    debugLog("[Bilibili Digest] Requesting selection explanation");
    const { text: explanation } = await requestAiCompletion({
      maxTokens: 1024,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });

    return {
      success: true,
      explanation: explanation.trim(),
    };
  } catch (error) {
    console.error("Explain selection error:", error);
    return {
      success: false,
      error: error.message || "Failed to explain selection",
    };
  }
}

// ============================================================
// TRANSLATION — Translate transcript batches into Simplified Chinese
// ============================================================
// Uses a low temperature for consistent, natural translations.

/**
 * Shared base rules that every translation prompt includes.
 * These ensure translations sound natural rather than machine-translated.
 *
 * @param {string} targetLanguage - Must be 'zh'
 * @returns {Promise<string>} - The base translation rules
 */
async function getTranslationBaseRules(targetLanguage) {
  if (targetLanguage !== "zh") {
    throw new Error(`Unsupported translation target: ${targetLanguage}`);
  }
  const langName = "Simplified Chinese";
  const langSpecific = await loadPromptSection(
    "translation.md",
    "Chinese rules",
  );
  return loadPromptSection("translation.md", "Shared base rules", {
    langName,
    langSpecific,
  });
}

function validateTranscriptBatchRequest(content) {
  const segments = content?.segments;
  if (!Array.isArray(segments) || segments.length < 1 || segments.length > 4) {
    throw new Error("Transcript translation requires 1 to 4 segments");
  }

  const seenIds = new Set();
  let totalCharacters = 0;
  const normalized = segments.map((segment) => {
    const id = typeof segment?.id === "string" ? segment.id.trim() : "";
    const text = typeof segment?.text === "string" ? segment.text.trim() : "";
    if (!/^[A-Za-z0-9:_-]{1,128}$/.test(id) || seenIds.has(id)) {
      throw new Error("Transcript translation segment IDs must be unique and stable");
    }
    if (!text || text.length > 4000) {
      throw new Error("Transcript translation segment text is invalid or too long");
    }
    seenIds.add(id);
    totalCharacters += text.length;
    return { id, text };
  });
  if (totalCharacters > 12000) {
    throw new Error("Transcript translation batch is too large");
  }
  return normalized;
}

function looksLikeChineseTranslation(text, sourceText) {
  const latinLetters = (sourceText.match(/[A-Za-z]/g) || []).length;
  if (latinLetters < 20) return true;
  return /[\u3400-\u9fff]/.test(text);
}

/**
 * Aligns untrusted model output by exact stable ID. Missing, duplicated,
 * unknown, empty, or clearly non-Chinese values become explicit row errors.
 */
function normalizeTranslatedSegmentBatch(parsed, sourceSegments) {
  const candidates = Array.isArray(parsed?.segments) ? parsed.segments : [];
  const sourceById = new Map(sourceSegments.map((segment) => [segment.id, segment]));
  const translatedById = new Map();

  candidates.forEach((candidate) => {
    if (
      typeof candidate?.id !== "string" ||
      typeof candidate?.text !== "string" ||
      !sourceById.has(candidate.id) ||
      translatedById.has(candidate.id)
    ) {
      return;
    }
    const text = candidate.text.trim();
    const source = sourceById.get(candidate.id);
    if (text && looksLikeChineseTranslation(text, source.text)) {
      translatedById.set(candidate.id, text);
    }
  });

  return {
    segments: sourceSegments.map((source) => ({
      id: source.id,
      text: translatedById.get(source.id) || "",
      error: translatedById.has(source.id)
        ? ""
        : "Missing or invalid Chinese translation",
    })),
  };
}

/**
 * Translates content using DeepSeek.
 * @param {Object} content - JSON object containing semantic transcript segments
 * @param {string} contentType - 'transcriptBatch' or 'interfaceBatch'
 * @param {string} targetLanguage - 'zh' for Simplified Chinese
 * @param {string} videoTitle - The video title (for context)
 * @returns {Object} - { success, translatedContent } or { success: false, error }
 */
async function handleTranslateContent(
  content,
  contentType,
  targetLanguage,
  videoTitle,
) {
  try {
    if (targetLanguage !== "zh") {
      return {
        success: false,
        error: `Unsupported translation target: ${String(targetLanguage)}`,
      };
    }
    if (!["transcriptBatch", "interfaceBatch"].includes(contentType)) {
      return {
        success: false,
        error: `Unsupported translation content type: ${String(contentType)}`,
      };
    }

    const settings = await getSettings();
    if (!settings.aiApiKey) {
      return { success: false, error: "DeepSeek API key not configured" };
    }

    const sourceSegments = validateTranscriptBatchRequest(content);
    const langName = "Simplified Chinese";
    const baseRules = await getTranslationBaseRules(targetLanguage);
    const promptSection =
      contentType === "transcriptBatch"
        ? "Transcript batch translation"
        : "Interface content translation";
    const systemPrompt = await loadPromptSection(
      "translation.md",
      promptSection,
      {
        langName,
        videoTitle: videoTitle || "Unknown",
        baseRules,
      },
    );
    const userContent = JSON.stringify({ segments: sourceSegments });
    const translationOptions = {
      temperature: 0.2,
      maxTokens: 1536,
      responseFormat: { type: "json_object" },
    };
    let result = await callAiTranslation(
      systemPrompt,
      userContent,
      translationOptions,
    );

    // DeepSeek JSON mode can rarely return an empty content string. The prompt
    // already requires JSON, so retry once without response_format.
    if (!result.success && result.code === "EMPTY_AI_RESPONSE") {
      result = await callAiTranslation(systemPrompt, userContent, {
        temperature: translationOptions.temperature,
        maxTokens: translationOptions.maxTokens,
      });
    }
    if (!result.success) return result;

    const parsed = parseLooseJson(result.text);
    const aligned = normalizeTranslatedSegmentBatch(parsed, sourceSegments);
    if (!aligned.segments.some((segment) => segment.text)) {
      return {
        success: false,
        error: "Translation returned no valid Chinese segments",
      };
    }
    return { success: true, translatedContent: aligned };
  } catch (error) {
    console.error("[Bilibili Digest] Translation error:", error);
    return { success: false, error: error.message || "Translation failed" };
  }
}

/**
 * Makes a single DeepSeek call for translation.
 * Uses temperature 0.3 for consistent, predictable translations.
 *
 * @param {string} systemPrompt - The system-level instructions
 * @param {string} userContent - The user message (content to translate)
 * @returns {Object} - { success, text } or { success: false, error }
 */
async function callAiTranslation(
  systemPrompt,
  userContent,
  { temperature = 0.3, maxTokens = 8192, responseFormat } = {},
) {
  try {
    const { text } = await requestAiCompletion({
      temperature,
      maxTokens,
      responseFormat,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });

    return { success: true, text };
  } catch (error) {
    if (error.status === 429) {
      return {
        success: false,
        error: "Rate limited — try again in a moment",
        code: "RATE_LIMITED",
      };
    }
    return { success: false, error: error.message, code: error.code };
  }
}

// Pure validators are exposed for the repository's Node tests only.
globalThis.__YTD_TRANSLATION_TESTING__ = {
  requestAiCompletion,
  callAiTranslation,
  validateTranscriptBatchRequest,
  normalizeTranslatedSegmentBatch,
  handleSaveNote,
  handleTranslateContent,
  closePanelForTab,
  updatePanelForTab,
  handleFetchTranscript,
  readPlayInfoFromTab,
  fetchBilibiliView,
  pickSubtitleTrack,
  normalizeBilibiliSubtitle,
  fetchBilibiliPlayUrl,
  downloadBilibiliAudio,
  installMediaRefererRule,
  postTranscriptionRequest,
  transcribeAudioBuffer,
  handleProbeAudio,
  handleTranscribe,
};
