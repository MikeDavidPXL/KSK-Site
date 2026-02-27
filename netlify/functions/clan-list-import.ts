// /.netlify/functions/clan-list-import
// POST: receive parsed CSV rows (client-side parsed), upsert into clan_list_members
// Resolves discord_id via guild members, detects 420 tag
import type { Handler } from "@netlify/functions";
import {
  getSessionFromCookie,
  discordFetch,
  supabase,
  json,
  fetchAllGuildMembers,
  resolveDiscordId,
  has420InName,
  RANK_LADDER,
  computeTimeDays,
  earnedRank,
  nextRankFor,
  rankIndex,
  GuildMember,
} from "./shared";

const MAX_ROWS = 5000;

// Rate limit: 1 import per 60s per user
const lastImport = new Map<string, number>();
const IMPORT_COOLDOWN = 60_000;

// ── Header normalisation ────────────────────────────────────
/** Canonical key: lowercase, trim, collapse whitespace, strip non-alphanumeric
 *  except spaces. e.g. "Known as (nickname)" → "known as nickname"           */
function canonicalKey(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9 ]/g, " ")   // replace special chars with space
    .replace(/\s+/g, " ")           // collapse multiple spaces
    .trim();
}

// Internal field names we care about
type Field =
  | "discord_name"
  | "ign"
  | "uid"
  | "join_date"
  | "time_in_clan"
  | "rank_current"
  | "status"
  | "has_420_tag"
  | "_needs_role_updated";

/** Map of canonical header aliases → internal field */
const HEADER_ALIASES: Record<string, Field> = {
  // discord name
  "discord name":      "discord_name",
  "discord":           "discord_name",
  "discord username":  "discord_name",
  "username":          "discord_name",
  "discord_name":      "discord_name",

  // ingame name
  "ingame name":       "ign",
  "in game name":      "ign",
  "in-game name":      "ign",  // after canonical: "in game name"
  "ign":               "ign",
  "known as nickname": "ign",
  "known as":          "ign",
  "nickname":          "ign",

  // uid
  "uid":               "uid",
  "user id":           "uid",
  "id":                "uid",

  // join date
  "join date":         "join_date",
  "joined":            "join_date",
  "date joined":       "join_date",
  "join_date":         "join_date",

  // time in clan
  "time in clan days": "time_in_clan",
  "time in clan":      "time_in_clan",
  "days in clan":      "time_in_clan",
  "time_in_clan_days": "time_in_clan",
  "time_in_clan":      "time_in_clan",

  // rank
  "role given":        "rank_current",
  "role_given":        "rank_current",
  "role":              "rank_current",
  "rank":              "rank_current",
  "current role":      "rank_current",

  // status
  "status":            "status",
  "active status":     "status",
  "activity":          "status",

  // has 420 tag
  "has 420 tag":       "has_420_tag",
  "has 420 tag?":      "has_420_tag",  // after canonical: "has 420 tag"
  "420 tag":           "has_420_tag",
  "tag":               "has_420_tag",

  // needs role updated (ignored but mapped so it doesn't noise)
  "needs role updated":"_needs_role_updated",
  "needs role update": "_needs_role_updated",
  "needs promotion":   "_needs_role_updated",
  "promotion due":     "_needs_role_updated",
};

// Required fields (display name for error messages)
const REQUIRED_FIELDS: { field: Field; label: string }[] = [
  { field: "discord_name", label: "Discord Name" },
  { field: "ign",          label: "Ingame Name (IGN)" },
  { field: "uid",          label: "UID" },
  { field: "join_date",    label: "Join Date" },
];

/**
 * Build a mapping from original CSV header → internal field.
 * Returns the mapping + any warnings/errors about missing required columns.
 */
function buildHeaderMapping(
  originalHeaders: string[]
): {
  mapping: Map<string, Field>;
  resolvedLog: Record<string, string>;
  missingColumns: string[];
} {
  const mapping = new Map<string, Field>();
  const resolvedLog: Record<string, string> = {};
  const resolvedFields = new Set<Field>();

  for (const origHeader of originalHeaders) {
    const canonical = canonicalKey(origHeader);
    const field = HEADER_ALIASES[canonical];
    if (field) {
      mapping.set(origHeader, field);
      resolvedFields.add(field);
      resolvedLog[field] = origHeader;
    }
  }

  const missingColumns = REQUIRED_FIELDS
    .filter((r) => !resolvedFields.has(r.field))
    .map((r) => r.label);

  return { mapping, resolvedLog, missingColumns };
}

/** Normalise a row using the pre-built header mapping */
function normalizeRow(
  raw: Record<string, unknown>,
  headerMapping: Map<string, Field>
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(raw)) {
    const field = headerMapping.get(key);
    if (field) {
      // Strip newlines/carriage returns that Google Sheets CSV sometimes embeds
      out[field] = val == null
        ? undefined
        : String(val).replace(/[\r\n]+/g, " ").trim();
    }
  }
  return out;
}

