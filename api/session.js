export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  try {

    const {
      accessToken,
      refreshToken
    } = req.body || {};

    if (!accessToken || !refreshToken) {
      return res.status(400).json({
        success: false,
        message: "Missing authentication tokens."
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
      console.error("Missing Supabase environment variables.");

      return res.status(500).json({
        success: false,
        message: "Authentication service unavailable."
      });
    }

    // Validate the Supabase access token
    const userResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`
        }
      }
    );

    if (!userResponse.ok) {

      console.error(
        "Supabase token validation failed:",
        userResponse.status
      );

      return res.status(401).json({
        success: false,
        message: "Invalid or expired login session."
      });
    }

    const user = await userResponse.json();

    if (!user?.email) {
      return res.status(401).json({
        success: false,
        message: "Authenticated email not found."
      });
    }

    /*
      Store tokens only in secure HttpOnly cookies.
      Browser JavaScript cannot read these after this point.
    */

    res.setHeader("Set-Cookie", [
      `aayssa_access=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=3600`,
      `aayssa_refresh=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=2592000`
    ]);

    return res.status(200).json({
      success: true
    });

  } catch (error) {

    console.error("Session API error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to create secure session."
    });
  }
}
