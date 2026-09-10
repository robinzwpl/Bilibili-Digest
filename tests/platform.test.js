/**
 * @file platform.test.js
 *
 * Tests for the shared bilibili platform helpers.
 */

const assert = require("node:assert");
const { describe, it } = require("node:test");

// Mirror the loading pattern used by other tests.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (fileName) =>
  fs.readFileSync(path.join(process.cwd(), fileName), "utf8");

const sandbox = { URL, console, module: { exports: {} } };
sandbox.globalThis = sandbox;
vm.runInNewContext(read("platform.js"), sandbox);
const platform = sandbox.module.exports;

describe("BILI_PLATFORM helpers", () => {
  it("extracts bvid from a video URL", () => {
    assert.equal(
      platform.extractBvid("https://www.bilibili.com/video/BV1Fg411D7Jy"),
      "BV1Fg411D7Jy",
    );
    assert.equal(
      platform.extractBvid("https://www.bilibili.com/video/BV1Fg411D7Jy?p=2"),
      "BV1Fg411D7Jy",
    );
  });

  it("extracts the playlist page number", () => {
    assert.equal(platform.extractPage("https://www.bilibili.com/video/BV1Fg411D7Jy"), 1);
    assert.equal(
      platform.extractPage("https://www.bilibili.com/video/BV1Fg411D7Jy?p=2"),
      2,
    );
    assert.equal(
      platform.extractPage("https://www.bilibili.com/video/BV1Fg411D7Jy?p=12&foo=bar"),
      12,
    );
  });

  it("builds a pageId that includes the playlist part", () => {
    assert.equal(
      platform.extractPageId("https://www.bilibili.com/video/BV1Fg411D7Jy"),
      "BV1Fg411D7Jy",
    );
    assert.equal(
      platform.extractPageId("https://www.bilibili.com/video/BV1Fg411D7Jy?p=2"),
      "BV1Fg411D7Jy_p2",
    );
    assert.equal(
      platform.extractPageId("https://www.bilibili.com/video/BV1Fg411D7Jy?p=12"),
      "BV1Fg411D7Jy_p12",
    );
  });

  it("splits a pageId back into bvid and page", () => {
    assert.deepEqual(platform.splitPageId("BV1Fg411D7Jy"), {
      bvid: "BV1Fg411D7Jy",
      page: 1,
    });
    assert.deepEqual(platform.splitPageId("BV1Fg411D7Jy_p2"), {
      bvid: "BV1Fg411D7Jy",
      page: 2,
    });
    assert.deepEqual(platform.splitPageId("BV1Fg411D7Jy_p12"), {
      bvid: "BV1Fg411D7Jy",
      page: 12,
    });
    assert.deepEqual(platform.splitPageId("invalid"), {
      bvid: null,
      page: 1,
    });
  });

  it("recognises bilibili video pages", () => {
    assert.ok(platform.isBilibiliVideoPage("https://www.bilibili.com/video/BV1Fg411D7Jy"));
    assert.ok(
      platform.isBilibiliVideoPage("https://www.bilibili.com/video/BV1Fg411D7Jy?p=3"),
    );
    assert.equal(
      platform.isBilibiliVideoPage("https://www.bilibili.com/"),
      false,
    );
  });

  it("builds canonical URLs with optional playlist page", () => {
    assert.equal(
      platform.canonicalBilibiliUrl("BV1Fg411D7Jy"),
      "https://www.bilibili.com/video/BV1Fg411D7Jy",
    );
    assert.equal(
      platform.canonicalBilibiliUrl("BV1Fg411D7Jy", 2),
      "https://www.bilibili.com/video/BV1Fg411D7Jy?p=2",
    );
  });
});