// Normalize rank name to a known rank
function normalizeRank(raw: string | undefined): string {
  if (!raw) return "Private";
  const lower = raw.toLowerCase().trim();
  const found = RANK_LADDER.find((r) => r.name.toLowerCase() === lower);
  return found ? found.name : "Private";
}

// Parse date from various formats:
// - Excel serial number (e.g. 45695 → 2025-02-07)
// - DD/MM/YYYY (European, used in user's CSV)
// - MM/DD/YYYY (US)
// - YYYY-MM-DD (ISO)
function parseDate(raw: string | number | undefined): string | null {
  if (raw == null || raw === "") return null;

  // 1. Excel serial date number
  const num = typeof raw === "number" ? raw : Number(raw);
  if (!isNaN(num) && num > 1000 && num < 200000) {
    // Convert Excel serial → JS Date. 25569 = days between 1900-01-01 and Unix epoch.
    // Add 12h to avoid timezone edge-case rounding.
    const ms = (num - 25569) * 86_400_000 + 43_200_000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  }

  const s = String(raw).trim();

  // 2. DD/MM/YYYY or MM/DD/YYYY
  const slashMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const a = parseInt(slashMatch[1], 10);
    const b = parseInt(slashMatch[2], 10);
    const year = parseInt(slashMatch[3], 10);
    let day: number, month: number;
    if (a > 12) {
      // a must be day (DD/MM/YYYY)
      day = a; month = b;
    } else if (b > 12) {
      // b must be day (MM/DD/YYYY)
      day = b; month = a;
    } else {
      // Ambiguous — default to DD/MM/YYYY (European)
      day = a; month = b;
    }
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31 && year >= 1900 && year <= 2100) {
      const d = new Date(Date.UTC(year, month - 1, day));
      if (!isNaN(d.getTime())) {
        return d.toISOString().split("T")[0];
      }
    }
  }

  // 3. YYYY-MM-DD (ISO)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const d = new Date(Date.UTC(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10)
    ));
    if (!isNaN(d.getTime())) {
      return d.toISOString().split("T")[0];
    }
  }

  return null;
}

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
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  // ── Rate limit ────────────────────────────────────────────
  const now = Date.now();
  const last = lastImport.get(session.discord_id) ?? 0;
  if (now - last < IMPORT_COOLDOWN) {
    return json(
      { error: "Please wait before importing again.", code: "RATE_LIMITED" },
      429
    );
  }
  lastImport.set(session.discord_id, now);

  // ── Parse body ────────────────────────────────────────────
  let body: { rows?: Record<string, unknown>[] };
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { rows } = body;
  if (!rows || !Array.isArray(rows) || rows.length === 0) {
    return json({ error: "rows is required (non-empty array)" }, 400);
  }
  if (rows.length > MAX_ROWS) {
    return json({ error: `Maximum ${MAX_ROWS} rows allowed` }, 400);
  }

  // ── Build header mapping from first row's keys ────────────
  const originalHeaders = Object.keys(rows[0]);
  const { mapping: headerMapping, resolvedLog, missingColumns } =
    buildHeaderMapping(originalHeaders);

  console.log("[clan-list-import] Original headers:", originalHeaders);
  console.log("[clan-list-import] Canonical headers:", originalHeaders.map(canonicalKey));
  console.log("[clan-list-import] Resolved mapping:", resolvedLog);

  // If required columns are missing, return one clear error
  if (missingColumns.length > 0) {
    return json(
      {
        error: `Missing required column(s): ${missingColumns.join(", ")}. Found headers: ${originalHeaders.map((h) => `"${h}"`).join(", ")}`,
        resolved_mapping: resolvedLog,
      },
      400
    );
  }

  // ── Fetch guild members for discord_id resolution ─────────
  let guildMembers: GuildMember[] = [];
  try {
    guildMembers = await fetchAllGuildMembers();
  } catch (err) {
    console.error("Failed to fetch guild members:", err);
    // Continue without resolution — all rows get needs_resolution
  }

  // ── Process rows ──────────────────────────────────────────
  let imported = 0;
  let updated = 0;
  let unresolved = 0;
  const errors: string[] = [];
  const SOURCE_CSV = "csv" as const;

  for (let i = 0; i < rows.length; i++) {
    const raw = normalizeRow(rows[i], headerMapping);

    if (!raw.discord_name) {
      errors.push(`Row ${i + 1}: empty Discord Name`);
      continue;
    }
    if (!raw.ign) {
      errors.push(`Row ${i + 1}: empty Ingame Name`);
      continue;
    }
    if (!raw.uid) {
      errors.push(`Row ${i + 1}: missing UID`);
      continue;
    }

    const joinDate = parseDate(raw.join_date);
    if (!joinDate) {
      errors.push(`Row ${i + 1}: invalid or missing Join date`);
      continue;
    }

    const status =
      raw.status?.toLowerCase() === "inactive" ? "inactive" : "active";
    const rankCurrent = normalizeRank(raw.rank_current);
    const timeCsv = raw.time_in_clan ? parseInt(raw.time_in_clan, 10) : 0;

    // Resolve discord_id
    let discordId: string | null = null;
    let needsResolution = false;
    let detectedTag = false;

    // Check CSV has_420_tag value as fallback
    const csvTag = raw.has_420_tag?.toLowerCase();
    const csvTagValue = csvTag === "true" || csvTag === "yes" || csvTag === "1";

    if (guildMembers.length > 0) {
      const resolved = resolveDiscordId(raw.discord_name, guildMembers);
      if (resolved.id) {
        discordId = resolved.id;
        // Check 420 tag from actual Discord name
        const gm = guildMembers.find((m) => m.user.id === resolved.id);
        if (gm) detectedTag = has420InName(gm);
        // Fallback to CSV value if Discord detection didn't find tag
        if (!detectedTag && csvTagValue) detectedTag = true;
      } else {
        needsResolution = true;
        unresolved++;
        // Use CSV tag value when we can't resolve
        detectedTag = csvTagValue;
      }
    } else {
      needsResolution = true;
      unresolved++;
      detectedTag = csvTagValue;
    }

    // Calculate time & rank fields
    const isActive = status === "active";
    const csvDays = Math.max(0, timeCsv || 0);

    // Use CSV "Time in Clan (days)" as the accumulated days (source of truth).
    // For active + tagged: store csvDays as frozen_days, counting_since = now
    //   → at import time: total = csvDays + 0 = csvDays (exact match)
    //   → after import: grows by +1 per day naturally
    // For inactive or not tagged: frozen_days = csvDays, counting_since = null
    //   → stays frozen at csvDays until re-activated
    const countingSince =
      isActive && detectedTag ? new Date().toISOString() : null;
    const frozenDays = csvDays;

    const effectiveDays = computeTimeDays(frozenDays, countingSince);
    const earned = earnedRank(effectiveDays);
    // Use the higher of CSV rank and earned rank
    const currentIdx = Math.max(
      RANK_LADDER.findIndex(
        (r) => r.name.toLowerCase() === rankCurrent.toLowerCase()
      ),
      RANK_LADDER.indexOf(earned)
    );
    const finalRank = RANK_LADDER[Math.max(0, currentIdx)].name;

    const nxt = nextRankFor(finalRank, effectiveDays);
    const promoteEligible =
      isActive &&
      detectedTag &&
      !!nxt &&
      effectiveDays >= nxt.daysRequired &&
      rankIndex(finalRank) < RANK_LADDER.length - 1;

    const record = {
      discord_name: raw.discord_name,
      discord_id: discordId,
      ign: raw.ign,
      uid: raw.uid,
      join_date: joinDate,
      status,
      has_420_tag: detectedTag,
      rank_current: finalRank,
      rank_next: nxt?.name ?? null,
      frozen_days: frozenDays,
      counting_since: countingSince,
      promote_eligible: promoteEligible,
      promote_reason: promoteEligible && nxt
        ? `${effectiveDays} days in clan, meets ${nxt.name} threshold (${nxt.daysRequired} days)`
        : null,
      needs_resolution: needsResolution,
      resolution_status: discordId ? "resolved_auto" : "unresolved",
      resolved_at: discordId ? new Date().toISOString() : null,
      resolved_by: null,
      source: SOURCE_CSV,
      updated_at: new Date().toISOString(),
    };

    // Upsert by uid (unique game id)
    const { data: existing } = await supabase
      .from("clan_list_members")
      .select("id")
      .eq("uid", raw.uid)
      .maybeSingle();

    if (existing) {
      const { error: updateErr } = await supabase
        .from("clan_list_members")
        .update(record)
        .eq("id", existing.id);
      if (updateErr) {
        errors.push(`Row ${i + 1}: update failed — ${updateErr.message}`);
        continue;
      }
      updated++;
    } else {
      const { error: insertErr } = await supabase
        .from("clan_list_members")
        .insert(record);
      if (insertErr) {
        errors.push(`Row ${i + 1}: insert failed — ${insertErr.message}`);
        continue;
      }
      imported++;
    }
  }

  // ── Debug summary ──────────────────────────────────────────
  console.log(`[clan-list-import] Imported: ${imported}, Updated: ${updated}, Unresolved: ${unresolved}, Errors: ${errors.length}, Total rows: ${rows.length}`);

  // ── Audit log ─────────────────────────────────────────────
  await supabase.from("audit_log").insert({
    action: "clan_list_imported",
    actor_id: session.discord_id,
    details: { imported, updated, unresolved, error_count: errors.length },
  });

  return json({ ok: true, imported, updated, unresolved, errors });
};

export { handler };
