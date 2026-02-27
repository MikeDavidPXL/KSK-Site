// /.netlify/functions/promotion-queue-confirm
// POST: confirm queued promotions (staff only, requires 5+ resolved members)
// Changes status from queued to confirmed, awaiting processing
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
} from "./shared";

interface ConfirmBody {
  dry_run?: boolean;
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
  let body: ConfirmBody = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    // empty body is ok
  }

  try {
    // ── Fetch queued items ────────────────────────────────────
    const { data: queued, error: fetchErr } = await supabase
      .from("promotion_queue")
      .select("*")
      .eq("status", "queued");

    if (fetchErr) {
      console.error("Fetch queue error:", fetchErr);
      return json({ error: "Failed to fetch queue" }, 500);
    }

    // ── Count resolved members ────────────────────────────────
    const resolved = (queued ?? []).filter((q: any) => q.discord_id);
    if (resolved.length < 5) {
      return json(
        {
          error: `Only ${resolved.length} resolved members in queue. Need at least 5.`,
          code: "INSUFFICIENT_QUEUE",
          resolved_count: resolved.length,
        },
        400
      );
    }

    // ── Dry run mode: return preview ────────────────────────
    if (body.dry_run) {
      return json({
        ok: true,
        preview: true,
        items_to_confirm: resolved.length,
        items: resolved,
      });
    }

    // ── Update status to confirmed ──────────────────────────
    const resolvedIds = resolved.map((q: any) => q.id);
    const nowIso = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from("promotion_queue")
      .update({
        status: "confirmed",
        confirmed_at: nowIso,
        confirmed_by: session.discord_id,
      })
      .in("id", resolvedIds);

    if (updateErr) {
      console.error("Queue update error:", updateErr);
      return json({ error: "Failed to confirm queue" }, 500);
    }

    // ── Audit log ─────────────────────────────────────────────
    await supabase.from("audit_log").insert({
      action: "promotion_queue_confirmed",
      actor_id: session.discord_id,
      details: {
        confirmed_count: resolved.length,
        ids: resolvedIds,
      },
    });

    return json({
      ok: true,
      confirmed_count: resolved.length,
      items: resolved,
    });
  } catch (err) {
    console.error("Queue confirm error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
