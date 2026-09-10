const test = require("node:test");
const assert = require("node:assert/strict");

const settings = require("../settings.js");
const platform = require("../platform.js");

test("DeepSeek defaults use V4 Flash", () => {
  const normalized = settings.normalize({
    provider: "unexpected",
    aiApiKey: "  example-key  ",
    aiBaseUrl: "https://api.example.com/v1",
    aiModel: "example-model",
  });

  assert.equal(normalized.provider, "deepseek");
  assert.equal(normalized.aiBaseUrl, "https://api.deepseek.com");
  assert.equal(normalized.aiModel, "deepseek-v4-flash");
  assert.equal(normalized.aiApiKey, "example-key");
  assert.equal(
    settings.chatCompletionsUrl(),
    "https://api.deepseek.com/chat/completions",
  );
});

test("legacy custom migration clears only the AI key and is idempotent", () => {
  const legacy = {
    provider: "custom",
    aiApiKey: "custom-secret",
    aiBaseUrl: "https://api.example.com/v1",
    aiModel: "example-model",
  };
  const first = settings.migrateLegacyCustom(legacy);

  assert.equal(first.migrated, true);
  assert.equal(first.settings.provider, "deepseek");
  assert.equal(first.settings.aiBaseUrl, settings.DEFAULTS.aiBaseUrl);
  assert.equal(first.settings.aiModel, settings.DEFAULTS.aiModel);
  assert.equal(first.settings.aiApiKey, "");

  const second = settings.migrateLegacyCustom(first.settings);
  assert.equal(second.migrated, false);
  assert.deepEqual(second.settings, first.settings);

  const configuredDeepSeek = settings.normalize({
    ...first.settings,
    aiApiKey: "new-deepseek-key",
  });
  assert.equal(configuredDeepSeek.aiApiKey, "new-deepseek-key");
});

test("speech-to-text defaults stay off and normalize defensively", () => {
  const defaults = settings.normalize({});

  assert.equal(defaults.asrEnabled, false);
  assert.equal(defaults.asrProvider, "siliconflow");
  assert.equal(defaults.asrApiKey, "");
  assert.equal(defaults.asrBaseUrl, "https://api.siliconflow.cn/v1");
  assert.equal(defaults.asrMaxBytes, settings.DEFAULT_ASR_MAX_BYTES);
  assert.equal(settings.asrReady(defaults), false);

  const configured = settings.normalize({
    asrEnabled: true,
    asrProvider: "siliconflow",
    asrApiKey: "  key  ",
    asrBaseUrl: "  https://api.siliconflow.cn/v1  ",
    asrModel: "  whisper-large-v3  ",
    asrMaxBytes: 8 * 1024 * 1024,
  });

  assert.equal(configured.asrEnabled, true);
  assert.equal(configured.asrApiKey, "key");
  assert.equal(configured.asrBaseUrl, "https://api.siliconflow.cn/v1");
  assert.equal(configured.asrModel, "whisper-large-v3");
  assert.equal(configured.asrMaxBytes, 8 * 1024 * 1024);
  assert.equal(settings.asrReady(configured), true);

  // A plaintext endpoint would leak the key, and an unknown provider id must
  // not silently inherit another provider's base URL.
  const downgraded = settings.normalize({
    asrEnabled: true,
    asrApiKey: "key",
    asrProvider: "siliconflow",
    asrBaseUrl: "http://insecure.example.com/v1",
  });
  assert.equal(downgraded.asrBaseUrl, "https://api.siliconflow.cn/v1");

  const unknown = settings.normalize({ asrProvider: "mystery" });
  assert.equal(unknown.asrProvider, "custom");
  assert.equal(unknown.asrBaseUrl, "");

  const clamped = settings.normalize({ asrMaxBytes: 900 * 1024 * 1024 });
  assert.equal(clamped.asrMaxBytes, 100 * 1024 * 1024);
  assert.equal(settings.normalize({ asrMaxBytes: 12 }).asrMaxBytes, 1024 * 1024);
});

test("bilibili canonical URL is derived from bvid", () => {
  assert.equal(
    platform.canonicalBilibiliUrl("BV1Fg411D7Jy"),
    "https://www.bilibili.com/video/BV1Fg411D7Jy",
  );
  assert.throws(
    () => platform.canonicalBilibiliUrl('"><script>'),
    /Invalid bilibili video ID/,
  );
});

test("extractBvid parses bilibili video URLs", () => {
  assert.equal(
    platform.extractBvid("https://www.bilibili.com/video/BV1Fg411D7Jy"),
    "BV1Fg411D7Jy",
  );
  assert.equal(
    platform.extractBvid(
      "https://www.bilibili.com/video/BV1Fg411D7Jy?spm_id_from=333.999",
    ),
    "BV1Fg411D7Jy",
  );
  assert.equal(platform.extractBvid("https://www.bilibili.com/"), null);
  assert.equal(platform.extractBvid("BV1Fg411D7Jy"), "BV1Fg411D7Jy");
  assert.equal(platform.isBilibiliVideoPage("https://www.bilibili.com/video/BV1Fg411D7Jy"), true);
  assert.equal(platform.isBilibiliVideoPage("https://www.bilibili.com/"), false);
});
