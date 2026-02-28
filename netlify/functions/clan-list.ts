// /.netlify/functions/clan-list
// GET: fetch clan list rows with search, pagination, list selection
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

const PAGE_SIZE = 50;

const handler: Handler = async (event) => {
  // ── Auth ──────────────────────────────────────────────
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // ── Staff check ───────────────────────────────────────
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  const params = event.queryStringParameters ?? {};

  // ── If no list_id, return available lists ─────────────
  if (!params.list_id) {
    const showArchived = params.show_archived === "true";

    let query = supabase
      .from("clan_list")
      .select("id, uploaded_at, uploaded_by, file_name, row_count, archived_at, archived_by, archive_reason")
      .order("uploaded_at", { ascending: false });

    if (!showArchived) {
      query = query.is("archived_at", null);
    }

    const { data, error } = await query;
    if (error) {
      console.error("clan_list fetch error:", error);
      return json({ error: "Failed to fetch lists" }, 500);
    }

    return json({ lists: data ?? [] });
  }

  // ── Fetch rows for a specific list ────────────────────
  const listId = params.list_id;
  const page = Math.max(1, parseInt(params.page || "1", 10));
  const search = (params.search || "").trim().toLowerCase();

  // First get list metadata
  const { data: listMeta } = await supabase
    .from("clan_list")
    .select("id, uploaded_at, uploaded_by, file_name, row_count")
    .eq("id", listId)
    .single();

  if (!listMeta) {
    return json({ error: "List not found" }, 404);
  }

  // If there's a search query, fetch all rows and filter in memory
  // (JSONB full-text search across dynamic keys is complex in SQL)
  if (search) {
    const { data: allRows, error: rowErr } = await supabase
      .from("clan_list_rows")
      .select("id, row_data")
      .eq("list_id", listId);

    if (rowErr) {
      return json({ error: "Failed to fetch rows" }, 500);
    }

    const filtered = (allRows ?? []).filter((row) => {
      const values = Object.values(row.row_data as Record<string, unknown>);
      return values.some(
        (v) => v != null && String(v).toLowerCase().includes(search)
      );
    });

    const totalFiltered = filtered.length;
    const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return json({
      list: listMeta,
      rows: paged,
      total: totalFiltered,
      page,
      page_size: PAGE_SIZE,
      total_pages: Math.ceil(totalFiltered / PAGE_SIZE),
    });
  }

  // No search — use Supabase pagination
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: rows, error: rowErr } = await supabase
    .from("clan_list_rows")
    .select("id, row_data")
    .eq("list_id", listId)
    .range(from, to);

  if (rowErr) {
    return json({ error: "Failed to fetch rows" }, 500);
  }

  return json({
    list: listMeta,
    rows: rows ?? [],
    total: listMeta.row_count,
    page,
    page_size: PAGE_SIZE,
    total_pages: Math.ceil(listMeta.row_count / PAGE_SIZE),
  });
};

export { handler };
