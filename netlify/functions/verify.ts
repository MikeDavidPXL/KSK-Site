// /.netlify/functions/verify
// POST: Verify a user via Cloudflare Turnstile captcha → swap Unverified role for KOTH
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  assignRole,
  removeRole,
} from "./shared";

// ── Simple in-memory rate limiter (per cold-start; good enough for lambda) ──
const attempts = new Map<string, number[]>();
const RATE_WINDOW = 60_000; // 1 minute
const RATE_LIMIT = 3; // max 3 attempts per minute per user

function isRateLimited(discordId: string): boolean {
  const now = Date.now();
  const userAttempts = (attempts.get(discordId) ?? []).filter(
    (t) => now - t < RATE_WINDOW
  );
  attempts.set(discordId, userAttempts);
  if (userAttempts.length >= RATE_LIMIT) return true;
  userAttempts.push(now);
  return false;
}

// ── Validate Cloudflare Turnstile token ─────────────────────
async function validateTurnstile(token: string, ip: string): Promise<boolean> {
  const res = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY!,
        response: token,
        remoteip: ip,
      }),
    }
  );
  const data = (await res.json()) as { success: boolean };
  return data.success;
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Session check ─────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // ── Rate limit ────────────────────────────────────────────
  if (isRateLimited(session.discord_id)) {
    await supabase.from("audit_log").insert({
      action: "site_verify_rate_limited",
      actor_id: session.discord_id,
      details: { reason: "Too many attempts" },
    });
    return json(
      { error: "Too many attempts. Try again in a minute.", code: "RATE_LIMITED" },
      429
    );
  }

  // ── Parse body ────────────────────────────────────────────
  let body: { captcha_token?: string };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.captcha_token) {
    return json({ error: "Missing captcha token", code: "MISSING_TOKEN" }, 400);
  }

  // ── Fetch guild member ────────────────────────────────────
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );

  console.log("[verify] member lookup", {
    session_discord_id: session.discord_id,
    discord_member_found: !!member,
  });

  if (!member) {
    return json(
      { error: "You must be in the Discord server first.", code: "NOT_IN_GUILD" },
      403
    );
  }

  const roles: string[] = member.roles ?? [];
  console.log("[verify] roles before", {
    session_discord_id: session.discord_id,
    roles_before: roles,
  });
  const isStaff = roles.includes(process.env.DISCORD_STAFF_ROLE_ID!);
  const isPrivate = roles.includes(process.env.DISCORD_MEMBER_ROLE_ID!);
  const isKoth = roles.includes(process.env.DISCORD_KOTH_PLAYER_ROLE_ID!);

  // ── Already verified? Skip captcha ────────────────────────
  if (isStaff || isPrivate || isKoth) {
    return json({ ok: true, skipped: true });
  }

  // ── Validate Turnstile captcha ────────────────────────────
  const clientIp =
    event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    event.headers["client-ip"] ||
    "0.0.0.0";

  const captchaValid = await validateTurnstile(body.captcha_token, clientIp);

  if (!captchaValid) {
    await supabase.from("audit_log").insert({
      action: "site_verify_captcha_fail",
      actor_id: session.discord_id,
      details: { ip: clientIp },
    });
    return json(
      { error: "Captcha verification failed. Please try again.", code: "CAPTCHA_FAIL" },
      400
    );
  }

  // ── Role swap: remove Unverified, add KOTH ────────────────
  const hasUnverified = roles.includes(process.env.DISCORD_UNVERIFIED_ROLE_ID!);
  let removedUnverified = false;
  let addedKoth = false;

  if (hasUnverified) {
    removedUnverified = await removeRole(
      session.discord_id,
      process.env.DISCORD_UNVERIFIED_ROLE_ID!
    );
  }

  addedKoth = await assignRole(
    session.discord_id,
    process.env.DISCORD_KOTH_PLAYER_ROLE_ID!
  );

  const memberAfter = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const rolesAfter: string[] = memberAfter?.roles ?? [];
  console.log("[verify] roles after", {
    session_discord_id: session.discord_id,
    roles_after: rolesAfter,
  });

  if (!addedKoth) {
    await supabase.from("audit_log").insert({
      action: "site_verify_role_fail",
      actor_id: session.discord_id,
      details: {
        removed_unverified: removedUnverified,
        added_koth: false,
        error: "Failed to assign KOTH role",
      },
    });
    return json(
      {
        error: "Verification succeeded but role assignment failed. Please contact staff.",
        code: "ROLE_FAIL",
      },
      500
    );
  }

  // ── Audit log success ─────────────────────────────────────
  await supabase.from("audit_log").insert({
    action: "site_verify_success",
    actor_id: session.discord_id,
    details: {
      removed_unverified: removedUnverified,
      added_koth: addedKoth,
      ip: clientIp,
      session_discord_id: session.discord_id,
      discord_member_found: true,
      roles_before: roles,
      roles_after: rolesAfter,
    },
  });

  return json({ ok: true });
};

export { handler };
