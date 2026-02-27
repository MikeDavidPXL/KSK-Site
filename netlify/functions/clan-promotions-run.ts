// /.netlify/functions/clan-promotions-run
// POST: execute pending promotions — role changes + announcement (staff only)
// Requires >= 5 eligible members OR { "force": true } in body
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  assignRole,
  postChannelMessage,
  computeTimeDays,
  earnedRank,
  rankIndex,
  RANK_LADDER,
} from "./shared";

const ANNOUNCEMENT_CHANNEL = "1376309040686170254";

// Rate limit: 1 run per 5 min per user
const lastRun = new Map<string, number>();
const RUN_COOLDOWN = 300_000;

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

  // ── Rate limit ────────────────────────────────────────────
  const now = Date.now();
  const last = lastRun.get(session.discord_id) ?? 0;
  if (now - last < RUN_COOLDOWN) {
    return json(
      { error: "Please wait before running promotions again.", code: "RATE_LIMITED" },
      429
    );
  }
  lastRun.set(session.discord_id, now);

  // ── Parse body ────────────────────────────────────────────
  let body: { force?: boolean } = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    // empty body is fine
  }

  // ── Fetch eligible members (exclude archived/not-in-guild) ─
  const { data: candidates, error: fetchErr } = await supabase
    .from("clan_list_members")
    .select("*")
    .eq("status", "active")
    .eq("has_420_tag", true)
    .is("archived_at", null)
    .eq("in_guild", true);

  if (fetchErr) {
    console.error("Promotions query error:", fetchErr);
    return json({ error: "Failed to fetch members" }, 500);
  }

  // Build list of members that need promotion
  const toPromote: {
    id: string;
    discord_name: string;
    discord_id: string | null;
    from_rank: string;
    to_rank: string;
    to_role_id: string | null;
    days: number;
  }[] = [];

  for (const m of candidates ?? []) {
    const days = computeTimeDays(m.frozen_days, m.counting_since);
    const earned = earnedRank(days);
    const currentIdx = rankIndex(m.rank_current);
    const earnedIdx = RANK_LADDER.indexOf(earned);

    if (currentIdx >= RANK_LADDER.length - 1) continue; // Max rank
    if (earnedIdx <= currentIdx) continue; // No promotion needed

    toPromote.push({
      id: m.id,
      discord_name: m.discord_name,
      discord_id: m.discord_id,
      from_rank: m.rank_current,
      to_rank: earned.name,
      to_role_id: earned.roleId,
      days,
    });
  }

  // ── Threshold check ───────────────────────────────────────
  const resolvable = toPromote.filter((p) => p.discord_id);
  if (resolvable.length < 5 && !body.force) {
    return json({
      ok: false,
      message: `Only ${resolvable.length} promotions ready. Need 5 or more, or use force.`,
      total_due: toPromote.length,
      resolvable: resolvable.length,
      unresolved: toPromote.length - resolvable.length,
    });
  }

  // ── Execute promotions ────────────────────────────────────
  let executed = 0;
  let failed = 0;
  let skippedUnresolved = 0;
  const promotedForAnnouncement: { mention: string; to_rank: string }[] = [];
  const details: {
    discord_name: string;
    from_rank: string;
    to_rank: string;
    result: string;
  }[] = [];

  for (const p of toPromote) {
    // Skip members without discord_id
    if (!p.discord_id) {
      skippedUnresolved++;
      details.push({
        discord_name: p.discord_name,
        from_rank: p.from_rank,
        to_rank: p.to_rank,
        result: "skipped_unresolved",
      });
      continue;
    }

    try {
      // Add target rank role
      let roleSuccess = true;
      if (p.to_role_id) {
        const added = await assignRole(p.discord_id, p.to_role_id);
        if (!added) {
          roleSuccess = false;
          console.error(`Failed to add role ${p.to_role_id} to ${p.discord_id}`);
        }
      }

      // Ranks are additive: we only ADD the new role, never remove lower ones

      if (roleSuccess) {
        // Update DB
        await supabase
          .from("clan_list_members")
          .update({
            rank_current: p.to_rank,
            rank_next: null,
            promote_eligible: false,
            promote_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", p.id);

        executed++;
        promotedForAnnouncement.push({
          mention: `<@${p.discord_id}>`,
          to_rank: p.to_rank,
        });
        details.push({
          discord_name: p.discord_name,
          from_rank: p.from_rank,
          to_rank: p.to_rank,
          result: "success",
        });

        // Audit log per promotion
        await supabase.from("audit_log").insert({
          action: "clan_promotion_applied",
          actor_id: session.discord_id,
          target_id: p.discord_id,
          details: {
            from_rank: p.from_rank,
            to_rank: p.to_rank,
            discord_api_result: "success",
          },
        });
      } else {
        failed++;
        details.push({
          discord_name: p.discord_name,
          from_rank: p.from_rank,
          to_rank: p.to_rank,
          result: "role_change_failed",
        });
        await supabase.from("audit_log").insert({
          action: "clan_promotion_applied",
          actor_id: session.discord_id,
          target_id: p.discord_id,
          details: {
            from_rank: p.from_rank,
            to_rank: p.to_rank,
            discord_api_result: "failed",
          },
        });
      }
    } catch (err) {
      failed++;
      details.push({
        discord_name: p.discord_name,
        from_rank: p.from_rank,
        to_rank: p.to_rank,
        result: "error",
      });
      console.error(`Promotion error for ${p.discord_name}:`, err);
    }
  }

  // ── Post announcement ─────────────────────────────────────
  let announcementPosted = false;
  if (promotedForAnnouncement.length > 0) {
    // Build promotion list grouped by rank
    const rankGroups = new Map<string, string[]>();
    for (const p of promotedForAnnouncement) {
      const existing = rankGroups.get(p.to_rank) ?? [];
      existing.push(p.mention);
      rankGroups.set(p.to_rank, existing);
    }

    // Find the role IDs for mentions
    const getRoleMention = (rankName: string) => {
      const r = RANK_LADDER.find((l) => l.name === rankName);
      return r?.roleId ? `<@&${r.roleId}>` : rankName;
    };

    const promotionLines = promotedForAnnouncement
      .map((p) => `${p.mention} -> ${getRoleMention(p.to_rank)}`)
      .join("\n");

    const announcement = [
      "It is promotion time again :weed: 420 :weed:",
      "",
      "Here are the Promotions",
      "",
      promotionLines,
      "",
      "Big congrats to all of you. You earned it. :muscle:",
      "",
      "For information on how to get promoted yourself, please visit ---> #promotions",
      "If you feel like you are due for promotion and didn't get one open a ticket ---> #ticket-logs",
      "",
      "Have a Wonderful Day :sunny:",
      `<@&${process.env.DISCORD_MEMBER_ROLE_ID}>  :420clan:`,
    ].join("\n");

    announcementPosted = await postChannelMessage(
      ANNOUNCEMENT_CHANNEL,
      announcement
    );

    console.log(`[promotions-run] Announcement to ${ANNOUNCEMENT_CHANNEL}: ${announcementPosted ? "SUCCESS" : "FAILED"}`);

    await supabase.from("audit_log").insert({
      action: announcementPosted
        ? "clan_promotion_announced"
        : "clan_promotion_announce_failed",
      actor_id: session.discord_id,
      details: {
        channel: ANNOUNCEMENT_CHANNEL,
        promoted_count: promotedForAnnouncement.length,
      },
    });
  }

  return json({
    ok: true,
    executed,
    failed,
    skipped_unresolved: skippedUnresolved,
    announcement_posted: announcementPosted,
    details,
  });
};

export { handler };
