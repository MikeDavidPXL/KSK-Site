// Admin Panel — standalone page for staff only
// Archive / restore support, expandable application cards
// Auto-polls every 10s for new applications
import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Navigate, Link } from "react-router-dom";
import {
  Shield,
  ArrowLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronDown,
  ChevronUp,
  LogOut,
  Archive,
  ArchiveRestore,
  StickyNote,
  Send,
  Users,
  Trash2,
  X,
} from "lucide-react";
import clanLogo from "@/assets/clan-logo.png";
import { buildDiscordAvatarUrl } from "@/lib/discord";

const POLL_INTERVAL = 10_000; // 10 seconds

// ── Types ─────────────────────────────────────────────────
interface AdminNote {
  id: string;
  note: string;
  created_at: string;
  created_by: string;
  created_by_username?: string | null;
  created_by_avatar_hash?: string | null;
}

interface AdminApp {
  id: string;
  discord_id: string;
  discord_name: string;
  uid: string;
  age: number;
  speaks_english: boolean;
  timezone: string;
  activity: string;
  level: string;
  playstyle: string;
  banned_koth_cheating: boolean;
  looking_for: string;
  has_mic: boolean;
  clan_history: string;
  status: string;
  reviewer_note: string | null;
  created_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  application_notes: AdminNote[];
}

type Filter = "all" | "pending" | "accepted" | "rejected";

