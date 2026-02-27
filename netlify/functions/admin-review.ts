// /.netlify/functions/admin-review
// POST: accept or reject an application (staff only)
// On accept: assign Private role, remove KOTH role, upsert clan_list_members
// Posts all logs to Discord channel with staff ping
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  assignRole,
  removeRole,
  postAppLog,
} from "./shared";

type ApplicationRow = {
  id: string;
  discord_id: string;
  discord_name: string;
  uid: string | null;
  ingame_name?: string | null;
  ign?: string | null;
};

async function upsertClanMemberFromApplication(
  app: ApplicationRow,
  acceptedAtIso: string
): Promise<{ ok: boolean; clanMemberId: string | null; error: string | null }> {
  if (!app.discord_id) {
    return { ok: false, clanMemberId: null, error: "application.discord_id is missing" };
  }

  const joinDate = acceptedAtIso.split("T")[0];

  const { data: existing, error: existingErr } = await supabase
    .from("clan_list_members")
    .select("id, join_date")
    .eq("discord_id", app.discord_id)
    .maybeSingle();

  if (existingErr) {
    return {
      ok: false,
      clanMemberId: null,
      error: `lookup failed: ${existingErr.message}`,
    };
  }

  const payload = {
    discord_id: app.discord_id,
    discord_name: app.discord_name,
    ign: app.ingame_name || app.ign || app.discord_name,
    uid: app.uid || null,
    join_date: existing?.join_date || joinDate,
    status: "active",
    has_420_tag: false,
    rank_current: "Private",
    frozen_days: 0,
    counting_since: acceptedAtIso,
    source: "application" as const,
    needs_resolution: false,
    resolution_status: "resolved_auto" as const,
    resolved_at: acceptedAtIso,
    resolved_by: null,
    updated_at: acceptedAtIso,
  };

  const { data: upserted, error: upsertErr } = await supabase
    .from("clan_list_members")
    .upsert(payload, { onConflict: "discord_id" })
    .select("id")
    .single();

  if (upsertErr) {
    return {
      ok: false,
      clanMemberId: null,
      error: upsertErr.message,
    };
  }

  return { ok: true, clanMemberId: upserted?.id ?? null, error: null };
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth check
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // Staff role check
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { application_id, action, note, deny_reason } = body;
  if (!application_id || !["accept", "reject", "retry_create_clan_member"].includes(action)) {
    return json({ error: "application_id and action (accept|reject|retry_create_clan_member) required" }, 400);
  }

  // Get application
  const { data: app, error: fetchErr } = await supabase
    .from("applications")
    .select("*")
    .eq("id", application_id)
    .single();

  if (fetchErr || !app) {
    return json({ error: "Application not found" }, 404);
  }

  if (!app.discord_id) {
    return json({ error: "Application has no discord_id; cannot continue" }, 400);
  }

  // ── RETRY CREATE CLAN MEMBER (accepted applications) ─────
  if (action === "retry_create_clan_member") {
    const acceptedAt = app.accepted_at || new Date().toISOString();
    console.log("[admin-review] retry_create_clan_member start", {
      application_id,
      discord_id: app.discord_id,
    });
    const upsert = await upsertClanMemberFromApplication(app, acceptedAt);

    await supabase.from("audit_log").insert({
      action: "clan_member_retry_from_accept",
      target_id: application_id,
      actor_id: session.discord_id,
      details: {
        application_id,
        discord_id: app.discord_id,
        upserted: upsert.ok,
        clan_member_id: upsert.clanMemberId,
        error: upsert.error,
      },
    });

    if (!upsert.ok) {
      // Log retry failure to channel
      try {
        const logMsg = [
          `⚠️ **Retry create clan member failed**`,
          `Applicant: <@${app.discord_id}> (${app.discord_name})`,
          `UID: ${app.uid || "N/A"}`,
          `Error: ${upsert.error}`,
        ].join("\n");
        await postAppLog(logMsg);
      } catch {}

      return json(
        {
          error: "Retry create clan member failed",
          clan_member_upsert_ok: false,
          clan_member_error: upsert.error,
        },
        500
      );
    }

    // Log retry success to channel
    try {
      const logMsg = [
        `✅ **Retry create clan member succeeded**`,
        `Applicant: <@${app.discord_id}> (${app.discord_name})`,
        `UID: ${app.uid || "N/A"}`,
        `Clan member ID: ${upsert.clanMemberId}`,
      ].join("\n");
      await postAppLog(logMsg);
    } catch {}

    return json({
      ok: true,
      status: app.status,
      clan_member_upsert_ok: true,
      clan_member_id: upsert.clanMemberId,
    });
  }

  // ── ACCEPT ────────────────────────────────────────────────
  if (action === "accept") {
    const now = new Date().toISOString();
    console.log("[admin-review] accept start", {
      application_id,
      discord_id: app.discord_id,
    });

    // 1. Update application status + timestamps
    const { error: updateErr } = await supabase
      .from("applications")
      .update({
        status: "accepted",
        reviewer_id: session.discord_id,
        reviewer_note: note || null,
        accepted_at: now,
        accepted_by: session.discord_id,
      })
      .eq("id", application_id);

    if (updateErr) {
      console.error("Accept update error:", updateErr);
      return json({ error: "Failed to update application" }, 500);
    }

    const upsert = await upsertClanMemberFromApplication(app, now);
    console.log("[admin-review] accept upsert result", {
      application_id,
      discord_id: app.discord_id,
      ok: upsert.ok,
      clan_member_id: upsert.clanMemberId,
      error: upsert.error,
    });

    if (!upsert.ok) {
      console.error("Clan member upsert failed:", {
        application_id,
        discord_id: app.discord_id,
        error: upsert.error,
      });

      // Log upsert failure to channel
      try {
        const logMsg = [
          `⚠️ **Application accepted but clan member creation failed**`,
          `Applicant: <@${app.discord_id}> (${app.discord_name})`,
          `UID: ${app.uid || "N/A"}`,
          `Error: ${upsert.error}`,
          `Use "Retry" button to try again.`,
        ].join("\n");
        await postAppLog(logMsg);
      } catch {}

      await supabase.from("audit_log").insert({
        action: "clan_member_upsert_failed_on_accept",
        target_id: application_id,
        actor_id: session.discord_id,
        details: {
          application_id,
          discord_id: app.discord_id,
          error: upsert.error,
        },
      });

      return json(
        {
          error: "Application accepted but clan member upsert failed",
          status: "accepted",
          clan_member_upsert_ok: false,
          clan_member_error: upsert.error,
        },
        500
      );
    }

    // 2. Assign Private role + remove KOTH role
    const roleAssigned = await assignRole(
      app.discord_id,
      process.env.DISCORD_MEMBER_ROLE_ID!
    );
    const roleRemoved = await removeRole(
      app.discord_id,
      process.env.DISCORD_KOTH_PLAYER_ROLE_ID!
    );

    // 3. Discord channel logging — accept + role swap
    try {
      // Accept message
      const acceptMsg = [
        `✅ **Application accepted**`,
        `Applicant: <@${app.discord_id}> (${app.discord_name})`,
        `UID: ${app.uid || "N/A"}`,
        `Accepted by: <@${session.discord_id}>`,
        note ? `Note: ${note}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      await postAppLog(acceptMsg);

      // Role swap result message (separate)
      const roleMsg = [
        `🔄 **Role update result**`,
        `Applicant: <@${app.discord_id}>`,
        `Private added: ${roleAssigned ? "✓" : "✗"}`,
        `KOTH removed: ${roleRemoved ? "✓" : "✗"}`,
        !roleAssigned || !roleRemoved
          ? `⚠️ Role update incomplete — check manually`
          : null,
      ]
        .filter(Boolean)
        .join("\n");
      await postAppLog(roleMsg);
    } catch (logErr: any) {
      console.error("Accept channel log error:", logErr);
      await supabase.from("audit_log").insert({
        action: "application_accept_log_error",
        target_id: application_id,
        actor_id: session.discord_id,
        details: { error: logErr?.message || String(logErr) },
      });
    }

    // 4. Audit log
    await supabase.from("audit_log").insert({
      action: "application_accepted",
      target_id: application_id,
      actor_id: session.discord_id,
      details: {
        application_id,
        discord_id: app.discord_id,
        upserted: true,
        note: note || null,
        role_assigned: roleAssigned,
        role_removed: roleRemoved,
        clan_member_id: upsert.clanMemberId,
        discord_role_result: { assigned: roleAssigned, removed: roleRemoved },
      },
    });

    // Separate audit log entry for role update
    await supabase.from("audit_log").insert({
      action: "application_role_update",
      target_id: application_id,
      actor_id: session.discord_id,
      details: {
        application_id,
        discord_id: app.discord_id,
        private_added: roleAssigned,
        koth_removed: roleRemoved,
      },
    });

    return json({
      ok: true,
      status: "accepted",
      role_assigned: roleAssigned,
      role_removed: roleRemoved,
      clan_member_upsert_ok: true,
      clan_member_error: null,
      clan_member_id: upsert.clanMemberId,
    });
  }

  // ── REJECT ────────────────────────────────────────────────
  const now = new Date().toISOString();

  const { error: updateErr } = await supabase
    .from("applications")
    .update({
      status: "rejected",
      reviewer_id: session.discord_id,
      reviewer_note: note || null,
      deny_reason: deny_reason || null,
      denied_at: now,
      denied_by: session.discord_id,
    })
    .eq("id", application_id);

  if (updateErr) {
    console.error("Reject update error:", updateErr);
    return json({ error: "Failed to update application" }, 500);
  }

  // Discord channel logging — deny
  try {
    const denyMsg = [
      `❌ **Application denied**`,
      `Applicant: <@${app.discord_id}> (${app.discord_name})`,
      `UID: ${app.uid || "N/A"}`,
      `Denied by: <@${session.discord_id}>`,
      deny_reason ? `Reason: ${deny_reason}` : null,
      note ? `Note: ${note}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    await postAppLog(denyMsg);
  } catch (logErr: any) {
    console.error("Deny channel log error:", logErr);
    await supabase.from("audit_log").insert({
      action: "application_deny_log_error",
      target_id: application_id,
      actor_id: session.discord_id,
      details: { error: logErr?.message || String(logErr) },
    });
  }

  // Audit log
  await supabase.from("audit_log").insert({
    action: "application_denied",
    target_id: application_id,
    actor_id: session.discord_id,
    details: {
      application_id,
      discord_id: app.discord_id,
      deny_reason: deny_reason || null,
      note: note || null,
    },
  });

  return json({
    ok: true,
    status: "rejected",
  });
};

export { handler };
