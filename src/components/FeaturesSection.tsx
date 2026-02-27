import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Shirt, Crosshair, Car, Monitor, Zap, RefreshCw } from "lucide-react";

const features = [
  { icon: Crosshair, title: "Weapon Skins", description: "Exclusive weapon textures for all weapons in CosmicV" },
  { icon: Car, title: "Vehicle Liveries", description: "!!STILL A WIP!!" },
  { icon: Zap, title: "Performance Friendly", description: "Optimized as best i can for minimal FPS impact with the beautiful textures. It will cost some fps." },
  { icon: RefreshCw, title: "Regular Updates", description: "New content and improvements when i got time... This is all still a test." },
];

const FeaturesSection = () => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" className="py-24 relative">
      <div className="container mx-auto px-4" ref={ref}>
        <motion.h2
          className="font-display text-3xl sm:text-4xl font-bold uppercase mb-12 text-center neon-text-purple text-secondary"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
        >
          What's Included?
        </motion.h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="bg-card border border-border rounded-lg p-6 group hover:neon-border-purple transition-all duration-300"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.1 * i, duration: 0.5 }}
            >
              <feature.icon className="w-10 h-10 text-secondary mb-4 group-hover:drop-shadow-[0_0_10px_hsl(270_80%_60%_/_0.6)] transition-all duration-300" />
              <h3 className="font-display text-lg font-bold mb-2 text-foreground">{feature.title}</h3>
              <p
                className={`text-sm ${
                  feature.description.includes("WIP")
                    ? "text-secondary neon-text-purple font-semibold tracking-wider uppercase animate-pulse"
                    : "text-muted-foreground"
                }`}
              >
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeaturesSection;
