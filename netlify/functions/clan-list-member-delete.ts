// /.netlify/functions/clan-list-member-delete
// DELETE: remove a member from the clan list (staff only)
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
} from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "DELETE") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Auth ──────────────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  // ── Parse member_id from query string ─────────────────────
  const memberId = event.queryStringParameters?.id;
  if (!memberId) {
    return json({ error: "Missing id parameter" }, 400);
  }

  // ── Fetch member details for audit log ────────────────────
  const { data: existing, error: fetchErr } = await supabase
    .from("clan_list_members")
    .select("discord_name, ign, uid")
    .eq("id", memberId)
    .maybeSingle();

  if (fetchErr || !existing) {
    return json({ error: "Member not found" }, 404);
  }

  // ── Delete member ──────────────────────────────────────────
  const { error: deleteErr } = await supabase
    .from("clan_list_members")
    .delete()
    .eq("id", memberId);

  if (deleteErr) {
    console.error("Delete member error:", deleteErr);
    return json({ error: "Failed to delete member" }, 500);
  }

  // ── Audit log ─────────────────────────────────────────────
  await supabase.from("audit_log").insert({
    action: "clan_member_deleted",
    actor_id: session.discord_id,
    details: {
      member_id: memberId,
      discord_name: existing.discord_name,
      ign: existing.ign,
      uid: existing.uid,
    },
  });

  return json({ ok: true });
};

export { handler };
