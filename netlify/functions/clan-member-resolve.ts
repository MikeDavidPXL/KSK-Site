// /.netlify/functions/clan-member-resolve
// POST: manually resolve a clan_list_members row via opaque resolve_token (staff only)
// The UI never sees discord_id — only signed tokens
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  verifyResolveToken,
} from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const staffMember = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = staffMember?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: { member_row_id?: string; resolve_token?: string };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.member_row_id || !body.resolve_token) {
    return json({ error: "member_row_id and resolve_token are required" }, 400);
  }

  // Verify token and extract discord_id
  const selectedDiscordId = verifyResolveToken(body.resolve_token);
  if (!selectedDiscordId) {
    return json({ error: "Invalid or expired resolve token" }, 400);
  }

  // Validate the extracted discord_id is still in the guild
  const selectedMember = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${selectedDiscordId}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  if (!selectedMember) {
    return json({ error: "Resolved user is not in guild", code: "DISCORD_NOT_IN_GUILD" }, 400);
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("clan_list_members")
    .select("id, discord_id")
    .eq("id", body.member_row_id)
    .single();

  if (fetchErr || !existing) {
    return json({ error: "Member row not found" }, 404);
  }

  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from("clan_list_members")
    .update({
      discord_id: selectedDiscordId,
      needs_resolution: false,
      resolution_status: "resolved_manual",
      resolved_at: now,
      resolved_by: session.discord_id,
      updated_at: now,
    })
    .eq("id", body.member_row_id)
    .select("id, resolution_status, resolved_at")
    .single();

  if (updErr) {
    return json({ error: "Failed to resolve member", details: updErr.message }, 500);
  }

  await supabase.from("audit_log").insert({
    action: "clan_member_resolved_manual",
    actor_id: session.discord_id,
    target_id: body.member_row_id,
    details: {
      old_discord_id: existing.discord_id,
      new_discord_id: selectedDiscordId,
      resolution_status: "resolved_manual",
    },
  });

  return json({ ok: true, member: updated });
};

export { handler };
