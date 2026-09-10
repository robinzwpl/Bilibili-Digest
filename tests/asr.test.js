/**
 * @file asr.test.js
 *
 * Pure helpers behind the hosted speech-to-text fallback: endpoint building,
 * response shaping (verbose_json / SRT / plain text), and the transcript
 * contract that lets a transcribed video reuse every existing feature.
 */

const test = require("node:test");
const assert = require("node:assert/strict");

const asr = require("../asr.js");
const settings = require("../settings.js");

test("transcriptionsUrl builds one endpoint shape from any input", () => {
  assert.equal(
    asr.transcriptionsUrl("https://api.siliconflow.cn/v1"),
    "https://api.siliconflow.cn/v1/audio/transcriptions",
  );
  assert.equal(
    asr.transcriptionsUrl("https://api.siliconflow.cn/v1/"),
    "https://api.siliconflow.cn/v1/audio/transcriptions",
  );
  assert.equal(
    asr.transcriptionsUrl(
      "https://api.siliconflow.cn/v1/audio/transcriptions",
    ),
    "https://api.siliconflow.cn/v1/audio/transcriptions",
  );
  assert.equal(asr.transcriptionsUrl(""), "");
  assert.equal(asr.transcriptionsUrl("   "), "");
});

test("endpoint origin patterns drive the optional host permission", () => {
  assert.equal(
    asr.endpointOriginPattern("https://api.siliconflow.cn/v1"),
    "https://api.siliconflow.cn/*",
  );
  assert.equal(
    asr.endpointHost("https://api.siliconflow.cn/v1"),
    "api.siliconflow.cn",
  );
  assert.equal(asr.endpointOriginPattern("not a url"), "");
  assert.equal(asr.endpointHost("not a url"), "");
});

test("response formats degrade from exact to estimated", () => {
  assert.deepEqual(asr.responseFormatPlan(true), [
    "verbose_json",
    "srt",
    "json",
  ]);
  assert.deepEqual(asr.responseFormatPlan(false), ["json"]);

  assert.equal(
    asr.modelSupportsTimestamps("siliconflow", "whisper-large-v3"),
    true,
  );
  assert.equal(
    asr.modelSupportsTimestamps("siliconflow", "FunAudioLLM/SenseVoiceSmall"),
    false,
  );
  // Unknown models (custom endpoints) are given the benefit of the doubt.
  assert.equal(asr.modelSupportsTimestamps("custom", "my-model"), true);
  assert.equal(asr.modelSupportsTimestamps("siliconflow", ""), false);
});

test("verbose_json segments become cues with exact timings", () => {
  const parsed = asr.parseTranscriptionResponse(
    {
      text: "第一句。第二句。",
      segments: [
        { start: 0, end: 2.5, text: "第一句。" },
        { start: 2.5, end: 5, text: "第二句。" },
      ],
    },
    "verbose_json",
    600,
  );

  assert.equal(parsed.estimated, false);
  assert.equal(parsed.cues.length, 2);
  assert.deepEqual(
    parsed.cues.map((cue) => [cue.text, cue.start, cue.end]),
    [
      ["第一句。", 0, 2.5],
      ["第二句。", 2.5, 5],
    ],
  );
});

test("plain json text is spread across the audio length and flagged", () => {
  const parsed = asr.parseTranscriptionResponse(
    { text: "第一句。第二句。第三句。第四句。" },
    "json",
    40,
  );

  assert.equal(parsed.estimated, true);
  assert.equal(parsed.cues.length, 4);
  assert.equal(parsed.cues[0].start, 0);
  assert.equal(parsed.cues[0].end, 10);
  assert.equal(parsed.cues[3].start, 30);
  assert.equal(parsed.cues[3].end, 40);
});

test("plain json without a known duration still yields a usable timeline", () => {
  const parsed = asr.parseTranscriptionResponse({ text: "一。二。" }, "json", 0);

  assert.equal(parsed.estimated, true);
  assert.equal(parsed.cues.length, 2);
  assert.equal(parsed.cues[1].start, 5);
});

test("SRT and WebVTT responses are parsed into cues", () => {
  const srt = [
    "1",
    "00:00:00,000 --> 00:00:02,500",
    "第一句。",
    "",
    "2",
    "00:00:02,500 --> 00:00:05,000",
    "第二句。",
  ].join("\n");

  const parsed = asr.parseTranscriptionResponse(srt, "srt", 0);
  assert.equal(parsed.estimated, false);
  assert.equal(parsed.cues.length, 2);
  assert.equal(parsed.cues[1].start, 2.5);
  assert.equal(parsed.cues[1].end, 5);

  const vtt = [
    "WEBVTT",
    "",
    "00:00:01.000 --> 00:00:03.000",
    "Hello there.",
  ].join("\n");

  const fromVtt = asr.cuesFromSrt(vtt);
  assert.equal(fromVtt.length, 1);
  assert.equal(fromVtt[0].text, "Hello there.");
  assert.equal(fromVtt[0].start, 1);
});

