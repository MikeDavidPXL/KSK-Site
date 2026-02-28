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
  isStaffRole,
  computeTimeDays,
  earnedRank,
  nextRankFor,
  rankIndex,
  RANK_LADDER,
} from "./shared";

// Rate limiting
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_COOLDOWN = 30_000; // 30 seconds between sync calls

// Guild member cache (60s TTL)
let cachedGuildIds: Set<string> | null = null;
let cachedGuildRoleMap: Map<string, string[]> | null = null;
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
  
  if (!isStaffRole(roles)) {
    return json({ error: "Forbidden" }, 403);
  }
  const staffTier = determineStaffTier(roles);

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
      cachedGuildRoleMap = new Map(guildMembers.map((m) => [m.user.id, m.roles ?? []]));
      cacheTimestamp = now;
    }

    const guildIds = cachedGuildIds ?? new Set<string>();
    const guildRoleMap = cachedGuildRoleMap ?? new Map<string, string[]>();

    // ── Load active clan members with discord_id ──────────────
    const { data: clanMembers, error: fetchErr } = await supabase
      .from("clan_list_members")
      .select(
        "id, discord_id, discord_name, ign, uid, in_guild, left_guild_at, rank_current, frozen_days, counting_since, status, has_ksk_tag"
      )
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
    let ranksSyncedCount = 0;
    const archivedNames: string[] = [];

    const roleLadder = RANK_LADDER.filter((r) => r.roleId);

    // ── Process each member ───────────────────────────────────
    for (const cm of members) {
      const inGuild = guildIds.has(cm.discord_id);

      if (inGuild) {
        stillInGuildCount++;

        const discordRoles = guildRoleMap.get(cm.discord_id) ?? [];
        const highestRoleRank = [...roleLadder]
          .reverse()
          .find((r) => r.roleId && discordRoles.includes(r.roleId));

        const syncedCurrentRank = highestRoleRank?.name ?? "Trial Member";
        const frozenDays = cm.frozen_days ?? 0;
        const countingSince = cm.counting_since ?? null;
        const status = cm.status ?? "active";
        const hasTag = cm.has_ksk_tag ?? false;
        const isActive = status === "active" && hasTag;

        const days = computeTimeDays(frozenDays, countingSince);
        const earned = earnedRank(days);
        const currentIdx = rankIndex(syncedCurrentRank);
        const earnedIdx = RANK_LADDER.indexOf(earned);
        const nxt = nextRankFor(syncedCurrentRank, days);

        await supabase
          .from("clan_list_members")
          .update({
            in_guild: true,
            last_guild_check_at: nowIso,
            left_guild_at: null,
            rank_current: syncedCurrentRank,
            rank_next: nxt?.name ?? null,
            promote_eligible:
              isActive &&
              earnedIdx > currentIdx &&
              currentIdx < RANK_LADDER.length - 1,
            promote_reason:
              isActive && earnedIdx > currentIdx && nxt
                ? `${days} days in clan, meets ${earned.name} threshold (${earned.daysRequired} days)`
                : null,
          })
          .eq("id", cm.id);

        if ((cm.rank_current ?? "Trial Member") !== syncedCurrentRank) {
          ranksSyncedCount++;
        }
      } else {
        archivedLeftGuildCount++;
        archivedNames.push(cm.discord_name || cm.ign || cm.uid || "Unknown");

        await supabase
          .from("clan_list_members")
          .update({
            in_guild: false,
            last_guild_check_at: nowIso,
            left_guild_at: cm.left_guild_at ?? nowIso,
            archived_at: nowIso,
            archived_by: session.discord_id,
            archive_reason: "left_guild",
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
        ranks_synced_count: ranksSyncedCount,
        unresolved_count: unresolvedCount ?? 0,
        archived_names: archivedNames.slice(0, 50),
      },
    });

    // ── Discord log ───────────────────────────────────────────
    const staffPingRoleId = process.env.DISCORD_STAFF_PING_ROLE_ID;
    let logMsg = staffPingRoleId ? `<@&${staffPingRoleId}>\n` : "";
    logMsg += `🔄 **Discord Membership Sync Executed**\n`;
    logMsg += `**By:** <@${session.discord_id}>\n`;
    logMsg += `**Checked:** ${members.length} members\n`;
    logMsg += `**Still in guild:** ${stillInGuildCount}\n`;
    logMsg += `**Archived (left guild):** ${archivedLeftGuildCount}\n`;
    logMsg += `**Rank updates from Discord:** ${ranksSyncedCount}`;

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
      ranks_synced_count: ranksSyncedCount,
      unresolved_count: unresolvedCount ?? 0,
      archived_names: archivedNames,
    });
  } catch (err) {
    console.error("Clan sync error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

export { handler };
