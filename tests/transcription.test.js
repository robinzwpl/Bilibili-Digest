/**
 * @file transcription.test.js
 *
 * The hosted speech-to-text fallback, end to end inside the service worker:
 * resolve the audio stream, download it past the CDN's Referer check, upload it
 * to an OpenAI-compatible endpoint, and shape the reply into the transcript
 * contract the side panel already understands.
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

const BIG_TRACK = {
  id: 30280,
  bandwidth: 141126,
  baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/big.m4s",
};
const SMALL_TRACK = {
  id: 30216,
  bandwidth: 66166,
  baseUrl: "https://upos-sz-mirrorcos.bilivideo.com/small.m4s",
  backupUrl: ["https://upos-sz-mirrorali.bilivideo.com/small-backup.m4s"],
};

function jsonResponse(payload, status = 200) {
  const text = JSON.stringify(payload);
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: { get: () => null },
    text: async () => text,
    json: async () => payload,
  };
}

function textResponse(text, { status = 200, contentType = "text/plain" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === "content-type" ? contentType : null,
    },
    text: async () => text,
    json: async () => JSON.parse(text),
  };
}

function binaryResponse(byteLength, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status: status,
    headers: {
      get: (name) =>
        String(name).toLowerCase() === "content-length"
          ? String(byteLength)
          : null,
    },
    arrayBuffer: async () => new ArrayBuffer(byteLength),
    text: async () => "",
    json: async () => ({}),
  };
}

const DEFAULT_SETTINGS = {
  provider: "deepseek",
  aiApiKey: "test-key",
  aiBaseUrl: "https://api.deepseek.com",
  aiModel: "deepseek-v4-flash",
  asrEnabled: true,
  asrProvider: "siliconflow",
  asrApiKey: "test-key",
  asrBaseUrl: "https://api.siliconflow.cn/v1",
  asrModel: "whisper-large-v3",
  asrMaxBytes: 24 * 1024 * 1024,
};

function loadBackground(options = {}) {
  const calls = [];
  const listeners = { addListener() {} };
  const dnrRules = [];
  const localStorage = {
    ytd_settings: Object.assign({}, DEFAULT_SETTINGS, options.settings || {}),
  };

  const asrHandler = options.asrHandler || (() => jsonResponse({ text: "hi" }));
  const audioHandler =
    options.audioHandler || (() => binaryResponse(1024));

  const fetchImpl = async (url, init) => {
    const target = String(url);
    calls.push(target);

    if (target.includes("/x/web-interface/nav")) {
      return jsonResponse(NAV_JSON);
    }

    if (target.includes("/x/web-interface/view")) {
      return jsonResponse({
        code: 0,
        data: {
          aid: 111,
          cid: 1111,
          title: "T",
          owner: { name: "U" },
          pages: [
            { page: 1, cid: 1111, part: "P1", duration: 600 },
            { page: 2, cid: 2222, part: "P2", duration: 120 },
          ],
        },
      });
    }

    if (target.includes("/x/player/wbi/playurl")) {
      if (options.noAudioTrack) {
        return jsonResponse({ code: 0, data: { dash: { audio: [] } } });
      }
      return jsonResponse({
        code: 0,
        data: {
          dash: {
            duration: 600,
            audio: options.audioTracks || [BIG_TRACK, SMALL_TRACK],
          },
        },
      });
    }

    if (target.includes("bilivideo.com")) {
      return audioHandler(target, init);
    }

    // Everything else is the configured transcription endpoint.
    return asrHandler(target, init);
  };

  const sandbox = {
    console,
    URL,
    TextDecoder,
    TextEncoder,
    AbortController,
    FormData,
    Blob,
    fetch: fetchImpl,
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    importScripts() {},
    chrome: {
      permissions: {
        contains: async () => options.permissionGranted !== false,
        request: async () => options.permissionGranted !== false,
      },
      declarativeNetRequest: {
        updateDynamicRules: async (update) => {
          dnrRules.push(update);
        },
      },
      cookies: { getAll: async () => [{ name: "SESSDATA", value: "x" }] },
      storage: {
        local: {
          setAccessLevel: () => Promise.resolve(),
          get: async (key) => {
            if (key === null) return Object.assign({}, localStorage);
            return { [key]: localStorage[key] };
          },
          set: async (values) => Object.assign(localStorage, values),
          remove: async () => {},
        },
      },
      scripting: { executeScript: async () => [{ result: null }] },
      action: { onClicked: listeners },
      sidePanel: {
        setPanelBehavior() {},
        setOptions: () => Promise.resolve(),
      },
      runtime: {
        onInstalled: listeners,
        onMessage: listeners,
        onStartup: listeners,
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
  vm.runInNewContext(read("asr.js"), sandbox);
  vm.runInNewContext(read("background.js"), sandbox);

  return { helpers: sandbox.__YTD_TRANSLATION_TESTING__, calls, dnrRules };
}

test("a video with no subtitles is transcribed end to end", async () => {
  const { helpers, calls, dnrRules } = loadBackground({
    asrHandler: () =>
      jsonResponse({
        text: "第一句。第二句。",
        segments: [
          { start: 0, end: 2.5, text: "第一句。" },
          { start: 2.5, end: 5, text: "第二句。" },
        ],
      }),
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, true);
  assert.equal(result.source, "asr");
  assert.equal(result.timingEstimated, false);
  assert.equal(result.cid, 1111);
  assert.equal(result.aid, 111);
  assert.equal(result.page, 1);
  assert.equal(result.needsTranslation, false);
  assert.equal(
    JSON.stringify(
      result.transcript.map((entry) => [entry.text, entry.start, entry.duration]),
    ),
    JSON.stringify([
      ["第一句。", 0, 2],
      ["第二句。", 2, 3],
    ]),
  );
  assert.equal(result.transcriptText, "第一句。 第二句。");

  // Speech recognition does not need bandwidth, so the cheapest mirror wins.
  const audioCalls = calls.filter((url) => url.includes("bilivideo.com"));
  assert.equal(audioCalls.length, 1);
  assert.match(audioCalls[0], /small\.m4s$/);

  // Uploaded once, with the exact format the model is known to support.
  const uploadCalls = calls.filter((url) => url.includes("/audio/transcriptions"));
  assert.equal(uploadCalls.length, 1);
  assert.equal(uploadCalls[0], "https://api.siliconflow.cn/v1/audio/transcriptions");
});

test("the CDN Referer rule is installed before the audio download", async () => {
  const { helpers, dnrRules } = loadBackground();

  await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(dnrRules.length, 1);
  const rules = dnrRules[0].addRules;
  assert.ok(rules.length >= 1, "expected at least one header rewrite rule");

  const refererRule = rules[0];
  assert.equal(refererRule.action.type, "modifyHeaders");
  // Compare via JSON: rule objects are created inside the vm context, so their
  // prototypes differ from this realm's and deepStrictEqual rejects them.
  assert.equal(
    JSON.stringify(refererRule.action.requestHeaders),
    JSON.stringify([
      {
        header: "Referer",
        operation: "set",
        value: "https://www.bilibili.com/",
      },
    ]),
  );
  assert.ok(refererRule.condition.urlFilter.includes("bilivideo.com"));
  assert.ok(refererRule.condition.resourceTypes.includes("xmlhttprequest"));
});

test("a rejected audio mirror falls through to the backup URL", async () => {
  const { helpers, calls } = loadBackground({
    audioHandler: (url) =>
      url.includes("small-backup")
        ? binaryResponse(2048)
        : { ok: false, status: 403, headers: { get: () => null } },
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, true);
  const audioCalls = calls.filter((url) => url.includes("bilivideo.com"));
  assert.equal(audioCalls.length, 2);
  assert.match(audioCalls[1], /small-backup\.m4s$/);
});

test("an unsupported response format downgrades to the next one", async () => {
  const seenFormats = [];
  const { helpers } = loadBackground({
    asrHandler: (url, init) => {
      const format = init.body.get("response_format");
      seenFormats.push(format);
      if (format === "verbose_json") {
        return textResponse("response_format is not supported", { status: 400 });
      }
      if (format === "srt") {
        return textResponse(
          [
            "1",
            "00:00:00,000 --> 00:00:03,000",
            "第一句。",
            "",
            "2",
            "00:00:03,000 --> 00:00:06,000",
            "第二句。",
          ].join("\n"),
        );
      }
      return jsonResponse({ text: "第三句。" });
    },
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.deepEqual(seenFormats, ["verbose_json", "srt"]);
  assert.equal(result.success, true);
  assert.equal(result.timingEstimated, false);
  assert.equal(result.transcript.length, 2);
  assert.equal(result.transcript[1].start, 3);
});

test("a text-only model still produces a usable estimated timeline", async () => {
  const { helpers } = loadBackground({
    settings: { asrModel: "FunAudioLLM/SenseVoiceSmall" },
    asrHandler: () => jsonResponse({ text: "第一句。第二句。" }),
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, true);
  assert.equal(result.timingEstimated, true);
  assert.equal(result.transcript.length, 2);
  // The part is 600 s long, so the estimate spans the real audio length.
  assert.equal(result.transcript[1].start, 300);
});

test("the fallback never runs while the switch is off", async () => {
  const { helpers, calls } = loadBackground({
    settings: { asrEnabled: false },
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "asr_disabled");
  assert.equal(
    calls.filter((url) => url.includes("bilivideo.com")).length,
    0,
    "a disabled fallback must not download anything",
  );
  assert.equal(
    calls.filter((url) => url.includes("/audio/transcriptions")).length,
    0,
    "a disabled fallback must not call a paid service",
  );
});

test("a missing key is reported before any network work", async () => {
  const { helpers, calls } = loadBackground({
    settings: { asrApiKey: "" },
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "asr_not_configured");
  assert.equal(calls.filter((url) => url.includes("bilivideo.com")).length, 0);
});

test("a rejected key names the provider in the message", async () => {
  const { helpers } = loadBackground({
    asrHandler: () => textResponse("unauthorized", { status: 401 }),
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "asr_auth");
  assert.match(result.message, /SiliconFlow/);
});

test("audio over the size ceiling is refused before uploading", async () => {
  const { helpers, calls } = loadBackground({
    settings: { asrMaxBytes: 1024 },
    audioHandler: () => binaryResponse(4 * 1024 * 1024),
  });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "audio_too_large");
  assert.match(result.message, /4\.0 MB/);
  assert.equal(
    calls.filter((url) => url.includes("/audio/transcriptions")).length,
    0,
    "an oversized upload must never be sent",
  );
});

test("a video with no separate audio stream fails cleanly", async () => {
  const { helpers } = loadBackground({ noAudioTrack: true });

  const result = await helpers.handleTranscribe("BV1Fg411D7Jy", 42);

  assert.equal(result.success, false);
  assert.equal(result.error, "audio_unavailable");
});

test("the pre-flight reports length, size and permission state", async () => {
  const granted = loadBackground();
  const probe = await granted.helpers.handleProbeAudio("BV1Fg411D7Jy");

  assert.equal(probe.success, true);
  assert.equal(probe.duration, 600);
  assert.equal(probe.minutes, 10);
  // 66 kbps for 600 s is about 4.7 MB.
  assert.ok(probe.estimatedBytes > 4.5 * 1024 * 1024);
  assert.equal(probe.tooLarge, false);
  assert.equal(probe.permissionMissing, false);
  assert.equal(probe.endpointHost, "api.siliconflow.cn");
  assert.equal(
    granted.calls.filter((url) => url.includes("bilivideo.com")).length,
    0,
    "the pre-flight must not download audio",
  );

  const missing = loadBackground({
    settings: { asrMaxBytes: 1024 * 1024 },
    permissionGranted: false,
  });
  const denied = await missing.helpers.handleProbeAudio("BV1Fg411D7Jy");
  assert.equal(denied.permissionMissing, true);
  assert.equal(denied.tooLarge, true);
});