// ══════════════════════════════════════════════════════════
//  ADMIN PANEL PAGE
// ══════════════════════════════════════════════════════════
const AdminPanel = () => {
  const { user, loading: authLoading } = useAuth();
  const [apps, setApps] = useState<AdminApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("pending");
  const [showArchived, setShowArchived] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [noteSaving, setNoteSaving] = useState<string | null>(null);
  const [noteSaved, setNoteSaved] = useState<string | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<
    Record<
      string,
      { kind: "success" | "error"; message: string; canRetryCreate?: boolean }
    >
  >({});

  // Archive All state
  const [archiveAllModalOpen, setArchiveAllModalOpen] = useState(false);
  const [archiveAllReason, setArchiveAllReason] = useState("cleanup");
  const [archiveAllLoading, setArchiveAllLoading] = useState(false);
  const [archiveAllResult, setArchiveAllResult] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // ── Fetch (silent = no loading spinner, used by polling) ──
  const fetchApps = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("status", filter);
      if (showArchived) params.set("show_archived", "true");
      const qs = params.toString() ? `?${params}` : "";
      const res = await fetch(`/.netlify/functions/admin-list${qs}`);
      const data = await res.json();
      setApps(data.applications ?? []);
    } catch {
      // silent fail on poll, don't clear list
      if (!silent) setApps([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [filter, showArchived]);

  // Initial fetch
  useEffect(() => {
    if (user?.is_staff) fetchApps();
  }, [user, fetchApps]);

  // ── Auto-poll every 10s (silent, no spinner) ────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user?.is_staff) return;

    pollRef.current = setInterval(() => {
      fetchApps(true);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [user, fetchApps]);

  const review = async (appId: string, action: "accept" | "reject") => {
    setActionLoading(appId);
    try {
      const res = await fetch("/.netlify/functions/admin-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: appId, action, note }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setReviewFeedback((prev) => ({
          ...prev,
          [appId]: {
            kind: "error",
            message:
              data?.clan_member_error ||
              data?.error ||
              "Request failed",
            canRetryCreate: action === "accept",
          },
        }));
        return;
      }

      if (action === "accept") {
        if (data?.clan_member_upsert_ok) {
          setReviewFeedback((prev) => ({
            ...prev,
            [appId]: {
              kind: "success",
              message: "Clan member created",
            },
          }));
        } else {
          setReviewFeedback((prev) => ({
            ...prev,
            [appId]: {
              kind: "error",
              message:
                data?.clan_member_error ||
                "Clan member upsert failed",
              canRetryCreate: true,
            },
          }));
        }
      } else {
        setReviewFeedback((prev) => ({
          ...prev,
          [appId]: {
            kind: "success",
            message: "Application rejected",
          },
        }));
      }

      if (res.ok) {
        setNote("");
        await fetchApps();
      }
    } finally {
      setActionLoading(null);
    }
  };

  const retryCreateClanMember = async (appId: string) => {
    setActionLoading(appId);
    try {
      const res = await fetch("/.netlify/functions/admin-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          application_id: appId,
          action: "retry_create_clan_member",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data?.clan_member_upsert_ok) {
        setReviewFeedback((prev) => ({
          ...prev,
          [appId]: {
            kind: "error",
            message:
              data?.clan_member_error ||
              data?.error ||
              "Retry create clan member failed",
            canRetryCreate: true,
          },
        }));
        return;
      }

      setReviewFeedback((prev) => ({
        ...prev,
        [appId]: {
          kind: "success",
          message: "Clan member created",
        },
      }));
      await fetchApps();
    } finally {
      setActionLoading(null);
    }
  };

  const saveInternalNote = async (appId: string) => {
    if (!internalNote.trim()) return;
    setNoteSaving(appId);
    setNoteSaved(null);
    try {
      const res = await fetch("/.netlify/functions/admin-application-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: appId, note: internalNote }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update notes in-place without full refetch
        setApps((prev) =>
          prev.map((a) =>
            a.id === appId ? { ...a, application_notes: data.notes } : a
          )
        );
        setInternalNote("");
        setNoteSaved(appId);
        setTimeout(() => setNoteSaved(null), 2000);
      }
    } finally {
      setNoteSaving(null);
    }
  };

  const archiveAction = async (
    appId: string,
    action: "archive" | "restore",
    reason?: string
  ) => {
    setActionLoading(appId);
    try {
      const res = await fetch("/.netlify/functions/admin-archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ application_id: appId, action, reason }),
      });
      if (res.ok) {
        await fetchApps();
      }
    } finally {
      setActionLoading(null);
    }
  };

  // Archive All handler
  const archiveAll = async () => {
    setArchiveAllLoading(true);
    setArchiveAllResult(null);
    try {
      const res = await fetch("/.netlify/functions/admin-applications-archive-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: archiveAllReason || "cleanup" }),
      });
      const data = await res.json();

      if (!res.ok) {
        setArchiveAllResult({
          kind: "error",
          message: data?.error || "Failed to archive applications",
        });
        return;
      }

      setArchiveAllResult({
        kind: "success",
        message: `Successfully archived ${data.archived_count} application${data.archived_count !== 1 ? "s" : ""}`,
      });

      // Refresh list after short delay to show message
      setTimeout(async () => {
        await fetchApps();
        setArchiveAllModalOpen(false);
        setArchiveAllResult(null);
        setArchiveAllReason("cleanup");
      }, 1500);
    } catch {
      setArchiveAllResult({
        kind: "error",
        message: "Network error",
      });
    } finally {
      setArchiveAllLoading(false);
    }
  };

  // Guard: staff only
  if (!authLoading && (!user || !user.is_staff)) {
    return <Navigate to="/pack" replace />;
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const statusIcon = (s: string) => {
    if (s === "pending") return <Clock className="w-4 h-4 text-yellow-400" />;
    if (s === "accepted") return <CheckCircle className="w-4 h-4 text-green-400" />;
    return <XCircle className="w-4 h-4 text-red-400" />;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top bar ─────────────────────────────────────── */}
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.5 }}
        className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-lg"
      >
        <div className="container mx-auto px-4 flex items-center justify-between h-16">
          <Link
            to="/pack"
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <img src={clanLogo} alt="420 Clan Logo" className="w-8 h-8 rounded-full" />
            <span className="font-display text-sm font-bold hidden sm:block">
              Back to homepage
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-secondary" />
            <span className="font-display text-lg font-bold text-secondary hidden sm:block">
              Admin Panel
            </span>
          </div>
          <div className="flex items-center gap-3">
            {/* Navigation to Clan List */}
            <Link
              to="/clan-list"
              className="px-3 py-1.5 text-sm font-display font-bold bg-secondary/20 hover:bg-secondary/30 text-secondary rounded-lg transition border border-secondary/30 hidden sm:block"
              title="Go to Clan List"
            >
              Clan List
            </Link>
            <Link
              to="/clan-list"
              className="px-2 py-1.5 text-secondary hover:bg-secondary/20 rounded transition sm:hidden"
              title="Clan List"
            >
              <Users className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              {user!.avatar && (
                <img
                  src={user!.avatar}
                  alt=""
                  className="w-8 h-8 rounded-full border border-border"
                />
              )}
              <span className="text-sm text-foreground hidden sm:block">
                {user!.username}
              </span>
            </div>
            <a
              href="/.netlify/functions/logout"
              className="text-muted-foreground hover:text-destructive transition"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </a>
          </div>
        </div>
      </motion.nav>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="container mx-auto px-4 max-w-4xl py-12">
        {/* Filters */}
        <div className="flex gap-2 mb-4 flex-wrap justify-center">
          {(["pending", "accepted", "rejected", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`font-display text-sm px-4 py-1.5 rounded-lg border transition ${
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Show archived toggle + result count */}
        <div className="flex items-center justify-between mb-4">
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="accent-primary w-4 h-4 rounded"
            />
            <Archive className="w-4 h-4" />
            Show archived
          </label>
          <span className="text-sm text-muted-foreground">
            {apps.length} result{apps.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Archive All button — centered, only visible on "all" tab */}
        {filter === "all" && user?.is_staff && (
          <div className="flex justify-center mb-6">
            <button
              onClick={() => setArchiveAllModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-display font-bold border border-purple-500/50 text-purple-400 hover:bg-purple-500/10 hover:border-purple-500 rounded-lg transition"
            >
              <Trash2 className="w-4 h-4" />
              Archive All
            </button>
          </div>
        )}

        {/* Archive All Confirmation Modal */}
        {archiveAllModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-lg font-bold text-foreground flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-purple-400" />
                  Archive All
                </h3>
                <button
                  onClick={() => {
                    setArchiveAllModalOpen(false);
                    setArchiveAllResult(null);
                  }}
                  className="text-muted-foreground hover:text-foreground transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-3">
                  <p className="text-sm text-purple-300">
                    <strong>This will archive:</strong>
                  </p>
                  <ul className="text-sm text-purple-300/80 mt-1 list-disc list-inside">
                    <li>All <span className="text-green-400">accepted</span> applications</li>
                    <li>All <span className="text-red-400">rejected</span> applications</li>
                  </ul>
                  <p className="text-sm text-yellow-400 mt-2">
                    ⚠️ Pending applications will NOT be archived.
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-muted-foreground mb-1">
                    Archive reason (optional)
                  </label>
                  <input
                    type="text"
                    value={archiveAllReason}
                    onChange={(e) => setArchiveAllReason(e.target.value)}
                    placeholder="cleanup"
                    className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  />
                </div>

                {archiveAllResult && (
                  <div
                    className={`text-sm px-3 py-2 rounded-md border ${
                      archiveAllResult.kind === "success"
                        ? "bg-green-500/10 border-green-500/30 text-green-400"
                        : "bg-red-500/10 border-red-500/30 text-red-400"
                    }`}
                  >
                    {archiveAllResult.message}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => {
                      setArchiveAllModalOpen(false);
                      setArchiveAllResult(null);
                    }}
                    disabled={archiveAllLoading}
                    className="flex-1 px-4 py-2 bg-muted hover:bg-muted/80 text-foreground font-display font-bold rounded-lg transition disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={archiveAll}
                    disabled={archiveAllLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-display font-bold rounded-lg transition disabled:opacity-50"
                  >
                    {archiveAllLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                    Archive
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <Loader2 className="w-6 h-6 text-primary animate-spin mx-auto" />
          </div>
        )}

        {!loading && apps.length === 0 && (
          <p className="text-center text-muted-foreground py-12">
            No applications found.
          </p>
        )}

        <div className="space-y-3">
          {apps.map((app) => {
            const isArchived = !!app.archived_at;

            return (
              <div
                key={app.id}
                className={`bg-card border rounded-lg overflow-hidden transition-all duration-300 ${
                  isArchived
                    ? "border-muted opacity-60 hover:opacity-80"
                    : "border-border hover:neon-border-blue"
                }`}
              >
                <button
                  onClick={() =>
                    setExpanded(expanded === app.id ? null : app.id)
                  }
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  {statusIcon(app.status)}
                  <span className="font-display text-sm font-bold text-foreground flex-1">
                    {app.discord_name}{" "}
                    <span className="text-muted-foreground font-normal">
                      (UID: {app.uid})
                    </span>
                    {isArchived && (
                      <span className="ml-2 text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                        archived
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(app.created_at).toLocaleDateString()}
                  </span>
                  {expanded === app.id ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </button>

                {expanded === app.id && (
                  <div className="border-t border-border px-5 py-5 space-y-3">
                    <Detail label="UID" value={app.uid} />
                    <Detail label="Age" value={String(app.age)} />
                    <Detail
                      label="Speaks English"
                      value={yesNo(app.speaks_english)}
                    />
                    <Detail label="Timezone" value={app.timezone} />
                    <Detail label="Activity" value={app.activity} />
                    <Detail label="Level" value={app.level} />
                    <Detail
                      label="Preferred playstyle"
                      value={app.playstyle}
                    />
                    <Detail
                      label="Banned from KOTH (cheating)"
                      value={yesNo(app.banned_koth_cheating)}
                    />
                    <Detail
                      label="Looking for in a clan"
                      value={app.looking_for}
                    />
                    <Detail label="Has mic" value={yesNo(app.has_mic)} />
                    <Detail
                      label="Current/previous clan membership"
                      value={app.clan_history}
                    />
                    {app.reviewer_note && (
                      <Detail
                        label="Reviewer note"
                        value={app.reviewer_note}
                      />
                    )}
                    {isArchived && app.archive_reason && (
                      <Detail
                        label="Archive reason"
                        value={app.archive_reason}
                      />
                    )}

                    {reviewFeedback[app.id] && (
                      <div
                        className={`text-sm px-3 py-2 rounded-md border ${
                          reviewFeedback[app.id].kind === "success"
                            ? "bg-green-500/10 border-green-500/30 text-green-400"
                            : "bg-red-500/10 border-red-500/30 text-red-400"
                        }`}
                      >
                        {reviewFeedback[app.id].message}
                        {reviewFeedback[app.id].kind === "error" &&
                          reviewFeedback[app.id].canRetryCreate && (
                          <button
                            onClick={() => retryCreateClanMember(app.id)}
                            disabled={actionLoading === app.id}
                            className="ml-3 underline underline-offset-2 hover:text-red-300 disabled:opacity-60"
                          >
                            Retry create clan member
                          </button>
                          )}
                      </div>
                    )}

                    {/* ── Internal Notes ────────────── */}
                    <div className="pt-3 border-t border-border">
                      <div className="flex items-center gap-2 mb-2">
                        <StickyNote className="w-4 h-4 text-yellow-400" />
                        <span className="text-xs font-display text-yellow-400 uppercase tracking-wider">
                          Internal Notes ({app.application_notes?.length || 0})
                        </span>
                      </div>

                      {/* Existing notes */}
                      {app.application_notes?.length > 0 && (
                        <div className="space-y-2 mb-3 max-h-48 overflow-y-auto">
                          {app.application_notes.map((n) => (
                            <div
                              key={n.id}
                              className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2"
                            >
                              <p className="text-sm text-foreground whitespace-pre-wrap">
                                {n.note}
                              </p>
                              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                <img
                                  src={buildDiscordAvatarUrl(
                                    n.created_by,
                                    n.created_by_avatar_hash
                                  )}
                                  alt={n.created_by_username || n.created_by}
                                  className="w-4 h-4 rounded-full border border-yellow-500/30"
                                  loading="lazy"
                                />
                                <span>
                                  {n.created_by_username || n.created_by} ·{" "}
                                  {new Date(n.created_at).toLocaleString()}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add note */}
                      <div className="flex gap-2">
                        <textarea
                          value={expanded === app.id ? internalNote : ""}
                          onChange={(e) => setInternalNote(e.target.value)}
                          placeholder="Add internal note..."
                          maxLength={1000}
                          rows={2}
                          className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 resize-none"
                        />
                        <button
                          onClick={() => saveInternalNote(app.id)}
                          disabled={
                            noteSaving === app.id || !internalNote.trim()
                          }
                          className="self-end px-3 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition disabled:opacity-50 flex items-center gap-1 text-sm font-display font-bold"
                        >
                          {noteSaving === app.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Send className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {noteSaved === app.id && (
                        <p className="text-xs text-green-400 mt-1">Saved!</p>
                      )}
                    </div>

                    {/* ── Accept / Reject (pending only) ─── */}
                    {app.status === "pending" && !isArchived && (
                      <div className="pt-3 border-t border-border space-y-3">
                        <textarea
                          value={note}
                          onChange={(e) => setNote(e.target.value)}
                          placeholder="Optional note (shown to user if rejected)..."
                          rows={2}
                          className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                        />
                        <div className="flex gap-3">
                          <button
                            onClick={() => review(app.id, "accept")}
                            disabled={actionLoading === app.id}
                            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-display font-bold py-2.5 rounded-lg transition disabled:opacity-50"
                          >
                            {actionLoading === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CheckCircle className="w-4 h-4" />
                            )}
                            Accept
                          </button>
                          <button
                            onClick={() => review(app.id, "reject")}
                            disabled={actionLoading === app.id}
                            className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-display font-bold py-2.5 rounded-lg transition disabled:opacity-50"
                          >
                            {actionLoading === app.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <XCircle className="w-4 h-4" />
                            )}
                            Reject
                          </button>
                        </div>
                      </div>
                    )}

                    {/* ── Archive / Restore ────────────── */}
                    <div className="pt-3 border-t border-border">
                      {isArchived ? (
                        <button
                          onClick={() => archiveAction(app.id, "restore")}
                          disabled={actionLoading === app.id}
                          className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition disabled:opacity-50"
                        >
                          {actionLoading === app.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <ArchiveRestore className="w-4 h-4" />
                          )}
                          Restore from archive
                        </button>
                      ) : (
                        <button
                          onClick={() => archiveAction(app.id, "archive")}
                          disabled={actionLoading === app.id}
                          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition disabled:opacity-50"
                        >
                          {actionLoading === app.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Archive className="w-4 h-4" />
                          )}
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs font-display text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <p className="text-sm text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function yesNo(value: boolean) {
  return value ? "Yes" : "No";
}

export default AdminPanel;
