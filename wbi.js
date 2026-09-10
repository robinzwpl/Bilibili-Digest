/**
 * Bilibili WBI request signing.
 *
 * Bilibili's api.bilibili.com endpoints increasingly require a `w_rid`/`wts`
 * signature pair for anti-abuse. The algorithm is public and stable:
 *
 *   1. GET /x/web-interface/nav → data.wbi_img.img_url / sub_url
 *   2. Extract the filename stem of each → img_key / sub_key
 *   3. mixin_key = pick 32 chars from (img_key + sub_key) using the fixed
 *      mixinKeyEncTab permutation table
 *   4. w_rid = md5(sortedQueryString + mixin_key)
 *
 * Pure functions below are unit-testable. Only `signParams` touches the
 * network (fetching nav once and caching the keys).
 */
var BILI_WBI = (() => {
  const NAV_URL = "https://api.bilibili.com/x/web-interface/nav";

  // Fixed permutation table (public knowledge).
  const MIXIN_KEY_ENC_TAB = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
    49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55,
    40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57,
    62, 11, 36, 20, 34, 44, 52,
  ];

  // ---- Minimal MD5 (RFC 1321) for UTF-8 strings -------------------------
  // Web Crypto has no MD5, so we ship a compact implementation.

  function md5(str) {
    function rotl(x, c) {
      return (x << c) | (x >>> (32 - c));
    }
    const bytes = utf8Encode(String(str));
    const bitLen = bytes.length * 8;

    // Padding: append 0x80, pad with zeros to 56 mod 64, append 64-bit length.
    const padded = new Uint8Array((((bytes.length + 8) >> 6) + 1) * 64);
    padded.set(bytes);
    padded[bytes.length] = 0x80;

    const lenHigh = Math.floor(bitLen / 0x100000000);
    const lenLow = bitLen >>> 0;
    const dv = new DataView(padded.buffer);
    dv.setUint32(padded.length - 8, lenLow, true);
    dv.setUint32(padded.length - 4, lenHigh, true);

    let a0 = 0x67452301;
    let b0 = 0xefcdab89;
    let c0 = 0x98badcfe;
    let d0 = 0x10325476;

    const S = [
      7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14,
      20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16,
      23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
      15, 21, 6, 10, 15, 21,
    ];
    const K = new Uint32Array(64);
    for (let i = 0; i < 64; i++) {
      K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000) >>> 0;
    }

    for (let block = 0; block < padded.length; block += 64) {
      const M = new Uint32Array(16);
      for (let j = 0; j < 16; j++) {
        M[j] = dv.getUint32(block + j * 4, true);
      }
      let A = a0;
      let B = b0;
      let C = c0;
      let D = d0;
      for (let i = 0; i < 64; i++) {
        let F, g;
        if (i < 16) {
          F = (B & C) | (~B & D);
          g = i;
        } else if (i < 32) {
          F = (D & B) | (~D & C);
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          F = B ^ C ^ D;
          g = (3 * i + 5) % 16;
        } else {
          F = C ^ (B | ~D);
          g = (7 * i) % 16;
        }
        const tmp = D;
        D = C;
        C = B;
        B = (B + rotl((A + F + K[i] + M[g]) >>> 0, S[i])) >>> 0;
        A = tmp;
      }
      a0 = (a0 + A) >>> 0;
      b0 = (b0 + B) >>> 0;
      c0 = (c0 + C) >>> 0;
      d0 = (d0 + D) >>> 0;
    }

    return (
      toHexLE(a0) + toHexLE(b0) + toHexLE(c0) + toHexLE(d0)
    );
  }

  function utf8Encode(str) {
    const out = [];
    for (let i = 0; i < str.length; i++) {
      let code = str.codePointAt(i);
      if (code > 0xffff) i++;
      if (code < 0x80) out.push(code);
      else if (code < 0x800) {
        out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0x10000) {
        out.push(
          0xe0 | (code >> 12),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      } else {
        out.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f),
        );
      }
    }
    return out;
  }

  function toHexLE(n) {
    let s = "";
    for (let i = 0; i < 4; i++) {
      s += ((n >>> (i * 8)) & 0xff).toString(16).padStart(2, "0");
    }
    return s;
  }

  // ---- Key extraction ---------------------------------------------------

  function extractKeyFromUrl(url) {
    const u = String(url || "");
    const m = u.match(/\/([^/]+)\.(?:png|jpg|jpeg|gif|webp)$/i);
    return m ? m[1] : "";
  }

  /** Compute mixin_key from img_key + sub_key (pure). */
  function getMixinKey(imgKey, subKey) {
    const raw = imgKey + subKey;
    let out = "";
    for (const idx of MIXIN_KEY_ENC_TAB) {
      out += raw[idx] || "";
    }
    return out.slice(0, 32);
  }

  /**
   * Sign a params object (pure). Returns { w_rid, wts }.
   * Characters to strip from values: ! ' ( ) *
   */
  function encodeWbi(params, mixinKey) {
    const cleaned = {};
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null) continue;
      cleaned[k] = String(v).replace(/[!'()*]/g, "");
    }
    cleaned.wts = String(Math.floor(Date.now() / 1000));

    const query = Object.keys(cleaned)
      .sort()
      .map(
        (k) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(cleaned[k])}`,
      )
      .join("&");

    const w_rid = md5(query + mixinKey);
    return { w_rid, wts: cleaned.wts };
  }

  // ---- Cached keys + network sign --------------------------------------

  let keyCache = null;

  /** Fetch and cache img_key/sub_key from the nav endpoint. */
  async function getWbiKeys({ fetchImpl = fetch } = {}) {
    if (keyCache) return keyCache;
    const res = await fetchImpl(NAV_URL, {
      headers: {
        Accept: "application/json",
        Referer: "https://www.bilibili.com/",
      },
      credentials: "include",
    });
    if (!res.ok) {
      throw new Error(`nav request failed: ${res.status}`);
    }
    const json = await res.json();
    const wbi = json?.data?.wbi_img;
    if (!wbi?.img_url || !wbi?.sub_url) {
      throw new Error("nav response missing wbi_img keys");
    }
    keyCache = {
      imgKey: extractKeyFromUrl(wbi.img_url),
      subKey: extractKeyFromUrl(wbi.sub_url),
    };
    return keyCache;
  }

  /**
   * Sign params against the live mixin key (network on first call).
   * fetchImpl is injectable for tests.
   */
  async function signParams(params, { fetchImpl = fetch } = {}) {
    const { imgKey, subKey } = await getWbiKeys({ fetchImpl });
    const mixinKey = getMixinKey(imgKey, subKey);
    return encodeWbi(params, mixinKey);
  }

  return {
    md5,
    getMixinKey,
    encodeWbi,
    getWbiKeys,
    signParams,
    NAV_URL,
    MIXIN_KEY_ENC_TAB,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = BILI_WBI;
}
