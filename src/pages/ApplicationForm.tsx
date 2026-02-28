import { useState, useRef, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { ArrowLeft, Send, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

const ApplicationForm = () => {
  const { user, loading: authLoading, refresh } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    uid: "",
    age: "",
    speaks_english: "",
    timezone: "",
    activity: "",
    level: "",
    playstyle: "",
    banned_koth_cheating: "",
    looking_for: "",
    has_mic: "",
    clan_history: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOverride, setConfirmOverride] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  // Scroll to the error/override box whenever it appears
  useEffect(() => {
    if ((confirmOverride || error) && errorRef.current) {
      errorRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [confirmOverride, error]);

  // Guard: Discord roles are the truth for access.
  // staff / private → pack page, no session → login, unverified → verify, no koth → dashboard
  if (!authLoading && !user) return <Navigate to="/" replace />;
  if (!authLoading && user && user.effective_status === "accepted") return <Navigate to="/pack" replace />;
  if (!authLoading && user && user.is_unverified && !user.is_koth) return <Navigate to="/verify" replace />;
  if (!authLoading && user && user.effective_status !== "koth") return <Navigate to="/dashboard" replace />;

  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  const handle = (field: string, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const doSubmit = async (override = false) => {
    setError(null);
    setConfirmOverride(null);
    setSubmitting(true);

    try {
      const res = await fetch("/.netlify/functions/application-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, override }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.code === "ALREADY_ACCEPTED" || data.code === "ALREADY_PENDING") {
          setConfirmOverride(data.code);
          return;
        }
        setError(data.error || "Something went wrong");
        return;
      }

      await refresh();
      navigate("/dashboard");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    doSubmit(false);
  };

  if (!user) return null; // should never reach here due to guards above

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 smoke-overlay pointer-events-none" />
      <div className="relative z-10 container mx-auto px-4 py-12 max-w-xl">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>

        <motion.div
          className="bg-card border border-border rounded-xl p-8 neon-border-purple"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <h1 className="font-display text-2xl font-bold mb-6 neon-text-purple text-secondary text-center">
            Clan Application
          </h1>

          {/* Confirm override dialog */}
          {confirmOverride && (
            <div ref={errorRef} className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 text-center">
              <p className="text-sm text-yellow-300 font-display font-bold mb-1">
                {confirmOverride === "ALREADY_ACCEPTED"
                  ? "You already have an accepted application."
                  : "You already have a pending application."}
              </p>
              <p className="text-xs text-muted-foreground mb-4">
                Do you want to submit a new application anyway? Your previous one will remain in the system.
              </p>
              <div className="flex gap-3 justify-center">
                <button
                  type="button"
                  onClick={() => setConfirmOverride(null)}
                  className="px-5 py-2 rounded-lg border border-border text-sm font-display text-muted-foreground hover:text-foreground transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => doSubmit(true)}
                  disabled={submitting}
                  className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-bold hover:bg-primary/90 transition disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Send anyway"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <div ref={!confirmOverride ? errorRef : undefined} className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-6 text-sm text-destructive text-center">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <Field
              label="1. What is your UID?"
              value={form.uid}
              onChange={(v) => handle("uid", v)}
              placeholder="Your FiveM UID"
            />
            <Field
              label="2. Age?"
              value={form.age}
              onChange={(v) => handle("age", v)}
              type="number"
              placeholder="18"
            />
            <SelectField
              label="3. Do you speak English?"
              value={form.speaks_english}
              onChange={(v) => handle("speaks_english", v)}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
            <Field
              label="4. Where are you from (timezone)?"
              value={form.timezone}
              onChange={(v) => handle("timezone", v)}
              placeholder="e.g. CET, EST, PST"
            />
            <Field
              label="5. How active are you?"
              value={form.activity}
              onChange={(v) => handle("activity", v)}
              placeholder="e.g. Daily, 3-4 days/week"
            />
            <Field
              label="6. What's your lvl?"
              value={form.level}
              onChange={(v) => handle("level", v)}
              placeholder="Your current level"
            />
            <TextArea
              label="7. What’s your preferred playstyle?"
              value={form.playstyle}
              onChange={(v) => handle("playstyle", v)}
              placeholder="Aggressive, support, objective-focused, etc."
            />
            <SelectField
              label="8. Have you ever been banned from KOTH for cheating?"
              value={form.banned_koth_cheating}
              onChange={(v) => handle("banned_koth_cheating", v)}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
            <TextArea
              label="9. What are you looking for in a clan?"
              value={form.looking_for}
              onChange={(v) => handle("looking_for", v)}
              placeholder="What matters most to you in a clan?"
            />
            <SelectField
              label="10. Do you have a mic?"
              value={form.has_mic}
              onChange={(v) => handle("has_mic", v)}
              options={[
                { value: "yes", label: "Yes" },
                { value: "no", label: "No" },
              ]}
            />
            <TextArea
              label="11. Are you currently in or have previously been a member of a clan?"
              value={form.clan_history}
              onChange={(v) => handle("clan_history", v)}
              placeholder="Tell us about your current/previous clan membership"
            />

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-display font-bold py-3 rounded-lg transition neon-box-blue"
            >
              {submitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
              Submit Application
            </button>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-display text-foreground mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-sm font-display text-foreground mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition"
      >
        <option value="" disabled>
          Select an option
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-display text-foreground mb-1.5">
        {label}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required
        rows={3}
        className="w-full bg-muted border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/50 transition resize-none"
      />
    </div>
  );
}

export default ApplicationForm;
