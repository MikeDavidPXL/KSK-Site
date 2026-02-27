// /.netlify/functions/admin-application-note
// POST: add an internal note to an application (staff only)
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

const MAX_NOTE_LENGTH = 1000;

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Auth check ────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // ── Staff role check ──────────────────────────────────
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
  let body: { application_id?: string; note?: string };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { application_id, note } = body;

  if (!application_id) {
    return json({ error: "application_id is required" }, 400);
  }
  if (!note || note.trim().length === 0) {
    return json({ error: "note is required" }, 400);
  }
  if (note.length > MAX_NOTE_LENGTH) {
    return json(
      { error: `Note must be ${MAX_NOTE_LENGTH} characters or less` },
      400
    );
  }

  // ── Verify application exists ─────────────────────────
  const { data: app, error: appErr } = await supabase
    .from("applications")
    .select("id")
    .eq("id", application_id)
    .single();

  if (appErr || !app) {
    return json({ error: "Application not found" }, 404);
  }

  // ── Insert note ───────────────────────────────────────
  const { error: insertErr } = await supabase
    .from("application_notes")
    .insert({
      application_id,
      note: note.trim(),
      created_by: session.discord_id,
      created_by_username: session.username || null,
    });

  if (insertErr) {
    console.error("Insert note error:", insertErr);
    return json({ error: "Failed to save note" }, 500);
  }

  // ── Audit log ─────────────────────────────────────────
  await supabase.from("audit_log").insert({
    action: "application_note_added",
    target_id: application_id,
    actor_id: session.discord_id,
    details: {
      note_preview: note.trim().slice(0, 100),
    },
  });

  // ── Return updated notes list ─────────────────────────
  const { data: notes } = await supabase
    .from("application_notes")
    .select("id, note, created_at, created_by, created_by_username")
    .eq("application_id", application_id)
    .order("created_at", { ascending: false });

  return json({ ok: true, notes: notes ?? [] });
};

export { handler };
