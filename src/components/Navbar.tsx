import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import clanLogo from "@/assets/clan-logo.png";

const navItems = [
  { label: "Home", href: "#hero" },
  { label: "About Us", href: "#about" },
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#video" },
  { label: "Changelog", href: "#changelog" },
  { label: "Download", href: "#download" },
];

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5 }}
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/90 backdrop-blur-md border-b border-border shadow-lg"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 flex items-center justify-between h-16">
        <a href="#hero" className="flex items-center gap-2">
          <img src={clanLogo} alt="420 Clan Logo" className="w-10 h-10 rounded-full" />
          <span className="font-display text-lg font-bold gradient-neon-text hidden sm:block">
            420 CLAN
          </span>
        </a>
        <div className="hidden md:flex items-center gap-6">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="font-body text-sm font-medium hover:text-primary transition-colors duration-200 uppercase tracking-wider"
            >
              {item.label}
            </a>
          ))}
        </div>
        <a
          href="#download"
          className="bg-primary/20 border border-primary/50 text-primary font-display text-xs font-bold px-4 py-2 rounded-md hover:bg-primary/30 neon-border-blue transition-all duration-200 uppercase tracking-wider"
        >
          Download
        </a>
      </div>
    </motion.nav>
  );
};

export default Navbar;
