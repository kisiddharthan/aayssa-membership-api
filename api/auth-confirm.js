export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).send("Method not allowed");
  }

  const { token_hash, type } = req.query;

  if (!token_hash || type !== "email") {
    return res.redirect(
      302,
      "https://portal.atlantaayyappasevasangam.org/?login=invalid"
    );
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

    const response = await fetch(
      `${supabaseUrl}/auth/v1/verify`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          token_hash,
          type: "email",
        }),
      }
    );

    const data = await response.json();

    if (
      !response.ok ||
      !data.access_token ||
      !data.refresh_token
    ) {
      console.error("Supabase verify failed:", data);

      return res.redirect(
        302,
        "https://portal.atlantaayyappasevasangam.org/?login=failed"
      );
    }

    res.setHeader("Set-Cookie", [
      `aayssa_access=${encodeURIComponent(
        data.access_token
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,

      `aayssa_refresh=${encodeURIComponent(
        data.refresh_token
      )}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`,
    ]);

    return res.redirect(
      302,
      "https://portal.atlantaayyappasevasangam.org/"
    );
  } catch (error) {
    console.error("Auth confirmation error:", error);

    return res.redirect(
      302,
      "https://portal.atlantaayyappasevasangam.org/?login=error"
    );
  }
}
