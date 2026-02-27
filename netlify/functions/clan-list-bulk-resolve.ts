// /.netlify/functions/clan-list-bulk-resolve
// POST: attempt to auto-resolve all unresolved clan_list_members against guild (staff only)
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  fetchAllGuildMembers,
  searchGuildMemberCandidates,
  normalizeLookup,
} from "./shared";

function normalizeUid(input: unknown): string {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function lookupVariants(input: string): string[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];

  const noDiscriminator = raw.replace(/#\d{2,6}$/g, "").trim();
  const noBrackets = noDiscriminator.replace(/\[[^\]]*\]/g, " ").trim();
  const noSpecial = noBrackets.replace(/[^\p{L}\p{N}\s]/gu, " ").trim();

  const variants = [raw, noDiscriminator, noBrackets, noSpecial]
    .map((v) => normalizeLookup(v))
    .filter(Boolean);

  return Array.from(new Set(variants));
}

const handler: Handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  // 1. Fetch all unresolved members
  const { data: unresolved, error: fetchErr } = await supabase
    .from("clan_list_members")
    .select("id, discord_name, discord_id, uid")
    .or("discord_id.is.null,needs_resolution.eq.true");

  if (fetchErr) {
    return json({ error: "Failed to fetch unresolved members" }, 500);
  }

  if (!unresolved || unresolved.length === 0) {
    return json({ ok: true, resolved: 0, skipped: 0, ambiguous: 0, not_found: 0, details: [] });
  }

  // 2. Preload application UID -> discord_id map (normalized)
  const { data: appRows, error: appFetchErr } = await supabase
    .from("applications")
    .select("uid, discord_id, status")
    .in("status", ["accepted", "pending"])
    .not("discord_id", "is", null);

  if (appFetchErr) {
    return json({ error: "Failed to fetch applications for UID mapping" }, 500);
  }

  const uidToDiscordIds = new Map<string, Set<string>>();
  for (const app of appRows ?? []) {
    const uidKey = normalizeUid(app.uid);
    const did = String(app.discord_id ?? "").trim();
    if (!uidKey || !did) continue;
    if (!uidToDiscordIds.has(uidKey)) uidToDiscordIds.set(uidKey, new Set());
    uidToDiscordIds.get(uidKey)!.add(did);
  }

  // 3. Fetch all guild members once
  const guildMembers = await fetchAllGuildMembers();
  if (!guildMembers.length) {
    return json(
      {
        error:
          "Discord member listing is unavailable. Check bot permissions/intents (Server Members Intent) and DISCORD_GUILD_ID.",
        code: "GUILD_MEMBER_LIST_UNAVAILABLE",
        debug: {
          uid_map_size: uidToDiscordIds.size,
          guild_member_count: guildMembers.length,
        },
      },
      503
    );
  }
  const nowIso = new Date().toISOString();

  let resolved = 0;
  let skipped = 0;
  let ambiguous = 0;
  let notFound = 0;
  let uidResolved = 0;
  let nameResolved = 0;
  let uidMissing = 0;
  let uidNoMatch = 0;
  let uidAmbiguous = 0;
  const details: { discord_name: string; result: string }[] = [];

  for (const row of unresolved) {
    // Skip if already has a discord_id and isn't flagged
    if (row.discord_id && row.discord_id.length > 0) {
      skipped++;
      details.push({ discord_name: row.discord_name, result: "already_has_id" });
      continue;
    }

    let matchedId: string | null = null;

    // 3a. Deterministic resolve by normalized UID -> applications.discord_id map
    if (row.uid) {
      const uidKey = normalizeUid(row.uid);
      const uniqueIds = Array.from(uidToDiscordIds.get(uidKey) ?? []);

      if (uniqueIds.length === 1) {
        matchedId = uniqueIds[0];
        uidResolved++;
      } else if (uniqueIds.length > 1) {
        uidAmbiguous++;
        ambiguous++;
        details.push({
          discord_name: row.discord_name,
          result: `ambiguous_uid (${uniqueIds.length} application ids)`,
        });
        continue;
      } else {
        uidNoMatch++;
      }
    } else {
      uidMissing++;
    }

    // 3b. Fallback by name matching against guild members
    let candidates = [] as ReturnType<typeof searchGuildMemberCandidates>;
    let exact = [] as ReturnType<typeof searchGuildMemberCandidates>;

    if (!matchedId) {
      const variants = lookupVariants(row.discord_name);
      const candidateMap = new Map<string, (typeof candidates)[number]>();

      for (const variant of variants) {
        const found = searchGuildMemberCandidates(guildMembers, variant, 25);
        for (const c of found) {
          candidateMap.set(c.discord_id, c);
        }
      }

      candidates = Array.from(candidateMap.values());
      const normalizedVariants = new Set(lookupVariants(row.discord_name));

      exact = candidates.filter((c) => {
        const names = [c.username, c.display_name, c.nick ?? ""]
          .map((n) => normalizeLookup(n))
          .filter(Boolean);
        return names.some((n) => normalizedVariants.has(n));
      });

      if (exact.length === 1) {
        matchedId = exact[0].discord_id;
        nameResolved++;
      } else if (exact.length === 0 && candidates.length === 1) {
        matchedId = candidates[0].discord_id;
        nameResolved++;
      }
    }

    if (matchedId) {
      const { error: updErr } = await supabase
        .from("clan_list_members")
        .update({
          discord_id: matchedId,
          needs_resolution: false,
          resolution_status: "resolved_auto",
          resolved_at: nowIso,
          resolved_by: null,
          updated_at: nowIso,
        })
        .eq("id", row.id);

      if (!updErr) {
        resolved++;
        details.push({ discord_name: row.discord_name, result: "resolved" });
      } else {
        skipped++;
        details.push({ discord_name: row.discord_name, result: `db_error: ${updErr.message}` });
      }
    } else if (exact.length > 1 || candidates.length > 1) {
      ambiguous++;
      details.push({ discord_name: row.discord_name, result: `ambiguous (${candidates.length} matches)` });
    } else {
      notFound++;
      details.push({ discord_name: row.discord_name, result: "not_found" });
    }
  }

  await supabase.from("audit_log").insert({
    action: "clan_list_bulk_resolve",
    actor_id: session.discord_id,
    details: {
      total_unresolved: unresolved.length,
      resolved,
      skipped,
      ambiguous,
      not_found: notFound,
      uid_resolved: uidResolved,
      name_resolved: nameResolved,
      uid_missing: uidMissing,
      uid_no_match: uidNoMatch,
      uid_ambiguous: uidAmbiguous,
      uid_map_size: uidToDiscordIds.size,
      guild_member_count: guildMembers.length,
    },
  });

  return json({
    ok: true,
    total_checked: unresolved.length,
    resolved,
    skipped,
    ambiguous,
    not_found: notFound,
    debug: {
      uid_resolved: uidResolved,
      name_resolved: nameResolved,
      uid_missing: uidMissing,
      uid_no_match: uidNoMatch,
      uid_ambiguous: uidAmbiguous,
      uid_map_size: uidToDiscordIds.size,
      guild_member_count: guildMembers.length,
    },
    details,
  });
};

export { handler };
