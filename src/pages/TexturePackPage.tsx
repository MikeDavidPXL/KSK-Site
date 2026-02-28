// KSK Main Page — Tactical Military Theme
// Completely rebuilt UI: no neon, no glow, clean structured layout
import { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  Crosshair,
  Car,
  Zap,
  RefreshCw,
  Tag,
  Shield,
  Loader2,
  LogOut,
  Users,
  Menu,
  X,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";
import { buildDiscordAvatarUrl } from "@/lib/discord";

// ── Types ─────────────────────────────────────────────────
interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
  fileSize?: string;
}

const features = [
  { icon: Crosshair, title: "Weapon Skins", description: "Exclusive weapon textures for all weapons in CosmicV." },
  { icon: Car, title: "Vehicle Liveries", description: "Custom vehicle liveries — still a work in progress." },
  { icon: Zap, title: "Performance Friendly", description: "Optimized for minimal FPS impact with high-quality textures." },
  { icon: RefreshCw, title: "Regular Updates", description: "New content and improvements delivered regularly." },
];

// ── Staff members configuration ─────────────────────────────
type StaffMember = {
  discord_id: string;
  display_name: string;
  staff_role: "Owner" | "Web Developer" | "Admin";
  staff_role_rank: number;
  avatar_hash: string | null;
  avatar_url: string;
};
const roleOrder: StaffMember["staff_role"][] = ["Owner", "Web Developer", "Admin"];

// ── Nav items ───────────────────────────────────────────────
// "Home" scrolls to top of page (hero visible)
const navItems = [
  { label: "Home", href: "#hero" },
  { label: "About", href: "#about" },
  { label: "Features", href: "#features" },
  { label: "Showcase", href: "#video" },
  { label: "Changelog", href: "#changelog" },
  { label: "Staff", href: "#staff" },
];

const POLL_INTERVAL = 10_000;

