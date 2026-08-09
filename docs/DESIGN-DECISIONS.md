# Design decisions

The running log of non-obvious choices made while building
[F1 Tracker](../README.md), and the reasoning behind each — kept because the
"why" is the part that's easy to lose. Newest entries at the bottom.
[Known data quirks](#known-data-quirks-not-bugs) are documented at the end.

## Decisions

**Filter for completed races, not just scheduled ones.**
OpenF1's `/sessions` endpoint returns _future_ scheduled races too. Taking the
max `date_start` without filtering grabs the next upcoming race instead of
the most recent finished one — filtering by `date_end < now` first is
required to get a race that's actually happened.

**Retry/backoff distinguishes failure types.**
A 429 or 5xx response is retried with exponential backoff + jitter, since
those are transient (rate limit hit, server hiccup). A 4xx like 400 or 404 is
_not_ retried — that means the request itself was malformed, and retrying it
just burns through the rate-limit budget for no benefit.

**Request pacing, not just reactive retries.**
Calls are proactively spaced rather than only backing off after a 429 —
OpenF1's free tier allows 3 req/sec, so waiting for a rejection before
slowing down means a call has already been wasted (and risks compounding
across multiple drivers' requests in the same run).

**Transport split from domain logic.**
Pacing/retry (`openf1_client.py`) moved out of `fetch_laps.py` once more
endpoints (pit stops, stints) were on the way. Without the split, one file
would end up mixing HTTP plumbing, endpoint-specific calls, and database
writes — harder to test and easy to break unrelated things while editing.
The client has zero opinions about laps/drivers; it just does "GET this
URL safely."

**Composite primary key on `laps`, not an auto-incrementing id.**
`(session_key, driver_number, lap_number)` together _are_ the identity of a
lap — there's no other sensible definition of "the same lap" across reruns.
An auto-incrementing `id` would have no way to recognize "I've already seen
this lap" on a second run, so every rerun would insert duplicates instead of
updating in place. The composite key is what makes `ON CONFLICT ... DO
UPDATE` actually idempotent rather than just syntactically present.

**Dropped the per-driver sector segment arrays (`segments_sector_1/2/3`).**
OpenF1 returns these as arrays of mini-sector color codes. Flattening an
array into a relational column means either a JSON column or a separate
child table — both add real complexity for data that doesn't serve the
project's actual goal (comparing lap times between two drivers). Left out
deliberately, not missed by accident.

**One `cur.execute()` per lap, not a bulk insert.**
At ~70 laps × 2 drivers per run, the overhead of bulk insert helpers
(`execute_values` etc.) isn't worth the added complexity yet. Worth
revisiting if the project ever pulls a full season instead of one race.

**Structured logging via a shared `logger.py`, not per-file `getLogger()` calls.**
All four files import the same `logger` instance from `logger.py`. That
means format, level, and handler configuration live in exactly one place —
changing the log format or adding a file handler later is a one-line edit,
not a hunt across every module. Log levels follow standard conventions:
`INFO` for the happy path (run started, laps upserted), `WARNING` for
recoverable surprises (malformed date in API response), `DEBUG` for
internal plumbing that's useful when debugging but noise otherwise (retry
delays, individual DB upsert confirmations).

**Managed Postgres (Neon) instead of local Docker Compose, for Part 5.**
GitHub Actions runners are ephemeral cloud VMs with no route to a home
network — a scheduled cloud job can't reach a Postgres container running
on a local machine. Neon was chosen over Supabase and Railway: it's plain
Postgres with no bundled auth/storage this project doesn't need, and its
scale-to-zero free tier fits a job that only writes twice a week — no
idle-pause risk like Supabase's weekly timeout, no always-on billing like
Railway's default. Free tier limits (500 MB storage, 100 CU-hrs/month)
leave comfortable headroom even scaled up to a full 22-driver grid.

**Twice-weekly schedule (Monday + Thursday), not once.**
Monday is the primary run — a race weekend wraps by Sunday, so that's when
new completed-race data is actually available. Thursday is redundancy: with
idempotent upserts, re-running against an already-fetched race is a no-op,
so it costs nothing and catches a silently failed Monday run before the
next race weekend.

**Data model expanded beyond laps, ahead of Part 6.**
`stints` (tire compound/age), `pit` (stop duration/lap), `weather`
(track/air temp, humidity, rainfall), `positions` (lap-by-lap position
changes), and `race_control` (flags, safety car, penalties) were added to
the schema before frontend work starts — these produce genuinely different
chart types (tire strategy strips, position line charts, pit stop
comparisons) instead of just more rows in a lap-time table. `car_data` and
`location` (high-frequency telemetry, many samples per second) are
explicitly excluded — orders of magnitude more volume than everything else
combined, and not needed at race-weekend granularity.

**`race_control` is insert-only, not upserted.**
Unlike a lap time, a race control message is an append-only event — it
never gets corrected after the fact, so there's no "same row, updated" case
the way there is for laps or stints. Simpler to insert without an
`ON CONFLICT` clause and rely on a higher-level check than to force a
synthetic key onto data that doesn't need one. The check is
`race_control_already_fetched()` in `backend/pipeline/store.py`: `main()` calls it before
fetching and skips the endpoint entirely if the session's messages are
already in the table — otherwise the Thursday redundancy run would
duplicate every row.

**Red-flag outliers are blanked from charts, never from data (Part 6).**
A red-flag stoppage records one absurd "lap" (30+ minutes at Monaco) and one
absurd "pit stop" (the car sitting out the stoppage), and a single such value
flattens every real lap against the axis. The lap chart drops anything over
1.5× the median (tightened from an initial 3× — ordinary SC/red-flag crawl
laps at ~1.6×+ race pace were still squashing the real pace battle into a
sliver; pit in/out laps sit around 1.2–1.35× so they survive the cut) and
the pit stop chart drops stops over 180s, so the actual racing story stays
readable — but only in the chart layer: the values remain untouched in the
database, the API response, and each chart's table view, and the chart
subtitle says when something was left off.

**4-team pair model instead of a fixed Hamilton/Leclerc comparison.**
The pipeline expanded to track every driver across four teams (Ferrari,
Mercedes, McLaren, Red Bull) instead of two hardcoded drivers, and the
frontend gained a team switcher so any two drivers on a tracked team can be
compared head-to-head. Each team's accent and driver-slot colors are run
through a contrast validator rather than picked by eye, so a colorblind-
readability regression fails loudly instead of shipping unnoticed — the one
known ambiguity found this way (Ferrari's giallo accent vs. McLaren's papaya,
too close for deuteranopia) is tracked deliberately rather than silently
accepted.

**Countdown falls back to a disk-persisted cache, not just an in-process one.**
`/api/next-race` is the one documented exception to "the API never calls
OpenF1 itself" — the `races` table only ever has completed sessions, so
finding the *next* one means a live call. OpenF1's free tier blocks *all*
unauthenticated requests while any session anywhere is live, which would
otherwise blank the countdown for an entire race weekend. The last good
payload is persisted to disk, not just kept in memory, so a process restart
mid-lockout (a redeploy, `--reload` picking up a save) still has a fallback
to serve instead of `null`.

**Backdrop-filter over anything animated forces a permanent re-blur — never animate under glass.**
The redesign's first real performance bug came from this: the page
background ("aurora") originally used three `filter: blur(110px)` blobs on
infinite drift keyframes, sitting under roughly a dozen `backdrop-filter`
glass surfaces. Anything animating beneath a backdrop-filter surface forces
it to recompute the blur every frame, forever — regardless of how cheap the
animation itself is. Fixed by making the aurora a static layer: solid themed
fills shaped by a `mask-image` radial gradient instead of `filter: blur()`,
so only the 250ms retint crossfade animates. The same root cause resurfaced
later, scoped to Race Analysis's chart cards specifically — see the
scroll-jank entry below.

**Custom accessible listbox instead of the native `<select>`.**
The native dropdown's popup styling is controlled by the OS/browser, not
CSS — it rendered a white menu in dark mode despite the page correctly
setting `color-scheme`. Replaced with a WAI-ARIA listbox component
(`GlassSelect.tsx`): trigger `aria-expanded`, `aria-activedescendant`,
arrow-key navigation that skips disabled options, and close on
`Escape`/`Tab`/outside-click — while still rendering as part of the same
glass design system as everything else on the page.

**Route-scoped code-splitting via `React.lazy`, not `vite.config.ts` manual chunks.**
The dashboard's three views each pull in different heavy dependencies — `three.js` /
`react-three-fiber` / `drei` for the Overview hero, `recharts` for the six Race Analysis
charts — but every component was a static import, so all three shipped in one bundle
regardless of which view a visitor landed on. Wrapping the already-existing
`view === "..."` conditionals in `React.lazy()` + `Suspense` splits each cluster into
its own chunk automatically (confirmed via `npm run build`: a ~905KB three.js/r3f/drei
chunk and separate recharts chunks, apart from the ~355KB main bundle) — no
`manualChunks` config needed, since Vite already splits on `import()` boundaries.

**Cache-Control + gzip on backend responses, only where data is provably immutable.**
Every `/api/races/{session_key}/...` endpoint serves data the fetch pipeline already
backfilled — it never changes once written. `GZipMiddleware` plus a
`Cache-Control: public, max-age=3600` header were added to those six endpoints, but
deliberately not to `/health` or `/api/next-race`, which are live/uncached by design.

**Race Analysis scroll jank root-caused to `backdrop-filter`, not JS.**
The page stacks 6-7 frosted `.glass` chart cards; scrolling re-blurs whatever's moving
underneath each one, every frame. Measured with a `requestAnimationFrame`-delta +
`PerformanceObserver('longtask')` harness before touching anything: 18 frames over 33ms
per fast-scroll pass and zero main-thread long tasks, confirming pure GPU compositor
cost, not a JS bottleneck — then confirmed the cause via A/B (backdrop-filter stripped
with injected CSS), which dropped the stutter to zero. Fix: Race Analysis's `ChartCard`s
use a solid, non-blurred fill (`card--solid`) instead of the shared `.glass` recipe —
same border/shadow language, no `backdrop-filter` — while the sidebar and Overview keep
the full frosted treatment.

**Jolpica F1 (Ergast-schema) added alongside OpenF1, not instead of it.**
OpenF1 has no concept of season schedules, standings, or historical
results — it's a live/session-timing API. Race Weekend and Standings need
exactly those concepts, so `race_weekend.py` calls the free
[Jolpica F1 API](https://github.com/jolpica/jolpica-f1) directly, deliberately
independent of `next_race.py`/OpenF1: it finds "the next race" itself by
scanning the season schedule for the soonest date >= now, rather than
depending on OpenF1 being reachable or trusting an undocumented Ergast
round-selector keyword. Unlike OpenF1, an empty Jolpica result is a `200`
with an empty array, never a `404` — so `jolpica_client.py` has no
"no results" special case, only real transport/server errors.

**Three different cache shapes for three different kinds of Jolpica data.**
All three follow the same disk-persisted, never-5xx pattern as
`/api/next-race`'s countdown cache, but the TTL differs by how often the
underlying data can actually change: `/api/race-weekend` and `/api/standings`
get a 6-hour TTL (schedule/circuit/standings move at most weekly);
`/api/races/{session_key}/official-result` gets no TTL at all, because a
finished race's result is immutable forever and re-fetching it on a timer
would just be wasted requests against the rate limit.

**Circuit card serves hand-curated facts, not a map or image.**
`CircuitImage.tsx` originally rendered a lat/long pin map, then a plain
placeholder frame once that was dropped — neither gave a visitor anything
circuit-specific to look at, since Jolpica doesn't provide circuit imagery.
Replaced by `CircuitCard.tsx`, backed by `backend/shared/circuit_facts.json`
(length, turns, lap count, lap record, one fun-fact line) keyed by the same
Ergast `circuitId` the schedule payload already carries. A circuit missing
from the file arrives as `facts: null` and the card degrades to name/
location/last-year-winner — cosmetic, not breaking.

**One atomic per-race snapshot feeds both the telemetry insight sentence and the stat tiles.**
`lib/raceStory.ts` computes fastest lap/laps completed/pit stops/avg gap
once per race, and `Telemetry.tsx` only commits a new snapshot once every
fetch it depends on has settled *and* agrees with the currently selected
race (checked via each row's own `session_key`). Without that guard, a race
switch could show the new race's label over the previous race's numbers for
one render — or one stat tile updating a beat ahead of another.

**Per-client rate limiting lives in the API process, not in front of it.**
A sliding-window limiter (120 req/min per client, `/health` exempt) runs as
FastAPI middleware — a single uvicorn process serves everything at this
scale, so process-local state is the whole truth, and no Redis/external
dependency is warranted. It protects free-tier Render/Neon capacity on the
bulk endpoints *and* the OpenF1/Jolpica upstreams on cache-miss paths
(without a cap, a request flood while a cache is cold would amplify against
them). The ceiling is deliberately generous — a page load fires ~12 calls
and a race switch ~7 more, so only scripted hammering trips it. It's
registered *before* the CORS middleware, which makes CORS the outer layer:
a 429 still passes through CORSMiddleware on the way out, so the browser
lets the frontend read the status instead of an opaque CORS failure.

**Light mode separates by value step, edge and contact shadow — not by emitted
light.**
Light had been built on dark's grammar. Dark separates surfaces by *emitted
light*: a glow, a bright hairline, blobs of atmosphere. White has no headroom
above it, so every one of those degrades — the glow becomes a smudge, the
hairline a whisper, and the aurora a salmon stain that got clipped along section
boundaries into a visible seam. Light now separates by **value step + edge weight
+ contact shadow**, and the three are sized as a composite rather than any one
carrying it. Concretely: the page dropped `#e6e5e2` → `#dedcd9` to open room
under the cards; four near-identical fills collapsed to three visible tiers;
`shadowCard`/`shadowRaised` each gained a tight contact layer ahead of the
ambient one (on a pale ground the contact shadow does nearly all the perceptual
work, and bundling it into the same token means the consumers that drop or
re-declare `--shadow-card` inherit it for free); hairlines were promoted; and
`spec` — a white specular top edge measuring **1.01–1.05:1** on a near-white
card — was retired to transparent. Dark keeps `spec` at 0.14, where it renders
1.53:1 and genuinely reads. The blobs are off in light, replaced by a vertical
wash painted by the same *fixed* `.aurora` layer, which is why the seam cannot
come back: nothing clips it, so there is no boundary to reveal.

**The accent is split by job, because one value was doing five.**
A single full-chroma hex served as fill, border, glow, text and icon. On black a
saturated red is the brightest thing in frame and reads as energy; on white it is
the darkest, most saturated thing and reads as *urgency*. So `accent` is now the
**fill** — the lighter, more chromatic step for small solid areas — and
`accentInk` is the deeper, less chromatic step for text and icons. Ferrari's red
comes down in lightness *and* chroma together (L .563→.512, C .229→.204); moving
only one of the two keeps it reading as an alert. Ferrari and Red Bull previously
collapsed both roles onto one hex and no longer do. Teams whose `onAccent` is
dark ink (Mercedes, McLaren, neutral) keep a bright fill — deepening it would
break the dark-on-accent direction — so only their ink moves. Driver/series
colours are untouched throughout: accent is a UI identity, never a data identity.

**The glow tier is gone in light, and each use was replaced rather than dimmed.**
Glow is additive, so on white it can only render as a tint spreading outward —
read as blur or bleed — and running it hotter just enlarges the smudge. Because
the app has *no* CSS mode branches (every per-mode difference is a token on
`.app-shell`), the whole tier switches off by setting the ring and blur
percentages to `0%`: `color-mix` at 0% is fully transparent, so all three glow
consumers need no CSS branch at all. The work moved to a heavier border plus a
tinted fill mixed **into** the existing fill rather than layered over it — one
translucency instead of two stacked, and at 0% the mix resolves to exactly the
original fill, leaving dark untouched. The active chip, the insight card, the
swatch halo and the countdown's outer bloom all went through this.

**Hero3D's pace ramp is compressed in light, never flattened — it is data.**
The wide faint duplicate under the crisp lap trace encodes pace on *opacity*
(faster laps glow more), so a constant would delete information. The 3:1 check
the original code documents as having "failed for real" failed again: at the old
0.07–0.22 ramp the glow dragged **three** drivers' crisp lines below the floor
against their own glow-brightened surround (ferrari0 3.78→2.62, mercedes1
3.61→2.78, redbull1 3.20→2.47). Light now runs 0.03–0.13 at `lineWidth` 5 — only
redbull1 still dips, and it starts from just 3.20 bare. The floor dropped
alongside the ceiling so the fast-vs-slow ramp stays perceptible (ΔE 2.8), and
width came down because width and opacity both feed the smudge while only one is
doing encoding work. Dark keeps 0.07–0.22 at width 7.

**The countdown commits to its inversion; its overrides split by what the token
describes.**
It reads as unthemed in light not because it lacks a theme but because pinning
dark wholesale also pins dark's *page-relative* values onto a light page. Three
compounding causes: its `--glass-opaque` fill at 0.85 let the light page bleed
through and flattened it to ≈`#38383a`, a muddy mid-charcoal; its accent ring
resolved to dark's 30% scaled ×0.4–0.85, landing at **1.49:1** against the card's
own fill; and its shadow was a black-on-black one tuned for a near-black page. So
the override set is split by **what the token describes** — tokens describing the
card's *own dark surface* (ink ramp, fills, accent) come from dark, and tokens
describing its *relationship to the page beneath it* (elevation, outer bloom,
accent edge weight) come from the active mode. The accent edge is a static border
rather than part of the breathing ring, because the keyframes scale by ×0.4 at
the trough and even a 100% token would go invisible for half of every cycle.

**One floor governs driver-colour separation: ΔE 8. Twelve is a target, not a
second floor.**
Three numbers were in play across `theme.ts`'s header and the dataviz method it
was validated against — 6, 8 and 12 — with nothing saying which governed what.
The settled rule: **ΔE 8** (OKLab ×100, worst of protan/deutan) is the only
*floor*. It is what `CVD_COLLISIONS` has always used as its inclusion criterion,
and it matches the dataviz categorical CVD target. **12** is a *target* applying
to exactly one case — a team's own two drivers, the pair the default view shows.
That pair has no remedy available (a team's drivers must wear their team's two
slot colours), so 8–12 reports WARN and leans on the secondary encoding every
chart carries: legend, acronym end-labels, tooltip, and table. Cross-team
head-to-head pairs get *no* relief band, because they do have a remedy — below 8
the pair belongs in `CVD_COLLISIONS`, which routes it through the documented
slot-swap. **6 is retired from this project's vocabulary**; it was the dataviz
absolute floor and this project holds a stricter line.

**The theme validator declares its accepted exceptions instead of remembering
them.**
`frontend/scripts/validate-theme.ts` carries an `ACCEPTED` table keyed
`<group>|<check>`, each entry holding the measured value at the time of
acceptance and the reason. A listed FAIL reports WARN and doesn't fail the run.
The reason it's a table rather than a relaxed threshold: an exception encoded as
a loosened floor silently forgives the *next* regression too, and an exception
that lives only in someone's memory gets re-broken. Entries that stop firing are
reported as **stale**, so a fixed exception gets deleted rather than quietly
outliving the problem it excused.

_Currently accepted:_ `dark · inkMuted on chip` at 4.42:1 — `--glass2` over the
dark page leaves inkMuted too little to work with. Pre-existing, and the dark
palette was frozen for the light-mode pass. **Known outstanding work.**

**Contrast floors are scoped to the consumer, not to the token.**
`--accent-ink` renders in seven places at three different floors. The hero's
`.rotating-word` is `clamp(2.2rem, …, 3.75rem)` at display weight, so it earns
the 3:1 large-text floor; a `:focus-visible` outline is a graphical object at
3:1; the 12px eyebrows take the full 4.5:1. Writing that as "accentInk on page ≥
3:1" would be true today and wrong the moment someone adds small text on the
page — it would inherit an allowance it doesn't qualify for. So the validator
enumerates the consumers by selector and attaches a floor to each: the floor is
a property of the rendered text, decided where the text is specified.

**The `[data-band]` veil darkens in light and lightens in dark, on purpose.**
It paints `--surface`, which in light is near-white — so it *lifted* alternate
sections toward the card colour and shrank the page-to-card step on half the
page, working directly against the thing the light stack separates by. Light now
paints a slight darkening wash instead, which keeps the same section rhythm dark
has *and* helps elevation: band-b's page-to-card step is 0.108 ΔL against
band-a's 0.090. The cost is that band-b becomes the darkest ground on the page,
so `inkMuted` is solved against the veiled band rather than the bare page. It's
stored as one complete `rgba()` per mode rather than a `color-mix` off
`--surface`, which is both simpler than what it replaced and the only way the
two modes can run in opposite directions.

**A design review's finding was a misread, and is recorded rather than dropped.**
The review that drove this work called for removing a halo on the chart lines and
replacing it with plate-coloured casing strokes. No such halo existed: all five
recharts charts draw a single flat `strokeWidth={2}` line — no `<defs>`, no
filters, no duplicated wide stroke — and `activeDot` already carried a 2px
`stroke={theme.surface}` separation ring. The review worked from screenshots and
had identified **`Hero3D.tsx`'s lap trace** as a chart line. The fix landed there
instead (see the pace-ramp entry above) and the charts were left alone. Logged
because a silently-dropped review item looks identical to an overlooked one.

## Known data quirks (not bugs)

- **Empty result sets arrive as 404, and entire races can be missing.**
  OpenF1 returns `404 {"detail": "No results found."}` instead of `200 []`
  when a query matches nothing. `request_with_retry` recognizes exactly that
  response and returns an empty list, so "no data" flows through the pipeline
  as zero rows instead of an exception (any other 404 still raises). And the
  gap can be total: the 2026 Bahrain GP (session_key 11261) has a driver
  roster on OpenF1 but no laps, stints, pit, weather, positions, or race
  control data at all — discovered when it aborted the first season backfill.
- Lap counts can legitimately differ between drivers in the same session — a
  DNF, retirement, or red flag means fewer laps for one driver. This needs
  intentional handling downstream (e.g. when comparing two drivers), not a
  fix to the fetch logic itself.
- **Global live-session lockout (free tier).** While _any_ F1 session is
  live — from ~30 min before it starts to ~30 min after it ends — OpenF1
  blocks **all** unauthenticated requests, not just requests for that
  session's data. A `/sessions` query asking only for fully historical
  races still gets a 401 if some unrelated session elsewhere on the
  calendar happens to be live at request time. Filtering by `date_end < now`
  in the query params doesn't avoid this — the lockout is enforced before
  any server-side filtering happens. On the free tier, there's no
  workaround; you wait for the live window to close. Confirmed live during
  the 2026 Austrian GP (June 28).
