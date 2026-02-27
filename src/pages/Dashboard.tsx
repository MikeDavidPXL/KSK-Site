import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { ExternalLink, FileText, Loader2, ShieldAlert, RefreshCw } from "lucide-react";
import { Link, Navigate } from "react-router-dom";

const DISCORD_INVITE = "https://discord.gg/qBpYXRgmcH";
const POLL_INTERVAL = 10_000; // 10 seconds

const Dashboard = () => {
  const { user, loading, silentRefresh, lastUpdated } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Auto-poll every 10s (silent, no loading spinner) ────
  useEffect(() => {
    // Only poll for users on the dashboard (KOTH users waiting for status)
    if (loading || !user) return;
    // Staff/private redirect away, so no need to poll for them
    if (user.is_staff || user.is_private) return;

    pollRef.current = setInterval(() => {
      silentRefresh();
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loading, user, silentRefresh]);

  // ── Refresh on tab focus ────────────────────────────────
  useEffect(() => {
    if (loading || !user) return;
    if (user.is_staff || user.is_private) return;

    const onFocus = () => silentRefresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loading, user, silentRefresh]);

  // ── Manual refresh handler ──────────────────────────────
  const handleManualRefresh = async () => {
    setRefreshing(true);
    await silentRefresh();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  // No session → back to login
  if (!user) {
    return <Navigate to="/" replace />;
  }

  // Staff or Private → straight to pack page
  if (user.is_staff || user.is_private) {
    return <Navigate to="/pack" replace />;
  }

  // Not in guild at all → join Discord card
  if (!user.in_guild) {
    return (
      <GatePage>
        <GateCard
          icon={<ExternalLink className="w-8 h-8 text-primary" />}
          title="Join our Discord first"
          description="You need to be in the 420 Clan Discord server before you can apply."
        >
          <a
            href={DISCORD_INVITE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-display font-bold px-8 py-3 rounded-lg transition hover:scale-105"
          >
            <ExternalLink className="w-4 h-4" /> Join Discord
          </a>
        </GateCard>
      </GatePage>
    );
  }

  // In guild but unverified → must verify via captcha first
  if (user.is_unverified && !user.is_koth) {
    return <Navigate to="/verify" replace />;
  }

  // In guild but no KOTH role → must verify first
  if (!user.is_koth) {
    return (
      <GatePage>
        <GateCard
          icon={<ShieldAlert className="w-8 h-8 text-yellow-400" />}
          title="Verify Your Account"
          description="You need to verify on the website to unlock the application form."
        >
          <Link
            to="/verify"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-display font-bold px-8 py-3 rounded-lg transition hover:scale-105"
          >
            <ShieldAlert className="w-4 h-4" /> Go to Verification
          </Link>
        </GateCard>
      </GatePage>
    );
  }

  // Has KOTH role → show application flow
  // effective_status is "koth" here — Discord roles are the truth.
  // application may be null (revoked ones are hidden by backend).
  const app = user.application;

  return (
    <GatePage>
      {/* No application or previous was revoked → fresh apply */}
      {!app && (
        <GateCard
          icon={<FileText className="w-8 h-8 text-primary" />}
          title="Apply for the 420 Clan"
          description="Fill out the application form to join us. Staff will review it soon."
        >
          <Link
            to="/apply"
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-display font-bold px-8 py-3 rounded-lg transition hover:scale-105"
          >
            <FileText className="w-4 h-4" /> Start Application
          </Link>
        </GateCard>
      )}

      {/* Application pending */}
      {app?.status === "pending" && (
        <GateCard
          icon={<Loader2 className="w-8 h-8 text-yellow-400 animate-spin" />}
          title="Application Pending"
          description="Your application is being reviewed by staff. This page updates automatically."
        >
          <span className="text-yellow-400 font-display text-sm block mb-4">
            Submitted{" "}
            {new Date(app.created_at).toLocaleDateString()}
          </span>
          <StatusFooter
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={handleManualRefresh}
          />
        </GateCard>
      )}

      {/* Application accepted but no Private role yet — brief sync window */}
      {app?.status === "accepted" && (
        <GateCard
          icon={<Loader2 className="w-8 h-8 text-green-400 animate-spin" />}
          title="Application Accepted!"
          description="Your application was accepted. Your role should update shortly — this page checks automatically."
        >
          <span className="text-green-400 font-display text-sm block mb-4">
            Accepted! Waiting for role sync...
          </span>
          <StatusFooter
            lastUpdated={lastUpdated}
            refreshing={refreshing}
            onRefresh={handleManualRefresh}
          />
        </GateCard>
      )}

      {/* Application rejected */}
      {app?.status === "rejected" && (
        <GateCard
          icon={<FileText className="w-8 h-8 text-destructive" />}
          title="Application Rejected"
          description="Unfortunately your application was not accepted. You may re-apply."
        >
          {app.reviewer_note && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-muted-foreground font-display font-bold mb-2">
                Feedback from Staff:
              </p>
              <p className="text-sm text-foreground">
                {app.reviewer_note}
              </p>
            </div>
          )}
          <Link
            to="/apply"
            className="inline-flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-display font-bold px-8 py-3 rounded-lg transition hover:scale-105"
          >
            <FileText className="w-4 h-4" /> Re-Apply
          </Link>
        </GateCard>
      )}
    </GatePage>
  );
};

// Page shell
function GatePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 smoke-overlay pointer-events-none" />
      <nav className="relative z-10 border-b border-border bg-card/60 backdrop-blur">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <span className="font-display text-lg font-bold neon-text-blue text-primary">
            420 Clan
          </span>
          <a
            href="/.netlify/functions/logout"
            className="text-xs text-muted-foreground hover:text-destructive transition"
          >
            Logout
          </a>
        </div>
      </nav>
      <div className="relative z-10 container mx-auto px-4 py-16 max-w-2xl">
        {children}
      </div>
    </div>
  );
}

// Reusable card component
function GateCard({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <motion.div
      className="bg-card border border-border rounded-xl p-10 text-center neon-border-blue"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className="flex justify-center mb-4">{icon}</div>
      <h2 className="font-display text-2xl font-bold mb-2 text-foreground">
        {title}
      </h2>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto">
        {description}
      </p>
      {children}
    </motion.div>
  );
}

// Subtle refresh indicator + manual button
function StatusFooter({
  lastUpdated,
  refreshing,
  onRefresh,
}: {
  lastUpdated: number | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const timeAgo = lastUpdated
    ? `Last checked ${Math.round((Date.now() - lastUpdated) / 1000)}s ago`
    : "";

  return (
    <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground mt-2">
      {refreshing ? (
        <span className="flex items-center gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" /> Updating…
        </span>
      ) : (
        <>
          {timeAgo && <span>{timeAgo}</span>}
          <button
            onClick={onRefresh}
            className="inline-flex items-center gap-1 hover:text-primary transition cursor-pointer"
            title="Refresh now"
          >
            <RefreshCw className="w-3 h-3" /> Refresh
          </button>
        </>
      )}
    </div>
  );
}

export default Dashboard;
