// /.netlify/functions/clan-promotions-preview
// POST: calculate all members eligible for promotion (staff only)
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  computeTimeDays,
  earnedRank,
  rankIndex,
  RANK_LADDER,
} from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
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

  // ── Fetch all active+tagged members (exclude archived/not-in-guild) ─
  const { data: candidates, error } = await supabase
    .from("clan_list_members")
    .select("*")
    .eq("status", "active")
    .eq("has_420_tag", true)
    .is("archived_at", null)
    .eq("in_guild", true);

  if (error) {
    console.error("Preview query error:", error);
    return json({ error: "Failed to fetch members" }, 500);
  }

  const promotions: {
    member_id: string;
    discord_name: string;
    discord_id: string | null;
    ign: string;
    uid: string;
    from_rank: string;
    to_rank: string;
    time_in_clan_days: number;
    reason: string;
    needs_resolution: boolean;
  }[] = [];

  const unresolvedMembers: {
    member_id: string;
    discord_name: string;
    ign: string;
    uid: string;
    from_rank: string;
    to_rank: string;
  }[] = [];

  for (const m of candidates ?? []) {
    const days = computeTimeDays(m.frozen_days, m.counting_since);
    const earned = earnedRank(days);
    const currentIdx = rankIndex(m.rank_current);
    const earnedIdx = RANK_LADDER.indexOf(earned);

    // Skip if already at max rank or earned rank is not higher
    if (currentIdx >= RANK_LADDER.length - 1) continue;
    if (earnedIdx <= currentIdx) continue;

    const toRank = earned.name;
    const reason = `${days} days in clan, meets ${earned.name} threshold (${earned.daysRequired} days)`;

    const entry = {
      member_id: m.id,
      discord_name: m.discord_name,
      discord_id: m.discord_id,
      ign: m.ign,
      uid: m.uid,
      from_rank: m.rank_current,
      to_rank: toRank,
      time_in_clan_days: days,
      reason,
      needs_resolution: m.needs_resolution || !m.discord_id,
    };

    promotions.push(entry);

    if (!m.discord_id) {
      unresolvedMembers.push({
        member_id: m.id,
        discord_name: m.discord_name,
        ign: m.ign,
        uid: m.uid,
        from_rank: m.rank_current,
        to_rank: toRank,
      });
    }
  }

  // Also update cached promote fields in DB
  for (const p of promotions) {
    await supabase
      .from("clan_list_members")
      .update({
        rank_next: p.to_rank,
        promote_eligible: true,
        promote_reason: p.reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.member_id);
  }

  await supabase.from("audit_log").insert({
    action: "clan_promotions_preview",
    actor_id: session.discord_id,
    details: {
      total_due: promotions.length,
      unresolved: unresolvedMembers.length,
    },
  });

  return json({
    promotions,
    total_due: promotions.length,
    threshold_met: promotions.filter((p) => p.discord_id).length >= 5,
    unresolved: unresolvedMembers,
  });
};

export { handler };
