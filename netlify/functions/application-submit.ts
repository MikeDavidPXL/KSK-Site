// /.netlify/functions/application-submit
// POST: submit a new application (KOTH player only, not staff/private)
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  postAppLog,
} from "./shared";

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }
  if (!session.discord_id) {
    return json({ error: "Missing discord_id in session" }, 401);
  }

  // Server-side role check: only KOTH players who are NOT already private/staff
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  if (!member) {
    return json({ error: "You must be in the Discord server" }, 403);
  }
  const roles: string[] = member.roles ?? [];
  const isStaff = roles.includes(process.env.DISCORD_STAFF_ROLE_ID!);
  const isPrivate = roles.includes(process.env.DISCORD_MEMBER_ROLE_ID!);
  const isKoth = roles.includes(process.env.DISCORD_KOTH_PLAYER_ROLE_ID!);

  if (isStaff || isPrivate) {
    return json({ error: "You already have clan access" }, 403);
  }
  if (!isKoth) {
    return json({ error: "You must verify in Discord first to get KOTH Player role" }, 403);
  }

  let body: any;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const override = body.override === true;

  // Check for existing pending/accepted application
  const { data: existing } = await supabase
    .from("applications")
    .select("id, status")
    .eq("discord_id", session.discord_id)
    .in("status", ["pending", "accepted"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && !override) {
    const code = existing.status === "accepted" ? "ALREADY_ACCEPTED" : "ALREADY_PENDING";
    return json(
      {
        error: `You already have a ${existing.status} application.`,
        code,
        existing_id: existing.id,
      },
      409
    );
  }

  const {
    uid,
    age,
    speaks_english,
    timezone,
    activity,
    level,
    playstyle,
    banned_koth_cheating,
    looking_for,
    has_mic,
    clan_history,
  } = body;

  if (
    !uid ||
    !age ||
    !speaks_english ||
    !timezone ||
    !activity ||
    !level ||
    !playstyle ||
    !banned_koth_cheating ||
    !looking_for ||
    !has_mic ||
    !clan_history
  ) {
    return json({ error: "All fields are required" }, 400);
  }

  const parsedAge = Number(age);
  if (Number.isNaN(parsedAge) || parsedAge <= 0) {
    return json({ error: "Age must be a valid number" }, 400);
  }

  const { data, error } = await supabase
    .from("applications")
    .insert({
      discord_id: session.discord_id,
      discord_name: session.username,
      uid,
      age: parsedAge,
      speaks_english: speaks_english === "yes",
      timezone,
      activity,
      level,
      playstyle,
      banned_koth_cheating: banned_koth_cheating === "yes",
      looking_for,
      has_mic: has_mic === "yes",
      clan_history,
    })
    .select()
    .single();

  if (error) {
    console.error("Insert error:", error);
    return json(
      {
        error: "Failed to submit application",
        details: error.message,
      },
      500
    );
  }

  // If this was an override reapply, log it
  if (existing && override) {
    await supabase.from("audit_log").insert({
      action: "application_reapply",
      target_id: data.id,
      actor_id: session.discord_id,
      details: {
        previous_application_id: existing.id,
        previous_status: existing.status,
        new_application_id: data.id,
      },
    });
  }

  // ── Discord channel logging ───────────────────────────────
  try {
    const logContent = [
      `📋 **New application submitted**`,
      `Applicant: <@${session.discord_id}> (${session.username})`,
      `UID: ${uid}`,
      `Review: https://420-site.netlify.app/admin`,
    ].join("\n");

    const posted = await postAppLog(logContent, true);
    if (!posted) {
      // Log Discord failure but don't fail submission
      await supabase.from("audit_log").insert({
        action: "application_log_message_failed",
        target_id: data.id,
        actor_id: session.discord_id,
        details: { error: "Discord message post failed" },
      });
    }
  } catch (logErr: any) {
    // Never fail the submission because of logging
    console.error("Application log error:", logErr);
    await supabase.from("audit_log").insert({
      action: "application_log_error",
      target_id: data.id,
      actor_id: session.discord_id,
      details: { error: logErr?.message || String(logErr) },
    });
  }

  // Audit log for submission
  await supabase.from("audit_log").insert({
    action: "application_submitted",
    target_id: data.id,
    actor_id: session.discord_id,
    details: {
      uid,
      discord_name: session.username,
    },
  });

  return json({ ok: true, application: data }, 201);
};

export { handler };
