// /.netlify/functions/clan-sync-discord
// POST: Sync clan list members with Discord guild membership (staff only)
// Auto-archives members who left the guild
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  fetchAllGuildMembers,
  postChannelMessage,
  determineStaffTier,
} from "./shared";

// Rate limiting
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_COOLDOWN = 30_000; // 30 seconds between sync calls

// Guild member cache (60s TTL)
let cachedGuildIds: Set<string> | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60_000;

// Log channel same as APP_LOG_CHANNEL_ID
const SYNC_LOG_CHANNEL_ID = "1374059564168773863";

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
  
  // Staff check: must have staff role or be owner/webdev/admin
  const staffTier = determineStaffTier(roles);
  const hasLegacyStaff = roles.includes(process.env.DISCORD_STAFF_ROLE_ID!);
  if (!staffTier && !hasLegacyStaff) {
    return json({ error: "Forbidden" }, 403);
  }

  // ── Rate limit ────────────────────────────────────────────
  const now = Date.now();
  const lastRun = rateLimitMap.get("global") ?? 0;
  if (now - lastRun < RATE_LIMIT_COOLDOWN) {
    const waitSecs = Math.ceil((RATE_LIMIT_COOLDOWN - (now - lastRun)) / 1000);
    return json({ error: `Rate limited. Try again in ${waitSecs}s.` }, 429);
  }
  rateLimitMap.set("global", now);

  try {
    // ── Fetch all guild members (cached) ──────────────────────
    if (!cachedGuildIds || now - cacheTimestamp > CACHE_TTL) {
      const guildMembers = await fetchAllGuildMembers();
      cachedGuildIds = new Set(guildMembers.map((m) => m.user.id));
      cacheTimestamp = now;
    }

    // ── Load active clan members with discord_id ──────────────
    const { data: clanMembers, error: fetchErr } = await supabase
      .from("clan_list_members")
      .select("id, discord_id, discord_name, ign, uid, in_guild, left_guild_at")
      .not("discord_id", "is", null)
      .is("archived_at", null);

    if (fetchErr) {
      console.error("Clan members fetch error:", fetchErr);
      return json({ error: "Failed to fetch clan members" }, 500);
    }

    const members = clanMembers ?? [];
    const nowIso = new Date().toISOString();

    let stillInGuildCount = 0;
    let archivedLeftGuildCount = 0;
    const archivedNames: string[] = [];

    // ── Process each member ───────────────────────────────────
    for (const cm of members) {
      const inGuild = cachedGuildIds.has(cm.discord_id);

      if (inGuild) {
        // Member is in guild - update tracking fields
        stillInGuildCount++;
        await supabase
          .from("clan_list_members")
          .update({
            in_guild: true,
            last_guild_check_at: nowIso,
            left_guild_at: null,
          })
          .eq("id", cm.id);
      } else {
        // Member left guild - archive them
        archivedLeftGuildCount++;
        archivedNames.push(cm.discord_name || cm.ign || cm.uid || "Unknown");

        await supabase
          .from("clan_list_members")
          .update({
            in_guild: false,
            last_guild_check_at: nowIso,
            left_guild_at: cm.left_guild_at ?? nowIso,
            // Archive
            archived_at: nowIso,
            archived_by: session.discord_id,
            archive_reason: "left_guild",
            // Mark for start-over
            reset_required: true,
            reset_reason: "left_guild",
            reset_at: nowIso,
          })
          .eq("id", cm.id);
      }
    }

    // Count unresolved (no discord_id)
    const { count: unresolvedCount } = await supabase
      .from("clan_list_members")
      .select("id", { count: "exact", head: true })
      .is("discord_id", null)
      .is("archived_at", null);

    // ── Audit log ─────────────────────────────────────────────
    await supabase.from("audit_log").insert({
      action: "clan_sync_discord_archive",
      actor_id: session.discord_id,
      details: {
        checked_count: members.length,
        still_in_guild_count: stillInGuildCount,
        archived_left_guild_count: archivedLeftGuildCount,
        unresolved_count: unresolvedCount ?? 0,
        archived_names: archivedNames.slice(0, 50), // Cap for log size
      },
    });

    // ── Discord log ───────────────────────────────────────────
    const staffPingRoleId = process.env.DISCORD_STAFF_PING_ROLE_ID;
    let logMsg = staffPingRoleId ? `<@&${staffPingRoleId}>\n` : "";
    logMsg += `🔄 **Discord Membership Sync Executed**\n`;
    logMsg += `**By:** <@${session.discord_id}>\n`;
    logMsg += `**Checked:** ${members.length} members\n`;
    logMsg += `**Still in guild:** ${stillInGuildCount}\n`;
    logMsg += `**Archived (left guild):** ${archivedLeftGuildCount}`;

    if (archivedLeftGuildCount > 0 && archivedNames.length > 0) {
      const displayNames = archivedNames.slice(0, 10).join(", ");
      const moreCount = archivedNames.length - 10;
      logMsg += `\n**Members archived:** ${displayNames}`;
      if (moreCount > 0) {
        logMsg += ` (+${moreCount} more)`;
      }
    }

    if ((unresolvedCount ?? 0) > 0) {
      logMsg += `\n⚠️ **Unresolved (no Discord ID):** ${unresolvedCount}`;
    }

    await postChannelMessage(SYNC_LOG_CHANNEL_ID, logMsg);

    return json({
      ok: true,
      checked_count: members.length,
      still_in_guild_count: stillInGuildCount,
      archived_left_guild_count: archivedLeftGuildCount,
      unresolved_count: unresolvedCount ?? 0,
      archived_names: archivedNames,
    });
  } catch (err) {
    console.error("Clan sync error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
