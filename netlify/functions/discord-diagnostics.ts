// /.netlify/functions/discord-diagnostics
// GET: staff-only Discord diagnostics for guild/member access
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, json, supabase } from "./shared";

const DISCORD_API = "https://discord.com/api/v10";

async function probe(path: string) {
  const res = await fetch(`${DISCORD_API}${path}`, {
    headers: {
      Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
  });
  const text = await res.text().catch(() => "");
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    sample: text.slice(0, 300),
  };
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json({ error: "Method not allowed" }, 405);
  }

  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const staffMember = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = staffMember?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  const guildId = process.env.DISCORD_GUILD_ID || "";

  const botMe = await probe("/users/@me");
  const guildInfo = await probe(`/guilds/${guildId}`);
  const memberList = await probe(`/guilds/${guildId}/members?limit=1`);
  const selfMember = await probe(`/guilds/${guildId}/members/${session.discord_id}`);

  await supabase.from("audit_log").insert({
    action: "discord_diagnostics",
    actor_id: session.discord_id,
    details: {
      guild_id_present: Boolean(guildId),
      bot_me_status: botMe.status,
      guild_info_status: guildInfo.status,
      member_list_status: memberList.status,
      self_member_status: selfMember.status,
    },
  });

  return json({
    ok: true,
    hints: {
      if_member_list_403:
        "Enable Server Members Intent in Discord Developer Portal for the bot application.",
      if_guild_info_404:
        "Check DISCORD_GUILD_ID and ensure bot is in that guild.",
      if_bot_me_401:
        "DISCORD_BOT_TOKEN invalid in Netlify environment variables.",
    },
    checks: {
      guild_id_present: Boolean(guildId),
      guild_id_value: guildId,
      bot_me: botMe,
      guild_info: guildInfo,
      member_list: memberList,
      self_member: selfMember,
    },
  });
};

export { handler };
