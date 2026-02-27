// Ban Report Page — for members to report their bans
import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  Loader2,
  CheckCircle,
  Shield,
} from "lucide-react";
import clanLogo from "@/assets/clan-logo.png";

const BAN_REASONS = [
  { value: "cheating", label: "Cheating" },
  { value: "toxic_behavior", label: "Toxic behavior" },
  { value: "exploiting", label: "Exploiting" },
  { value: "rule_violation", label: "Rule violation" },
  { value: "false_ban", label: "Mistake / False ban" },
  { value: "other", label: "Other" },
];

const BanReportPage = () => {
  const { user, loading: authLoading, loginUrl } = useAuth();

  // Form state
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [additionalContext, setAdditionalContext] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!reason) {
      setError("Please select a reason for your ban.");
      return;
    }

    if (reason === "other" && !customReason.trim()) {
      setError("Please provide a custom reason.");
      return;
    }

    if (!confirmed) {
      setError("You must confirm the checkbox to proceed.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch("/.netlify/functions/ban-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          custom_reason: reason === "other" ? customReason : undefined,
          additional_context: additionalContext || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to submit ban report.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Loading
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    );
  }

  // Not logged in — show login prompt
  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        {/* Nav */}
        <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-lg">
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
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <span className="font-display text-lg font-bold text-red-500 hidden sm:block">
                Ban Report
              </span>
            </div>
            <div className="w-24" />
          </div>
        </nav>

        {/* Login prompt */}
        <div className="container mx-auto px-4 max-w-lg py-24 text-center">
          <Shield className="w-16 h-16 text-red-500 mx-auto mb-6" />
          <h1 className="font-display text-2xl font-bold text-foreground mb-4">
            Login Required
          </h1>
          <p className="text-muted-foreground mb-8">
            You must be logged in with Discord to submit a ban report.
          </p>
          <a
            href={loginUrl}
            className="inline-flex items-center gap-2 bg-[#5865F2] hover:bg-[#4752C4] text-white font-display font-bold px-6 py-3 rounded-lg transition"
          >
            Login with Discord
          </a>
        </div>
      </div>
    );
  }

  // Success state
  if (success) {
    return (
      <div className="min-h-screen bg-background">
        {/* Nav */}
        <nav className="sticky top-0 z-50 bg-background/90 backdrop-blur-md border-b border-border shadow-lg">
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
              <CheckCircle className="w-5 h-5 text-foreground" />
              <span className="font-display text-lg font-bold text-foreground hidden sm:block">
                Report Received
              </span>
            </div>
            <div className="w-24" />
          </div>
        </nav>

        {/* Success message */}
        <div className="container mx-auto px-4 max-w-lg py-24 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
          >
            <CheckCircle className="w-20 h-20 text-foreground mx-auto mb-6" />
          </motion.div>
          <h1 className="font-display text-2xl font-bold text-foreground mb-4">
            Ban Report Received
          </h1>
          <p className="text-muted-foreground mb-2">
            Your ban report has been received.
          </p>
          <p className="text-muted-foreground mb-8">
            Our team has been notified.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 bg-muted hover:bg-muted/80 text-foreground font-display font-bold px-6 py-3 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Homepage
          </Link>
        </div>
      </div>
    );
  }

  // Form
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
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
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="font-display text-lg font-bold text-red-500 hidden sm:block">
              Ban Report
            </span>
          </div>
          <div className="flex items-center gap-2">
            {user.avatar && (
              <img
                src={user.avatar}
                alt=""
                className="w-8 h-8 rounded-full border border-border"
              />
            )}
            <span className="text-sm text-foreground hidden sm:block">
              {user.username}
            </span>
          </div>
        </div>
      </motion.nav>

      {/* Form */}
      <div className="container mx-auto px-4 max-w-xl py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="text-center mb-8">
            <AlertTriangle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h1 className="font-display text-2xl font-bold text-foreground mb-2">
              Report Your Ban
            </h1>
            <p className="text-muted-foreground text-sm">
              Submit this report within 24 hours of being banned. This helps us
              track your case if you win an appeal later.
            </p>
          </div>

          {/* Warning box */}
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-400">
              <strong>Important:</strong> This is NOT an appeal form. This form is only
              to notify the clan that you have been banned.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Reason */}
            <div>
              <label className="block text-sm font-display text-foreground mb-2">
                Reason for Ban <span className="text-red-500">*</span>
              </label>
              <div className="space-y-2">
                {BAN_REASONS.map((r) => (
                  <label
                    key={r.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                      reason === r.value
                        ? "bg-red-500/10 border-red-500/50"
                        : "bg-card border-border hover:border-muted-foreground/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="reason"
                      value={r.value}
                      checked={reason === r.value}
                      onChange={() => setReason(r.value)}
                      className="accent-red-500 w-4 h-4"
                    />
                    <span className="text-sm text-foreground">{r.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Custom reason (if "other" selected) */}
            {reason === "other" && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.2 }}
              >
                <label className="block text-sm font-display text-foreground mb-2">
                  Describe the reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="What was the stated reason for your ban?"
                  maxLength={200}
                  className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border"
                />
              </motion.div>
            )}

            {/* Additional context */}
            <div>
              <label className="block text-sm font-display text-foreground mb-2">
                Additional Context{" "}
                <span className="text-muted-foreground">(Optional)</span>
              </label>
              <textarea
                value={additionalContext}
                onChange={(e) => setAdditionalContext(e.target.value)}
                placeholder="Any additional information you want to provide..."
                rows={4}
                maxLength={1000}
                className="w-full bg-muted border border-border rounded-lg px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-border resize-none"
              />
              <p className="text-xs text-muted-foreground mt-1 text-right">
                {additionalContext.length}/1000
              </p>
            </div>

            {/* Confirmation checkbox */}
            <div className="bg-card border border-border rounded-lg p-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="accent-red-500 w-5 h-5 mt-0.5"
                />
                <span className="text-sm text-foreground">
                  I understand this does not guarantee an appeal.
                </span>
              </label>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-display font-bold py-4 rounded-lg transition disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <AlertTriangle className="w-5 h-5" />
              )}
              Submit Ban Report
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default BanReportPage;
