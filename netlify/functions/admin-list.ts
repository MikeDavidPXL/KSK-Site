// /.netlify/functions/admin-list
// GET: list all applications (staff only)
import type { Handler } from "@netlify/functions";
import { getSessionFromCookie, discordFetch, supabase, json } from "./shared";

type NoteRow = {
  id: string;
  note: string;
  created_at: string;
  created_by: string;
  created_by_username?: string | null;
  created_by_avatar_hash?: string | null;
};

const handler: Handler = async (event) => {
  // Auth check
  const session = getSessionFromCookie(event.headers.cookie);
  if (!session) return json({ error: "Unauthorized" }, 401);

  // Staff role check via Discord
  const member = await discordFetch(
    `/guilds/${process.env.DISCORD_GUILD_ID}/members/${session.discord_id}`,
    process.env.DISCORD_BOT_TOKEN!,
    true
  );
  const roles: string[] = member?.roles ?? [];
  if (!roles.includes(process.env.DISCORD_STAFF_ROLE_ID!)) {
    return json({ error: "Forbidden" }, 403);
  }

  // Query params
  const status = event.queryStringParameters?.status; // pending | accepted | rejected
  const showArchived = event.queryStringParameters?.show_archived === "true";

  let query = supabase
    .from("applications")
    .select("*, application_notes(id, note, created_at, created_by, created_by_username)")
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  // By default hide archived applications; show only when explicitly requested
  if (!showArchived) {
    query = query.is("archived_at", null);
  }

  const { data, error } = await query;
  if (error) {
    console.error("List error:", error);
    return json({ error: "Failed to fetch applications" }, 500);
  }

  const rawApps = data ?? [];

  const authorIds = Array.from(
    new Set(
      rawApps
        .flatMap((app: any) => app.application_notes ?? [])
        .map((note: NoteRow) => note.created_by)
        .filter(Boolean)
    )
  );

  const avatarHashByAuthorId = new Map<string, string | null>();

  await Promise.all(
    authorIds.map(async (authorId) => {
      const noteMember = await discordFetch(
        `/guilds/${process.env.DISCORD_GUILD_ID}/members/${authorId}`,
        process.env.DISCORD_BOT_TOKEN!,
        true
      );

      avatarHashByAuthorId.set(authorId, noteMember?.user?.avatar ?? null);
    })
  );

  // Sort nested notes newest-first + enrich with avatar hash
  const apps = rawApps.map((app: any) => ({
    ...app,
    application_notes: (app.application_notes ?? [])
      .map((note: NoteRow) => ({
        ...note,
        created_by_avatar_hash:
          avatarHashByAuthorId.get(note.created_by) ?? null,
      }))
      .sort(
      (a: NoteRow, b: NoteRow) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ),
  }));

  return json({ applications: apps });
};

export { handler };
