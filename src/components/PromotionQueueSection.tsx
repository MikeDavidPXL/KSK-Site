import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  RefreshCw,
  Trash2,
  CheckCircle,
  AlertTriangle,
  X,
  Loader2,
  Clock,
  ArrowRight,
  Info,
} from "lucide-react";

interface QueueItem {
  id: string;
  member_id: string;
  discord_id: string;
  discord_name: string;
  ign: string;
  uid: string;
  from_rank: string;
  to_rank: string;
  days?: number;
  status: "queued" | "confirmed" | "processed" | "failed" | "removed";
  created_at: string;
}

interface PromotionQueueProps {
  onQueueUpdate?: (counts: QueueCounts) => void;
}

interface QueueCounts {
  queued: number;
  confirmed: number;
  processed: number;
  failed: number;
  unresolved: number;
}

const RANKS = ["Private", "Corporal", "Sergeant", "Lieutenant", "Major"];
const RANK_COLORS = {
  Private: "text-green-300",
  Corporal: "text-blue-400",
  Sergeant: "text-orange-400",
  Lieutenant: "text-cyan-400",
  Major: "text-red-400",
};

const PromotionQueueSection = ({ onQueueUpdate }: PromotionQueueProps) => {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [unresolvedItems, setUnresolvedItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [building, setBuilding] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [processResult, setProcessResult] = useState<any>(null);
  const [showQueueInfo, setShowQueueInfo] = useState(false);

  // ── Fetch queue items ──────────────────────────────────────
  const fetchQueue = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/promotion-queue-list");
      const data = await res.json();
      if (res.ok) {
        const resolved = (data.items ?? []).filter((q: QueueItem) => q.discord_id);
        const unresolved = (data.items ?? []).filter((q: QueueItem) => !q.discord_id);
        setQueueItems(resolved);
        setUnresolvedItems(unresolved);

        const counts = {
          queued: (data.items ?? []).filter((q: QueueItem) => q.status === "queued").length,
          confirmed: (data.items ?? []).filter((q: QueueItem) => q.status === "confirmed").length,
          processed: (data.items ?? []).filter((q: QueueItem) => q.status === "processed").length,
          failed: (data.items ?? []).filter((q: QueueItem) => q.status === "failed").length,
          unresolved: unresolved.length,
        };
        onQueueUpdate?.(counts);
      } else {
        setError(data?.error || "Failed to fetch queue");
      }
    } catch {
      setError("Network error while fetching queue");
    } finally {
      setLoading(false);
    }
  };

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 10_000);
    return () => clearInterval(interval);
  }, []);

  // ── Build queue (find new eligible members) ───────────────
  const buildQueue = async () => {
    setBuilding(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/promotion-queue-build", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(
          `Added ${data.queued_added_count} new members to queue (Total: ${data.total_queued_count})`
        );
        setTimeout(() => setSuccessMessage(null), 5000);
        await fetchQueue();
      } else {
        setError(data?.error || "Failed to build queue");
      }
    } catch {
      setError("Network error while building queue");
    } finally {
      setBuilding(false);
    }
  };

  // ── Clear queue (remove all queued items) ──────────────────
  const clearQueue = async () => {
    if (
      !confirm(
        `Remove all ${queueItems.length + unresolvedItems.length} items from queue?`
      )
    ) {
      return;
    }
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/promotion-queue-clear", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage("Queue cleared");
        setTimeout(() => setSuccessMessage(null), 3000);
        await fetchQueue();
      } else {
        setError(data?.error || "Failed to clear queue");
      }
    } catch {
      setError("Network error while clearing queue");
    }
  };

  // ── Confirm queue (mark as confirmed awaiting process) ────
  const confirmQueue = async () => {
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/promotion-queue-confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMessage(`Confirmed ${data.confirmed_count} promotions`);
        setShowConfirmModal(false);
        setTimeout(() => setSuccessMessage(null), 5000);
        await fetchQueue();
      } else {
        setError(data?.error || "Failed to confirm queue");
      }
    } catch {
      setError("Network error while confirming queue");
    } finally {
      setConfirming(false);
    }
  };

  // ── Process queue (apply roles + announce) ────────────────
  const processQueue = async () => {
    if (!confirm("This will apply roles and post announcement. Continue?")) {
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch("/.netlify/functions/promotion-queue-process", {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        setProcessResult(data);
        setSuccessMessage(
          `Processed: ${data.processed_count} success, ${data.failed_count} failed. Announcement ${data.announcement_posted ? "posted!" : "not posted"}`
        );
        setTimeout(() => setSuccessMessage(null), 8000);
        await fetchQueue();
      } else {
        setError(data?.error || "Failed to process queue");
      }
    } catch {
      setError("Network error while processing queue");
    } finally {
      setProcessing(false);
    }
  };

  const resolvedCount = queueItems.length;
  const confirmedCount = queueItems.filter((q) => q.status === "confirmed").length;
  const queuedCount = queueItems.filter((q) => q.status === "queued").length;
  const canConfirm = queuedCount >= 5;
  const canProcess = confirmedCount > 0;
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-8 rounded-xl bg-gradient-to-b from-secondary/5 to-secondary/0 border border-secondary/30 shadow-2xl shadow-secondary/10 overflow-hidden"
    >
      {/* ─── HEADER ─── */}
      <div className="border-b border-secondary/20 bg-secondary/[0.03] backdrop-blur-sm px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-secondary/15 rounded-lg">
            <Clock className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-secondary">
              Promotion Queue
            </h2>
            <p className="text-xs text-muted-foreground">Manage and confirm pending promotions</p>
          </div>
        </div>
        
        <button
          onClick={() => setShowQueueInfo(!showQueueInfo)}
          className="text-muted-foreground hover:text-secondary transition p-2 hover:bg-secondary/10 rounded-lg"
          title="Queue info"
        >
          <Info className="w-4 h-4" />
        </button>
      </div>

      <div className="px-6 py-6 space-y-6">
        {/* Queue Info Tooltip */}
        <AnimatePresence>
          {showQueueInfo && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="bg-secondary/10 border border-secondary/30 rounded-lg px-4 py-3 text-sm text-muted-foreground space-y-1"
            >
              <p>
                <strong className="text-secondary">Build:</strong> Scans eligible members and queues them.
              </p>
              <p>
                <strong className="text-secondary">Confirm:</strong> Manually approve once 5+ members are ready.
              </p>
              <p>
                <strong className="text-secondary">Process:</strong> Apply Discord roles and post announcement.
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── STATUS CARDS ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Queued", count: queuedCount, color: "from-yellow-500/20 to-yellow-500/5", badge: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
            { label: "Confirmed", count: confirmedCount, color: "from-green-500/20 to-green-500/5", badge: "bg-green-500/20 text-green-400 border-green-500/30" },
            { label: "Resolved", count: resolvedCount, color: "from-blue-500/20 to-blue-500/5", badge: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
            { label: "Unresolved", count: unresolvedItems.length, color: "from-orange-500/20 to-orange-500/5", badge: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
          ].map(({ label, count, color, badge }) => (
            <motion.div
              key={label}
              whileHover={{ y: -2 }}
              className={`bg-gradient-to-b ${color} border rounded-lg px-3 py-3 text-center`}
            >
              <div className="text-xs font-display font-bold uppercase tracking-wider text-muted-foreground mb-1">
                {label}
              </div>
              <div className={`text-2xl font-display font-bold ${badge.split(" ")[0]}`}>
                {count}
              </div>
            </motion.div>
          ))}
        </div>

        {/* ─── CONTROL BUTTONS ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={buildQueue}
            disabled={building}
            className="group relative inline-flex items-center justify-center gap-2 rounded-lg font-display font-bold px-4 py-3 text-sm transition overflow-hidden"
          >
            {/* Background gradient */}
            <div className="absolute inset-0 bg-gradient-to-r from-secondary/40 to-secondary/20 border border-secondary/50 rounded-lg group-hover:from-secondary/60 group-hover:to-secondary/40 group-disabled:from-muted/30 group-disabled:to-muted/20 group-disabled:border-muted/30 transition" />
            <div className="relative flex items-center gap-2 text-secondary group-disabled:text-muted-foreground">
              {building ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              <span>Build</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={clearQueue}
            disabled={loading || (queuedCount + confirmedCount === 0)}
            className="group relative inline-flex items-center justify-center gap-2 rounded-lg font-display font-bold px-4 py-3 text-sm transition overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 to-red-500/10 border border-red-500/40 rounded-lg group-hover:from-red-500/50 group-hover:to-red-500/30 group-disabled:from-muted/30 group-disabled:to-muted/20 group-disabled:border-muted/30 transition" />
            <div className="relative flex items-center gap-2 text-red-400 group-disabled:text-muted-foreground">
              <Trash2 className="w-4 h-4" />
              <span>Clear</span>
            </div>
          </motion.button>

          {!canProcess && (
            <motion.button
              whileHover={canConfirm ? { scale: 1.02 } : {}}
              whileTap={canConfirm ? { scale: 0.98 } : {}}
              onClick={() => setShowConfirmModal(true)}
              disabled={!canConfirm || confirming}
              className="group relative inline-flex items-center justify-center gap-2 rounded-lg font-display font-bold px-4 py-3 text-sm transition overflow-hidden col-span-2 sm:col-span-1"
            >
              <div className={`absolute inset-0 border rounded-lg transition ${
                canConfirm
                  ? "bg-gradient-to-r from-green-500/40 to-green-500/20 border-green-500/60 group-hover:from-green-500/60 group-hover:to-green-500/40 group-hover:shadow-lg group-hover:shadow-green-500/20"
                  : "bg-muted/20 border-muted/30"
              }`} />
              <div className={`relative flex items-center gap-2 ${canConfirm ? "text-green-400" : "text-muted-foreground"}`}>
                {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                <span>{resolvedCount < 5 ? `${5 - resolvedCount} left` : "Confirm"}</span>
              </div>
            </motion.button>
          )}

          {canProcess && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={processQueue}
              disabled={processing}
              className="group relative inline-flex items-center justify-center gap-2 rounded-lg font-display font-bold px-4 py-3 text-sm transition overflow-hidden col-span-2 sm:col-span-1"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-500/50 to-yellow-500/30 border border-yellow-500/70 rounded-lg group-hover:from-yellow-500/70 group-hover:to-yellow-500/50 group-hover:shadow-lg group-hover:shadow-yellow-500/30 group-disabled:from-muted/30 group-disabled:to-muted/20 group-disabled:border-muted/30 transition" />
              <div className="relative flex items-center gap-2 text-yellow-400 group-disabled:text-muted-foreground">
                {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                <span>Process</span>
              </div>
            </motion.button>
          )}
        </div>

        {/* ─── MESSAGES ─── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-3 text-red-400 text-sm flex items-start gap-3"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}
          {successMessage && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="bg-green-500/10 border border-green-500/30 rounded-lg px-4 py-3 text-green-400 text-sm font-display font-bold"
            >
              ✓ {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ─── QUEUE ITEMS (Desktop Table + Mobile Cards) ─── */}
        {queueItems.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex items-center gap-2">
              <h3 className="font-display text-base font-bold text-foreground">
                Ready for Promotion
              </h3>
              <span className="text-xs font-display font-bold px-2.5 py-1 rounded-full bg-secondary/20 text-secondary border border-secondary/30">
                {resolvedCount}
              </span>
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block rounded-lg border border-secondary/20 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-secondary/10 border-b border-secondary/20">
                    <th className="text-left px-4 py-3 font-display font-bold text-secondary uppercase text-xs">
                      Member
                    </th>
                    <th className="text-left px-4 py-3 font-display font-bold text-secondary uppercase text-xs">
                      Rank Change
                    </th>
                    <th className="text-center px-4 py-3 font-display font-bold text-secondary uppercase text-xs">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {queueItems.map((item, i) => (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ delay: i * 0.05 }}
                        className={`border-b border-secondary/10 group hover:bg-secondary/5 transition ${i % 2 === 0 ? "bg-card/50" : "bg-muted/20"}`}
                      >
                        <td className="px-4 py-3">
                          <div className="space-y-0.5">
                            <div className="text-foreground font-semibold group-hover:text-secondary transition">
                              {item.discord_name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {item.ign} • {item.uid.substring(0, 8)}...
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`font-display font-bold ${RANK_COLORS[item.from_rank as keyof typeof RANK_COLORS] || "text-muted-foreground"}`}>
                              {item.from_rank}
                            </span>
                            <ArrowRight className="w-3 h-3 text-secondary/60" />
                            <span className={`font-display font-bold ${RANK_COLORS[item.to_rank as keyof typeof RANK_COLORS] || "text-green-400"}`}>
                              {item.to_rank}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-display font-bold px-3 py-1 rounded-full border ${
                            item.status === "queued"
                              ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                              : item.status === "confirmed"
                                ? "bg-green-500/20 text-green-400 border-green-500/30"
                                : item.status === "processed"
                                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                                  : "bg-red-500/20 text-red-400 border-red-500/30"
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Mobile: Cards */}
            <div className="sm:hidden space-y-3">
              <AnimatePresence>
                {queueItems.map((item, i) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-card border border-secondary/20 rounded-lg p-4 space-y-3 hover:bg-card/80 transition"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-foreground font-semibold font-display">
                          {item.discord_name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {item.ign} • {item.uid.substring(0, 10)}...
                        </div>
                      </div>
                      <span className={`text-xs font-display font-bold px-2.5 py-1 rounded-full border whitespace-nowrap ml-2 ${
                        item.status === "queued"
                          ? "bg-yellow-500/20 text-yellow-400 border-yellow-500/30"
                          : item.status === "confirmed"
                            ? "bg-green-500/20 text-green-400 border-green-500/30"
                            : "bg-blue-500/20 text-blue-400 border-blue-500/30"
                      }`}>
                        {item.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-secondary/10">
                      <span className={`font-display font-bold text-sm ${RANK_COLORS[item.from_rank as keyof typeof RANK_COLORS] || "text-muted-foreground"}`}>
                        {item.from_rank}
                      </span>
                      <ArrowRight className="w-4 h-4 text-secondary/60" />
                      <span className={`font-display font-bold text-sm ${RANK_COLORS[item.to_rank as keyof typeof RANK_COLORS] || "text-green-400"}`}>
                        {item.to_rank}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* ─── UNRESOLVED MEMBERS ─── */}
        {unresolvedItems.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-b from-orange-500/15 to-orange-500/5 border border-orange-500/30 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-orange-500/20 rounded">
                <AlertTriangle className="w-4 h-4 text-orange-400" />
              </div>
              <div>
                <h4 className="font-display font-bold text-orange-400 text-sm">
                  Unresolved Members
                </h4>
                <p className="text-xs text-muted-foreground">
                  No Discord ID — must resolve in Clan List before processing
                </p>
              </div>
              <span className="ml-auto text-xs font-display font-bold px-2.5 py-1 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30">
                {unresolvedItems.length}
              </span>
            </div>
            <div className="space-y-2 text-sm">
              {unresolvedItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2 bg-orange-500/5 rounded border border-orange-500/20"
                >
                  <div className="flex-1">
                    <span className="text-foreground font-semibold">
                      {item.discord_name}
                    </span>
                    <span className="text-muted-foreground text-xs ml-2">
                      {item.ign}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span className="text-orange-300 font-semibold">
                      {item.from_rank}
                    </span>
                    <ArrowRight className="w-3 h-3" />
                    <span className="text-orange-300 font-semibold">
                      {item.to_rank}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ─── PROCESS RESULT ─── */}
        {processResult && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-b from-blue-500/20 to-blue-500/5 border border-blue-500/30 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-500/20 rounded">
                <CheckCircle className="w-4 h-4 text-blue-400" />
              </div>
              <h4 className="font-display font-bold text-blue-400">
                Process Complete
              </h4>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="bg-blue-500/5 rounded p-2 border border-blue-500/20">
                <div className="text-xs text-muted-foreground font-display">Success</div>
                <div className="font-display font-bold text-green-400 text-lg">
                  {processResult.processed_count}
                </div>
              </div>
              <div className="bg-blue-500/5 rounded p-2 border border-blue-500/20">
                <div className="text-xs text-muted-foreground font-display">Failed</div>
                <div className="font-display font-bold text-red-400 text-lg">
                  {processResult.failed_count}
                </div>
              </div>
              <div className="bg-blue-500/5 rounded p-2 border border-blue-500/20">
                <div className="text-xs text-muted-foreground font-display">Announcement</div>
                <div className="font-display font-bold text-blue-400">
                  {processResult.announcement_posted ? "✓ Posted" : "✗ Failed"}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* ─── CONFIRM MODAL ─── */}
      <AnimatePresence>
        {showConfirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-card border border-secondary/40 rounded-xl shadow-2xl max-w-md w-full space-y-6 p-6"
            >
              <div className="space-y-2">
                <h3 className="font-display text-xl font-bold text-foreground">
                  Confirm Promotions
                </h3>
                <p className="text-sm text-muted-foreground">
                  You are about to mark <strong className="text-secondary">{resolvedCount} members</strong> ready for promotion. Discord roles and announcements will be applied after you click "Confirm Promotions".
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {queueItems.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-center justify-between p-2 bg-secondary/10 rounded-lg border border-secondary/20"
                  >
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-foreground">
                        {item.discord_name}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {item.ign}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">{item.from_rank}</span>
                      <ArrowRight className="w-3 h-3 text-secondary/60" />
                      <span className="font-bold text-green-400">{item.to_rank}</span>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex gap-3 pt-4 border-t border-secondary/20">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={confirmQueue}
                  disabled={confirming}
                  className="flex-1 group relative inline-flex items-center justify-center gap-2 rounded-lg font-display font-bold py-3 transition overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-green-500/50 to-green-500/30 border border-green-500/60 rounded-lg group-hover:from-green-500/70 group-hover:to-green-500/50 group-disabled:from-muted/30 group-disabled:to-muted/20 transition" />
                  <div className="relative flex items-center gap-2 text-green-400 group-disabled:text-muted-foreground">
                    {confirming ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                    <span>{confirming ? "Confirming..." : "Confirm"}</span>
                  </div>
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowConfirmModal(false)}
                  className="flex-1 group relative inline-flex items-center justify-center rounded-lg font-display font-bold py-3 transition overflow-hidden"
                >
                  <div className="absolute inset-0 bg-muted/30 border border-muted/40 rounded-lg group-hover:bg-muted/40 transition" />
                  <div className="relative text-foreground">Cancel</div>
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PromotionQueueSection;
