// /.netlify/functions/clan-list-archive
// POST: archive or restore a clan list (staff only)
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Auth ──────────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // ── Staff check ───────────────────────────────────────
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  // ── Parse body ────────────────────────────────────────
  let body: { list_id?: string; action?: string; reason?: string };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { list_id, action, reason } = body;

  if (!list_id || !["archive", "restore"].includes(action || "")) {
    return json({ error: "list_id and action (archive|restore) required" }, 400);
  }

  // ── Verify list exists ────────────────────────────────
  const { data: list } = await supabase
    .from("clan_list")
    .select("id, archived_at")
    .eq("id", list_id)
    .single();

  if (!list) {
    return json({ error: "List not found" }, 404);
  }

  if (action === "archive") {
    const { error } = await supabase
      .from("clan_list")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: session.discord_id,
        archive_reason: reason || null,
      })
      .eq("id", list_id);

    if (error) return json({ error: "Failed to archive" }, 500);

    await supabase.from("audit_log").insert({
      action: "clan_list_archived",
      actor_id: session.discord_id,
      target_id: list_id,
      details: { reason: reason || null },
    });
  } else {
    const { error } = await supabase
      .from("clan_list")
      .update({
        archived_at: null,
        archived_by: null,
        archive_reason: null,
      })
      .eq("id", list_id);

    if (error) return json({ error: "Failed to restore" }, 500);

    await supabase.from("audit_log").insert({
      action: "clan_list_restored",
      actor_id: session.discord_id,
      target_id: list_id,
      details: {},
    });
  }

  return json({ ok: true });
};

export { handler };
