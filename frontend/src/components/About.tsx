import { motion } from "framer-motion";
import { entrance, staggerContainer, staggerItem } from "../motion";
import { TEAM_NAMES, TEAM_ORDER } from "../teams";
import { TeamMark } from "./TeamMark";

const steps = [
  {
    title: "Fetch",
    body: "A Python pipeline pulls lap-by-lap timing from the OpenF1 API on a weekly GitHub Actions schedule, with request pacing and retry/backoff built in.",
  },
  {
    title: "Store",
    body: "Every run upserts into Neon Postgres. Idempotent by design — re-fetching a race never duplicates a row.",
  },
  {
    title: "Serve",
    body: "A small read-only FastAPI layer serves what the pipeline stored. It never calls OpenF1 itself, so it's immune to rate limits.",
  },
  {
    title: "Visualize",
    body: "This page charts the result — lap times, strategy, track position, weather, and the race control feed.",
  },
];

export function About() {
  return (
    <section id="about" className="about">
      <motion.div
        variants={entrance}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
      >
        <p className="section__eyebrow">About</p>
        <h2 className="section__title">Real data, end to end.</h2>
        <p className="about__body">
          F1 Tracker is a personal skill-building project that follows the
          full 2026 grid — all {TEAM_ORDER.length} constructors — across the
          season. Pick a team to compare its driver pair, or put any two of
          the {TEAM_ORDER.length * 2} tracked drivers head-to-head. Real
          timing data from the OpenF1 API lands in a Postgres database, a
          small API serves it, and this page draws it. No mock data anywhere
          in the stack: every lap, pit stop, and weather reading below
          happened on track.
        </p>
      </motion.div>

      <motion.ol
        className="pipeline"
        variants={staggerContainer()}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
      >
        {steps.map((step, i) => (
          <motion.li
            key={step.title}
            className="pipeline__step glass"
            variants={staggerItem}
          >
            <span className="pipeline__num">{String(i + 1).padStart(2, "0")}</span>
            <h3 className="pipeline__title">{step.title}</h3>
            <p className="pipeline__body">{step.body}</p>
          </motion.li>
        ))}
      </motion.ol>

      <motion.div
        variants={entrance}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
      >
        <ul className="mark-strip">
          {TEAM_ORDER.map((slug) => (
            <li key={slug} className="mark-strip__item">
              <TeamMark slug={slug} />
              {TEAM_NAMES[slug]}
            </li>
          ))}
        </ul>
        <p className="mark-strip__disclaimer">
          F1 Tracker is an unofficial, non-commercial project and is not
          affiliated with, endorsed by, or licensed by Formula 1, the FIA, or
          any of the eleven teams above. Team marks here are typographic
          codes, not team logos.
        </p>
      </motion.div>
    </section>
  );
}
