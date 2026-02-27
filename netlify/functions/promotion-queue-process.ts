// /.netlify/functions/promotion-queue-process
// POST: process confirmed promotions - apply roles and post announcement (staff only)
// Processes only items with status=confirmed, applies Discord roles, posts announcement
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  assignRole,
  postChannelMessage,
  RANK_LADDER,
} from "./shared";

const ANNOUNCEMENT_CHANNEL = "1376309040686170254";

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
    // ── Fetch confirmed items ─────────────────────────────────
    const { data: confirmed, error: fetchErr } = await supabase
      .from("promotion_queue")
      .select("*")
      .eq("status", "confirmed");

    if (fetchErr) {
      console.error("Fetch confirmed error:", fetchErr);
      return json({ error: "Failed to fetch confirmed queue" }, 500);
    }

    if (!confirmed || confirmed.length === 0) {
      return json({
        ok: true,
        message: "No confirmed items to process",
        processed_count: 0,
        failed_count: 0,
      });
    }

    const nowIso = new Date().toISOString();
    const processed: {
      id: string;
      discord_id: string;
      discord_name: string;
      to_rank: string;
      mention: string;
    }[] = [];
    const failed: {
      id: string;
      discord_id: string;
      discord_name: string;
      to_rank: string;
      error: string;
    }[] = [];

    // ── Process each confirmed item ────────────────────────────
    for (const item of confirmed) {
      try {
        // Find rank data for role assignment
        const rankData = RANK_LADDER.find((r) => r.name === item.to_rank);
        if (!rankData || !rankData.roleId) {
          throw new Error(`Invalid rank: ${item.to_rank}`);
        }

        // Assign Discord role
        const roleSuccess = await assignRole(item.discord_id, rankData.roleId);
        if (!roleSuccess) {
          throw new Error("Failed to assign Discord role");
        }

        // Update queue item status
        await supabase
          .from("promotion_queue")
          .update({
            status: "processed",
            processed_at: nowIso,
            processed_by: session.discord_id,
          })
          .eq("id", item.id);

        // Update clan member rank
        await supabase
          .from("clan_list_members")
          .update({
            rank_current: item.to_rank,
            rank_next: null,
            promote_eligible: false,
            promote_reason: null,
            updated_at: nowIso,
          })
          .eq("id", item.member_id);

        processed.push({
          id: item.id,
          discord_id: item.discord_id,
          discord_name: item.discord_name,
          to_rank: item.to_rank,
          mention: `<@${item.discord_id}>`,
        });

        // Audit log per promotion
        await supabase.from("audit_log").insert({
          action: "promotion_queue_processed_item",
          actor_id: session.discord_id,
          target_id: item.discord_id,
          details: {
            queue_id: item.id,
            member_id: item.member_id,
            from_rank: item.from_rank,
            to_rank: item.to_rank,
            result: "success",
          },
        });
      } catch (error) {
        failed.push({
          id: item.id,
          discord_id: item.discord_id,
          discord_name: item.discord_name,
          to_rank: item.to_rank,
          error: error instanceof Error ? error.message : "Unknown error",
        });

        // Update queue item with error
        await supabase
          .from("promotion_queue")
          .update({
            status: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
            processed_at: nowIso,
            processed_by: session.discord_id,
          })
          .eq("id", item.id);

        // Audit log per failure
        await supabase.from("audit_log").insert({
          action: "promotion_queue_processed_item",
          actor_id: session.discord_id,
          target_id: item.discord_id,
          details: {
            queue_id: item.id,
            member_id: item.member_id,
            from_rank: item.from_rank,
            to_rank: item.to_rank,
            result: "failed",
            error: error instanceof Error ? error.message : "Unknown error",
          },
        });
      }
    }

    // ── Post announcement if at least 1 processed ───────────────
    let announcementPosted = false;
    let announcementMessageId: string | null = null;

    if (processed.length > 0) {
      // Build promotion lines
      const getRoleMention = (rankName: string) => {
        const r = RANK_LADDER.find((l) => l.name === rankName);
        return r?.roleId ? `<@&${r.roleId}>` : rankName;
      };

      const promotionLines = processed
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

      if (announcementPosted) {
        // Try to get message ID from Discord (optional - for tracking)
        announcementMessageId = null; // Would need extended Discord API call
      }

      console.log(
        `[promotion-queue-process] Announcement to ${ANNOUNCEMENT_CHANNEL}: ${announcementPosted ? "SUCCESS" : "FAILED"}`
      );

      // Audit log for announcement
      await supabase.from("audit_log").insert({
        action: announcementPosted
          ? "promotion_queue_announced"
          : "promotion_queue_announce_failed",
        actor_id: session.discord_id,
        details: {
          channel: ANNOUNCEMENT_CHANNEL,
          promoted_count: processed.length,
          message_id: announcementMessageId,
        },
      });
    }

    // ── Final audit log ───────────────────────────────────────
    await supabase.from("audit_log").insert({
      action: "promotion_queue_processed",
      actor_id: session.discord_id,
      details: {
        processed_count: processed.length,
        failed_count: failed.length,
        announcement_posted: announcementPosted,
        announcement_message_id: announcementMessageId,
      },
    });

    return json({
      ok: true,
      processed_count: processed.length,
      failed_count: failed.length,
      announcement_posted: announcementPosted,
      processed: processed,
      failed: failed,
    });
  } catch (err) {
    console.error("Queue process error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
