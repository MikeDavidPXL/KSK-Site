// /.netlify/functions/auth-start
// Redirects the user to Discord OAuth2 authorization page
import type { Handler } from "@netlify/functions";

const handler: Handler = async () => {
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID!,
    redirect_uri: process.env.DISCORD_REDIRECT_URI!,
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
