// /.netlify/functions/logout
// Clears the session cookie and redirects to landing page
import type { Handler } from "@netlify/functions";

const handler: Handler = async () => {
  return {
    statusCode: 302,
    headers: {
      Location: "/",
      "Set-Cookie":
        "session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0",
    },
    body: "",
  };
};

export { handler };
