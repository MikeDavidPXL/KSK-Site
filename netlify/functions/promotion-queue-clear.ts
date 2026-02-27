// /.netlify/functions/promotion-queue-clear
// POST: clear promotion queue - remove all queued/confirmed items (staff only)
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
} from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const discordMember = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = discordMember?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  try {
    // ── Delete all queued/confirmed items ──────────────────────
    const { error: deleteErr } = await supabase
      .from("promotion_queue")
      .delete()
      .in("status", ["queued", "confirmed"]);

    if (deleteErr) {
      console.error("Queue clear error:", deleteErr);
      return json({ error: "Failed to clear queue" }, 500);
    }

    // ── Audit log ─────────────────────────────────────────────
    await supabase.from("audit_log").insert({
      action: "promotion_queue_cleared",
      actor_id: session.discord_id,
      details: {
        cleared_at: new Date().toISOString(),
      },
    });

    return json({
      ok: true,
      message: "Queue cleared",
    });
  } catch (err) {
    console.error("Queue clear error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
