// /admin: Neon Auth sign-in plus two read-only panels over /api/admin/*.
//
// Plain DOM, no React, and no imports from the public app: any module
// shared with index.html would be split into a shared chunk and change the
// public bundle, which this page must leave byte-identical. Every value is
// written with textContent, never innerHTML.
import { createAuthClient } from "@neondatabase/neon-js/auth";
import { BetterAuthVanillaAdapter } from "@neondatabase/neon-js/auth/vanilla";
import "./admin.css";

// Same default as src/api/client.ts (not imported, see above).
const API_BASE: string = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

// Production goes same-origin through the /neon-auth Vercel rewrite, so the
// session cookie is first-party (Safari blocks it cross-site). Dev talks to
// Neon Auth directly; "Allow Localhost" is on for that.
const AUTH_BASE: string = import.meta.env.PROD
  ? `${location.origin}/neon-auth`
  : import.meta.env.VITE_NEON_AUTH_URL;

// credentials goes through the adapter: the SDK's default adapter only keeps
// the headers from a top-level fetchOptions and drops credentials.
const auth = createAuthClient(AUTH_BASE, {
  adapter: BetterAuthVanillaAdapter({ fetchOptions: { credentials: "include" } }),
});

const root = document.getElementById("admin")!;

type Child = Node | string | null;

function el(tag: string, attrs: Record<string, string> = {}, ...children: Child[]): HTMLElement {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

function table(headers: string[], rows: (string | number | null)[][]): HTMLElement {
  return el(
    "div",
    { class: "scroll" },
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, ...headers.map((h) => el("th", {}, h)))),
      el("tbody", {}, ...rows.map((r) => el("tr", {}, ...r.map((c) => el("td", { class: "wrap" }, String(c ?? "—")))))),
    ),
  );
}

function unixToIso(seconds: unknown): string {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : String(seconds);
}

class ApiError extends Error {}

async function adminGet<T>(path: string): Promise<T> {
  // A fresh JWT per call: they live 15 minutes and the SDK caches the session.
  const { data, error } = await auth.token();
  if (error || !data?.token) throw new ApiError("Could not get a token from Neon Auth — try signing in again.");
  const res = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${data.token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(`HTTP ${res.status} — ${body.detail ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

type Check = { check: string; detail: string };
type MeResponse = {
  user_id: string;
  email: string | null;
  iat: number;
  exp: number;
  checks: Check[];
  claims: Record<string, unknown>;
};
type RaceCounts = {
  session_key: number;
  location: string;
  country_name: string;
  date_start: string | null;
  laps: number;
  pit: number;
  stints: number;
  positions: number;
  race_control: number;
  weather: number;
};
type StatusResponse = {
  latest_race: RaceCounts | null;
  races: RaceCounts[];
  next_race: { session_name: string; location: string; country_name: string; date_start: string } | null;
  next_race_fetched_at: string | null;
};

function panel(title: string, load: () => Promise<Node[]>): HTMLElement {
  const body = el("div", {}, el("p", { class: "muted" }, "Loading…"));
  load()
    .then((nodes) => body.replaceChildren(...nodes))
    .catch((e: unknown) => {
      const msg = e instanceof ApiError ? e.message : `Request failed: ${String(e)}`;
      body.replaceChildren(el("p", { class: "error" }, msg));
    });
  return el("section", {}, el("h2", {}, title), body);
}

async function statusPanel(): Promise<Node[]> {
  const s = await adminGet<StatusResponse>("/api/admin/status");
  const latest = s.latest_race;
  const next = s.next_race;
  return [
    el(
      "p",
      {},
      "Latest stored race: ",
      latest ? `${latest.location}, ${latest.country_name} · ${latest.date_start} · session_key ${latest.session_key}` : "none",
    ),
    el(
      "p",
      {},
      "Next race (cached): ",
      next ? `${next.session_name} · ${next.location}, ${next.country_name} · ${next.date_start}` : "nothing cached",
      // The cache is shown as-is, so say how old it is.
      s.next_race_fetched_at ? ` (cached at ${s.next_race_fetched_at})` : null,
    ),
    table(
      ["Race", "Date", "session_key", "laps", "pit", "stints", "positions", "race_control", "weather"],
      s.races.map((r) => [
        r.location,
        r.date_start?.slice(0, 10) ?? null,
        r.session_key,
        r.laps,
        r.pit,
        r.stints,
        r.positions,
        r.race_control,
        r.weather,
      ]),
    ),
  ];
}

async function checksPanel(): Promise<Node[]> {
  const me = await adminGet<MeResponse>("/api/admin/me");
  return [
    table(["Check", "Passed with"], me.checks.map((c) => [c.check, c.detail])),
    el("h2", {}, "Decoded claims"),
    table(
      ["Claim", "Value"],
      Object.entries(me.claims).map(([k, v]) => [
        k,
        k === "iat" || k === "exp" ? `${v} (${unixToIso(v)})` : typeof v === "object" ? JSON.stringify(v) : String(v),
      ]),
    ),
  ];
}

function renderSignedIn(email: string) {
  const signOut = el("button", { type: "button" }, "Sign out");
  signOut.addEventListener("click", async () => {
    try {
      const { error } = await auth.signOut();
      if (error) throw new Error(error.message ?? String(error.status));
      renderSignedOut();
    } catch (err) {
      // The session may still be valid, so stay on the signed-in view.
      alert(`Sign-out failed: ${String(err)}`);
    }
  });
  root.replaceChildren(
    el("header", {}, el("h1", {}, "F1 Tracker admin"), el("span", { class: "muted" }, `Signed in as ${email} `, signOut)),
    panel("Data status", statusPanel),
    panel("How the API checked you", checksPanel),
  );
}

function renderSignedOut(message = "") {
  const email = el("input", { type: "email", name: "email", autocomplete: "username", required: "" }) as HTMLInputElement;
  const password = el("input", {
    type: "password",
    name: "password",
    autocomplete: "current-password",
    required: "",
  }) as HTMLInputElement;
  const submit = el("button", { type: "submit" }, "Sign in") as HTMLButtonElement;
  const status = el("p", { class: "error", role: "alert" }, message);
  const form = el(
    "form",
    {},
    el("label", {}, "Email", email),
    el("label", {}, "Password", password),
    submit,
    status,
  );
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    submit.disabled = true;
    status.textContent = "";
    try {
      const { data, error } = await auth.signIn.email({ email: email.value, password: password.value });
      if (error || !data) {
        status.textContent = `Sign-in failed: ${error?.message ?? "unknown error"}`;
        return;
      }
      renderSignedIn(data.user.email);
    } catch (err) {
      status.textContent = `Could not reach Neon Auth: ${String(err)}`;
    } finally {
      submit.disabled = false;
    }
  });
  root.replaceChildren(el("header", {}, el("h1", {}, "F1 Tracker admin")), form);
}

async function start() {
  const { data, error } = await auth.getSession();
  if (data?.user) renderSignedIn(data.user.email);
  // Surface e.g. INVALID_ORIGIN or a broken rewrite instead of a bare form.
  else renderSignedOut(error ? `Neon Auth: ${error.message ?? error.status}` : "");
}

start().catch((e: unknown) => renderSignedOut(`Could not reach Neon Auth: ${String(e)}`));
