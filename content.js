/**
 * CONTENT SCRIPT (bilibili)
 *
 * This script runs on bilibili video pages (www.bilibili.com/video/BVxxx).
 * It can see and modify the page DOM.
 *
 * It handles:
 * 1. Extracting video info (title, up name, description) from the page
 * 2. Adding a "Digest" button to bilibili's action toolbar
 * 3. Adding a "Note" button overlay on top of the player
 * 4. Timestamp seeking (side panel -> player)
 *
 * Bilibili is an SPA too: clicking a related video swaps content without a
 * full reload, so we reconcile buttons on history changes and via a
 * MutationObserver on the body.
 */

const DEBUG = false;
const debugLog = (...args) => {
  if (DEBUG) console.log(...args);
};

// ============================================================
// GLOBAL STATE
// ============================================================

let noteButton = null;
let noteButtonTimer = null;
let noteKeyboardListenerAdded = false;
let noteButtonRetryTimer = null;
let digestButton = null;
let digestButtonObserver = null;
let digestButtonReconcileTimer = null;
let digestButtonResizeListenerAdded = false;
let lastUrl = null;

// ============================================================
// INITIALIZATION
// ============================================================

function currentBvid() {
  return BILI_PLATFORM.extractBvid(window.location.href);
}

function isVideoPage() {
  return BILI_PLATFORM.isBilibiliVideoPage(window.location.href);
}

function init() {
  if (!noteKeyboardListenerAdded) {
    document.addEventListener("keydown", handleNoteKeyboardShortcut);
    noteKeyboardListenerAdded = true;
  }

  lastUrl = window.location.href;
  injectDigestButton();
  tryInjectNoteButton();
  setupButtonObserver();
  setupDigestButtonResizeListener();
  setupNavigationWatcher();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// ============================================================
// MESSAGE HANDLING
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  debugLog("[Bilibili Digest Content] Received message:", message.action);

  if (message.action === "getVideoInfo") {
    sendResponse(extractVideoInfo());
    return false; // Synchronous response
  }

  if (message.action === "highlightMoments") {
    // Timeline markers disabled — chapters live only in the side panel.
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "getCurrentTime") {
    const video = findVideoElement();
    sendResponse({
      currentTime: video ? Math.floor(video.currentTime) : 0,
      paused: video ? video.paused : true,
    });
    return false;
  }

  if (message.action === "seekTo") {
    seekToTimestamp(message.seconds);
    sendResponse({ success: true });
    return false;
  }

  if (message.action === "showNoteSavedFeedback") {
    showNoteSavedToast(message.note);
    sendResponse({ success: true });
    return false;
  }

  sendResponse({ success: false, error: "Unknown action" });
  return false;
});

// ============================================================
// VIDEO / PLAYER ELEMENT RESOLUTION
// ============================================================

/**
 * Resolve the player <video> element. Bilibili's player DOM has changed a few
 * times; try several known selectors and fall back to any <video> inside the
 * player container.
 */
function findVideoElement() {
  return (
    document.querySelector(
      ".bpx-player-container video, " +
        ".bpx-player-video video, " +
        "video.bpx-player-video, " +
        "video.html5-video, " +
        "#bilibili-player video, " +
        "video",
    ) || null
  );
}

// ============================================================
// DIGEST BUTTON INJECTION
// ============================================================

function isVisible(element) {
  if (!element || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

/**
 * Find the visible action toolbar to host the Digest button. Bilibili renders
 * the video action row (like/coin/favorite/share) in `.video-toolbar`; we pick
 * the first visible one and return its `.toolbar-right` inner group when
 * available, else the toolbar itself.
 */
function findDigestButtonHost() {
  const toolbars = Array.from(document.querySelectorAll(".video-toolbar"));
  for (const toolbar of toolbars) {
    if (!isVisible(toolbar)) continue;
    const right = toolbar.querySelector(".toolbar-right, .ops");
    if (right && isVisible(right)) return right;
    return toolbar;
  }

  // Fallbacks for older / alternate layouts.
  return (
    document.querySelector(
      ".video-toolbar-right, " +
        ".ops, " +
        ".video-info .toolbar-right",
    ) || null
  );
}

function createDigestButton() {
  const button = document.createElement("button");
  button.id = "bili-digest-button";
  button.type = "button";
  button.setAttribute("aria-label", "Open Bilibili Digest");
  button.innerHTML = `<span>Digest</span>`;

  button.style.cssText = `
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 0 16px;
    height: 30px;
    border: none;
    border-radius: 15px;
    background: #00a1d6;
    color: white;
    font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    margin-left: 8px;
    transition: background 0.2s, transform 0.1s;
    flex: 0 0 auto;
    align-self: center;
    white-space: nowrap;
  `;

  button.addEventListener("mouseenter", () => {
    button.style.background = "#0089b8";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#00a1d6";
  });

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await chrome.runtime.sendMessage({ action: "openSidePanel" });
    } catch (err) {
      console.error("[Bilibili Digest] Failed to open side panel:", err);
    }
  });

  digestButton = button;
  return button;
}