test("an unparseable body degrades instead of throwing", () => {
  assert.equal(asr.parseTranscriptionResponse(null, "verbose_json", 0), null);
  assert.equal(asr.cuesFromSrt("no cues here"), null);
  assert.equal(asr.cuesFromSegments([]), null);
  assert.equal(asr.cuesFromSegments("nope"), null);
});

test("cuesToTranscript produces the shared transcript contract", () => {
  const shaped = asr.cuesToTranscript(
    [
      { text: "第一句。", start: 0, end: 2.5 },
      { text: "第二句。", start: 2.5, end: 5 },
    ],
    "asr",
    false,
  );

  assert.equal(shaped.transcript.length, 2);
  assert.equal(
    JSON.stringify(
      shaped.transcript.map((entry) => ({
        text: entry.text,
        start: entry.start,
        duration: entry.duration,
      })),
    ),
    JSON.stringify([
      { text: "第一句。", start: 0, duration: 2 },
      { text: "第二句。", start: 2, duration: 3 },
    ]),
  );
  assert.equal(shaped.transcriptText, "第一句。 第二句。");
  assert.match(shaped.transcriptTextTimestamped, /^\[0:00\] 第一句。\n\[0:02\] 第二句。$/);
  assert.equal(shaped.transcript[0].language, "asr");
  assert.equal(shaped.transcript[0].needsTranslation, false);
});

test("empty or whitespace cue text is dropped", () => {
  const shaped = asr.cuesToTranscript(
    [
      { text: "  ", start: 0, end: 1 },
      { text: "有效。", start: 1, end: 2 },
    ],
    "asr",
    false,
  );

  assert.equal(shaped.transcript.length, 1);
  assert.equal(shaped.transcript[0].text, "有效。");
});

test("splitSentences keeps punctuation and never returns nothing useful", () => {
  assert.deepEqual(asr.splitSentences("一。二！三？"), ["一。", "二！", "三？"]);
  assert.deepEqual(asr.splitSentences("  no  punctuation  "), [
    "no punctuation",
  ]);
  assert.deepEqual(asr.splitSentences(""), []);
});

test("audio size estimation and formatting", () => {
  // Measured against a real 66 kbps bilibili DASH audio stream.
  const bytes = asr.estimateAudioBytes(66166, 580);
  assert.ok(bytes > 4.5 * asr.MB && bytes < 5 * asr.MB, String(bytes));
  assert.equal(asr.estimateAudioBytes(0, 100), 0);
  assert.equal(asr.estimateAudioBytes(66166, 0), 0);

  assert.equal(asr.audioMinutes(600), 10);
  assert.equal(asr.audioMinutes(30), 1);
  assert.equal(asr.audioMinutes(0), 0);

  assert.equal(asr.formatBytes(512 * 1024), "512 KB");
  assert.equal(asr.formatBytes(4.7 * asr.MB), "4.7 MB");

  assert.equal(asr.clampMaxBytes(0), asr.DEFAULT_MAX_BYTES);
  assert.equal(asr.clampMaxBytes("nope"), asr.DEFAULT_MAX_BYTES);
  assert.equal(asr.clampMaxBytes(1024), asr.MB);
  assert.equal(asr.clampMaxBytes(500 * asr.MB), asr.MAX_MAX_BYTES);
});

test("provider presets stay in sync with the settings defaults", () => {
  const provider = asr.resolveProvider(settings.DEFAULTS.asrProvider);

  assert.equal(provider.id, settings.DEFAULTS.asrProvider);
  assert.equal(provider.baseUrl, settings.DEFAULTS.asrBaseUrl);
  assert.ok(
    provider.models.some(
      (model) => model.id === settings.DEFAULTS.asrModel,
    ),
    "the default model must exist in the provider preset",
  );

  for (const [id, baseUrl] of Object.entries(settings.ASR_BASE_URLS)) {
    assert.equal(
      asr.PROVIDERS[id].baseUrl,
      baseUrl,
      `settings.js and asr.js disagree about ${id}`,
    );
  }
});

test("unknown provider ids fall back instead of breaking the pipeline", () => {
  assert.equal(asr.isKnownProvider("siliconflow"), true);
  assert.equal(asr.isKnownProvider("nope"), false);
  assert.equal(asr.resolveProvider("nope").id, "custom");
  assert.equal(asr.resolveProvider("").id, "custom");
  assert.deepEqual(asr.modelsFor("custom"), []);
});
