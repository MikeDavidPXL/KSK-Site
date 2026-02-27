import { motion } from "framer-motion";
import { LogIn } from "lucide-react";
import clanLogo from "@/assets/clan-logo.png";

const LandingPage = () => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 smoke-overlay pointer-events-none" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary/5 blur-[120px]" />

      <motion.div
        className="relative z-10 flex flex-col items-center text-center px-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7 }}
      >
        {/* Logo */}
        <motion.img
          src={clanLogo}
          alt="420 Clan"
          className="w-32 h-32 mb-8 drop-shadow-2xl"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
        />

        <h1 className="font-display text-4xl sm:text-6xl font-bold uppercase mb-4 gradient-neon-text">
          420 Clan
        </h1>
        <p className="text-muted-foreground text-lg sm:text-xl mb-3 max-w-md">
          CosmicV KOTH Clan
        </p>
        <p className="text-muted-foreground/70 text-sm mb-10 max-w-sm">
          Log in with Discord to apply for the clan and access our exclusive texture pack.
        </p>

        {/* Discord login button */}
        <a
          href="/.netlify/functions/auth-start"
          className="inline-flex items-center gap-3 bg-[#5865F2] hover:bg-[#4752C4] text-white font-display font-bold text-lg px-10 py-4 rounded-xl transition-all duration-300 hover:scale-105 shadow-lg shadow-[#5865F2]/30"
        >
          <LogIn className="w-5 h-5" />
          Login with Discord
        </a>

        <p className="text-muted-foreground/50 text-xs mt-6">
          We only request your Discord identity &amp; server membership.
        </p>
      </motion.div>
    </div>
  );
};

export default LandingPage;