function injectDigestButton() {
  const existingButtons = Array.from(
    document.querySelectorAll("#bili-digest-button"),
  );

  if (!isVideoPage()) {
    existingButtons.forEach((button) => button.remove());
    digestButton = null;
    return false;
  }

  const host = findDigestButtonHost();
  if (!host) {
    debugLog("[Bilibili Digest Content] Visible toolbar not found yet");
    return false;
  }

  let button = existingButtons.find((b) => b === digestButton);
  if (!button) {
    existingButtons.forEach((b) => b.remove());
    button = createDigestButton();
  }

  existingButtons.forEach((b) => {
    if (b !== button) b.remove();
  });

  if (button.parentElement !== host) {
    host.appendChild(button);
  }

  debugLog("[Bilibili Digest Content] Digest button reconciled");
  return true;
}

function scheduleDigestButtonReconciliation(delay = 80) {
  if (digestButtonReconcileTimer) {
    clearTimeout(digestButtonReconcileTimer);
  }
  digestButtonReconcileTimer = setTimeout(() => {
    digestButtonReconcileTimer = null;
    injectDigestButton();
  }, delay);
}

function setupDigestButtonResizeListener() {
  if (digestButtonResizeListenerAdded) return;
  window.addEventListener("resize", () => {
    scheduleDigestButtonReconciliation(120);
  });
  digestButtonResizeListenerAdded = true;
}

