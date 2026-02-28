// Shared helpers for all Netlify Functions
import { createClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import { parse } from "cookie";

// ── Supabase ────────────────────────────────────────────────
export const supabase = createClient(
  process.env.SUPABASE_DATABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── JWT Session ─────────────────────────────────────────────
const SECRET = process.env.SESSION_SECRET!;

export interface SessionPayload {
  discord_id: string;
  username: string;
  avatar_hash: string | null;
}

export type StaffTier = "leader" | "coleader" | "webdev" | "staff";

export const LEADER_ROLE_ID =
  process.env.DISCORD_OWNER_ROLE_ID ?? process.env.LEADER_ROLE_ID;
export const COLEADER_ROLE_ID =
  process.env.DISCORD_COLEADER_ROLE_ID ?? process.env.COLEADER_ROLE_ID;
export const WEBDEV_ROLE_ID =
  process.env.DISCORD_WEBDEV_ROLE_ID ?? process.env.WEB_DEV_ROLE_ID;
export const STAFF_ROLE_ID =
  process.env.DISCORD_ADMIN_ROLE_ID ?? process.env.DISCORD_STAFF_ROLE_ID;

// ── Rank role IDs (from env) ─────────────────────────────────
export const MEMBER_ROLE_ID = process.env.DISCORD_MEMBER_ROLE_ID!;
export const RECRUITER_ROLE_ID =
  process.env.DISCORD_RECRUITER_ROLE_ID ?? process.env.DISCORD_RECRUITEER_ROLE_ID!;
export const COMMANDER_ROLE_ID = process.env.DISCORD_COMMANDER_ROLE_ID!;

const PROMOTED_ROLES = [
  MEMBER_ROLE_ID,
  RECRUITER_ROLE_ID,
  COMMANDER_ROLE_ID,
];

/** Returns true if the user holds Member, Recruiter, or Commander role */
export function isMemberOrHigher(roles: string[]): boolean {
  return PROMOTED_ROLES.some((r) => roles.includes(r));
}

export function determineStaffTier(roles: string[]): StaffTier | null {
  if (LEADER_ROLE_ID && roles.includes(LEADER_ROLE_ID)) return "leader";
  if (COLEADER_ROLE_ID && roles.includes(COLEADER_ROLE_ID)) return "coleader";
  if (WEBDEV_ROLE_ID && roles.includes(WEBDEV_ROLE_ID)) return "webdev";
  if (STAFF_ROLE_ID && roles.includes(STAFF_ROLE_ID)) return "staff";
  return null;
}

/**
 * Returns true if the user holds any staff-level role.
 * Mirrors the logic in /me — checks all tiered roles (leader, coleader,
 * webdev, admin) plus the legacy DISCORD_STAFF_ROLE_ID as fallback.
 */
export function isStaffRole(roles: string[]): boolean {
  if (determineStaffTier(roles) !== null) return true;
  // Legacy fallback: raw DISCORD_STAFF_ROLE_ID env var
  const legacyId = process.env.DISCORD_STAFF_ROLE_ID;
  if (legacyId && roles.includes(legacyId)) return true;
  return false;
}

export function staffTierRank(tier: StaffTier | null): number {
  if (tier === "leader") return 4;
  if (tier === "coleader") return 3;
  if (tier === "webdev") return 2;
  if (tier === "staff") return 1;
  return 0;
}

export function staffTierLabel(tier: StaffTier): "Leader" | "Co-Leader" | "Web Developer" | "Staff" {
  if (tier === "leader") return "Leader";
  if (tier === "coleader") return "Co-Leader";
  if (tier === "webdev") return "Web Developer";
  return "Staff";
}

export function getDiscordDefaultAvatarIndex(discordId: string): number {
  try {
    return Number(BigInt(discordId) % 6n);
  } catch {
    return 0;
  }
}

export function buildDiscordAvatarUrl(
  discordId: string | null | undefined,
  avatarHash: string | null | undefined
): string {
  if (discordId && avatarHash) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatarHash}.png?v=${avatarHash}`;
  }

  if (discordId) {
    const index = getDiscordDefaultAvatarIndex(discordId);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  }

  return "https://cdn.discordapp.com/embed/avatars/0.png";
}

export function createSession(payload: SessionPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, SECRET) as SessionPayload;
  } catch {
    return null;
  }
}

export function getSessionFromCookie(
  cookieHeader: string | undefined
): SessionPayload | null {
  if (!cookieHeader) return null;
  const cookies = parse(cookieHeader);
  const token = cookies["session"];
  if (!token) return null;
  return verifySession(token);
}

// ── Discord helpers ─────────────────────────────────────────
const DISCORD_API = "https://discord.com/api/v10";

export async function discordFetch(path: string, token: string, bot = false) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: bot ? `Bot ${token}` : `Bearer ${token}`,
    },
  });
  if (!res.ok) return null;
  return res.json();
}

export async function assignRole(userId: string, roleId: string) {
  const res = await fetch(
    `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
  return res.ok;
}

export async function removeRole(userId: string, roleId: string) {
  const res = await fetch(
    `${DISCORD_API}/guilds/${process.env.DISCORD_GUILD_ID}/members/${userId}/roles/${roleId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
  return res.ok;
}

// ── Rank ladder ─────────────────────────────────────────────
export interface RankDef {
  name: string;
  roleId: string | null;
  daysRequired: number;
}

export const RANK_LADDER: RankDef[] = [
  { name: "Trial Member", roleId: null,              daysRequired: 0  },
  { name: "Member",       roleId: MEMBER_ROLE_ID,    daysRequired: 14 },
  { name: "Recruiter",    roleId: RECRUITER_ROLE_ID,  daysRequired: 30 },
  { name: "Commander",    roleId: COMMANDER_ROLE_ID,  daysRequired: 60 },
];

export const RANK_ROLE_IDS = RANK_LADDER
  .map((r) => r.roleId)
  .filter(Boolean) as string[];

/** Get the rank index (0 = Private, 4 = Major) */
export function rankIndex(name: string): number {
  const idx = RANK_LADDER.findIndex(
    (r) => r.name.toLowerCase() === name.toLowerCase()
  );
  return idx === -1 ? 0 : idx;
}

/** Calculate effective time in clan (days) */
export function computeTimeDays(
  frozenDays: number,
  countingSince: string | null
): number {
  if (!countingSince) return frozenDays;
  const now = Date.now();
  const since = new Date(countingSince).getTime();
  const diff = Math.max(0, Math.floor((now - since) / 86_400_000));
  return frozenDays + diff;
}

/** Determine the highest rank earned based on days */
export function earnedRank(days: number): RankDef {
  let earned = RANK_LADDER[0];
  for (const rank of RANK_LADDER) {
    if (days >= rank.daysRequired) earned = rank;
  }
  return earned;
}

/** Determine next rank above current rank (null if already Commander) */
export function nextRankFor(currentRank: string, days: number): RankDef | null {
  const idx = rankIndex(currentRank);
  if (idx >= RANK_LADDER.length - 1) return null; // already Commander
  const next = RANK_LADDER[idx + 1];
  if (days >= next.daysRequired) return next;
  return next; // show upcoming rank even if not yet earned
}

// ── Fetch all guild members (paginated) ─────────────────────
export interface GuildMember {
  user: {
    id: string;
    username: string;
    global_name?: string | null;
    avatar?: string | null;
  };
  nick?: string | null;
  roles: string[];
}

export interface GuildMemberCandidate {
  discord_id: string;
  display_name: string;
  username: string;
  nick: string | null;
}

export function normalizeLookup(input: string | null | undefined): string {
  return (input ?? "")
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function memberFields(member: GuildMember) {
  const username = member.user.username ?? "";
  const globalName = member.user.global_name ?? "";
  const nick = member.nick ?? "";
  const displayName = nick || globalName || username;
  return {
    username,
    globalName,
    nick,
    displayName,
    usernameNorm: normalizeLookup(username),
    globalNorm: normalizeLookup(globalName),
    nickNorm: normalizeLookup(nick),
  };
}

export function guildMemberToCandidate(member: GuildMember): GuildMemberCandidate {
  const fields = memberFields(member);
  return {
    discord_id: member.user.id,
    display_name: fields.displayName,
    username: fields.username,
    nick: member.nick ?? null,
  };
}

export function searchGuildMemberCandidates(
  guildMembers: GuildMember[],
  query: string,
  limit = 20
): GuildMemberCandidate[] {
  const q = normalizeLookup(query);
  if (!q) return [];

  const ranked = guildMembers
    .map((member) => {
      const fields = memberFields(member);
      const exact =
        fields.usernameNorm === q || fields.globalNorm === q || fields.nickNorm === q;
      const starts =
        fields.usernameNorm.startsWith(q) ||
        fields.globalNorm.startsWith(q) ||
        fields.nickNorm.startsWith(q);
      const contains =
        fields.usernameNorm.includes(q) ||
        fields.globalNorm.includes(q) ||
        fields.nickNorm.includes(q);

      let score = 0;
      if (exact) score = 3;
      else if (starts) score = 2;
      else if (contains) score = 1;

      return { member, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  return ranked.slice(0, limit).map((x) => guildMemberToCandidate(x.member));
}

export async function fetchAllGuildMembers(): Promise<GuildMember[]> {
  const allMembers: GuildMember[] = [];
  let after = "0";
  const limit = 1000;

  while (true) {
    const data = await discordFetch(
      `/guilds/${process.env.DISCORD_GUILD_ID}/members?limit=${limit}&after=${after}`,
      process.env.DISCORD_BOT_TOKEN!,
      true
    );
    if (!data || !Array.isArray(data) || data.length === 0) break;
    allMembers.push(...data);
    if (data.length < limit) break;
    after = data[data.length - 1].user.id;
  }

  return allMembers;
}

/** Try to resolve discord_id from a display name.
 *  Strategy: exact match on username/global_name/nick → partial contains →
 *  first-word match. Names are cleaned of newlines/extra whitespace. */
export function resolveDiscordId(
  displayName: string,
  guildMembers: GuildMember[]
): { id: string | null; multiple: boolean } {
  const candidates = searchGuildMemberCandidates(guildMembers, displayName, 25);
  if (candidates.length === 1) return { id: candidates[0].discord_id, multiple: false };
  if (candidates.length > 1) return { id: null, multiple: true };
  return { id: null, multiple: false };
}

/** Check if a guild member has "KSK" in any name field */
export function hasKSKInName(member: GuildMember): boolean {
  const names = [
    member.user.username,
    member.user.global_name,
    member.nick,
  ].filter(Boolean) as string[];
  return names.some((n) => n.toUpperCase().includes("KSK"));
}

// ── Post to a Discord channel ───────────────────────────────
export async function postChannelMessage(
  channelId: string,
  content: string
): Promise<boolean> {
  const res = await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`postChannelMessage failed: ${res.status} ${res.statusText}`, body);
  }
  return res.ok;
}

// ── Application log channel ID ──────────────────────────────
export const APP_LOG_CHANNEL_ID = "1468737258768175296";

// ── Post application log (ping optional) ────────────────────
export async function postAppLog(
  content: string,
  withPing = false,
  explicitPingRoleId?: string | null
): Promise<boolean> {
  let fullContent = content;
  if (withPing) {
    const pingRoleId = explicitPingRoleId || process.env.DISCORD_STAFF_PING_ROLE_ID;
    if (pingRoleId) {
      fullContent = `<@&${pingRoleId}>\n` + content;
    }
  }
  return postChannelMessage(APP_LOG_CHANNEL_ID, fullContent);
}


// ── Resolve tokens (opaque, hide discord_id from UI) ────────
const RESOLVE_TOKEN_SECRET = SECRET; // reuse session secret

export function signResolveToken(discordId: string): string {
  return jwt.sign({ did: discordId, purpose: "resolve" }, RESOLVE_TOKEN_SECRET, {
    expiresIn: "15m",
  });
}

export function verifyResolveToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, RESOLVE_TOKEN_SECRET) as {
      did?: string;
      purpose?: string;
    };
    if (payload.purpose !== "resolve" || !payload.did) return null;
    return payload.did;
  } catch {
    return null;
  }
}

// ── Response helpers ────────────────────────────────────────
export function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  };
}

export function redirect(url: string, cookie?: string) {
  const headers: Record<string, string> = { Location: url };
  if (cookie) headers["Set-Cookie"] = cookie;
  return { statusCode: 302, headers, body: "" };
}
