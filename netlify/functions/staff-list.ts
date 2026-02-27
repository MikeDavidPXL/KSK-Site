import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  json,
  fetchAllGuildMembers,
  determineStaffTier,
  staffTierLabel,
  staffTierRank,
  buildDiscordAvatarUrl,
} from "./shared";

type StaffListItem = {
  discord_id: string;
  display_name: string;
  staff_role: "Owner" | "Web Developer" | "Admin";
  staff_role_rank: number;
  avatar_hash: string | null;
  avatar_url: string;
};

let cachedAt = 0;
let cachedStaff: StaffListItem[] | null = null;
const CACHE_TTL_MS = 60_000;

const handler: Handler = async (event) => {
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const requester = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );

  const requesterRoles: string[] = requester?.roles ?? [];
  const isPrivate = requesterRoles.includes(process.env.DISCORD_MEMBER_ROLE_ID!);
  const isStaff = !!determineStaffTier(requesterRoles) || requesterRoles.includes(process.env.DISCORD_STAFF_ROLE_ID!);

  // Allow any authenticated member (Private or Staff) to see the staff list
  if (!isPrivate && !isStaff) {
    return json({ error: "Forbidden" }, 403);
  }

  const now = Date.now();
  if (cachedStaff && now - cachedAt < CACHE_TTL_MS) {
    return json({ staff: cachedStaff, cached: true, cache_ttl_ms: CACHE_TTL_MS });
  }

  const members = await fetchAllGuildMembers();

  const staff = members
    .map((member): StaffListItem | null => {
      const tier = determineStaffTier(member.roles ?? []);
      if (!tier) return null;

      const displayName =
        member.nick?.trim() ||
        member.user.global_name?.trim() ||
        member.user.username;

      const avatarHash = member.user.avatar ?? null;

      return {
        discord_id: member.user.id,
        display_name: displayName,
        staff_role: staffTierLabel(tier),
        staff_role_rank: staffTierRank(tier),
        avatar_hash: avatarHash,
        avatar_url: buildDiscordAvatarUrl(member.user.id, avatarHash),
      };
    })
    .filter((item): item is StaffListItem => item !== null)
    .sort((a, b) => {
      if (b.staff_role_rank !== a.staff_role_rank) {
        return b.staff_role_rank - a.staff_role_rank;
      }
      return a.display_name.localeCompare(b.display_name, undefined, {
        sensitivity: "base",
      });
    });

  cachedStaff = staff;
  cachedAt = now;

  return json({ staff, cached: false, cache_ttl_ms: CACHE_TTL_MS });
};

export { handler };
