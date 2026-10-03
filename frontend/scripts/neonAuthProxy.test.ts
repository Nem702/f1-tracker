import { test } from "node:test";
import assert from "node:assert/strict";

import { rewriteSetCookie, upstreamHeaders, upstreamUrl } from "../api/neon-auth.ts";

const NEON_HOST = "ep-green-sound-ail6z0yt.neonauth.c-4.us-east-1.aws.neon.tech";

test("upstream host is fixed to Neon Auth, sub-path and query kept", () => {
  const url = upstreamUrl("sign-in/email", new URLSearchParams("a=1"));
  assert.equal(url?.href, `https://${NEON_HOST}/neondb/auth/sign-in/email?a=1`);
});

test("paths that escape the base or carry a URL are rejected", () => {
  for (const path of ["../x", "a/../../x", "%2e%2e/x", "a//b", "a\\b", "https://evil.example/x", "//evil.example", "", null]) {
    assert.equal(upstreamUrl(path, new URLSearchParams()), null, String(path));
  }
});

test("Origin is set and forwarding headers are not passed on", () => {
  const h = upstreamHeaders(
    new Headers({
      host: "f1-tracker.dev",
      "x-forwarded-host": "f1-tracker.dev",
      "x-forwarded-for": "1.2.3.4",
      "x-vercel-id": "abc",
      origin: "https://f1-tracker.dev",
      "content-type": "application/json",
      cookie: "__Secure-neon-auth.session_token=t; other=x",
    }),
  );
  assert.equal(h.get("origin"), "https://f1-tracker.dev");
  assert.equal(h.get("content-type"), "application/json");
  assert.equal(h.get("cookie"), "__Secure-neon-auth.session_token=t");
  for (const name of ["host", "x-forwarded-host", "x-forwarded-for", "x-vercel-id"]) assert.equal(h.get(name), null, name);
});

test("Set-Cookie: Domain and Partitioned dropped, SameSite forced to Lax, rest kept", () => {
  const out = rewriteSetCookie(
    `__Secure-neon-auth.session_token=t; Domain=${NEON_HOST}; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=None; Partitioned`,
  );
  assert.equal(out, "__Secure-neon-auth.session_token=t; Path=/; Max-Age=60; HttpOnly; Secure; SameSite=Lax");
});
