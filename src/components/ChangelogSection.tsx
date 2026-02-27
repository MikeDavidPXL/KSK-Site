import { AnimatePresence, motion, useInView } from "framer-motion";
import { useRef, useEffect, useState } from "react";
import { ChevronDown, Tag } from "lucide-react";

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
}

const ChangelogSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetch("/changelog.json")
      .then((res) => res.json())
      .then((data) => setEntries(data))
      .catch(console.error);
  }, []);

  const latestEntry = entries[0];
  const olderEntries = entries.slice(1);

  return (
    <section id="changelog" className="py-24 relative">
      <div className="container mx-auto px-4" ref={ref}>
        <motion.h2
          className="font-display text-3xl sm:text-4xl font-bold uppercase mb-12 text-center neon-text-purple text-secondary"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          Changelog
        </motion.h2>
        <div className="max-w-3xl mx-auto space-y-4">
          {latestEntry && (
            <div className="relative pt-5">
              {olderEntries.slice(0, 2).map((entry, i) => (
                <motion.div
                  key={`stack-${entry.version}`}
                  className="absolute left-0 right-0 rounded-lg border border-border bg-card/80"
                  style={{
                    top: `${(i + 1) * 8}px`,
                    transform: `scale(${1 - (i + 1) * 0.015})`,
                    zIndex: 1 - i,
                  }}
                  initial={{ opacity: 0 }}
                  animate={isInView ? { opacity: expanded ? 0 : 1 } : {}}
                  transition={{ delay: 0.08 * i, duration: 0.3 }}
                  aria-hidden="true"
                >
                  <div className="h-20" />
                </motion.div>
              ))}

              <motion.button
                type="button"
                onClick={() => setExpanded((prev) => !prev)}
                className="relative z-10 w-full text-left bg-card border border-border rounded-lg p-6 hover:neon-border-purple transition-all duration-300"
                initial={{ opacity: 0, x: -30 }}
                animate={isInView ? { opacity: 1, x: 0 } : {}}
                transition={{ duration: 0.5 }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 mb-3">
                      <Tag className="w-5 h-5 text-secondary" />
                      <span className="font-display text-sm font-bold text-secondary">
                        v{latestEntry.version}
                      </span>
                      <span className="text-muted-foreground text-xs">{latestEntry.date}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold mb-3 text-foreground">
                      {latestEntry.title}
                    </h3>
                    <ul className="space-y-1.5">
                      {latestEntry.changes.map((change, i) => (
                        <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                          <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
                          {change}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {olderEntries.length > 0 && (
                    <div className="shrink-0 flex items-center gap-1 text-xs text-secondary font-display font-bold mt-0.5">
                      <span>{expanded ? "Hide older" : `${olderEntries.length} older`}</span>
                      <ChevronDown
                        className={`w-4 h-4 transition-transform duration-300 ${
                          expanded ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  )}
                </div>
              </motion.button>
            </div>
          )}

          <AnimatePresence initial={false}>
            {expanded && olderEntries.length > 0 && (
              <motion.div
                key="older-changelog"
                initial={{ opacity: 0, height: 0, y: -8 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -8 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="overflow-hidden"
              >
                <div className="space-y-4 pt-2">
                  {olderEntries.map((entry, i) => (
                    <motion.div
                      key={entry.version}
                      className="bg-card border border-border rounded-lg p-6 hover:neon-border-purple transition-all duration-300"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.05 * i, duration: 0.25 }}
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <Tag className="w-5 h-5 text-secondary" />
                        <span className="font-display text-sm font-bold text-secondary">
                          v{entry.version}
                        </span>
                        <span className="text-muted-foreground text-xs">{entry.date}</span>
                      </div>
                      <h3 className="font-display text-lg font-bold mb-3 text-foreground">
                        {entry.title}
                      </h3>
                      <ul className="space-y-1.5">
                        {entry.changes.map((change, j) => (
                          <li key={j} className="text-muted-foreground text-sm flex items-start gap-2">
                            <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
};

export default ChangelogSection;