// /.netlify/functions/promotion-queue-list
// GET: fetch promotion queue items (staff only)
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
} from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
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
    // ── Fetch all queue items ─────────────────────────────────
    const { data: items, error: fetchErr } = await supabase
      .from("promotion_queue")
      .select("*")
      .order("status", { ascending: false })
      .order("created_at", { ascending: false });

    if (fetchErr) {
      console.error("Fetch queue error:", fetchErr);
      return json({ error: "Failed to fetch queue" }, 500);
    }

    return json({
      ok: true,
      items: items ?? [],
    });
  } catch (err) {
    console.error("Queue list error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
