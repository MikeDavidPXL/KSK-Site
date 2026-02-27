// /.netlify/functions/admin-applications-archive-all
// POST: archive all accepted/rejected applications (staff only)
// Body: { reason?: string }
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json, postAppLog } from "./shared";

// Simple in-memory rate limiter (per deployment instance)
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 3; // max 3 calls per minute per user

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth check
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // Staff role check via Discord
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  // Rate limit check
  const now = Date.now();
  const userKey = session.discord_id;
  const lastCall = rateLimitMap.get(userKey) || 0;
  if (now - lastCall < RATE_LIMIT_WINDOW / RATE_LIMIT_MAX) {
    return json({ error: "Rate limited. Please wait before trying again." }, 429);
  }
  rateLimitMap.set(userKey, now);

  let body: { reason?: string } = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const reason = body.reason?.trim() || "cleanup";

  // Archive only accepted/rejected applications that are not already archived
  const { data: toArchive, error: selectErr } = await supabase
    .from("applications")
    .select("id")
    .in("status", ["accepted", "rejected"])
    .is("archived_at", null);

  if (selectErr) {
    console.error("Archive all select error:", selectErr);
    return json({ error: "Failed to query applications" }, 500);
  }

  const ids = toArchive?.map((a) => a.id) ?? [];
  
  if (ids.length === 0) {
    // No rows to archive — still success, just 0 count
    await supabase.from("audit_log").insert({
      action: "applications_archive_all",
      actor_id: session.discord_id,
      details: { archived_count: 0, reason },
    });

    return json({ ok: true, archived_count: 0 });
  }

  // Perform the bulk update
  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      archived_at: new Date().toISOString(),
      archived_by: session.discord_id,
      archive_reason: reason,
    })
    .in("id", ids);

  if (updateErr) {
    console.error("Archive all update error:", updateErr);
    return json({ error: "Failed to archive applications" }, 500);
  }

  const archivedCount = ids.length;

  // Audit log
  await supabase.from("audit_log").insert({
    action: "applications_archive_all",
    actor_id: session.discord_id,
    details: { archived_count: archivedCount, reason },
  });

  // Discord log (no ping, just info)
  try {
    const logMsg = `🗃️ Archive All executed
Archived: ${archivedCount} application${archivedCount !== 1 ? "s" : ""}
By: <@${session.discord_id}>
Reason: ${reason}`;
    await postAppLog(logMsg, false);
  } catch (e) {
    // Don't fail the request if Discord logging fails
    console.error("Discord log error:", e);
  }

  return json({ ok: true, archived_count: archivedCount });
};

export { handler };
