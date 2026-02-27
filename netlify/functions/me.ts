// /.netlify/functions/me
// Returns the current session user + role claims + application status
// Discord roles are ALWAYS the source of truth for access.
// DB application status is historical — never grants access on its own.
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  buildDiscordAvatarUrl,
  determineStaffTier,
  isCorporalOrHigher,
} from "./shared";

const handler: Handler = async (event) => {
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) {
    return json({ user: null }, 200);
  }

  // Check guild membership via bot
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );

  const inGuild = !!member;
  const roles: string[] = member?.roles ?? [];

  const legacyAvatarHashFromUrl = (() => {
    const legacyUrl = (session as any)?.avatar as string | undefined;
    if (!legacyUrl) return null;
    const match = legacyUrl.match(/\/avatars\/[^/]+\/([^/.?]+)\.(png|jpg|jpeg|webp|gif)/i);
    return match?.[1] ?? null;
  })();

  const resolvedAvatarHash =
    member?.user?.avatar ??
    session.avatar_hash ??
    legacyAvatarHashFromUrl ??
    null;

  // Role priority: owner > webdev > admin
  const staffTier = determineStaffTier(roles);
  const hasLegacyStaffRole = roles.includes(process.env.DISCORD_STAFF_ROLE_ID!);
  const isStaff = !!staffTier || hasLegacyStaffRole;
  const isPrivate = roles.includes(process.env.DISCORD_MEMBER_ROLE_ID!);
  const isKoth = roles.includes(process.env.DISCORD_KOTH_PLAYER_ROLE_ID!);
  const isUnverified = roles.includes(process.env.DISCORD_UNVERIFIED_ROLE_ID!);
  const isCorporalPlus = isCorporalOrHigher(roles);

  // ── Effective status: purely based on Discord roles ───────
  // staff/private → "accepted" (has pack access)
  // koth only     → "koth"     (can apply)
  // unverified    → "unverified" (must captcha verify first)
  // in guild, no roles → "none"
  // not in guild       → "none"
  let effectiveStatus: "accepted" | "koth" | "unverified" | "none" = "none";
  if (isStaff || isPrivate) {
    effectiveStatus = "accepted";
  } else if (isKoth) {
    effectiveStatus = "koth";
  } else if (isUnverified) {
    effectiveStatus = "unverified";
  }

  // Get latest application from DB (historical only)
  const { data: app } = await supabase
    .from("applications")
    .select("id, status, created_at, reviewer_note")
    .eq("discord_id", session.discord_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Auto-revoke: DB says accepted but Discord says no Private role ──
  // This catches users who left the guild, got role removed, etc.
  // Mark the old application as "revoked" so they can re-apply cleanly.
  if (
    app &&
    app.status === "accepted" &&
    !isPrivate &&
    !isStaff
  ) {
    // If user left the guild entirely, also soft-archive the application
    const shouldArchive = !inGuild;

    await supabase
      .from("applications")
      .update({
        status: "revoked",
        reviewer_note: "Auto-revoked: Private role no longer present",
        ...(shouldArchive
          ? {
              archived_at: new Date().toISOString(),
              archived_by: "system",
              archive_reason: "left_guild",
            }
          : {}),
      })
      .eq("id", app.id);

    // Also log it
    await supabase.from("audit_log").insert({
      action: shouldArchive
        ? "application_auto_archived"
        : "application_auto_revoked",
      target_id: app.id,
      actor_id: "system",
      details: {
        reason: shouldArchive
          ? "User left the guild — application archived"
          : "User no longer has Private role in Discord",
        discord_id: session.discord_id,
        in_guild: inGuild,
        had_koth: isKoth,
      },
    });

    // Update the local app object so the response reflects reality
    app.status = "revoked";
    app.reviewer_note = "Auto-revoked: Private role no longer present";
  }

  // For the frontend: if app was revoked, treat as no application
  // so the user sees fresh apply flow instead of confusing old status
  const visibleApp =
    app && app.status !== "revoked" ? app : null;

  return json({
    user: {
      discord_id: session.discord_id,
      username: session.username,
      avatar_hash: resolvedAvatarHash,
      avatar: buildDiscordAvatarUrl(session.discord_id, resolvedAvatarHash),
      in_guild: inGuild,
      is_staff: isStaff,
      staff_tier: staffTier,
      is_private: isPrivate,
      is_corporal_or_higher: isCorporalPlus,
      is_koth: isKoth,
      is_unverified: isUnverified,
      effective_status: effectiveStatus,
      application: visibleApp,
    },
  });
};

export { handler };
