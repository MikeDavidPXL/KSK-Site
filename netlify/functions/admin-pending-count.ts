// /.netlify/functions/admin-pending-count
// GET: return count of pending (non-archived) applications (staff only)
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

const handler: Handler = async (event) => {
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

  const { count, error } = await supabase
    .from("applications")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
    .is("archived_at", null);

  if (error) {
    console.error("Pending count error:", error);
    return json({ error: "Failed to count" }, 500);
  }

  return json({ pending: count ?? 0 });
};

export { handler };
