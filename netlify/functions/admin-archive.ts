// /.netlify/functions/admin-archive
// POST: archive or restore an application (staff only)
// Body: { application_id, action: "archive" | "restore", reason?: string }
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

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

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { application_id, action, reason } = body;
  if (!application_id || !["archive", "restore"].includes(action)) {
    return json(
      { error: "application_id and action (archive|restore) required" },
      400
    );
  }

  // Verify application exists
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("id, discord_name, archived_at")
    .eq("id", application_id)
    .single();

  if (fetchErr || !app) {
    return json({ error: "Application not found" }, 404);
  }

  if (action === "archive") {
    if (app.archived_at) {
      return json({ error: "Already archived" }, 409);
    }

    const { error } = await supabase
      .from("applications")
      .update({
        archived_at: new Date().toISOString(),
        archived_by: session.discord_id,
        archive_reason: reason || null,
      })
      .eq("id", application_id);

    if (error) {
      console.error("Archive error:", error);
      return json({ error: "Failed to archive" }, 500);
    }

    await supabase.from("audit_log").insert({
      action: "application_archived",
      target_id: application_id,
      actor_id: session.discord_id,
      details: { reason: reason || null, discord_name: app.discord_name },
    });

    return json({ ok: true, action: "archived" });
  }

  // ── Restore ────────────────────────────────────────────
  if (!app.archived_at) {
    return json({ error: "Not archived" }, 409);
  }

  const { error } = await supabase
    .from("applications")
    .update({
      archived_at: null,
      archived_by: null,
      archive_reason: null,
    })
    .eq("id", application_id);

  if (error) {
    console.error("Restore error:", error);
    return json({ error: "Failed to restore" }, 500);
  }

  await supabase.from("audit_log").insert({
    action: "application_restored",
    target_id: application_id,
    actor_id: session.discord_id,
    details: { discord_name: app.discord_name },
  });

  return json({ ok: true, action: "restored" });
};

export { handler };
