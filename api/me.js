export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  try {
    // Read HttpOnly access-token cookie
    const cookies = parseCookies(req.headers.cookie || "");
    const accessToken = cookies.aayssa_access;

    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated."
      });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_PUBLISHABLE_KEY =
      process.env.SUPABASE_PUBLISHABLE_KEY;

    const BASEROW_TOKEN = process.env.BASEROW_TOKEN;
    const BASEROW_TABLE_ID = process.env.BASEROW_TABLE_ID;

    if (
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY ||
      !BASEROW_TOKEN ||
      !BASEROW_TABLE_ID
    ) {
      console.error("Missing required environment variables.");

      return res.status(500).json({
        success: false,
        message: "Portal service unavailable."
      });
    }

    // Verify session with Supabase
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
      return res.status(401).json({
        success: false,
        message: "Session expired."
      });
    }

    const user = await userResponse.json();

    if (!user?.email) {
      return res.status(401).json({
        success: false,
        message: "Authenticated email unavailable."
      });
    }

    const normalizedEmail =
      String(user.email).trim().toLowerCase();

    // IMPORTANT:
    // Look up ONLY the authenticated user's email.
    const baserowUrl =
      `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464593__equal=${encodeURIComponent(normalizedEmail)}`;

    const baserowResponse = await fetch(baserowUrl, {
      headers: {
        Authorization: `Token ${BASEROW_TOKEN}`
      }
    });

    if (!baserowResponse.ok) {
      console.error(
        "Baserow member lookup failed:",
        baserowResponse.status
      );

      return res.status(500).json({
        success: false,
        message: "Unable to load membership."
      });
    }

    const baserowData = await baserowResponse.json();

    if (
      !Array.isArray(baserowData.results) ||
      baserowData.results.length === 0
    ) {
      return res.status(403).json({
        success: false,
        message: "AAYSSA membership not found."
      });
    }

    const row = baserowData.results[0];

    // Translate Baserow Role safely
    const roleId =
      row.field_10493689?.id ??
      row.field_10493689?.value ??
      row.field_10493689;

    let role = "Member";

    if (
      Number(roleId) === 7473605 ||
      row.field_10493689?.value === "Board"
    ) {
      role = "Board";
    }

    if (
      Number(roleId) === 7473606 ||
      row.field_10493689?.value === "Admin"
    ) {
      role = "Admin";
    }

    /*
      Return ONLY fields that the member is
      allowed to see.

      Never return the complete Baserow row.
    */

    return res.status(200).json({
      success: true,

      member: {
        firstName: row.field_10227506 || "",
        lastName: row.field_10473214 || "",

        membershipId:
          row.field_10361167 || "",

        status:
          row.field_10227507?.value ||
          row.field_10227507 ||
          "",

        role,

        email:
          row.field_10281594 || "",

        mobileNumber:
          row.field_10281595 || "",

        address:
          row.field_10281618 || "",

        spouseFirstName:
          row.field_10227562 || "",

        spouseLastName:
          row.field_10473216 || "",

        noOfAdults:
          row.field_10281686 ?? null,

        noOfKids:
          row.field_10281655 ?? null,

        volunteerInterest:
          row.field_10281690 || [],

        areasOfInterest:
          row.field_10281806 || [],

        emailOptIn:
          Boolean(row.field_10281810),

        textOptIn:
          Boolean(row.field_10281812),

        editProfileLink:
          row.field_10361006 || ""
      }
    });

  } catch (error) {
    console.error("Member profile API error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load member profile."
    });
  }
}

function parseCookies(cookieHeader) {
  const cookies = {};

  cookieHeader.split(";").forEach(cookie => {
    const index = cookie.indexOf("=");

    if (index === -1) return;

    const key = cookie.slice(0, index).trim();
    const value = cookie.slice(index + 1).trim();

    if (key) {
      cookies[key] = decodeURIComponent(value);
    }
  });

  return cookies;
}
