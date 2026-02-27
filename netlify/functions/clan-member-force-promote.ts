// /.netlify/functions/clan-member-force-promote
// POST: manually promote a specific member to any rank (staff only)
// Bypasses all eligibility checks, updates role + DB, no announcement
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  assignRole,
  RANK_LADDER,
} from "./shared";

interface ForcePromoteBody {
  member_id: string;
  new_rank: string;
}

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

  // ── Parse body ────────────────────────────────────────────
  let body: ForcePromoteBody;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  if (!body.member_id || !body.new_rank) {
    return json({ error: "member_id and new_rank are required" }, 400);
  }

  // Validate rank
  const rankData = RANK_LADDER.find((r) => r.name === body.new_rank);
  if (!rankData) {
    return json({ error: "Invalid rank" }, 400);
  }

  // ── Fetch member ──────────────────────────────────────────
  const { data: member, error: fetchErr } = await supabase
    .from("clan_list_members")
    .select("*")
    .eq("id", body.member_id)
    .single();

  if (fetchErr || !member) {
    return json({ error: "Member not found" }, 404);
  }

  // ── Update Discord role ───────────────────────────────────
  let roleUpdated = false;
  if (member.discord_id && rankData.roleId) {
    roleUpdated = await assignRole(member.discord_id, rankData.roleId);
    if (!roleUpdated) {
      console.error(
        `Failed to assign role ${rankData.roleId} to ${member.discord_id}`
      );
    }
  }

  // ── Update database ───────────────────────────────────────
  const nowIso = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("clan_list_members")
    .update({
      rank_current: body.new_rank,
      rank_next: null,
      promote_eligible: false,
      promote_reason: null,
      updated_at: nowIso,
    })
    .eq("id", body.member_id);

  if (updateErr) {
    console.error("Force promotion DB update error:", updateErr);
    return json({ error: "Database update failed" }, 500);
  }

  // ── Audit log ─────────────────────────────────────────────
  await supabase.from("audit_log").insert({
    action: "clan_promotion_forced",
    actor_id: session.discord_id,
    target_id: member.discord_id ?? null,
    details: {
      member_id: body.member_id,
      discord_name: member.discord_name,
      ign: member.ign,
      from_rank: member.rank_current,
      to_rank: body.new_rank,
      role_updated: roleUpdated,
      discord_id_present: !!member.discord_id,
    },
  });

  return json({
    ok: true,
    role_updated: roleUpdated,
    member: {
      id: member.id,
      discord_name: member.discord_name,
      rank_current: body.new_rank,
    },
  });
};

export { handler };
