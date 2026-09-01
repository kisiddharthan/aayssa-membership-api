export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  try {
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

    const BASEROW_TOKEN =
      process.env.BASEROW_TOKEN;

    const BASEROW_TABLE_ID =
      process.env.BASEROW_TABLE_ID;

    if (
      !SUPABASE_URL ||
      !SUPABASE_PUBLISHABLE_KEY ||
      !BASEROW_TOKEN ||
      !BASEROW_TABLE_ID
    ) {
      console.error(
        "Missing required environment variables."
      );

      return res.status(500).json({
        success: false,
        message: "Admin service unavailable."
      });
    }


    // ------------------------------------------------
    // 1. Validate current Supabase session
    // ------------------------------------------------

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
      String(user.email)
        .trim()
        .toLowerCase();


    // ------------------------------------------------
    // 2. Look up authenticated member in Baserow
    // ------------------------------------------------

    const adminLookupUrl =
      `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464593__equal=${encodeURIComponent(
        normalizedEmail
      )}`;

    const adminLookupResponse =
      await fetch(adminLookupUrl, {
        headers: {
          Authorization:
            `Token ${BASEROW_TOKEN}`
        }
      });

    if (!adminLookupResponse.ok) {
      console.error(
        "Admin lookup failed:",
        adminLookupResponse.status
      );

      return res.status(500).json({
        success: false,
        message: "Unable to verify administrator."
      });
    }

    const adminLookupData =
      await adminLookupResponse.json();

    if (
      !Array.isArray(adminLookupData.results) ||
      adminLookupData.results.length === 0
    ) {
      return res.status(403).json({
        success: false,
        message: "Membership not found."
      });
    }

    const adminRow =
      adminLookupData.results[0];


    // ------------------------------------------------
    // 3. Server-side ADMIN authorization
    // ------------------------------------------------

    const roleField =
      adminRow.field_10493689;

    const roleId =
      roleField?.id ??
      roleField?.value ??
      roleField;

    const roleName =
      roleField?.value ??
      "";

    const isAdmin =
      Number(roleId) === 7473606 ||
      roleName === "Admin";

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Administrator access required."
      });
    }


    // ------------------------------------------------
    // 4. Retrieve ALL membership rows
    //
    // This happens SERVER-SIDE only.
    // Nothing exposes the Baserow token to the browser.
    // ------------------------------------------------

    const rows =
      await fetchAllBaserowRows(
        BASEROW_TABLE_ID,
        BASEROW_TOKEN
      );


    // ------------------------------------------------
    // 5. Aggregate statistics
    // ------------------------------------------------

    let registeredFamilies = 0;
    let activeFamilies = 0;

    let totalAdults = 0;
    let totalKids = 0;

    const volunteerCounts = {
      Pooja: 0,
      Annadhanam: 0,
      Bhajan: 0,
      Media: 0,
      Decorations: 0
    };

    let primaryMemberVolunteers = 0;
    let spouseVolunteers = 0;
    let otherFamilyVolunteers = 0;


    for (const row of rows) {

      registeredFamilies += 1;


      // ----------------------------------------------
      // Membership Status
      // field_10227507
      // ----------------------------------------------

      const status =
        row.field_10227507?.value ??
        row.field_10227507 ??
        "";

      if (
        String(status).toLowerCase() ===
        "active"
      ) {
        activeFamilies += 1;
      }


      // ----------------------------------------------
      // Adults / Kids
      // ----------------------------------------------

      totalAdults +=
        safeNumber(
          row.field_10281686
        );

      totalKids +=
        safeNumber(
          row.field_10281655
        );


      // ----------------------------------------------
      // Interested in Volunteering?
      // field_10281690
      // ----------------------------------------------

      const volunteers =
        getMultiSelectValues(
          row.field_10281690
        );

      if (
        volunteers.includes(
          "Primary Member"
        )
      ) {
        primaryMemberVolunteers += 1;
      }

      if (
        volunteers.includes(
          "Spouse"
        )
      ) {
        spouseVolunteers += 1;
      }

      if (
        volunteers.includes(
          "Other Family Member"
        )
      ) {
        otherFamilyVolunteers += 1;
      }


      // ----------------------------------------------
      // Areas of Interest
      // field_10281806
      // ----------------------------------------------

      const interests =
        getMultiSelectValues(
          row.field_10281806
        );

      for (
        const interest
        of interests
      ) {
        if (
          Object.prototype.hasOwnProperty.call(
            volunteerCounts,
            interest
          )
        ) {
          volunteerCounts[interest] += 1;
        }
      }
    }


    const totalPeople =
      totalAdults + totalKids;


    // ------------------------------------------------
    // 6. Return ONLY aggregate admin information
    // ------------------------------------------------

    return res.status(200).json({
      success: true,

      stats: {
        registeredFamilies,
        activeFamilies,

        totalAdults,
        totalKids,
        totalPeople,

        volunteerCounts,

        volunteerParticipation: {
          primaryMember:
            primaryMemberVolunteers,

          spouse:
            spouseVolunteers,

          otherFamilyMember:
            otherFamilyVolunteers
        }
      }
    });


  } catch (error) {

    console.error(
      "Admin stats API error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load admin statistics."
    });
  }
}



// ====================================================
// Retrieve every Baserow row
//
// Baserow paginates responses.
// We handle pagination on the server.
// ====================================================

async function fetchAllBaserowRows(
  tableId,
  token
) {

  const rows = [];

  let page = 1;
  const size = 200;


  while (true) {

    const url =
      `https://api.baserow.io/api/database/rows/table/${tableId}/` +
      `?user_field_names=false` +
      `&page=${page}` +
      `&size=${size}`;


    const response =
      await fetch(url, {
        headers: {
          Authorization:
            `Token ${token}`
        }
      });


    if (!response.ok) {

      throw new Error(
        `Baserow rows request failed: ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      Array.isArray(data.results)
    ) {
      rows.push(
        ...data.results
      );
    }


    if (!data.next) {
      break;
    }


    page += 1;
  }


  return rows;
}



// ====================================================
// Convert Baserow number values safely
// ====================================================

function safeNumber(value) {

  const number =
    Number(value);

  if (
    Number.isFinite(number)
  ) {
    return number;
  }

  return 0;
}



// ====================================================
// Convert Baserow multi-select values into strings
// ====================================================

function getMultiSelectValues(items) {

  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(item => {

      if (
        typeof item === "string"
      ) {
        return item;
      }

      return (
        item?.value ||
        item?.name ||
        ""
      );

    })
    .filter(Boolean);
}



// ====================================================
// Parse HttpOnly cookies
// ====================================================

function parseCookies(cookieHeader) {

  const cookies = {};

  cookieHeader
    .split(";")
    .forEach(cookie => {

      const index =
        cookie.indexOf("=");

      if (index === -1) {
        return;
      }

      const key =
        cookie
          .slice(0, index)
          .trim();

      const value =
        cookie
          .slice(index + 1)
          .trim();

      if (key) {
        cookies[key] =
          decodeURIComponent(value);
      }
    });

  return cookies;
}
