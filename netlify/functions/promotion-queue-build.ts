// /.netlify/functions/promotion-queue-build
// POST: build promotion queue from eligible members (staff only)
// Identifies members eligible for promotion and adds them to queue
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
  nextRankFor,
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
    // ── Fetch all active members (exclude archived and not-in-guild) ──
    const { data: allMembers, error: fetchErr } = await supabase
      .from("clan_list_members")
      .select("*")
      .eq("status", "active")
      .eq("has_420_tag", true)
      .is("archived_at", null)
      .eq("in_guild", true);

    if (fetchErr) {
      console.error("Fetch members error:", fetchErr);
      return json({ error: "Failed to fetch members" }, 500);
    }

    // ── Compute promotion_due for each ────────────────────────
    const promotionDue = (allMembers ?? [])
      .map((m: any) => {
        const days = computeTimeDays(m.frozen_days, m.counting_since);
        const earned = earnedRank(days);
        const currentIdx = rankIndex(m.rank_current);
        const earnedIdx = RANK_LADDER.indexOf(earned);

        const needsPromo =
          earnedIdx > currentIdx && currentIdx < RANK_LADDER.length - 1;
        const nxt = nextRankFor(m.rank_current, days);

        return {
          id: m.id,
          member_id: m.id,
          discord_id: m.discord_id,
          discord_name: m.discord_name,
          ign: m.ign,
          uid: m.uid,
          from_rank: m.rank_current,
          to_rank: nxt?.name,
          days,
          promotion_due: needsPromo && nxt,
          resolved: !!m.discord_id,
        };
      })
      .filter((m: any) => m.promotion_due && m.to_rank);

    // ── Check which ones are already queued ───────────────────
    const memberIds = promotionDue.map((m: any) => m.member_id);
    const { data: existingQueue, error: queueErr } = await supabase
      .from("promotion_queue")
      .select("member_id")
      .in("member_id", memberIds)
      .in("status", ["queued", "confirmed"]);

    if (queueErr) {
      console.error("Queue check error:", queueErr);
      return json({ error: "Failed to check queue status" }, 500);
    }

    const queuedMemberIds = new Set(
      (existingQueue ?? []).map((q: any) => q.member_id)
    );

    // ── Filter to only new eligible members ───────────────────
    const toQueue = promotionDue.filter(
      (m: any) => !queuedMemberIds.has(m.member_id)
    );

    if (toQueue.length === 0) {
      return json({
        ok: true,
        queued_added_count: 0,
        total_queued_count: (existingQueue ?? []).filter(
          (q: any) => q.status === "queued" || q.status === "confirmed"
        ).length,
        unresolved_count: toQueue.filter((m: any) => !m.resolved).length,
        message: "No new eligible members to add to queue",
      });
    }

    // ── Insert into queue ────────────────────────────────────
    const queueRecords = toQueue.map((m: any) => ({
      member_id: m.member_id,
      discord_id: m.discord_id || "",
      discord_name: m.discord_name,
      ign: m.ign,
      uid: m.uid,
      from_rank: m.from_rank,
      to_rank: m.to_rank,
      created_by: session.discord_id,
      status: "queued",
    }));

    const { error: insertErr } = await supabase
      .from("promotion_queue")
      .insert(queueRecords);

    if (insertErr) {
      console.error("Queue insert error:", insertErr);
      return json({ error: "Failed to add members to queue" }, 500);
    }

    // ── Count final queue state ───────────────────────────────
    const { count: totalQueuedCount } = await supabase
      .from("promotion_queue")
      .select("id", { count: "exact", head: true })
      .in("status", ["queued", "confirmed"]);

    const unresolvedCount = toQueue.filter((m: any) => !m.resolved).length;

    // ── Audit log ─────────────────────────────────────────────
    await supabase.from("audit_log").insert({
      action: "promotion_queue_built",
      actor_id: session.discord_id,
      details: {
        added_count: toQueue.length,
        total_count: totalQueuedCount,
        unresolved_count: unresolvedCount,
      },
    });

    return json({
      ok: true,
      queued_added_count: toQueue.length,
      total_queued_count: totalQueuedCount,
      unresolved_count: unresolvedCount,
    });
  } catch (err) {
    console.error("Queue build error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
