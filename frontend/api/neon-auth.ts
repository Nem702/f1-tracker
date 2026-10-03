// /neon-auth/* -> Neon Auth, same-origin, so the session cookie is first-party
// (Safari blocks it cross-site). vercel.json rewrites /neon-auth/:path* here
// with the sub-path in ?_path=.
//
// A plain external rewrite doesn't work: Vercel adds x-forwarded-* headers and
// Neon rejects them (400 INVALID_HOSTNAME). This mirrors the SDK's own Next.js
// handler (@neondatabase/auth, src/server/proxy): build fresh upstream headers
// from an allowlist, set Origin, and rewrite Set-Cookie for this host.
//
// Never log cookies, tokens or bodies.

const NEON_AUTH_BASE = "https://ep-green-sound-ail6z0yt.neonauth.c-4.us-east-1.aws.neon.tech/neondb/auth";
const SITE_ORIGIN = "https://f1-tracker.dev";
const COOKIE_PREFIX = "__Secure-neon-auth";

// Plain path segments only: rejects "..", encoded characters, "//", "\" and full URLs.
const SAFE_PATH = /^[A-Za-z0-9-]+(\/[A-Za-z0-9-]+)*$/;

const REQUEST_HEADERS = ["content-type", "accept", "user-agent", "authorization"];
// No content-encoding: fetch has already decompressed the body.
const RESPONSE_HEADERS = ["content-type", "set-auth-jwt", "set-auth-token", "x-neon-ret-request-id"];

export function upstreamUrl(path: string | null, search: URLSearchParams): URL | null {
  if (!path || !SAFE_PATH.test(path)) return null;
  const url = new URL(`${NEON_AUTH_BASE}/${path}`);
  url.search = search.toString();
  return url;
}

export function upstreamHeaders(incoming: Headers): Headers {
  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = incoming.get(name);
    if (value) headers.set(name, value);
  }
  // Only Neon Auth's own cookies, as the SDK does.
  const cookies = (incoming.get("cookie") ?? "")
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.startsWith(COOKIE_PREFIX));
  if (cookies.length) headers.set("cookie", cookies.join("; "));
  headers.set("origin", SITE_ORIGIN);
  headers.set("x-neon-auth-middleware", "true");
  return headers;
}

// Store the cookie for this host: drop Domain and Partitioned, force
// SameSite=Lax (every auth call is same-origin), keep the rest.
export function rewriteSetCookie(value: string): string {
  const [pair, ...attrs] = value.split(";").map((p) => p.trim());
  const kept = attrs.filter((a) => {
    const name = a.split("=")[0].trim().toLowerCase();
    return a && name !== "domain" && name !== "partitioned" && name !== "samesite";
  });
  return [pair, ...kept, "SameSite=Lax"].join("; ");
}

async function proxy(request: Request): Promise<Response> {
  // Upstream always sees Origin: SITE_ORIGIN, so do Neon's cross-site check here.
  const origin = request.headers.get("origin");
  if (origin && origin !== SITE_ORIGIN) return Response.json({ error: "Forbidden origin" }, { status: 403 });

  const incoming = new URL(request.url);
  const path = incoming.searchParams.get("_path");
  incoming.searchParams.delete("_path");
  const target = upstreamUrl(path, incoming.searchParams);
  if (!target) return Response.json({ error: "Invalid path" }, { status: 400 });

  let upstream: Response;
  try {
    upstream = await fetch(target, {
      method: request.method,
      headers: upstreamHeaders(request.headers),
      body: request.method === "POST" ? await request.text() : undefined,
      redirect: "manual",
    });
  } catch (err) {
    console.error("neon-auth proxy: upstream fetch failed", err instanceof Error ? err.name : "unknown");
    return Response.json({ error: "Upstream unreachable" }, { status: 502 });
  }

  const headers = new Headers({ "cache-control": "no-store" });
  for (const name of RESPONSE_HEADERS) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", rewriteSetCookie(cookie));
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
}

export const GET = proxy;
export const POST = proxy;
