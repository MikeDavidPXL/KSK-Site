// Pack page — restored old look with full section layout
// Staff sees admin panel link in navbar; private/staff both see this page
import { useEffect, useState, useRef, useCallback } from "react";
import { AnimatePresence, motion, useInView } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  Download,
  FileArchive,
  HardDrive,
  Hash,
  Crosshair,
  Car,
  Zap,
  RefreshCw,
  Tag,
  Shield,
  Loader2,
  LogOut,
  BookOpen,
  Users,
  Menu,
  X,
  AlertTriangle,
  ChevronDown,
  Lock,
} from "lucide-react";
import clanLogo from "@/assets/clan-logo.png";
import heroBanner from "@/assets/420Gif.png";
import { buildDiscordAvatarUrl } from "@/lib/discord";

// ── Types ─────────────────────────────────────────────────
interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  changes: string[];
  fileSize?: string;
}

interface PackConfig {
  version?: string;
  fileSize?: string;
  fileName?: string;
}

const features = [
  { icon: Crosshair, title: "Weapon Skins", description: "Exclusive weapon textures for all weapons in CosmicV" },
  { icon: Car, title: "Vehicle Liveries", description: "!!STILL A WIP!!" },
  { icon: Zap, title: "Performance Friendly", description: "Optimized as best i can for minimal FPS impact with the beautiful textures. It will cost some fps." },
  { icon: RefreshCw, title: "Regular Updates", description: "New content and improvements when i got time... This is all still a test." },
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

// ── Nav items (staff gets Admin Panel link, private/staff get Installation) ──
const getNavItems = (isStaff: boolean) => {
  const items = [
    { label: "Home", href: "#hero" },
    { label: "About Us", href: "#about" },
    { label: "Features", href: "#features" },
    { label: "Showcase", href: "#video" },
    { label: "Changelog", href: "#changelog" },
    { label: "Download", href: "#download" },
    { label: "Installation", href: "/installation", route: true },
  ];
  // Staff-only items are now in the shield dropdown menu
  return items;
};

// ══════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ══════════════════════════════════════════════════════════
// ── Page config ───────────────────────────────────────────
const stickyNavbar = true; // true = navbar always visible, false = navbar hidden until scroll

const POLL_INTERVAL = 10_000; // 10s
const NAV_THRESHOLD = 100; // scroll threshold for navbar reveal (if stickyNavbar = false)
const CONTENT_THRESHOLD = 150; // scroll threshold for main page sections

const TexturePackPage = () => {
  const { user, loading } = useAuth();
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [latestVersion, setLatestVersion] = useState("1.2.1");
  const [fileSize, setFileSize] = useState("601.6 MB");
  const [fileName, setFileName] = useState("420_Clan_TexturePack.rar");
  const [pendingCount, setPendingCount] = useState(0);
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([]);
  const [scrollY, setScrollY] = useState(0);
  const [changelogExpanded, setChangelogExpanded] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const initialHeight = useRef(
    typeof window !== "undefined" ? window.innerHeight : 800
  );

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrollY(window.scrollY);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    fetch("/pack-config.json")
      .then((res) => res.json())
      .then((data: PackConfig) => {
        if (data.version) setLatestVersion(data.version);
        if (data.fileSize) setFileSize(data.fileSize);
        if (data.fileName) setFileName(data.fileName);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch("/changelog.json")
      .then((res) => res.json())
      .then((data: ChangelogEntry[]) => {
        setChangelog(data);
      })
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
    return <Navigate to="/dashboard" replace />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const navItems = getNavItems(user!.is_staff);
  const canDownload = !!(user?.is_corporal_or_higher || user?.is_staff);
  const staffByRole = roleOrder.map((role) => ({
    role,
    members: staffMembers.filter((m) => m.staff_role === role),
  }));
  const latestChangelog = changelog[0];
  const olderChangelog = changelog.slice(1);

  // ── Secure download handler ──────────────────────────
  const handleDownload = async () => {
    setDownloadLoading(true);
    setDownloadError(null);
    try {
      const res = await fetch("/.netlify/functions/pack-download", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        setDownloadError(data.error || "Download failed.");
        return;
      }
      // Open the single-use tokenized URL
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch {
      setDownloadError("Network error. Please try again.");
    } finally {
      setDownloadLoading(false);
    }
  };

  // Hero image fades out over 70% of initial viewport height
  const heroOpacity = Math.max(0, 1 - scrollY / (initialHeight.current * 0.7));
  // Navbar: always visible if stickyNavbar, otherwise appear after NAV_THRESHOLD
  const showNav = stickyNavbar || scrollY > NAV_THRESHOLD;
  // Main page sections appear after CONTENT_THRESHOLD
  const showContent = scrollY > CONTENT_THRESHOLD;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Navbar ────────────────────────────────────────── */}
      <PackNavbar navItems={navItems} user={user!} pendingCount={pendingCount} visible={showNav} />

      {/* ── Hero Section ─────────────────────────────────── */}
      {/* Hero background image only - fully clean at scrollY=0 */}
      <div style={{ opacity: heroOpacity }} className="will-change-[opacity]">
        <section id="hero" className="relative min-h-screen overflow-hidden">
          <div className="absolute inset-0">
            <img src={heroBanner} alt="420 Clan Banner" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-background/30" />
            <div className="absolute inset-0 smoke-overlay" />
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
          </div>
        </section>
      </div>

      {/* ── Content sections - revealed after scroll threshold ── */}
      <div
        className={`transition-all duration-700 ease-out ${
          showContent
            ? "opacity-100 translate-y-0"
            : "opacity-0 translate-y-8"
        }`}
      >

      {/* ── Intro Section (moved from hero overlay) ────────── */}
      <section className="py-20 relative smoke-overlay">
        <div className="container mx-auto px-4 text-center">
          <img
            src={clanLogo}
            alt="420 Clan Logo"
            className="w-28 h-28 mx-auto mb-6 rounded-full neon-box-blue"
          />
          <h1
            className="font-display text-4xl sm:text-5xl md:text-7xl font-black uppercase mb-4 gradient-neon-text"
            style={{ WebkitTextStroke: "2px rgba(0, 0, 0, 0.2)" }}
          >
            420 Clan
          </h1>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-8 font-body text-muted-foreground">
            Come and hangout in the VC or on Cosmic.
            Upgrade your FiveM experience with our exclusive custom textures.
            With Weapons, vehicles, and more - all in one pack.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href="#download"
              className="inline-flex items-center gap-3 bg-primary text-primary-foreground font-display font-bold text-lg px-8 py-4 rounded-lg neon-box-blue hover:scale-105 transition-transform duration-200 uppercase tracking-wider"
            >
              <Download className="w-5 h-5" />
              Download modpack
            </a>
            <Link
              to="/ban-report"
              className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-display font-bold text-base px-6 py-3 rounded-lg hover:scale-105 transition-all duration-200 uppercase tracking-wider animate-pulse-subtle"
            >
              <AlertTriangle className="w-4 h-4" />
              I Have Been Banned
            </Link>
          </div>
        </div>
      </section>

      {/* ── About Section ────────────────────────────────── */}
      <AnimatedSection id="about" className="py-24 relative smoke-overlay">
        {(isInView) => (
          <div className="container mx-auto px-4">
            {/* About Us Text */}
            <motion.div
              className="max-w-3xl mx-auto text-center mb-16"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase mb-6 neon-text-blue text-primary">
                About 420 Clan
              </h2>
              <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                We are <span className="text-primary font-semibold">420 Clan</span>, a
                community built for lovers of the CosmicV KOTH FiveM server who want to
                take their experience to the next level. Our texture pack made by{" "}
                <span className="text-primary font-semibold neon-text-blue">M1K3</span>{" "}
                is designed to fully transform your server experience with high-quality
                custom content, clean weapon skins, and effects that pop to make your
                gameplay look and feel unique.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  { number: "50+", label: "Custom Textures" },
                  { number: "24/7", label: "Community Support In Discord" },
                ].map((stat, i) => (
                  <motion.div
                    key={stat.label}
                    className="bg-card border border-border rounded-lg p-6 neon-border-blue"
                    initial={{ opacity: 0, y: 20 }}
                    animate={isInView ? { opacity: 1, y: 0 } : {}}
                    transition={{ delay: 0.2 + i * 0.1, duration: 0.5 }}
                  >
                    <div className="font-display text-3xl font-black gradient-neon-text mb-1">
                      {stat.number}
                    </div>
                    <div className="text-muted-foreground text-sm uppercase tracking-wider">
                      {stat.label}
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* Staff Team Section */}
            <motion.div
              className="max-w-6xl mx-auto"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              <h3 className="font-display text-2xl sm:text-3xl font-bold uppercase mb-12 text-center neon-text-blue text-primary">
                Staff Team
              </h3>

              <div className="space-y-12">
                {staffByRole.map((group, groupIndex) => (
                  <div key={group.role}>
                    <h4 className="font-display text-xl font-bold uppercase mb-6 text-center text-secondary">
                      {group.role}
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[620px] mx-auto">
                      {group.members.map((member, memberIndex) => (
                        <motion.div
                          key={member.discord_id}
                          className={`bg-card border border-border rounded-lg p-6 text-center hover:border-primary/50 transition-all duration-300 w-full ${
                            group.role === "Web Developer" && group.members.length === 1
                              ? "sm:col-span-2 sm:max-w-[280px] sm:mx-auto"
                              : ""
                          }`}
                          initial={{ opacity: 0, y: 20 }}
                          animate={isInView ? { opacity: 1, y: 0 } : {}}
                          transition={{
                            delay: 0.5 + groupIndex * 0.1 + memberIndex * 0.05,
                            duration: 0.5,
                          }}
                        >
                          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted border-2 border-primary/30 flex items-center justify-center overflow-hidden">
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
                                  icon.innerHTML = '<svg class="w-10 h-10 text-muted-foreground" stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>';
                                  parent.appendChild(icon);
                                }
                              }}
                            />
                          </div>
                          <h5 className={`font-display text-lg font-bold mb-2 ${
                            member.display_name === "M1K3" ? "neon-text-blue" : "text-foreground"
                          }`}>
                            {member.display_name}
                          </h5>
                          <div className="inline-block px-3 py-1 rounded-full bg-primary/10 border border-primary/30 text-xs font-semibold text-primary uppercase tracking-wide">
                            {member.staff_role}
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatedSection>

      {/* ── Features Section ─────────────────────────────── */}
      <AnimatedSection id="features" className="py-24 relative">
        {(isInView) => (
          <div className="container mx-auto px-4">
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
                  <p className={`text-sm ${feature.description.includes("WIP") ? "text-secondary neon-text-purple font-semibold tracking-wider uppercase animate-pulse" : "text-muted-foreground"}`}>
                    {feature.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </AnimatedSection>

      {/* ── Video Section ────────────────────────────────── */}
      <AnimatedSection id="video" className="py-24 relative smoke-overlay">
        {(isInView) => (
          <div className="container mx-auto px-4">
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
        )}
      </AnimatedSection>

      {/* ── Changelog Section ────────────────────────────── */}
      <AnimatedSection id="changelog" className="py-24 relative">
        {(isInView) => (
          <div className="container mx-auto px-4">
            <motion.h2
              className="font-display text-3xl sm:text-4xl font-bold uppercase mb-12 text-center neon-text-purple text-secondary"
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              Changelog
            </motion.h2>
            <div className="max-w-3xl mx-auto space-y-4">
              {latestChangelog && (
                <div className="relative pt-5">
                  {olderChangelog.slice(0, 2).map((entry, i) => (
                    <motion.div
                      key={`stack-${entry.version}`}
                      className="absolute left-0 right-0 rounded-lg border border-border bg-card/80"
                      style={{
                        top: `${(i + 1) * 8}px`,
                        transform: `scale(${1 - (i + 1) * 0.015})`,
                        zIndex: 1 - i,
                      }}
                      initial={{ opacity: 0 }}
                      animate={isInView ? { opacity: changelogExpanded ? 0 : 1 } : {}}
                      transition={{ delay: 0.08 * i, duration: 0.3 }}
                      aria-hidden="true"
                    >
                      <div className="h-20" />
                    </motion.div>
                  ))}

                  <motion.button
                    type="button"
                    onClick={() => setChangelogExpanded((prev) => !prev)}
                    className="relative z-10 w-full text-left bg-card border border-border rounded-lg p-6 hover:neon-border-purple transition-all duration-300"
                    initial={{ opacity: 0, x: -30 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ duration: 0.5 }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3 mb-3">
                          <Tag className="w-5 h-5 text-secondary" />
                          <span className="font-display text-sm font-bold text-secondary">v{latestChangelog.version}</span>
                          <span className="text-muted-foreground text-xs">{latestChangelog.date}</span>
                        </div>
                        <h3 className="font-display text-lg font-bold mb-3 text-foreground">{latestChangelog.title}</h3>
                        <ul className="space-y-1.5">
                          {latestChangelog.changes.map((change, i) => (
                            <li key={i} className="text-muted-foreground text-sm flex items-start gap-2">
                              <span className="text-primary flex-shrink-0 leading-[1.25rem]">•</span>
                              {change}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {olderChangelog.length > 0 && (
                        <div className="shrink-0 flex items-center gap-1 text-xs text-secondary font-display font-bold mt-0.5">
                          <span>{changelogExpanded ? "Hide older" : `${olderChangelog.length} older`}</span>
                          <ChevronDown
                            className={`w-4 h-4 transition-transform duration-300 ${
                              changelogExpanded ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  </motion.button>
                </div>
              )}

              <AnimatePresence initial={false}>
                {changelogExpanded && olderChangelog.length > 0 && (
                  <motion.div
                    key="older-changelog"
                    initial={{ opacity: 0, height: 0, y: -8 }}
                    animate={{ opacity: 1, height: "auto", y: 0 }}
                    exit={{ opacity: 0, height: 0, y: -8 }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 pt-2">
                      {olderChangelog.map((entry, i) => (
                        <motion.div
                          key={entry.version}
                          className="bg-card border border-border rounded-lg p-6 hover:neon-border-purple transition-all duration-300"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.05 * i, duration: 0.25 }}
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <Tag className="w-5 h-5 text-secondary" />
                            <span className="font-display text-sm font-bold text-secondary">v{entry.version}</span>
                            <span className="text-muted-foreground text-xs">{entry.date}</span>
                          </div>
                          <h3 className="font-display text-lg font-bold mb-3 text-foreground">{entry.title}</h3>
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
        )}
      </AnimatedSection>

      {/* ── Download Section ─────────────────────────────── */}
      <AnimatedSection id="download" className="py-24 relative smoke-overlay">
        {(isInView) => (
          <div className="container mx-auto px-4">
            <motion.div
              className="max-w-2xl mx-auto text-center"
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6 }}
            >
              <h2 className="font-display text-3xl sm:text-4xl font-bold uppercase mb-6 neon-text-blue text-primary">
                Download
              </h2>
              {canDownload ? (
                <p className="text-muted-foreground mb-10">
                  Grab the texture pack and transform your FiveM experience today. <br></br>
                  <span className="text-primary font-semibold neon-text-blue">NOTE:</span> If u are caught sharing the file you will be blacklisted.
                </p>
              ) : (
                <p className="text-muted-foreground mb-10">
                  The texture pack download is currently locked.
                </p>
              )}
              <motion.div
                className="bg-card border border-border rounded-xl p-8 mb-8 neon-border-blue"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={isInView ? { opacity: 1, scale: 1 } : {}}
                transition={{ delay: 0.2, duration: 0.5 }}
              >
                <div className="flex items-center justify-center gap-3 mb-6">
                  <FileArchive className="w-8 h-8 text-primary" />
                  <span className="font-display text-xl font-bold text-foreground">
                    {fileName}
                  </span>
                </div>
                <div className="flex items-center justify-center gap-8 text-sm text-muted-foreground mb-8">
                  <div className="flex items-center gap-2">
                    <Hash className="w-4 h-4 text-secondary" />
                    <span>v{latestVersion}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-secondary" />
                    <span>{fileSize}</span>
                  </div>
                </div>
                {canDownload ? (
                  <>
                    <button
                      onClick={handleDownload}
                      disabled={downloadLoading}
                      className="inline-flex items-center gap-3 bg-primary text-primary-foreground font-display font-bold text-lg px-10 py-4 rounded-lg neon-box-blue hover:scale-105 animate-pulse-neon transition-all duration-1000 ease-in-out uppercase tracking-wider disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {downloadLoading ? (
                        <Loader2 className="w-6 h-6 animate-spin" />
                      ) : (
                        <Download className="w-6 h-6" />
                      )}
                      {downloadLoading ? "Generating link..." : "Download .RAR"}
                    </button>
                    {downloadError && (
                      <p className="text-destructive text-sm mt-3">{downloadError}</p>
                    )}
                  </>
                ) : (
                  <div
                    className="inline-flex items-center gap-3 border-2 border-border text-muted-foreground/40 font-display font-bold text-lg px-10 py-4 rounded-lg uppercase tracking-wider cursor-not-allowed select-none"
                    aria-disabled="true"
                  >
                    <Lock className="w-5 h-5" />
                    <span>
                      Reach{" "}
                      <span className="text-primary neon-text-blue">Corporal</span>
                      {" "}to unlock
                    </span>
                  </div>
                )}
              </motion.div>
              <p className="text-muted-foreground text-xs">
                You need <span className="text-primary">WinRAR</span> or <span className="text-primary">7-Zip</span> to extract this file.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatedSection>

      </div>{/* end content reveal wrapper */}

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t border-border py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-3">
            <div className="flex items-center gap-2">
              <img src={clanLogo} alt="420 Clan" className="w-6 h-6 rounded-full" />
              <span className="font-display text-xs font-bold text-muted-foreground uppercase tracking-wider">
                420 Clan © 2026
              </span>
            </div>
            <p className="text-muted-foreground text-xs">
              Not affiliated with Rockstar Games or FiveM.
            </p>
          </div>
          <div className="text-center space-y-1">
            <p className="text-muted-foreground text-xs font-semibold">
              Pack made by <span className="text-primary">Mike</span>
            </p>
            <p className="text-muted-foreground text-xs">
              For any questions send a DM on Discord: <span className="text-primary font-mono">m1k3_1206</span>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
};

// ══════════════════════════════════════════════════════════
//  NAVBAR (with user info + auth links)
// ══════════════════════════════════════════════════════════
function PackNavbar({
  navItems,
  user,
  pendingCount = 0,
  visible = true,
}: {
  navItems: { label: string; href: string; route?: boolean }[];
  user: {
    avatar: string | null;
    username: string;
    is_staff: boolean;
    staff_tier?: "owner" | "webdev" | "admin" | null;
  };
  pendingCount?: number;
  visible?: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("#hero");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [shieldOpen, setShieldOpen] = useState(false);
  const shieldRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sectionHrefs = navItems
      .filter((item) => !item.route && item.href.startsWith("#"))
      .map((item) => item.href);

    const onScroll = () => {
      setScrolled(window.scrollY > 50);

      const scrollPosition = window.scrollY + 140;
      let current = sectionHrefs[0] ?? "#hero";

      for (const href of sectionHrefs) {
        const el = document.querySelector(href) as HTMLElement | null;
        if (!el) continue;
        if (scrollPosition >= el.offsetTop) {
          current = href;
        }
      }

      setActiveSection(current);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [navItems]);

  // Close shield dropdown when clicking outside
  useEffect(() => {
    if (!shieldOpen) return;
    const onClick = (e: MouseEvent) => {
      if (shieldRef.current && !shieldRef.current.contains(e.target as Node)) {
        setShieldOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [shieldOpen]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ease-out ${
        visible
          ? "opacity-100 translate-y-0"
          : "opacity-0 -translate-y-4 pointer-events-none"
      } ${
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
          {navItems.map((item) => {
            const isInstall = item.label === "Installation";
            const isActive = !item.route && item.href === activeSection;
            const cls =
              `font-body text-sm font-medium hover:text-primary transition-colors duration-200 uppercase tracking-wider ${
                isActive ? "text-primary" : ""
              }`;

            if (item.route) {
              return (
                <Link key={item.href} to={item.href} className={cls}>
                  {isInstall && <BookOpen className="w-3.5 h-3.5 inline mr-1" />}
                  {item.label}
                </Link>
              );
            }

            return (
              <a key={item.href} href={item.href} className={cls}>
                {item.label}
              </a>
            );
          })}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {user.avatar && (
              <img src={user.avatar} alt="" className="w-8 h-8 rounded-full border border-border" />
            )}
            <span className="text-sm text-foreground hidden sm:block">{user.username}</span>
          </div>

          {/* ── Shield dropdown (staff only) ── */}
          {user.is_staff && (
            <div className="relative" ref={shieldRef}>
              <button
                type="button"
                onClick={() => setShieldOpen((o) => !o)}
                className={`relative inline-flex h-8 w-8 items-center justify-center rounded-md transition ${
                  shieldOpen
                    ? "text-secondary drop-shadow-[0_0_6px_rgba(168,85,247,0.7)]"
                    : "text-secondary/70 hover:text-secondary hover:drop-shadow-[0_0_6px_rgba(168,85,247,0.5)]"
                }`}
                aria-label="Admin tools"
              >
                <Shield className="w-4.5 h-4.5" />
                {pendingCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold min-w-[16px] h-[16px] flex items-center justify-center rounded-full px-0.5 animate-pulse">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </button>
              {shieldOpen && (
                <div className="absolute right-0 top-full mt-2 w-48 bg-card/95 backdrop-blur-sm border border-secondary/40 rounded-xl shadow-2xl shadow-secondary/20 z-50">
                  <div className="px-4 pt-3 pb-2 text-[11px] uppercase tracking-wide text-muted-foreground border-b border-secondary/20">
                    Signed in as {user.staff_tier === "owner" ? "Owner" : user.staff_tier === "webdev" ? "Web Developer" : user.staff_tier === "admin" ? "Admin" : "Staff"}
                  </div>
                  <Link
                    to="/admin"
                    onClick={() => setShieldOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-display font-bold text-secondary hover:bg-secondary/15 transition"
                  >
                    <Shield className="w-4 h-4" />
                    Admin Panel
                    {pendingCount > 0 && (
                      <span className="ml-auto bg-red-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                  </Link>
                  <Link
                    to="/clan-list"
                    onClick={() => setShieldOpen(false)}
                    className="flex items-center gap-2 px-4 py-3 text-sm font-display font-bold text-secondary hover:bg-secondary/15 transition border-t border-secondary/20 rounded-b-xl"
                  >
                    <Users className="w-4 h-4" />
                    Clan List
                  </Link>
                </div>
              )}
            </div>
          )}

          <a
            href="/.netlify/functions/logout"
            className="text-muted-foreground hover:text-destructive transition"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </a>
          <button
            type="button"
            onClick={() => setMobileOpen((open) => !open)}
            className="md:hidden text-muted-foreground hover:text-foreground transition"
            aria-label="Toggle navigation"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <div className="md:hidden border-t border-border/60 bg-background/95 backdrop-blur-md">
          <div className="px-4 py-4 flex flex-col gap-3">
            {navItems.map((item) => {
              const isInstall = item.label === "Installation";
              const isActive = !item.route && item.href === activeSection;
              const cls =
                `font-body text-sm font-medium uppercase tracking-wider transition-colors duration-200 ${
                  isActive ? "text-primary" : "text-foreground"
                }`;

              if (item.route) {
                return (
                  <Link
                    key={item.href}
                    to={item.href}
                    className={cls}
                    onClick={() => setMobileOpen(false)}
                  >
                    {isInstall && <BookOpen className="w-4 h-4 inline mr-2" />}
                    {item.label}
                  </Link>
                );
              }

              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={cls}
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </a>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}

// ══════════════════════════════════════════════════════════
//  ANIMATED SECTION WRAPPER
// ══════════════════════════════════════════════════════════
function AnimatedSection({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: (isInView: boolean) => React.ReactNode;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  return (
    <section id={id} className={className} ref={ref}>
      {children(isInView)}
    </section>
  );
}

export default TexturePackPage;
