import { describe, expect, it } from "vitest";

import { urlBase64ToUint8Array } from "./push";

/**
 * The VAPID key conversion is the one piece of this feature that is both
 * pure and easy to get subtly wrong — and when it IS wrong the browser fails with
 * an opaque InvalidCharacterError deep inside `pushManager.subscribe`, long after
 * the mistake. Worth pinning exactly.
 */

// jsdom is not configured for this package; atob exists in Node 20 globally.
if (typeof globalThis.window === "undefined") {
  Object.defineProperty(globalThis, "window", { value: { atob }, writable: true });
}

/** A real VAPID public key: 87 chars of URL-safe base64, no padding. */
const VAPID_KEY =
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkOMgXQfXlpjNZ8yhSjJ_Pt1KRLxHqmc7hVHYYNBTAoQvGkKAOqMHqM";

describe("urlBase64ToUint8Array", () => {
  it("produces the 65 bytes an uncompressed P-256 point needs", () => {
    const bytes = urlBase64ToUint8Array(VAPID_KEY);
    expect(bytes).toHaveLength(65);
    // 0x04 is the uncompressed-point marker every valid VAPID key starts with.
    expect(bytes[0]).toBe(0x04);
  });

  it("undoes the URL-safe substitutions rather than feeding them to atob", () => {
    // "-" and "_" are +/ in standard base64. Decoding without swapping them back
    // silently yields different bytes — this is the bug the helper exists to avoid.
    const withUrlSafeChars = "-_-_";
    const standardEquivalent = "+/+/";

    expect([...urlBase64ToUint8Array(withUrlSafeChars)]).toEqual([
      ...urlBase64ToUint8Array(standardEquivalent.replace(/\+/g, "-").replace(/\//g, "_")),
    ]);
    // And it must NOT equal what a naive atob of the url-safe string would give.
    expect([...urlBase64ToUint8Array(withUrlSafeChars)]).toEqual([251, 255, 191]);
  });

  it("restores stripped padding for every remainder", () => {
    // VAPID keys arrive unpadded; atob rejects a wrong-length string.
    expect(() => urlBase64ToUint8Array("QQ")).not.toThrow(); // needs "=="
    expect(() => urlBase64ToUint8Array("QUJD")).not.toThrow(); // already aligned
    expect(() => urlBase64ToUint8Array("QUI")).not.toThrow(); // needs "="
    expect([...urlBase64ToUint8Array("QUJD")]).toEqual([65, 66, 67]); // "ABC"
  });

  it("is byte-identical to decoding the padded, standard form by hand", () => {
    const padded = `${VAPID_KEY}=`.replace(/-/g, "+").replace(/_/g, "/");
    const expected = [...atob(padded)].map((character) => character.charCodeAt(0));
    expect([...urlBase64ToUint8Array(VAPID_KEY)]).toEqual(expected);
  });

  it("returns a view over a plain ArrayBuffer, as BufferSource requires", () => {
    const bytes = urlBase64ToUint8Array(VAPID_KEY);
    expect(bytes.buffer).toBeInstanceOf(ArrayBuffer);
  });
});
