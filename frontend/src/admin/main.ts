// /admin: Neon Auth sign-in plus four panels over /api/admin/*: two
// read-only, one that starts the fetch workflow on GitHub Actions, and one
// that edits circuit facts.
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

// Cells stay on one line and a wide table scrolls sideways inside its plate.
// Columns in `numeric` are right-aligned, `wrap` wraps at spaces, and
// `breakAll` may break anywhere (long tokens only). Rows marked in `dimmed`
// take the muted colour.
function table(
  headers: string[],
  rows: (Node | string | number | null)[][],
  {
    numeric = [],
    wrap = [],
    breakAll = [],
    dimmed = [],
  }: { numeric?: number[]; wrap?: number[]; breakAll?: number[]; dimmed?: boolean[] } = {},
): HTMLElement {
  const isNum = (i: number) => numeric.includes(i);
  const cellAttrs = (i: number): Record<string, string> =>
    isNum(i) ? { class: "num" } : wrap.includes(i) ? { class: "wrap" } : breakAll.includes(i) ? { class: "break" } : {};
  return el(
    "div",
    { class: "plate" },
    el(
      "table",
      {},
      el("thead", {}, el("tr", {}, ...headers.map((h, i) => el("th", isNum(i) ? { class: "num" } : {}, h)))),
      el(
        "tbody",
        {},
        ...rows.map((r, ri) =>
          el(
            "tr",
            dimmed[ri] ? { class: "dim" } : {},
            ...r.map((c, i) => el("td", cellAttrs(i), c instanceof Node ? c : String(c ?? "—"))),
          ),
        ),
      ),
    ),
  );
}

// Browser time zone, no seconds. en-GB fixes the order: "Sat, 3 Oct 2026, 13:41".
const DATE_TIME = new Intl.DateTimeFormat("en-GB", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});
const DATE_ONLY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });
const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const FORMATS = { dateTime: DATE_TIME, date: DATE_ONLY, short: DAY_MONTH };

// API timestamps are ISO strings; JWT iat/exp are Unix seconds. Null or
// anything unparseable comes back unchanged, so it shows as it did before.
function formatTime<T>(value: T, format: keyof typeof FORMATS = "dateTime"): string | T {
  const d = typeof value === "number" ? new Date(value * 1000) : typeof value === "string" ? new Date(value) : null;
  if (!d || Number.isNaN(d.getTime())) return value;
  return FORMATS[format].format(d);
}

class ApiError extends Error {
  status: number | null;
  detail: string | null;
  // The parsed error body, e.g. FastAPI's 422 { detail: [{ loc, msg }] }.
  body: unknown;

