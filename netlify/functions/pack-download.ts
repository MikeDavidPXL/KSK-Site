// pack-download — Auth-gated endpoint that generates a single-use download token.
// Returns a URL the frontend can open to trigger the actual redirect.
import type { Handler } from "@netlify/functions";
import crypto from "crypto";
import {
  supabase,
  getSessionFromCookie,
  discordFetch,
  isCorporalOrHigher,
} from "./shared";

const json = (body: unknown, status = 200) => ({
  statusCode: status,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const TOKEN_TTL_SECONDS = 300; // 5 minutes

export const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Auth check ──────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Verify user is still in the guild and has the private or staff role
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  if (!member) {
    return json({ error: "Not a guild member" }, 403);
  }

  const roles: string[] = member.roles ?? [];
  const isStaff = roles.includes(process.env.DISCORD_STAFF_ROLE_ID!);
  const isCorporalPlus = isCorporalOrHigher(roles);

  // Must be Corporal+ rank or Staff to download
  if (!isCorporalPlus && !isStaff) {
    return json({ error: "Forbidden — you need Corporal rank or higher to download" }, 403);
  }

  // ── Rate limit: max 5 tokens per user per hour ──────────
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("download_tokens")
    .select("id", { count: "exact", head: true })
    .eq("discord_id", session.discord_id)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= 5) {
    return json({ error: "Too many download requests. Try again later." }, 429);
  }

  // ── Generate token ──────────────────────────────────────
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SECONDS * 1000).toISOString();

  const { error: insertError } = await supabase.from("download_tokens").insert({
    token,
    discord_id: session.discord_id,
    expires_at: expiresAt,
    ip_address:
      event.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
      event.headers["client-ip"] ||
      null,
  });

  if (insertError) {
    console.error("Failed to create download token", insertError);
    return json({ error: "Server error" }, 500);
  }

  // ── Return the tokenised URL ────────────────────────────
  const origin =
    event.headers.origin ||
    event.headers.referer?.replace(/\/+$/, "") ||
    `https://${event.headers.host}`;

  return json({
    url: `${origin}/.netlify/functions/pack-redirect?token=${encodeURIComponent(token)}`,
    expires_in: TOKEN_TTL_SECONDS,
  });
};
