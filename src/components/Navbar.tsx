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
      <div className="container mx-auto px-4 h-16">
        <div className="h-full max-w-6xl mx-auto grid grid-cols-[1fr_auto_1fr] items-center">
          <a href="#hero" className="flex items-center gap-2 justify-self-start">
            <img src={clanLogo} alt="KSK Logo" className="h-10 w-auto object-contain" />
            <span className="font-display text-lg font-bold gradient-neon-text hidden sm:block">
              KSK
            </span>
          </a>
          <div className="hidden md:flex items-center gap-6 justify-self-center">
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
            className="justify-self-end bg-primary/20 border border-primary/50 text-primary font-display text-xs font-bold px-4 py-2 rounded-md hover:bg-primary/30 neon-border-blue transition-all duration-200 uppercase tracking-wider"
          >
            Download
          </a>
        </div>
      </div>
    </motion.nav>
  );
};

export default Navbar;