  constructor(message: string, status: number | null = null, detail: string | null = null, body: unknown = null) {
    super(message);
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

// The SDK's AuthError carries the HTTP status when Neon answered; anything
// else (e.g. fetch's TypeError) means the request never got a response.
function authErrorText(err: unknown): string {
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") return `Neon Auth: ${(err as Error).message} (${status})`;
  return `Could not reach Neon Auth: ${String(err)}`;
}

async function adminFetch<T>(path: string, method: "GET" | "POST" | "PUT" = "GET", body?: unknown): Promise<T> {
  // A fresh JWT per call: they live 15 minutes. Fetched directly because the
  // SDK's auth.token() maps /token to getSession and answers from its session
  // cache without a request, so it never returns a token.
  const tokenRes = await fetch(`${AUTH_BASE}/token`, { credentials: "include" });
  const token = tokenRes.ok ? ((await tokenRes.json().catch(() => ({}))) as { token?: unknown }).token : undefined;
  if (typeof token !== "string" || !token) {
    throw new ApiError(`Could not get a token from Neon Auth (${tokenRes.status}) — try signing in again.`);
  }
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const detail = typeof errBody.detail === "string" ? errBody.detail : null;
    throw new ApiError(`HTTP ${res.status} — ${detail ?? res.statusText}`, res.status, detail, errBody);
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

// Checked once at load; no resize handling. Stored races and Circuit facts
// start open above the phone breakpoint and closed on a phone.
const DESKTOP = window.matchMedia("(min-width: 641px)").matches;

// A glass card whose content is one <details>. The error sits outside it, so
// a failure shows while the card is closed.
function card(title: string, open: boolean, summaryExtra: Child[], body: Node, error: Child): HTMLElement {
  const details = el("details", {}, el("summary", {}, el("h2", {}, title), ...summaryExtra), body) as HTMLDetailsElement;
  details.open = open;
  return el("section", { class: "card glass" }, details, error);
}

// A closed panel still loads straight away.
function panel(title: string, load: () => Promise<Node[]>, open: boolean, ...summaryExtra: Child[]): HTMLElement {
  const body = el("div", { class: "card__body" }, el("p", { class: "muted" }, "Loading…"));
  const error = el("p", { class: "error" });
  load()
    .then((nodes) => body.replaceChildren(...nodes))
    .catch((e: unknown) => {
      body.replaceChildren();
      error.textContent = errorText(e);
    });
  return card(title, open, summaryExtra, body, error);
}

type Tone = "ok" | "fail" | "run" | "neutral";

// Colour never carries the meaning alone: a chip always has text.
function chip(text: string, tone: Tone): HTMLElement {
  return el("span", { class: `chip tone-${tone}` }, text);
}

function dot(tone: Tone, label: string): HTMLElement {
  return el("span", { class: `dot tone-${tone}`, role: "img", "aria-label": label });
}

type Tile = { root: HTMLElement; value: HTMLElement; sub: HTMLElement };

function tile(label: string): Tile {
  const value = el("p", { class: "tile__value" }, "…");
  const sub = el("p", { class: "tile__sub" });
  return { root: el("div", { class: "tile glass" }, el("p", { class: "tile__label" }, label), value, sub), value, sub };
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

// No conclusion yet means queued or in progress.
function runResult(run: Run): [text: string, tone: Tone] {
  if (!run.conclusion) return ["Running", "run"];
  if (run.conclusion === "success") return ["Success", "ok"];
  if (run.conclusion === "failure") return ["Failure", "fail"];
  return [run.conclusion, "neutral"];
}

function runDot(run: Run): HTMLElement {
  const [text, tone] = runResult(run);
  return dot(tone, text);
}

const TRIGGERS = new Map([
  ["workflow_dispatch", "Manual"],
  ["schedule", "Scheduled"],
]);

function triggerText(event: string | null): string {
  return event === null ? "—" : (TRIGGERS.get(event) ?? event);
}

// Fills the Last fetch tile too, on every load.
function fetchPanel(lastFetch: Tile): HTMLElement {
  const schedule = chip("Loading…", "neutral");
  const head = el("div", { class: "card__head" }, el("h2", {}, "Fetch"), schedule);
  const message = el("p", { role: "status" });
  const runsBox = el("div");
  const runButton = el("button", { type: "button", class: "primary" }, "Fetch latest data") as HTMLButtonElement;
  const refreshButton = el("button", { type: "button", class: "secondary" }, "Refresh") as HTMLButtonElement;
  const enableButton = el(
    "button",
    { type: "button", class: "secondary", hidden: "" },
    "Re-enable schedule",
  ) as HTMLButtonElement;
  const buttons = [runButton, refreshButton, enableButton];
  const section = el(
    "section",
    { class: "card glass" },
    head,
    el("div", { class: "actions" }, ...buttons),
    message,
    runsBox,
  );

  function say(text: string, isError = false) {
    message.className = isError ? "error" : "muted";
    message.textContent = text;
  }

  function showLastFetch(value: (Node | string)[], sub = "") {
    lastFetch.value.replaceChildren(...value);
    lastFetch.sub.textContent = sub;
  }

  async function load() {
    const r = await adminFetch<RunsResponse>("/api/admin/runs");
    const active = r.state === "active";
    schedule.className = `chip tone-${active ? "ok" : "run"}`;
    schedule.textContent = active ? "Schedule active" : `Schedule: ${r.state}`;
    enableButton.hidden = active;
    const newest = r.runs[0];
    if (newest) {
      showLastFetch([runDot(newest), runResult(newest)[0]], `${formatTime(newest.created_at) ?? "—"} · ${triggerText(newest.event)}`);
    } else {
      showLastFetch(["No runs"]);
    }
    runsBox.replaceChildren(
      ...(r.runs.length
        ? [
            el(
              "div",
              { class: "desk-only" },
              table(
                ["Run", "Result", "Trigger", "Started"],
                r.runs.map((run) => [
                  runLink(run),
                  chip(...runResult(run)),
                  triggerText(run.event),
                  formatTime(run.created_at),
                ]),
              ),
            ),
            el(
              "details",
              { class: "phone-only" },
              el("summary", {}, el("h3", {}, "Recent runs")),
              el(
                "div",
                { class: "plate" },
                el(
                  "ul",
                  { class: "list runs-list" },
                  ...r.runs.map((run) =>
                    el(
                      "li",
                      {},
                      runDot(run),
                      el("span", {}, String(formatTime(run.created_at) ?? "—")),
                      el("span", {}, triggerText(run.event)),
                    ),
                  ),
                ),
              ),
            ),
          ]
        : [el("p", { class: "muted" }, "No runs yet.")]),
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
        schedule.textContent = "";
        showLastFetch(["Not configured"]);
        section.replaceChildren(
          head,
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
        if (schedule.textContent === "Loading…") {
          schedule.textContent = "Schedule unknown";
          showLastFetch(["—"]);
        }
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

type LapRecord = { time: string; driver: string; year: number };
type Facts = {
  length_km: number;
  turns: number;
  laps?: number | null;
  first_gp: number;
  lap_record: LapRecord | null;
  note: string;
};
type FactsItem = {
  circuit_id: string;
  source: "json" | "db";
  facts: Facts;
  updated_at: string | null;
  updated_by: string | null;
};

// Keys are the field paths FastAPI reports in a 422's loc, minus "body".
// In two-column grid order: `wide` fields span both columns.
const FACT_FIELDS: { key: string; label: string; step?: string; wide?: boolean }[] = [
  { key: "length_km", label: "Length (km)", step: "0.001" },
  { key: "turns", label: "Turns", step: "1" },
  { key: "laps", label: "Race laps (optional)", step: "1" },
  { key: "first_gp", label: "First GP (year)", step: "1" },
  { key: "lap_record.time", label: "Lap record time (m:ss.SSS)" },
  { key: "lap_record.year", label: "Lap record year", step: "1" },
  { key: "lap_record.driver", label: "Lap record driver", wide: true },
  { key: "note", label: "Note", wide: true },
];
const LAP_RECORD_KEYS = ["lap_record.time", "lap_record.driver", "lap_record.year"];

function factsToValues(f: Facts): Record<string, string> {
  return {
    length_km: String(f.length_km),
    turns: String(f.turns),
    laps: f.laps == null ? "" : String(f.laps),
    first_gp: String(f.first_gp),
    "lap_record.time": f.lap_record?.time ?? "",
    "lap_record.driver": f.lap_record?.driver ?? "",
    "lap_record.year": f.lap_record ? String(f.lap_record.year) : "",
    note: f.note,
  };
}

async function circuitFactsPanel(): Promise<Node[]> {
  const items = await adminFetch<FactsItem[]>("/api/admin/circuit-facts");
  const byId = new Map(items.map((i) => [i.circuit_id, i]));

  const optionText = (i: FactsItem) => (i.source === "db" ? `${i.circuit_id} (edited)` : i.circuit_id);
  const picker = el(
    "select",
    { name: "circuit" },
    ...items.map((i) => el("option", { value: i.circuit_id }, optionText(i))),
  ) as HTMLSelectElement;
  const meta = el("p", { class: "muted" });
  const message = el("p", { role: "status" });
  const save = el("button", { type: "submit", class: "primary" }, "Save") as HTMLButtonElement;

  const inputs = new Map<string, HTMLInputElement | HTMLTextAreaElement>();
  const errors = new Map<string, HTMLElement>();
  const fields = FACT_FIELDS.map(({ key, label, step, wide }) => {
    const input = (
      key === "note"
        ? el("textarea", { name: key, rows: "3" })
        : el("input", step ? { name: key, type: "number", step } : { name: key, type: "text" })
    ) as HTMLInputElement | HTMLTextAreaElement;
    const error = el("span", { class: "error" });
    inputs.set(key, input);
    errors.set(key, error);
    return el("label", wide ? { class: "span2" } : {}, label, input, error);
  });
  // novalidate: the API is the one validator, and its messages land per field.
  const form = el(
    "form",
    { novalidate: "" },
    el("div", { class: "fields" }, el("label", { class: "span2" }, "Circuit", picker), ...fields),
    el("div", { class: "actions" }, save),
    message,
  );

  function say(text: string, isError = false) {
    message.className = isError ? "error" : "muted";
    message.textContent = text;
  }

  function clearErrors() {
    for (const e of errors.values()) e.textContent = "";
  }

  function show(item: FactsItem) {
    for (const [key, value] of Object.entries(factsToValues(item.facts))) inputs.get(key)!.value = value;
    clearErrors();
    meta.textContent =
      item.source === "db"
        ? `Source: database · last edited ${formatTime(item.updated_at)} by ${item.updated_by}`
        : "Source: circuit_facts.json (never edited)";
  }

  const text = (key: string) => inputs.get(key)!.value.trim();
  // Blank becomes null, so a missing required number is the API's to report.
  const num = (key: string) => (text(key) === "" ? null : Number(text(key)));

  function readForm() {
    const noRecord = LAP_RECORD_KEYS.every((k) => text(k) === "");
    return {
      length_km: num("length_km"),
      turns: num("turns"),
      laps: num("laps"),
      first_gp: num("first_gp"),
      lap_record: noRecord
        ? null
        : { time: text("lap_record.time"), driver: text("lap_record.driver"), year: num("lap_record.year") },
      note: text("note"),
    };
  }

  // Puts each 422 message next to its field; returns the ones with no field.
  function showValidation(detail: unknown): string[] {
    const unmatched: string[] = [];
    if (!Array.isArray(detail)) return unmatched;
    for (const issue of detail as { loc?: unknown[]; msg?: unknown }[]) {
      const key = (issue.loc ?? []).slice(1).join(".");
      const msg = String(issue.msg ?? "invalid");
      const target = errors.get(key);
      if (target) target.textContent = target.textContent ? `${target.textContent}; ${msg}` : msg;
      else unmatched.push(`${key || "body"}: ${msg}`);
    }
    return unmatched;
  }

  picker.addEventListener("change", () => {
    say("");
    show(byId.get(picker.value)!);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const circuitId = picker.value;
    save.disabled = picker.disabled = true;
    clearErrors();
    say("");
    try {
      const saved = await adminFetch<FactsItem>(
        `/api/admin/circuit-facts/${encodeURIComponent(circuitId)}`,
        "PUT",
        readForm(),
      );
      byId.set(circuitId, saved);
      picker.selectedOptions[0].textContent = optionText(saved);
      show(saved);
      say("Saved.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        const unmatched = showValidation((err.body as { detail?: unknown } | null)?.detail);
        say(unmatched.length ? unmatched.join("; ") : "Fix the fields marked above.", true);
      } else {
        say(errorText(err), true);
      }
    } finally {
      save.disabled = picker.disabled = false;
    }
  });

  if (items.length) show(items[0]);
  return [meta, form];
}

type StatusView = { cacheLine: HTMLElement; tiles: HTMLElement; error: HTMLElement; races: HTMLElement };

// One /status call fills the header's cache line, three of the four tiles
// (the fetch panel fills Last fetch) and Stored races.
function statusView(lastFetch: Tile): StatusView {
  const cacheLine = el("p", { class: "muted" });
  const latestTile = tile("Latest stored race");
  const nextTile = tile("Next race");
  const countTile = tile("Races stored");
  const error = el("p", { class: "error" });
  const racesMeta = el("span", { class: "summary-meta phone-only" });
  const racesBody = el("div", {}, el("p", { class: "muted" }, "Loading…"));
  const tiles = el("div", { class: "tiles" }, latestTile.root, nextTile.root, lastFetch.root, countTile.root);
  // Its load error shows under the tiles, which fail with it.
  const races = card("Stored races", DESKTOP, [racesMeta], racesBody, null);

  async function load() {
    const s = await adminFetch<StatusResponse>("/api/admin/status");
    const latest = s.latest_race;
    const next = s.next_race;
    const raceCounts = (r: RaceCounts) => [r.laps, r.pit, r.stints, r.positions, r.race_control, r.weather];
    // A stored race with no rows in any table (e.g. a cancelled one) is dimmed.
    const empty = s.races.map((r) => raceCounts(r).every((n) => n === 0));
    const emptyCount = empty.filter(Boolean).length;

    // The cache is shown as-is, so say how old it is.
    cacheLine.textContent = s.next_race_fetched_at ? `Next-race cache from ${formatTime(s.next_race_fetched_at)}` : "";
    latestTile.value.textContent = latest ? latest.location : "None";
    latestTile.sub.replaceChildren(
      ...(latest
        ? [
            el("span", { class: "desk-only" }, `${formatTime(latest.date_start)} · session ${latest.session_key}`),
            el("span", { class: "phone-only" }, String(formatTime(latest.date_start, "date"))),
          ]
        : []),
    );
    nextTile.value.textContent = next ? next.location : "Nothing cached";
    nextTile.sub.textContent = next ? String(formatTime(next.date_start)) : "";
    countTile.value.textContent = String(s.races.length);
    countTile.sub.textContent = `${emptyCount} with no data`;
    racesMeta.textContent = `${s.races.length} · ${emptyCount} empty`;

    racesBody.replaceChildren(
      el(
        "div",
        { class: "desk-only" },
        table(
          ["Race", "Date", "Session", "Laps", "Pit stops", "Stints", "Positions", "Race control", "Weather"],
          // null renders as "—".
          s.races.map((r, i) => [
            r.location,
            formatTime(r.date_start, "date"),
            r.session_key,
            ...raceCounts(r).map((n) => (empty[i] ? null : n)),
          ]),
          { numeric: [2, 3, 4, 5, 6, 7, 8], dimmed: empty },
        ),
      ),
      el(
        "div",
        { class: "plate phone-only" },
        el(
          "ul",
          { class: "list" },
          ...s.races.map((r, i) => {
            const date = String(formatTime(r.date_start, "short") ?? "—");
            return el(
              "li",
              empty[i] ? { class: "dim" } : {},
              el("span", {}, r.location),
              el("span", {}, empty[i] ? `${date} · no data` : date),
            );
          }),
        ),
      ),
    );
  }

  load().catch((e: unknown) => {
    for (const t of [latestTile, nextTile, countTile]) t.value.textContent = "—";
    racesBody.replaceChildren();
    error.textContent = errorText(e);
  });
  return { cacheLine, tiles, error, races };
}

// Fills the summary's "N passed" chip once /me answers.
async function checksPanel(passed: HTMLElement): Promise<Node[]> {
  const me = await adminFetch<MeResponse>("/api/admin/me");
  passed.textContent = `${me.checks.length} passed`;
  return [
    table(
      ["Check", "Passed with"],
      me.checks.map((c) => [c.check, c.detail]),
      { wrap: [1] },
    ),
    el("h3", {}, "Decoded claims"),
    table(
      ["Claim", "Value"],
      Object.entries(me.claims).map(([k, v]) => [
        k,
        k === "iat" || k === "exp" ? `${v} (${formatTime(v)})` : typeof v === "object" ? JSON.stringify(v) : String(v),
      ]),
      // Tokens and URLs are long unbroken strings.
      { breakAll: [1] },
    ),
  ];
}

// ---- site navbar: a plain-DOM copy of src/components/Navbar.tsx ----

type SvgPart = [tag: string, attrs: Record<string, string>];

// The public icons, element for element. Every part is stroked unless it
// says otherwise (the About dot is a fill).
const STROKE = { stroke: "currentColor", "stroke-width": "1.6" };
const ROUND = { ...STROKE, "stroke-linecap": "round" };

const NAV_ITEMS: { id: string; label: string; icon: SvgPart[] }[] = [
  {
    id: "hero",
    label: "Overview",
    icon: [
      ["rect", { x: "3.5", y: "3.5", width: "7.5", height: "7.5", rx: "2", ...STROKE }],
      ["rect", { x: "13", y: "3.5", width: "7.5", height: "7.5", rx: "2", ...STROKE }],
      ["rect", { x: "3.5", y: "13", width: "7.5", height: "7.5", rx: "2", ...STROKE }],
      ["rect", { x: "13", y: "13", width: "7.5", height: "7.5", rx: "2", ...STROKE }],
    ],
  },
  {
    id: "next-race",
    label: "Next Race",
    icon: [
      ["rect", { x: "3.5", y: "5", width: "17", height: "15.5", rx: "2", ...STROKE }],
      ["path", { d: "M3.5 9.5h17", ...STROKE }],
      ["path", { d: "M8 3.5v3M16 3.5v3", ...ROUND }],
    ],
  },
  {
    id: "last-race",
    label: "Last Race",
    icon: [
      ["path", { d: "M5 21V3", ...ROUND }],
      ["path", { d: "M5 4.5h9.5l-1.6 3 1.6 3H5", ...ROUND, "stroke-linejoin": "round" }],
    ],
  },
  {
    id: "season-standings",
    label: "Standings",
    icon: [
      ["path", { d: "M7 4.5h10v3.2a5 5 0 0 1-10 0V4.5Z", ...STROKE, "stroke-linejoin": "round" }],
      ["path", { d: "M7 5.3H4.8a2.1 2.1 0 0 0 2.2 3.6M17 5.3h2.2a2.1 2.1 0 0 1-2.2 3.6", ...ROUND }],
      ["path", { d: "M12 11.7v3.6", ...ROUND }],
      ["path", { d: "M9 19.5h6", ...ROUND }],
      ["path", { d: "M9.6 19.5 10 16h4l.4 3.5", ...STROKE, "stroke-linejoin": "round" }],
    ],
  },
  {
    id: "telemetry",
    label: "Telemetry",
    icon: [
      ["path", { d: "M4.5 20V4M4.5 20h15.5", ...ROUND }],
      ["path", { d: "M6.8 15.6 10.2 11l3 2.6 4.5-6.4", ...ROUND, "stroke-linejoin": "round" }],
    ],
  },
  {
    id: "about",
    label: "About",
    icon: [
      ["circle", { cx: "12", cy: "12", r: "8.25", ...STROKE }],
      ["path", { d: "M12 11v5.2", ...ROUND, "stroke-width": "1.8" }],
      ["circle", { cx: "12", cy: "8", r: "1", fill: "currentColor" }],
    ],
  },
];

const MENU_ICON: SvgPart[] = [["path", { d: "M4 7h16M4 12h16M4 17h16", ...ROUND }]];
const CLOSE_ICON: SvgPart[] = [["path", { d: "M6 6l12 12M18 6L6 18", ...ROUND }]];

function svgNode(tag: string, attrs: Record<string, string>): SVGElement {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  return node;
}

function svgIcon(parts: SvgPart[]): SVGElement {
  const svg = svgNode("svg", { width: "17", height: "17", viewBox: "0 0 24 24", fill: "none", "aria-hidden": "true" });
  for (const [tag, attrs] of parts) svg.append(svgNode(tag, attrs));
  return svg;
}

const navAccount = el("div", { class: "navbar__account" });

// Built once, above <main>, so it spans the page like the public bar. Links
// go to the public page, which scrolls to /#<section> on load. Below the
// 840px breakpoint the menu button shows and hides the links and account.
function mountNavbar() {
  const nav = el(
    "nav",
    { class: "navbar__nav", id: "admin-nav", "aria-label": "Site" },
    ...NAV_ITEMS.map(({ id, label, icon }) =>
      el(
        "a",
        { class: "navbar__nav-item", href: `/#${id}` },
        el("span", { class: "navbar__nav-icon" }, svgIcon(icon)),
        el("span", {}, label),
      ),
    ),
  );
  const menuBtn = el("button", { type: "button", class: "navbar__menu-btn", "aria-controls": "admin-nav" });
  const bar = el(
    "header",
    { class: "navbar glass" },
    el(
      "a",
      { class: "navbar__brand", href: "/" },
      el("span", { class: "navbar__brand-mark", "aria-hidden": "true" }),
      el("span", { class: "navbar__brand-word" }, "F1 Tracker"),
    ),
    nav,
    navAccount,
    menuBtn,
  );

  function setOpen(open: boolean) {
    bar.classList.toggle("navbar--open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    menuBtn.replaceChildren(svgIcon(open ? CLOSE_ICON : MENU_ICON));
  }
  const isOpen = () => bar.classList.contains("navbar--open");
  setOpen(false);
  menuBtn.addEventListener("click", () => setOpen(!isOpen()));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      menuBtn.focus();
    }
  });
  // An open menu also closes on a tap outside the bar and on scroll.
  document.addEventListener("pointerdown", (e) => {
    if (isOpen() && !bar.contains(e.target as Node)) setOpen(false);
  });
  window.addEventListener(
    "scroll",
    () => {
      if (isOpen()) setOpen(false);
    },
    { passive: true },
  );
  document.body.prepend(bar);
}

function renderSignedIn(email: string) {
  const signOut = el("button", { type: "button", class: "navbar__pill" }, "Sign out");
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
  navAccount.replaceChildren(el("span", { class: "navbar__email" }, email), signOut);
  const lastFetch = tile("Last fetch");
  const status = statusView(lastFetch);
  const passed = chip("", "ok");
  root.className = "dash";
  root.replaceChildren(
    el("header", { class: "page-head" }, el("h1", {}, "Admin"), status.cacheLine),
    status.tiles,
    status.error,
    status.races,
    el("div", { class: "split" }, fetchPanel(lastFetch), panel("Circuit facts", circuitFactsPanel, DESKTOP)),
    panel("API checks", () => checksPanel(passed), false, passed),
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
  const submit = el("button", { type: "submit", class: "primary" }, "Sign in") as HTMLButtonElement;
  const status = el("p", { class: "error", role: "alert" }, message);
  const form = el(
    "form",
    { class: "signin-card glass" },
    el("span", { class: "brand-mark", "aria-hidden": "true" }),
    el("h1", {}, "Admin sign-in"),
    el("p", { class: "muted" }, "Only allow-listed accounts can sign in."),
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
  navAccount.replaceChildren();
  root.className = "signin";
  root.replaceChildren(form);
}

async function start() {
  const { data, error } = await auth.getSession();
  if (data?.user) renderSignedIn(data.user.email);
  // Surface e.g. INVALID_ORIGIN or a broken rewrite instead of a bare form.
  else renderSignedOut(error ? `Neon Auth: ${error.message ?? error.status}` : "");
}

mountNavbar();
start().catch((e: unknown) => renderSignedOut(authErrorText(e)));
