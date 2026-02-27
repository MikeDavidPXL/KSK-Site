import { useEffect, useRef, useState, useCallback } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";
import { Loader2, ShieldCheck, AlertTriangle } from "lucide-react";

// Cloudflare Turnstile site key — set via env / hardcoded for public key
const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string;

const VerifyPage = () => {
  const { user, loading: authLoading, refresh } = useAuth();
  const navigate = useNavigate();

  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReady, setCaptchaReady] = useState(false);
  const [widgetRendered, setWidgetRendered] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | null>(null);
  const scriptAdded = useRef(false);

  // ── Load Turnstile script once ──────────────────────────
  useEffect(() => {
    // Already loaded
    if (window.turnstile) {
      setCaptchaReady(true);
      return;
    }

    // Prevent double-adding in strict mode
    if (scriptAdded.current) return;
    scriptAdded.current = true;

    const callbackName = "__turnstile_onload__";
    (window as any)[callbackName] = () => {
      setCaptchaReady(true);
    };

    const script = document.createElement("script");
    script.src = `https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=${callbackName}`;
    script.async = true;
    document.head.appendChild(script);

    return () => {
      delete (window as any)[callbackName];
    };
  }, []);

  // ── Render Turnstile widget when script is ready AND ref is mounted ──
  useEffect(() => {
    if (!captchaReady || !widgetRef.current || !window.turnstile) return;
    // Don't render twice
    if (turnstileWidgetId.current) return;
    if (!TURNSTILE_SITE_KEY) {
      setError("Captcha configuration missing. Please contact staff.");
      return;
    }

    try {
      turnstileWidgetId.current = window.turnstile.render(widgetRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token: string) => {
          setCaptchaToken(token);
          setError(null);
        },
        "error-callback": (errorCode: string) => {
          setCaptchaToken(null);
          console.error("[Turnstile] error-callback fired:", errorCode);
          // Don't treat interactive-timeout as fatal — just let user retry
          if (errorCode === "110200") {
            setError("Captcha timed out. Please try again.");
          } else {
            setError(`Captcha error (${errorCode || "unknown"}). Please refresh the page.`);
          }
        },
        "expired-callback": () => {
          setCaptchaToken(null);
          setError("Captcha expired. Please complete it again.");
        },
        theme: "dark",
        retry: "auto",
        "retry-interval": 2000,
      });
      setWidgetRendered(true);
    } catch {
      setError("Failed to initialize captcha. Please refresh the page.");
    }
    // Re-run when authLoading changes so the effect fires after the ref is mounted
  }, [captchaReady, authLoading]);

  // ── Reset captcha helper ────────────────────────────────
  const resetCaptcha = useCallback(() => {
    setCaptchaToken(null);
    if (window.turnstile && turnstileWidgetId.current) {
      window.turnstile.reset(turnstileWidgetId.current);
    }
  }, []);

  // ── Submit verify ───────────────────────────────────────
  const handleVerify = async () => {
    if (!captchaToken) return;
    setError(null);
    setVerifying(true);

    try {
      const res = await fetch("/.netlify/functions/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captcha_token: captchaToken }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed.");
        resetCaptcha();
        return;
      }

      // Success — refresh auth context to pick up new roles
      await refresh();
      navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
      resetCaptcha();
    } finally {
      setVerifying(false);
    }
  };

  // ── Guards ──────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;
  if (user.is_staff || user.is_private) return <Navigate to="/pack" replace />;
  if (user.is_koth) return <Navigate to="/dashboard" replace />;
  if (!user.in_guild) return <Navigate to="/dashboard" replace />;

  // Only unverified users should see this page
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

      <div className="relative z-10 container mx-auto px-4 py-16 max-w-lg">
        <motion.div
          className="bg-card border border-border rounded-xl p-10 text-center neon-border-blue"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex justify-center mb-4">
            <ShieldCheck className="w-10 h-10 text-primary" />
          </div>

          <h1 className="font-display text-2xl font-bold mb-2 text-foreground">
            Verify Your Account
          </h1>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto text-sm">
            Complete the captcha below to verify you're human. This will unlock
            access to apply for the 420 Clan.
          </p>

          {/* Turnstile widget */}
          <div className="flex justify-center mb-4">
            {!widgetRendered && !error && (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading captcha...
              </div>
            )}
            <div ref={widgetRef} />
          </div>

          {/* Status hint */}
          {widgetRendered && !captchaToken && !error && (
            <p className="text-xs text-muted-foreground mb-4">
              Complete the captcha above to enable the button.
            </p>
          )}
          {captchaToken && (
            <p className="text-xs text-green-400 mb-4">
              Captcha completed — click Verify to continue.
            </p>
          )}

          {error && (
            <div className="flex items-center gap-2 justify-center bg-destructive/10 border border-destructive/30 rounded-lg p-3 mb-6 text-sm text-destructive">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleVerify}
            disabled={!captchaToken || verifying}
            className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-display font-bold py-3 rounded-lg transition neon-box-blue"
          >
            {verifying ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <ShieldCheck className="w-5 h-5" />
            )}
            {verifying ? "Verifying..." : "Verify"}
          </button>
        </motion.div>
      </div>
    </div>
  );
};

// Global type augmentation for Turnstile
declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: Record<string, unknown>
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

export default VerifyPage;
