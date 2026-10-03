// /admin: Neon Auth sign-in plus three panels over /api/admin/*: two
// read-only, and one that starts the fetch workflow on GitHub Actions.
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

// Production goes same-origin through the /neon-auth proxy function
// (api/neon-auth.ts), so the session cookie is first-party (Safari blocks it
// cross-site). Dev talks to Neon Auth directly; "Allow Localhost" is on for that.
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

function table(headers: string[], rows: (Node | string | number | null)[][]): HTMLElement {
  return el(
    "div",
    { class: "scroll" },
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, ...headers.map((h) => el("th", {}, h)))),
      el(
        "tbody",
        {},
        ...rows.map((r) =>
          el("tr", {}, ...r.map((c) => el("td", { class: "wrap" }, c instanceof Node ? c : String(c ?? "—")))),
        ),
      ),
    ),
  );
}

function unixToIso(seconds: unknown): string {
  return typeof seconds === "number" ? new Date(seconds * 1000).toISOString() : String(seconds);
}

class ApiError extends Error {
  status: number | null;
  detail: string | null;

  constructor(message: string, status: number | null = null, detail: string | null = null) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

// The SDK's AuthError carries the HTTP status when Neon answered; anything
// else (e.g. fetch's TypeError) means the request never got a response.
function authErrorText(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return `Neon Auth: ${(err as Error).message} (${status})`;
  return `Could not reach Neon Auth: ${String(err)}`;
}

async function adminFetch<T>(path: string, method: "GET" | "POST" = "GET"): Promise<T> {
  // A fresh JWT per call: they live 15 minutes. Fetched directly because the
  // SDK's auth.token() maps /token to getSession and answers from its session
  // cache without a request, so it never returns a token.
  const tokenRes = await fetch(`${AUTH_BASE}/token`, { credentials: "include" });
  const token = tokenRes.ok ? ((await tokenRes.json().catch(() => ({}))) as { token?: unknown }).token : undefined;
  if (typeof token !== "string" || !token) {
    throw new ApiError(`Could not get a token from Neon Auth (${tokenRes.status}) — try signing in again.`);
  }
  const res = await fetch(`${API_BASE}${path}`, { method, headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const detail = typeof body.detail === "string" ? body.detail : null;
    throw new ApiError(`HTTP ${res.status} — ${detail ?? res.statusText}`, res.status, detail);
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

function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : `Request failed: ${String(e)}`;
}

function panel(title: string, load: () => Promise<Node[]>): HTMLElement {
  const body = el("div", {}, el("p", { class: "muted" }, "Loading…"));
  load()
    .then((nodes) => body.replaceChildren(...nodes))
    .catch((e: unknown) => body.replaceChildren(el("p", { class: "error" }, errorText(e))));
  return el("section", {}, el("h2", {}, title), body);
}

// Fixed, like the repo/workflow constants in backend/api/github_actions.py.
const WORKFLOW_PAGE = "https://github.com/Nem702/f1-tracker/actions/workflows/fetch.yml";
const NOT_CONFIGURED = "GitHub Actions not configured";

type Run = {
  id: number;
  status: string | null;
  conclusion: string | null;
  event: string | null;
  created_at: string | null;
  html_url: string | null;
};
type RunsResponse = { state: string; runs: Run[] };

function externalLink(href: string, text: string): HTMLElement {
  return el("a", { href, target: "_blank", rel: "noopener noreferrer" }, text);
}

function runLink(run: Run): Node | string {
  // Only GitHub URLs become links, whatever the API passes through.
  return run.html_url?.startsWith("https://github.com/") ? externalLink(run.html_url, `#${run.id}`) : `#${run.id}`;
}

function fetchPanel(): HTMLElement {
  const title = el("h2", {}, "Fetch");
  const stateLine = el("p", { class: "muted" }, "Loading…");
  const message = el("p", { role: "status" });
  const runsBox = el("div");
  const runButton = el("button", { type: "button" }, "Fetch latest data") as HTMLButtonElement;
  const refreshButton = el("button", { type: "button" }, "Refresh") as HTMLButtonElement;
  const enableButton = el("button", { type: "button", hidden: "" }, "Re-enable schedule") as HTMLButtonElement;
  const buttons = [runButton, refreshButton, enableButton];
  const section = el(
    "section",
    {},
    title,
    stateLine,
    el("div", { class: "actions" }, ...buttons),
    message,
    runsBox,
  );

  function say(text: string, isError = false) {
    message.className = isError ? "error" : "muted";
    message.textContent = text;
  }

  async function load() {
    const r = await adminFetch<RunsResponse>("/api/admin/runs");
    stateLine.textContent = `Workflow state: ${r.state}`;
    enableButton.hidden = r.state === "active";
    runsBox.replaceChildren(
      r.runs.length
        ? table(
            ["Run", "Status", "Conclusion", "Event", "Created"],
            r.runs.map((run) => [runLink(run), run.status, run.conclusion, run.event, run.created_at]),
          )
        : el("p", { class: "muted" }, "No runs yet."),
    );
  }

  // One request at a time: every button is disabled while one is in flight.
  async function busy(action: () => Promise<string | void>) {
    for (const b of buttons) b.disabled = true;
    say("");
    try {
      const done = await action();
      if (done) say(done);
    } catch (e) {
      if (e instanceof ApiError && e.status === 503 && e.detail === NOT_CONFIGURED) {
        section.replaceChildren(
          title,
          el(
            "p",
            {},
            "Fetching from here isn't configured on this server. ",
            externalLink(WORKFLOW_PAGE, "Run it from GitHub Actions"),
            ".",
          ),
        );
      } else {
        // A failed first load must not leave "Loading…" up.
        if (stateLine.textContent === "Loading…") stateLine.textContent = "Workflow state: unknown";
        say(errorText(e), true);
      }
    } finally {
      for (const b of buttons) b.disabled = false;
    }
  }

  runButton.addEventListener("click", () =>
    busy(async () => {
      await adminFetch("/api/admin/fetch", "POST");
      return "Run requested. It may take a few seconds to show up — press Refresh.";
    }),
  );
  refreshButton.addEventListener("click", () => busy(load));
  enableButton.addEventListener("click", () =>
    busy(async () => {
      await adminFetch("/api/admin/fetch/enable", "POST");
      await load();
      return "Schedule re-enabled.";
    }),
  );

  void busy(load);
  return section;
}

async function statusPanel(): Promise<Node[]> {
  const s = await adminFetch<StatusResponse>("/api/admin/status");
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
  const me = await adminFetch<MeResponse>("/api/admin/me");
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
    fetchPanel(),
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
      status.textContent = authErrorText(err);
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

start().catch((e: unknown) => renderSignedOut(authErrorText(e)));