// ══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════
const TexturePackPage = () => {
  const { user, loading } = useAuth();
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [changelogExpanded, setChangelogExpanded] = useState(false);

  useEffect(() => {
    fetch("/changelog.json")
      .then((res) => res.json())
      .then((data: ChangelogEntry[]) => setChangelog(data))
      .catch(console.error);
  }, []);

  // ── Pending count polling (staff only) ──────────────────
  const fetchPendingCount = useCallback(async () => {
    try {
      const res = await fetch("/.netlify/functions/admin-pending-count");
      if (res.ok) {
        const data = await res.json();
        setPendingCount(data.pending ?? 0);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!user?.is_staff) return;
    fetchPendingCount();
    const id = setInterval(fetchPendingCount, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [user, fetchPendingCount]);

  useEffect(() => {
    const loadStaffProfiles = async () => {
      try {
        const res = await fetch("/.netlify/functions/staff-list", {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { staff?: StaffMember[] };
        if (!Array.isArray(data.staff)) return;
        setStaffMembers(data.staff);
      } catch {
        // keep empty list
      }
    };
    loadStaffProfiles();
  }, []);

  // Guard: must be logged in + have private or staff role
  if (!loading && (!user || (!user.is_private && !user.is_staff))) {
    return <Navigate to="/verify" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const staffByRole = roleOrder.map((role) => ({
    role,
    members: staffMembers.filter((m) => m.staff_role === role),
  }));
  const latestChangelog = changelog[0];
  const olderChangelog = changelog.slice(1);

  return (
    <div className="min-h-screen bg-background surface-texture">
      {/* ── Navbar ────────────────────────────────────────── */}
      <TacticalNavbar user={user!} pendingCount={pendingCount} />

      {/* ── Hero Section (image only) ────────────────────── */}
      <section id="hero" className="relative h-screen overflow-hidden bg-black">
        <div className="absolute inset-0">
          <img
            src="/ksk_img.jpg"
            alt="KSK"
            className="w-full h-full object-cover scale-105 blur-[2px] opacity-50"
          />
          <div className="absolute inset-0 bg-black/30" />
          <div className="absolute inset-0 flex items-center justify-center p-4 sm:p-8">
            <img
              src="/ksk_img.jpg"
              alt="KSK"
              className="w-full max-w-6xl max-h-[82vh] object-contain"
            />
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-background to-transparent" />
        </div>
      </section>

      {/* ── About Section (with hero content at top) ─────── */}
      <FadeSection id="about" className="py-20 border-t divider-bronze">
        <div className="container mx-auto px-4">
          {/* Hero content moved here */}
          <motion.div
            className="text-center mb-16"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <img
              src="/ksk.png"
              alt="KSK Logo"
              className="h-24 w-auto mx-auto mb-6 border-2 border-primary/30 object-contain"
            />
            <h1 className="font-display text-5xl sm:text-6xl md:text-7xl text-primary tracking-widest mb-4">
              KSK
            </h1>
            <p className="font-sub text-base sm:text-lg text-foreground/80 uppercase tracking-[0.15em] mb-8 max-w-xl mx-auto">
              Kommando Spezialkräfte — CosmicV KOTH
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <a
                href="#features"
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground font-sub font-bold text-sm px-8 py-3.5 rounded hover:bg-primary/85 transition-colors duration-200 uppercase tracking-wider"
              >
                Learn More
              </a>
              <Link
                to="/ban-report"
                className="inline-flex items-center gap-2 border border-destructive/50 text-destructive font-sub font-bold text-sm px-6 py-3.5 rounded hover:bg-destructive/10 transition-colors duration-200 uppercase tracking-wider animate-pulse-subtle"
              >
                <AlertTriangle className="w-4 h-4" />
                Report Ban
              </Link>
            </div>
          </motion.div>

          {/* About text */}
          <div className="max-w-3xl mx-auto text-center mb-14">
            <h2 className="font-display text-3xl sm:text-4xl text-primary tracking-wider mb-6">
              ABOUT US
            </h2>
            <p className="text-base text-muted-foreground leading-relaxed font-body">
              We are <span className="text-primary font-semibold">KSK</span>, a
              community built for lovers of the CosmicV KOTH FiveM server who want to
              take their experience to the next level. Our texture pack made by{" "}
              <span className="text-primary font-semibold">M1K3</span>{" "}
              is designed to fully transform your server experience with high-quality
              custom content, clean weapon skins, and effects that pop to make your
              gameplay look and feel unique.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
            {[
              { number: "50+", label: "Custom Textures" },
              { number: "24/7", label: "Community Support" },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-card border border-border rounded p-6 text-center"
              >
                <div className="font-display text-4xl text-primary mb-1">
                  {stat.number}
                </div>
                <div className="text-muted-foreground text-xs uppercase tracking-[0.15em] font-sub">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeSection>

      {/* ── Features Section ─────────────────────────────── */}
      <FadeSection id="features" className="py-24 bg-olive border-t divider-bronze">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl sm:text-4xl text-primary tracking-wider mb-14 text-center">
            WHAT'S INCLUDED
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-4xl mx-auto">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-background/60 border border-secondary/15 rounded-lg p-7 group hover:border-primary/25 transition-colors duration-200"
              >
                <feature.icon className="w-7 h-7 text-secondary mb-4" />
                <h3 className="font-sub text-base font-bold mb-2 text-foreground uppercase tracking-wide">
                  {feature.title}
                </h3>
                <p className="text-sm text-muted-foreground font-body leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </FadeSection>

      {/* ── Video Section ────────────────────────────────── */}
      <FadeSection id="video" className="py-24 border-t divider-bronze">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl sm:text-4xl text-primary tracking-wider mb-4 text-center">
            SHOWCASE
          </h2>
          <p className="text-muted-foreground text-center mb-12 max-w-lg mx-auto font-body text-sm">
            Check out a preview of our textures in action.
          </p>
          <div className="max-w-4xl mx-auto border border-border/50 rounded-lg overflow-hidden shadow-soft">
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/9uN9U3PjRVk"
                title="KSK Showcase"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </FadeSection>

      {/* ── Changelog Section ────────────────────────────── */}
      <FadeSection id="changelog" className="py-20 bg-olive border-t divider-bronze">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl sm:text-4xl text-primary tracking-wider mb-14 text-center">
            CHANGELOG
          </h2>
          <div className="max-w-3xl mx-auto space-y-4">
            {latestChangelog && (
              <div className="relative pt-4">
                {/* Stacked card effect behind latest */}
                {!changelogExpanded && olderChangelog.slice(0, 2).map((_, i) => (
                  <div
                    key={`stack-${i}`}
                    className="absolute left-0 right-0 bg-background/50 border border-border/50 rounded-lg"
                    style={{
                      top: `${(i + 1) * 6}px`,
                      transform: `scale(${1 - (i + 1) * 0.01})`,
                      zIndex: 1 - i,
                    }}
                    aria-hidden="true"
                  >
                    <div className="h-16" />
                  </div>
                ))}

                <button
                  type="button"
                  onClick={() => setChangelogExpanded((prev) => !prev)}
                  className="relative z-10 w-full text-left bg-background/70 border border-border/50 rounded-lg p-6 hover:border-primary/30 transition-colors duration-200"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <Tag className="w-4 h-4 text-secondary" />
                        <span className="font-sub text-sm font-bold text-secondary uppercase tracking-wide">
                          v{latestChangelog.version}
                        </span>
                        <span className="text-muted-foreground text-xs font-body">{latestChangelog.date}</span>
                      </div>
                      <h3 className="font-sub text-lg font-bold mb-3 text-foreground">{latestChangelog.title}</h3>
                      <ul className="space-y-1">
                        {latestChangelog.changes.map((change, i) => (
                          <li key={i} className="text-muted-foreground text-sm flex items-start gap-2 font-body">
                            <span className="text-primary flex-shrink-0 leading-[1.25rem]">—</span>
                            {change}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {olderChangelog.length > 0 && (
                      <div className="shrink-0 flex items-center gap-1 text-xs text-secondary font-sub font-bold mt-0.5 uppercase tracking-wide">
                        <span>{changelogExpanded ? "Hide" : `${olderChangelog.length} older`}</span>
                        <ChevronDown
                          className={`w-4 h-4 transition-transform duration-200 ${
                            changelogExpanded ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </button>
              </div>
            )}

            <AnimatePresence initial={false}>
              {changelogExpanded && olderChangelog.length > 0 && (
                <motion.div
                  key="older-changelog"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="overflow-hidden"
                >
                  <div className="space-y-4 pt-2">
                    {olderChangelog.map((entry) => (
                      <div
                        key={entry.version}
                        className="bg-background/70 border border-border/50 rounded-lg p-6 hover:border-primary/30 transition-colors duration-200"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <Tag className="w-4 h-4 text-secondary" />
                          <span className="font-sub text-sm font-bold text-secondary uppercase tracking-wide">
                            v{entry.version}
                          </span>
                          <span className="text-muted-foreground text-xs font-body">{entry.date}</span>
                        </div>
                        <h3 className="font-sub text-lg font-bold mb-3 text-foreground">{entry.title}</h3>
                        <ul className="space-y-1">
                          {entry.changes.map((change, j) => (
                            <li key={j} className="text-muted-foreground text-sm flex items-start gap-2 font-body">
                              <span className="text-primary flex-shrink-0 leading-[1.25rem]">—</span>
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </FadeSection>

      {/* ── Staff Section ────────────────────────────────── */}
      <FadeSection id="staff" className="py-24 border-t divider-bronze">
        <div className="container mx-auto px-4">
          <h2 className="font-display text-3xl sm:text-4xl text-primary tracking-wider mb-14 text-center">
            STAFF TEAM
          </h2>
          <div className="max-w-4xl mx-auto space-y-12">
            {staffByRole.map((group) => (
              <div key={group.role}>
                <h3 className="font-sub text-base font-bold uppercase tracking-[0.15em] mb-6 text-center text-secondary">
                  {group.role}
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 max-w-lg mx-auto">
                  {group.members.map((member) => (
                    <div
                      key={member.discord_id}
                      className={`bg-card border border-border/50 rounded-lg p-6 text-center hover:border-primary/30 transition-colors duration-200 ${
                        group.role === "Web Developer" && group.members.length === 1
                          ? "sm:col-span-2 sm:max-w-[280px] sm:mx-auto"
                          : ""
                      }`}
                    >
                      <div className="w-16 h-16 mx-auto mb-4 bg-muted border border-border/50 rounded-lg flex items-center justify-center overflow-hidden">
                        <img
                          src={member.avatar_url || buildDiscordAvatarUrl(member.discord_id, member.avatar_hash)}
                          alt={member.display_name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                            const parent = e.currentTarget.parentElement;
                            if (parent && !parent.querySelector(".fallback-icon")) {
                              const icon = document.createElement("div");
                              icon.className = "fallback-icon flex items-center justify-center";
                              icon.innerHTML = '<svg class="w-8 h-8 text-muted-foreground" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                              parent.appendChild(icon);
                            }
                          }}
                        />
                      </div>
                      <h4 className={`font-sub text-base font-bold mb-2 ${
                        member.display_name === "M1K3" ? "text-primary" : "text-foreground"
                      }`}>
                        {member.display_name}
                      </h4>
                      <span className="inline-block px-3 py-1 bg-secondary/10 border border-secondary/20 rounded text-xs font-sub font-bold text-secondary uppercase tracking-wider">
                        {member.staff_role}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </FadeSection>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t divider-bronze py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <img src="/ksk.png" alt="KSK" className="h-5 w-auto object-contain" />
              <span className="font-sub text-xs font-bold text-muted-foreground uppercase tracking-[0.15em]">
                KSK © 2026
              </span>
            </div>
            <p className="text-muted-foreground text-xs font-body">
              Not affiliated with Rockstar Games or FiveM.
            </p>
          </div>
          <div className="text-center space-y-1">
            <p className="text-muted-foreground text-xs font-body">
              Pack made by <span className="text-primary font-semibold">Mike</span>
            </p>
            <p className="text-muted-foreground text-xs font-body">
              For any questions send a DM on Discord: <span className="text-primary font-mono">m1k3_1206</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
//  TACTICAL NAVBAR
// ══════════════════════════════════════════════════════════
function TacticalNavbar({
  user,
  pendingCount = 0,
}: {
  user: {
    avatar: string | null;
    username: string;
    is_staff: boolean;
    staff_tier?: "owner" | "webdev" | "admin" | null;
  };
  pendingCount?: number;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("#hero");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [staffMenuOpen, setStaffMenuOpen] = useState(false);
  const staffMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => {
      // Navbar becomes solid after scrolling past hero (1 viewport height)
      const heroHeight = window.innerHeight;
      setScrolled(window.scrollY > heroHeight - 100);
      
      const scrollPosition = window.scrollY + 120;
      let current = "#hero";
      for (const item of navItems) {
        if (!item.href.startsWith("#")) continue;
        const el = document.querySelector(item.href) as HTMLElement | null;
        if (el && scrollPosition >= el.offsetTop) current = item.href;
      }
      setActiveSection(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  useEffect(() => {
    if (!staffMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (staffMenuRef.current && !staffMenuRef.current.contains(e.target as Node)) {
        setStaffMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [staffMenuOpen]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
        scrolled
          ? "bg-background border-b border-border"
          : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 h-14">
        <div className="h-full max-w-6xl mx-auto grid grid-cols-[1fr_auto_1fr] items-center">
          {/* Left: Logo */}
          <a href="#hero" className="flex items-center gap-2 justify-self-start">
            <img src="/ksk.png" alt="KSK" className="h-8 w-auto object-contain" />
            <span className="font-display text-xl text-primary tracking-widest hidden sm:block">
              KSK
            </span>
          </a>

          {/* Center: Nav links (desktop) */}
          <div className="hidden md:flex items-center gap-5 justify-self-center">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`nav-underline font-sub text-xs font-bold uppercase tracking-[0.15em] transition-colors duration-200 ${
                  activeSection === item.href ? "text-primary active" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>

          {/* Right: User + actions */}
          <div className="flex items-center gap-3 justify-self-end">
          <div className="flex items-center gap-2">
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-7 h-7 border border-border" />
            )}
            <span className="text-xs text-muted-foreground font-body hidden sm:block">{user.username}</span>
          </div>

          {/* Staff dropdown */}
          {user.is_staff && (
            <div className="relative" ref={staffMenuRef}>
              <button
                type="button"
                onClick={() => setStaffMenuOpen((o) => !o)}
                className="relative inline-flex h-7 w-7 items-center justify-center text-secondary hover:text-primary transition-colors"
                aria-label="Admin tools"
              >
                <Shield className="w-4 h-4" />
                {pendingCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-destructive text-white text-[9px] font-bold min-w-[14px] h-[14px] flex items-center justify-center px-0.5">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
              {staffMenuOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card border border-border/70 rounded-lg shadow-soft overflow-hidden z-50">
                  <div className="px-4 py-2 text-[10px] uppercase tracking-wider text-muted-foreground bg-muted/50 font-sub">
                    {user.staff_tier === "owner" ? "Owner" : user.staff_tier === "webdev" ? "Web Dev" : "Staff"}
                  </div>
                  <div className="py-1">
                    <Link
                      to="/admin"
                      onClick={() => setStaffMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-sub font-medium text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Shield className="w-4 h-4 text-secondary" />
                      Admin Panel
                      {pendingCount > 0 && (
                        <span className="ml-auto bg-destructive text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center px-1 rounded">
                          {pendingCount > 99 ? "99+" : pendingCount}
                        </span>
                      )}
                    </Link>
                    <Link
                      to="/clan-list"
                      onClick={() => setStaffMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm font-sub font-medium text-foreground hover:bg-muted/60 transition-colors"
                    >
                      <Users className="w-4 h-4 text-secondary" />
                      Clan List
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          <a
            href="/.netlify/functions/logout"
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </a>

          {/* Mobile hamburger */}
          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          </div>
        </div>
      </div>

      {/* Mobile nav */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="px-4 py-3 flex flex-col gap-2">
            {navItems.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`font-sub text-sm font-bold uppercase tracking-[0.1em] py-1 transition-colors duration-200 ${
                  activeSection === item.href ? "text-primary" : "text-foreground"
                }`}
              >
                {item.label}
              </a>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}

// ══════════════════════════════════════════════════════════
//  FADE-IN SECTION WRAPPER
// ══════════════════════════════════════════════════════════
function FadeSection({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <section
      id={id}
      className={className}
      ref={ref}
    >
      <div
        className={`transition-all duration-500 ease-out ${
          isInView ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
        }`}
      >
        {children}
      </div>
    </section>
  );
}

export default TexturePackPage;
