// /.netlify/functions/ban-report
// POST: Submit a ban report (logged-in guild members only)
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json, postChannelMessage } from "./shared";

// Rate limiting
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 5;

// Ban report log channel
const BAN_REPORT_CHANNEL_ID = "1476342947644444693";
const BAN_REPORT_PING_ROLE_ID =
  process.env.DISCORD_OWNER_ROLE_ID ?? null;

// Valid ban reasons
const VALID_REASONS = [
  "cheating",
  "toxic_behavior",
  "exploiting",
  "rule_violation",
  "false_ban",
  "other",
];

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Auth check
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Guild membership check via Discord
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );

  if (!member || member.code === 10007) {
    return json({ error: "You must be a member of the Discord server" }, 403);
  }

  // Rate limit check
  const now = Date.now();
  const userKey = session.discord_id;
  const lastCall = rateLimitMap.get(userKey) || 0;
  if (now - lastCall < RATE_LIMIT_WINDOW / RATE_LIMIT_MAX) {
    return json({ error: "Rate limited. Please wait before trying again." }, 429);
  }
  rateLimitMap.set(userKey, now);

  // Parse body
  let body: {
    reason?: string;
    custom_reason?: string;
    additional_context?: string;
  };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { reason, custom_reason, additional_context } = body;

  // Validate reason
  if (!reason || !VALID_REASONS.includes(reason)) {
    return json({ error: "Invalid or missing reason" }, 400);
  }

  // If "other" is selected, custom_reason is required
  if (reason === "other" && (!custom_reason || custom_reason.trim().length === 0)) {
    return json({ error: "Custom reason is required when selecting 'Other'" }, 400);
  }

  // Check 24-hour duplicate protection
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentReport, error: checkErr } = await supabase
    .from("ban_reports")
    .select("id, submitted_at")
    .eq("discord_id", session.discord_id)
    .gte("submitted_at", twentyFourHoursAgo)
    .limit(1)
    .maybeSingle();

  if (checkErr) {
    console.error("Check recent report error:", checkErr);
    return json({ error: "Failed to check recent submissions" }, 500);
  }

  if (recentReport) {
    return json({
      error: "You already submitted a ban report within the last 24 hours.",
      existing_report: true,
    }, 409);
  }

  // Calculate appeal available date (6 months from now)
  const submittedAt = new Date();
  const appealAvailableAt = new Date(submittedAt);
  appealAvailableAt.setMonth(appealAvailableAt.getMonth() + 6);

  // Insert ban report
  const { data: report, error: insertErr } = await supabase
    .from("ban_reports")
    .insert({
      discord_id: session.discord_id,
      discord_name: session.username,
      reason,
      custom_reason: custom_reason?.trim() || null,
      additional_context: additional_context?.trim() || null,
      submitted_at: submittedAt.toISOString(),
      appeal_available_at: appealAvailableAt.toISOString(),
    })
    .select("id, appeal_available_at")
    .single();

  if (insertErr || !report) {
    console.error("Insert ban report error:", insertErr);
    return json({ error: "Failed to save ban report" }, 500);
  }

  // Audit log
  await supabase.from("audit_log").insert({
    action: "ban_report_submitted",
    target_id: report.id,
    actor_id: session.discord_id,
    details: {
      reason,
      custom_reason: custom_reason?.trim() || null,
      appeal_available_at: appealAvailableAt.toISOString(),
    },
  });

  // Discord log (ping owners)
  try {
    const reasonLabels: Record<string, string> = {
      cheating: "Cheating",
      toxic_behavior: "Toxic behavior",
      exploiting: "Exploiting",
      rule_violation: "Rule violation",
      false_ban: "Mistake / False ban",
      other: "Other",
    };

    let logMsg = `${BAN_REPORT_PING_ROLE_ID ? `<@&${BAN_REPORT_PING_ROLE_ID}>\n` : ""}🚨 **Ban Report Submitted**
**Member:** <@${session.discord_id}> (${session.username})
**Reason:** ${reasonLabels[reason] || reason}`;

    if (reason === "other" && custom_reason) {
      logMsg += `\n**Custom Reason:** ${custom_reason.trim()}`;
    }

    if (additional_context?.trim()) {
      logMsg += `\n**Context:** ${additional_context.trim().slice(0, 500)}`;
    }

    logMsg += `\n**Appeal Available After:** ${appealAvailableAt.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}`;

    await postChannelMessage(BAN_REPORT_CHANNEL_ID, logMsg);
  } catch (e) {
    // Log error but don't fail submission
    console.error("Discord log error:", e);
    await supabase.from("audit_log").insert({
      action: "ban_report_discord_log_failed",
      target_id: report.id,
      actor_id: session.discord_id,
      details: { error: String(e) },
    });
  }

  return json({
    ok: true,
    appeal_available_at: appealAvailableAt.toISOString(),
  });
};

export { handler };
