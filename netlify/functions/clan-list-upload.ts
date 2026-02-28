// /.netlify/functions/clan-list-upload
// POST: receive parsed rows from XLSX (client-side parsed), store in DB
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

const MAX_ROWS = 5000;
const MAX_FILE_NAME_LENGTH = 255;

// Simple per-user rate limit (1 upload per 30s per cold start)
const lastUpload = new Map<string, number>();
const UPLOAD_COOLDOWN = 30_000;

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

  // ── Rate limit ────────────────────────────────────────
  const now = Date.now();
  const last = lastUpload.get(session.discord_id) ?? 0;
  if (now - last < UPLOAD_COOLDOWN) {
    return json({ error: "Please wait before uploading again.", code: "RATE_LIMITED" }, 429);
  }
  lastUpload.set(session.discord_id, now);

  // ── Parse body ────────────────────────────────────────
  let body: { file_name?: string; rows?: Record<string, unknown>[] };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { file_name, rows } = body;

  if (!file_name || file_name.length > MAX_FILE_NAME_LENGTH) {
    return json({ error: "file_name is required (max 255 chars)" }, 400);
  }
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return json({ error: "rows is required (non-empty array)" }, 400);
  }
  if (rows.length > MAX_ROWS) {
    return json({ error: `Maximum ${MAX_ROWS} rows allowed` }, 400);
  }

  // ── Create clan_list entry ────────────────────────────
  const { data: list, error: listErr } = await supabase
    .from("clan_list")
    .insert({
      uploaded_by: session.discord_id,
      file_name,
      row_count: rows.length,
    })
    .select("id")
    .single();

  if (listErr || !list) {
    console.error("clan_list insert error:", listErr);
    return json({ error: "Failed to create list" }, 500);
  }

  // ── Insert rows in batches ────────────────────────────
  const BATCH_SIZE = 500;
  let insertedCount = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE).map((row) => ({
      list_id: list.id,
      row_data: row,
    }));

    const { error: rowErr } = await supabase
      .from("clan_list_rows")
      .insert(batch);

    if (rowErr) {
      console.error("clan_list_rows insert error:", rowErr);
      // Clean up the list entry on failure
      await supabase.from("clan_list").delete().eq("id", list.id);
      return json({ error: "Failed to insert rows" }, 500);
    }

    insertedCount += batch.length;
  }

  // ── Audit log ─────────────────────────────────────────
  await supabase.from("audit_log").insert({
    action: "clan_list_uploaded",
    actor_id: session.discord_id,
    target_id: list.id,
    details: { file_name, row_count: insertedCount },
  });

  return json({ ok: true, list_id: list.id, row_count: insertedCount });
};

export { handler };
