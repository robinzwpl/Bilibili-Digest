/**
 * @file subtitle-fetch.test.js
 *
 * Tests the bilibili subtitle pipeline, in particular the playlist-part fix:
 * the cid must come from the live page when available, and the view endpoint
 * fallback must carry the ?p page number.
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

const NAV_JSON = {
  code: 0,
  data: {
    wbi_img: {
      img_url:
        "https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png",
      sub_url:
        "https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png",
    },
  },
};

const SUBTITLE_BODY_JSON = {
  body: [
    { from: 0, to: 2.5, content: "第一句。" },
    { from: 2.5, to: 5, content: "第二句。" },
  ],
};

function makeSubtitleList(subtitles) {
  return { code: 0, data: { subtitle: { subtitles: subtitles } } };
}

function loadBackground({
  liveInfo = null,
  subtitles = [
    {
      lan: "zh-CN",
      subtitle_url: "//aisubtitle.hdslb.com/bfs/subtitle/one.json",
    },
  ],
  cookies = [{ name: "SESSDATA", value: "cookie-value" }],
} = {}) {
  const listeners = { addListener() {} };
  const calls = [];
  const localStorage = {
    ytd_settings: {
      provider: "deepseek",
      aiApiKey: "test-key",
      aiBaseUrl: "https://api.deepseek.com",
      aiModel: "deepseek-v4-flash",
    },
  };

  const fetchImpl = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/x/web-interface/nav")) {
      return { ok: true, status: 200, json: async () => NAV_JSON };
    }
    if (target.includes("/x/web-interface/view")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          code: 0,
          data: { aid: 111, cid: 222, title: "T", owner: { name: "U" } },
        }),
      };
    }
    if (target.includes("/x/player/wbi/v2")) {
      return {
        ok: true,
        status: 200,
        json: async () => makeSubtitleList(subtitles),
      };
    }
    // Subtitle CDN JSON.
    return { ok: true, status: 200, json: async () => SUBTITLE_BODY_JSON };
  };

  const sandbox = {
    console,
    URL,
    TextDecoder,
    TextEncoder,
    AbortController,
    fetch: fetchImpl,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    importScripts() {},
    chrome: {
      scripting: {
        executeScript: async (opts) => {
          calls.push("executeScript:" + JSON.stringify(opts.target));
          return [{ result: liveInfo }];
        },
      },
      cookies: { getAll: async () => cookies },
      storage: {
        local: {
          setAccessLevel: () => Promise.resolve(),
          get: async (key) => {
            if (key === null) return { ...localStorage };
            return { [key]: localStorage[key] };
          },
          set: async (values) => Object.assign(localStorage, values),
          remove: async () => {},
        },
      },
      action: { onClicked: listeners },
      sidePanel: {
        setPanelBehavior() {},
        setOptions: () => Promise.resolve(),
      },
      runtime: {
        onInstalled: listeners,
        onMessage: listeners,
        openOptionsPage() {},
        getURL: (resource) => "chrome-extension://test/" + resource,
        sendMessage: () => Promise.resolve({}),
      },
      tabs: { onUpdated: listeners, onActivated: listeners },
    },
  };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(read("settings.js"), sandbox);
  vm.runInNewContext(read("platform.js"), sandbox);
  vm.runInNewContext(read("wbi.js"), sandbox);
  vm.runInNewContext(read("background.js"), sandbox);

  return { helpers: sandbox.__YTD_TRANSLATION_TESTING__, calls };
}

test("a live page cid wins over the view endpoint", async () => {
  const { helpers, calls } = loadBackground({
    liveInfo: { aid: 999, cid: 888, page: 3, bvid: "BV1Fg411D7Jy" },
  });

  const result = await helpers.handleFetchTranscript("BV1Fg411D7Jy_p3", 42);

  assert.equal(result.success, true);
  assert.equal(result.cid, 888);
  assert.equal(result.aid, 999);

  const viewCalls = calls.filter((u) => u.includes("/x/web-interface/view"));
  assert.equal(
    viewCalls.length,
    0,
    "the view endpoint must be skipped when a live cid is available",
  );

  const playerCalls = calls.filter((u) => u.includes("/x/player/wbi/v2"));
  assert.equal(playerCalls.length, 1);
  assert.match(playerCalls[0], /aid=999/);
  assert.match(playerCalls[0], /cid=888/);
});

test("without a live cid the view endpoint receives the playlist page", async () => {
  const { helpers, calls } = loadBackground({ liveInfo: null });

  const result = await helpers.handleFetchTranscript("BV1Fg411D7Jy_p2", 42);

  assert.equal(result.success, true);
  const viewCalls = calls.filter((u) => u.includes("/x/web-interface/view"));
  assert.equal(viewCalls.length, 1);
  assert.match(viewCalls[0], /bvid=BV1Fg411D7Jy/);
  assert.match(viewCalls[0], /[?&]p=2/);
});

test("page 1 view requests omit the p parameter", async () => {
  const { helpers, calls } = loadBackground({ liveInfo: null });

  await helpers.handleFetchTranscript("BV1Fg411D7Jy", 42);

  const viewCalls = calls.filter((u) => u.includes("/x/web-interface/view"));
  assert.equal(viewCalls.length, 1);
  assert.doesNotMatch(viewCalls[0], /[?&]p=/);
});

test("track selection prefers Chinese CC, then AI Chinese, then foreign", () => {
  const { helpers } = loadBackground();

  const foreign = {
    lan: "en",
    subtitle_url: "//aisubtitle.hdslb.com/bfs/subtitle/en.json",
  };
  const aiZh = {
    lan: "ai-zh",
    subtitle_url: "//aisubtitle.hdslb.com/bfs/subtitle/ai.json",
  };
  const ccZh = {
    lan: "zh-CN",
    subtitle_url: "//aisubtitle.hdslb.com/bfs/subtitle/zh.json",
  };

  const pickCc = helpers.pickSubtitleTrack([foreign, aiZh, ccZh]);
  assert.equal(pickCc.track.lan, "zh-CN");
  assert.equal(pickCc.needsTranslation, false);
  assert.equal(pickCc.isAi, false);

  const pickAi = helpers.pickSubtitleTrack([foreign, aiZh]);
  assert.equal(pickAi.track.lan, "ai-zh");
  assert.equal(pickAi.needsTranslation, false);
  assert.equal(pickAi.isAi, true);

  const pickForeign = helpers.pickSubtitleTrack([foreign]);
  assert.equal(pickForeign.track.lan, "en");
  assert.equal(pickForeign.needsTranslation, true);

  assert.equal(helpers.pickSubtitleTrack([]), null);
});

test("subtitle bodies normalize into seekable transcript entries", () => {
  const { helpers } = loadBackground();

  const normalized = helpers.normalizeBilibiliSubtitle(
    SUBTITLE_BODY_JSON,
    "zh-CN",
    false,
  );

  assert.equal(normalized.transcript.length, 2);
  // Compare via JSON: objects created inside the vm context have a different
  // prototype, which trips deepStrictEqual.
  const shape = normalized.transcript.map((entry) => ({
    text: entry.text,
    start: entry.start,
    duration: entry.duration,
  }));
  assert.equal(
    JSON.stringify(shape),
    JSON.stringify([
      { text: "第一句。", start: 0, duration: 2 },
      { text: "第二句。", start: 2, duration: 3 },
    ]),
  );
  assert.equal(normalized.transcriptText, "第一句。 第二句。");
  assert.match(normalized.transcriptTextTimestamped, /\[0:00\] 第一句。/);
});

test("no subtitle track reports NO_SUBTITLE when logged in", async () => {
  const { helpers } = loadBackground({ liveInfo: null, subtitles: [] });

  const result = await helpers.handleFetchTranscript("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "NO_SUBTITLE");
});

test("no subtitle track reports NOT_LOGGED_IN without cookies", async () => {
  const { helpers } = loadBackground({
    liveInfo: null,
    subtitles: [],
    cookies: [],
  });

  const result = await helpers.handleFetchTranscript("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "NOT_LOGGED_IN");
});
