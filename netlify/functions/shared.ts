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

export type StaffTier = "owner" | "webdev" | "admin";

export const OWNER_ROLE_ID = process.env.DISCORD_OWNER_ROLE_ID;
export const WEBDEV_ROLE_ID = process.env.DISCORD_WEBDEV_ROLE_ID;
export const ADMIN_ROLE_ID =
  process.env.DISCORD_ADMIN_ROLE_ID ?? process.env.DISCORD_STAFF_ROLE_ID;

// ── Rank role IDs (Corporal and above can download the pack) ────
export const CORPORAL_ROLE_ID = "1374050435484094525";
export const SERGEANT_ROLE_ID = "1378450788069933206";
export const LIEUTENANT_ROLE_ID = "1378450714845778022";
export const MAJOR_ROLE_ID = "1378450739885637702";

const DOWNLOAD_ELIGIBLE_ROLES = [
  CORPORAL_ROLE_ID,
  SERGEANT_ROLE_ID,
  LIEUTENANT_ROLE_ID,
  MAJOR_ROLE_ID,
];

/** Returns true if the user holds Corporal, Sergeant, Lieutenant, or Major role */
export function isCorporalOrHigher(roles: string[]): boolean {
  return DOWNLOAD_ELIGIBLE_ROLES.some((r) => roles.includes(r));
}

export function determineStaffTier(roles: string[]): StaffTier | null {
  if (OWNER_ROLE_ID && roles.includes(OWNER_ROLE_ID)) return "owner";
  if (WEBDEV_ROLE_ID && roles.includes(WEBDEV_ROLE_ID)) return "webdev";
  if (ADMIN_ROLE_ID && roles.includes(ADMIN_ROLE_ID)) return "admin";
  return null;
}

export function staffTierRank(tier: StaffTier | null): number {
  if (tier === "owner") return 3;
  if (tier === "webdev") return 2;
  if (tier === "admin") return 1;
  return 0;
}

export function staffTierLabel(tier: StaffTier): "Owner" | "Web Developer" | "Admin" {
  if (tier === "owner") return "Owner";
  if (tier === "webdev") return "Web Developer";
  return "Admin";
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
  { name: "Private",    roleId: null,                    daysRequired: 0  },
  { name: "Corporal",   roleId: "1374050435484094525",   daysRequired: 14 },
  { name: "Sergeant",   roleId: "1378450788069933206",   daysRequired: 30 },
  { name: "Lieutenant", roleId: "1378450714845778022",   daysRequired: 60 },
  { name: "Major",      roleId: "1378450739885637702",   daysRequired: 90 },
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

/** Determine next rank above current rank (null if already Major) */
export function nextRankFor(currentRank: string, days: number): RankDef | null {
  const idx = rankIndex(currentRank);
  if (idx >= RANK_LADDER.length - 1) return null; // already Major
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

/** Check if a guild member has "420" in any name field */
export function has420InName(member: GuildMember): boolean {
  const names = [
    member.user.username,
    member.user.global_name,
    member.nick,
  ].filter(Boolean) as string[];
  return names.some((n) => n.includes("420"));
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
export const APP_LOG_CHANNEL_ID = "1374059564168773863";

// ── Post application log (ping optional) ────────────────────
export async function postAppLog(content: string, withPing = false): Promise<boolean> {
  let fullContent = content;
  if (withPing) {
    const staffPingRoleId = process.env.DISCORD_STAFF_PING_ROLE_ID;
    if (staffPingRoleId) {
      fullContent = `<@&${staffPingRoleId}>\n` + content;
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
