// /.netlify/functions/auth-callback
// Exchanges Discord code for token, creates session cookie, redirects to /dashboard
import type { Handler } from "@netlify/functions";
import { createSession, discordFetch, redirect } from "./shared";

const handler: Handler = async (event) => {
  const code = event.queryStringParameters?.code;
  if (!code) {
    return { statusCode: 400, body: "Missing code parameter" };
  }

  // Exchange code for access token
  const tokenRes = await fetch("https://discord.com/api/v10/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID!,
      client_secret: process.env.DISCORD_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      redirect_uri: process.env.DISCORD_REDIRECT_URI!,
    }),
  });

  if (!tokenRes.ok) {
    return { statusCode: 401, body: "Failed to exchange code" };
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;

  // Get user info
  const user = await discordFetch("/users/@me", accessToken);
  if (!user) {
    return { statusCode: 401, body: "Failed to fetch user" };
  }

  // Create JWT session
  const sessionToken = createSession({
    discord_id: user.id,
    username: user.username,
    avatar_hash: user.avatar ?? null,
  });

  // Set cookie and redirect
  const cookie = `session=${sessionToken}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 60 * 60}`;

  // Determine base URL from redirect URI
  const base = new URL(process.env.DISCORD_REDIRECT_URI!).origin;
  return redirect(`${base}/dashboard`, cookie);
};

export { handler };
