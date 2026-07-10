import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { digitRollEnter, digitRollExit, WORD_ROTATE_MS } from "../motion";

interface Props {
  /** Cycled one at a time, in order, looping back to the start. */
  words: string[];
  /** Static text appended after the word, inside .rotating-word so it
   *  inherits the same color instead of falling back to surrounding text. */
  suffix?: string;
}

/** DigitRoll's vertical-roll idea, stretched from a single tabular-width
 *  character to a whole word: the old word slides up and out while the new
 *  one slides in from below. `mode="wait"` (not DigitRoll's `popLayout`)
 *  because word width varies — waiting for the exit to finish before the
 *  next word enters avoids two different-width words overlapping mid-swap. */
export function RotatingWord({ words, suffix }: Props) {
  const [index, setIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    if (reducedMotion || words.length < 2) return;
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setIndex((i) => (i + 1) % words.length);
    }, WORD_ROTATE_MS);
    return () => window.clearInterval(id);
  }, [words.length, reducedMotion]);

  const word = words[index] ?? words[0];

  if (reducedMotion) {
    return (
      <span className="rotating-word">
        {word}
        {suffix}
      </span>
    );
  }

  return (
    <span className="rotating-word">
      <AnimatePresence mode="wait">
        <motion.span
          key={word}
          style={{ display: "inline-block" }}
          initial={{ y: "0.6em", opacity: 0 }}
          animate={{ y: "0em", opacity: 1, transition: digitRollEnter }}
          exit={{ y: "-0.6em", opacity: 0, transition: digitRollExit }}
        >
          {word}
        </motion.span>
      </AnimatePresence>
      {suffix}
    </span>
  );
}
