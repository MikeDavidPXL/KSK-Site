// /.netlify/functions/auth-start
// Redirects the user to Discord OAuth2 authorization page
import type { Handler } from "@netlify/functions";

const handler: Handler = async () => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Missing OAuth environment variables",
        missing: [
          !clientId ? "DISCORD_CLIENT_ID" : null,
          !redirectUri ? "DISCORD_REDIRECT_URI" : null,
        ].filter(Boolean),
      }),
    };
  }

  try {
    new URL(redirectUri);
  } catch {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Invalid OAuth environment variables",
        invalid: ["DISCORD_REDIRECT_URI"],
      }),
    };
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "identify guilds",
  });

  return {
    statusCode: 302,
    headers: { Location: `https://discord.com/api/oauth2/authorize?${params}` },
    body: "",
  };
};

export { handler };
