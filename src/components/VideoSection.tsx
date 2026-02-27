import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const VideoSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="video" className="py-24 relative smoke-overlay">
      <div className="container mx-auto px-4" ref={ref}>
        <motion.h2
          className="font-display text-3xl sm:text-4xl font-bold uppercase mb-4 text-center neon-text-blue text-primary"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          Showcase
        </motion.h2>
        <motion.p
          className="text-muted-foreground text-center mb-10 max-w-lg mx-auto"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.2, duration: 0.5 }}
        >
          Check out a preview of our textures in action.
        </motion.p>
        <motion.div
          className="max-w-4xl mx-auto rounded-xl overflow-hidden border border-border neon-border-blue"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={isInView ? { opacity: 1, scale: 1 } : {}}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src="https://www.youtube.com/embed/9uN9U3PjRVk"
              title="420 Clan Showcase"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default VideoSection;