function setupButtonObserver() {
  if (digestButtonObserver) return;
  digestButtonObserver = new MutationObserver(() => {
    if (isVideoPage()) {
      scheduleDigestButtonReconciliation();
      if (!noteButton || !noteButton.isConnected) {
        tryInjectNoteButton();
      }
    }
  });
  digestButtonObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

// ============================================================
// NOTE BUTTON (Overlay on Video Player)
// ============================================================

function tryInjectNoteButton() {
  if (!isVideoPage()) return;

  if (noteButtonRetryTimer) {
    clearInterval(noteButtonRetryTimer);
    noteButtonRetryTimer = null;
  }

  let attempts = 0;
  const maxAttempts = 30;

  function attempt() {
    attempts++;
    const playerContainer = document.querySelector(
      ".bpx-player-container, #bilibili-player",
    );
    if (playerContainer) {
      injectNoteButton(playerContainer);
      if (noteButtonRetryTimer) {
        clearInterval(noteButtonRetryTimer);
        noteButtonRetryTimer = null;
      }
      return;
    }
    if (attempts >= maxAttempts) {
      if (noteButtonRetryTimer) {
        clearInterval(noteButtonRetryTimer);
        noteButtonRetryTimer = null;
      }
    }
  }

  attempt();
  if (!noteButton || !noteButton.isConnected) {
    noteButtonRetryTimer = setInterval(attempt, 100);
  }
}

function injectNoteButton(playerContainer) {
  if (!isVideoPage()) return;

  const existingButton = document.getElementById("bili-note-button");
  if (existingButton) {
    if (noteButton === existingButton && existingButton.isConnected) {
      return;
    }
    existingButton.remove();
  }

  if (window.getComputedStyle(playerContainer).position === "static") {
    playerContainer.style.position = "relative";
  }

  const button = document.createElement("button");
  button.id = "bili-note-button";
  button.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="margin-right: 7px;">
      <path d="M12 20h9"></path>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
    </svg>
    <span>Note</span>
  `;

  button.style.cssText = `
    position: absolute;
    top: 16px;
    right: 16px;
    z-index: 9999;
    display: flex;
    align-items: center;
    padding: 9px 16px;
    background: #00a1d6;
    color: white;
    border: none;
    border-radius: 999px;
    font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.2px;
    cursor: pointer;
    transition: opacity 0.18s ease, transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
    opacity: 0;
    pointer-events: none;
    box-shadow: 0 4px 14px rgba(0,0,0,0.3);
  `;

  noteButton = button;

  playerContainer.addEventListener("mouseenter", () => {
    showNoteButton();
    resetNoteButtonTimer();
  });
  playerContainer.addEventListener("mousemove", () => {
    showNoteButton();
    resetNoteButtonTimer();
  });
  playerContainer.addEventListener("mouseleave", () => {
    clearTimeout(noteButtonTimer);
    noteButtonTimer = null;
    hideNoteButton();
  });

  button.addEventListener("mouseenter", () => {
    button.style.background = "#0089b8";
  });
  button.addEventListener("mouseleave", () => {
    button.style.background = "#00a1d6";
  });

  button.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await saveCurrentNote();
  });

  playerContainer.appendChild(button);
  debugLog("[Bilibili Digest Content] Note button injected");
}

function showNoteButton() {
  if (!noteButton) return;
  noteButton.style.opacity = "1";
  noteButton.style.pointerEvents = "auto";
}

function hideNoteButton() {
  if (!noteButton) return;
  noteButton.style.opacity = "0";
  noteButton.style.pointerEvents = "none";
}

function resetNoteButtonTimer() {
  clearTimeout(noteButtonTimer);
  noteButtonTimer = setTimeout(() => {
    hideNoteButton();
  }, 2000);
}

function handleNoteKeyboardShortcut(e) {
  if (!isVideoPage()) return;
  if (e.key !== "n" && e.key !== "N") return;

  const active = document.activeElement;
  if (
    active &&
    (active.tagName === "INPUT" ||
      active.tagName === "TEXTAREA" ||
      active.isContentEditable)
  ) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();
  showNoteButton();
  resetNoteButtonTimer();
  saveCurrentNote();
}

async function saveCurrentNote() {
  const video = findVideoElement();
  if (!video) {
    console.error("[Bilibili Digest] No video element found");
    return;
  }

  const currentTime = Math.max(0, Math.floor(video.currentTime) - 3);
  const videoInfo = extractVideoInfo();
  const pageId = BILI_PLATFORM.extractPageId(window.location.href);

  const btn = noteButton;
  const originalContent = btn ? btn.innerHTML : "";

  if (btn) {
    btn.innerHTML = '<span style="letter-spacing: 0.2px;">SAVING...</span>';
    btn.style.pointerEvents = "none";
  }

  try {
    const result = await chrome.runtime.sendMessage({
      action: "saveNote",
      videoId: pageId,
      timestamp: currentTime,
      videoTitle: videoInfo.title,
      channelName: videoInfo.channelName,
    });

    if (result.success) {
      if (btn) {
        btn.innerHTML = '<span style="letter-spacing: 0.2px;">SAVED</span>';
        btn.style.background = "#7c8b6f";
      }
      showNoteSavedToast(result.note);
    } else {
      if (btn) {
        btn.innerHTML = '<span style="letter-spacing: 0.2px;">ERROR</span>';
      }
      console.error("[Bilibili Digest] Save note error:", result.error);
    }
  } catch (err) {
    if (btn) {
      btn.innerHTML = '<span style="letter-spacing: 0.2px;">ERROR</span>';
    }
    console.error("[Bilibili Digest] Save note exception:", err);
  }

  setTimeout(() => {
    if (btn) {
      btn.innerHTML = originalContent;
      btn.style.background = "#00a1d6";
      btn.style.pointerEvents = "auto";
    }
  }, 2000);
}

function showNoteSavedToast(note) {
  const existing = document.getElementById("bili-note-toast");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.id = "bili-note-toast";
  toast.innerHTML = `
    <div style="font-weight: 700; margin-bottom: 6px; color: #00a1d6;">Note saved</div>
    <div style="font-size: 12px; color: #6b6258; margin-bottom: 8px;">${escapeHtml(note.timestamp)} — ${escapeHtml(note.videoTitle)}</div>
    <div style="font-size: 13px; line-height: 1.55; color: #2e2a24;">"${escapeHtml(note.text)}"</div>
    <div style="margin-top: 10px; font-size: 11px;">
      <a href="${escapeHtml(note.timestampedUrl)}" style="color: #00a1d6; font-weight: 600; text-decoration: none;">Copy link</a>
    </div>
  `;

  toast.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    background: #ffffff;
    border: 1px solid #ece5d9;
    border-radius: 14px;
    padding: 16px 20px;
    max-width: 350px;
    box-shadow: 0 12px 32px rgba(50, 42, 32, 0.2);
    font-family: system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
    animation: biliSlideIn 0.3s ease;
  `;

  const style = document.createElement("style");
  style.textContent = `
    @keyframes biliSlideIn {
      from { transform: translateX(100%); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
  `;
  document.head.appendChild(style);

  toast.querySelector("a").addEventListener("click", async (e) => {
    e.preventDefault();
    try {
      await navigator.clipboard.writeText(note.timestampedUrl);
      e.target.textContent = "Copied";
    } catch (err) {
      console.error("Copy failed:", err);
    }
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = "biliSlideIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, 5000);
}

// ============================================================
// VIDEO INFO EXTRACTION
// ============================================================

/**
 * Read title / up name / description from bilibili's DOM, with a fallback to
 * the page's __INITIAL_STATE__ when available via the MAIN world.
 */
function extractVideoInfo() {
  const bvid = currentBvid() || "";

  // Preferred DOM selectors (current bilibili layout).
  const title =
    document.querySelector("h1.video-title")?.textContent?.trim() ||
    document.querySelector(".video-info-title")?.textContent?.trim() ||
    "";

  const channelName =
    document.querySelector(".up-name")?.textContent?.trim() ||
    document.querySelector(".up-info-container .name")?.textContent?.trim() ||
    document.querySelector(".up-detail .up-name")?.textContent?.trim() ||
    "";

  const description =
    document.querySelector(".basic-desc-info")?.textContent?.trim() ||
    document.querySelector(".video-desc-container")?.textContent?.trim() ||
    "";

  const video = findVideoElement();

  return {
    bvid,
    title,
    channelName,
    duration: video ? Math.floor(video.duration) || 0 : 0,
    description,
  };
}

// ============================================================
// SEEK TO TIMESTAMP
// ============================================================

function seekToTimestamp(seconds) {
  const video = findVideoElement();
  if (!video) {
    console.error("[Bilibili Digest Content] No video element found for seek");
    return;
  }
  debugLog("[Bilibili Digest Content] Seeking to:", seconds);
  video.currentTime = seconds;
  if (video.paused) {
    video.play().catch(() => {});
  }
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text || "";
  return div.innerHTML;
}

// ============================================================
// PAGE NAVIGATION DETECTION
// ============================================================

/**
 * Bilibili is an SPA. We detect video changes by watching the full URL
 * (including the ?p=N playlist page) via history events + a light polling
 * fallback, then reconcile the buttons and notify the side panel.
 */
function onNavigation() {
  const url = window.location.href;
  const pageId = BILI_PLATFORM.extractPageId(url);

  if (url === lastUrl) return; // same URL, nothing to do
  lastUrl = url;

  // Clean up stale buttons.
  document.querySelectorAll("#bili-digest-button").forEach((b) => b.remove());
  digestButton = null;
  if (digestButtonReconcileTimer) {
    clearTimeout(digestButtonReconcileTimer);
    digestButtonReconcileTimer = null;
  }

  const existingNoteButton = document.getElementById("bili-note-button");
  if (existingNoteButton) existingNoteButton.remove();
  noteButton = null;
  clearTimeout(noteButtonTimer);
  noteButtonTimer = null;
  if (noteButtonRetryTimer) {
    clearInterval(noteButtonRetryTimer);
    noteButtonRetryTimer = null;
  }

  const existingToast = document.getElementById("bili-note-toast");
  if (existingToast) existingToast.remove();

  // Notify the side panel that the page (possibly the same bvid, different
  // playlist part) has changed, so it fetches the correct transcript.
  if (pageId) {
    try {
      chrome.runtime.sendMessage({
        action: "videoChanged",
        pageId,
        url,
      });
    } catch (err) {
      debugLog("[Bilibili Digest Content] videoChanged send failed:", err);
    }
  }

  setTimeout(() => {
    scheduleDigestButtonReconciliation(0);
    tryInjectNoteButton();
  }, 500);
}

function setupNavigationWatcher() {
  // Bilibili pushes history state for video navigation.
  window.addEventListener("popstate", onNavigation);
  // Catch pushState-driven changes that don't fire popstate.
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    const result = originalPushState.apply(this, args);
    setTimeout(onNavigation, 0);
    return result;
  };
  // Light polling fallback in case neither fired.
  setInterval(() => {
    if (window.location.href !== lastUrl) onNavigation();
  }, 1000);
}
