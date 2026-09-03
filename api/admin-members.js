export default async function handler(req, res) {

  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }


  try {

    // ==================================================
    // 1. Read authentication cookie
    // ==================================================

    const cookies =
      parseCookies(req.headers.cookie || "");

    const accessToken =
      cookies.aayssa_access;


    if (!accessToken) {
      return res.status(401).json({
        success: false,
        message: "Not authenticated."
      });
    }



    // ==================================================
    // 2. Environment variables
    // ==================================================

    const SUPABASE_URL =
      process.env.SUPABASE_URL;

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
        message: "Directory service unavailable."
      });
    }



    // ==================================================
    // 3. Validate Supabase session
    // ==================================================

    const userResponse =
      await fetch(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          headers: {

            apikey:
              SUPABASE_PUBLISHABLE_KEY,

            Authorization:
              `Bearer ${accessToken}`
          }
        }
      );


    if (!userResponse.ok) {

      return res.status(401).json({
        success: false,
        message: "Session expired."
      });
    }


    const user =
      await userResponse.json();


    if (!user?.email) {

      return res.status(401).json({
        success: false,
        message:
          "Authenticated email unavailable."
      });
    }


    const normalizedEmail =
      String(user.email)
        .trim()
        .toLowerCase();



    // ==================================================
    // 4. Look up authenticated AAYSSA member
    // ==================================================

    const viewerLookupUrl =
      `https://api.baserow.io/api/database/rows/table/${BASEROW_TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464593__equal=${encodeURIComponent(
        normalizedEmail
      )}`;


    const viewerLookupResponse =
      await fetch(
        viewerLookupUrl,
        {
          headers: {
            Authorization:
              `Token ${BASEROW_TOKEN}`
          }
        }
      );


    if (!viewerLookupResponse.ok) {

      console.error(
        "Directory viewer lookup failed:",
        viewerLookupResponse.status
      );

      return res.status(500).json({
        success: false,
        message:
          "Unable to verify directory access."
      });
    }


    const viewerLookupData =
      await viewerLookupResponse.json();


    if (
      !Array.isArray(
        viewerLookupData.results
      ) ||
      viewerLookupData.results.length === 0
    ) {

      return res.status(403).json({
        success: false,
        message: "Membership not found."
      });
    }


    const viewerRow =
      viewerLookupData.results[0];



    // ==================================================
    // 5. BOARD / ADMIN authorization
    //
    // Member = 7473604
    // Board  = 7473605
    // Admin  = 7473606
    // ==================================================

    const viewerRoleField =
      viewerRow.field_10493689;


    const viewerRoleId =
      viewerRoleField?.id ??
      viewerRoleField?.value ??
      viewerRoleField;


    const viewerRoleName =
      viewerRoleField?.value ??
      "";


    const isAdmin =
      Number(viewerRoleId) === 7473606 ||
      viewerRoleName === "Admin";


    const isBoard =
      Number(viewerRoleId) === 7473605 ||
      viewerRoleName === "Board";


    if (
      !isAdmin &&
      !isBoard
    ) {

      return res.status(403).json({
        success: false,
        message:
          "Board or administrator access required."
      });
    }


    const viewerRole =
      isAdmin
        ? "Admin"
        : "Board";



    // ==================================================
    // 6. Read query parameters
    //
    // Example:
    //
    // /api/admin-members?q=kannan&page=1&size=20
    // ==================================================

    const searchQuery =
      String(req.query.q || "")
        .trim()
        .toLowerCase();


    let page =
      Number.parseInt(
        req.query.page,
        10
      );


    let size =
      Number.parseInt(
        req.query.size,
        10
      );


    if (
      !Number.isFinite(page) ||
      page < 1
    ) {
      page = 1;
    }


    if (
      !Number.isFinite(size) ||
      size < 1
    ) {
      size = 20;
    }


    // Prevent someone from requesting
    // thousands of rows at once.

    size =
      Math.min(
        size,
        50
      );



    // ==================================================
    // 7. Discover Baserow Created on field
    // ==================================================

    let createdOnFieldKey = null;


    try {

      createdOnFieldKey =
        await findCreatedOnFieldKey(
          BASEROW_TABLE_ID,
          BASEROW_TOKEN
        );

    } catch (error) {

      console.warn(
        "Created on field unavailable:",
        error
      );
    }



    // ==================================================
    // 8. Retrieve rows SERVER-SIDE
    //
    // Browser never receives Baserow token.
    // ==================================================

    const rows =
      await fetchAllBaserowRows(
        BASEROW_TABLE_ID,
        BASEROW_TOKEN
      );



    // ==================================================
    // 9. Map Baserow rows into approved directory data
    // ==================================================

    let members =
      rows.map(row => {

        const firstName =
          cleanString(
            row.field_10227506
          );


        const lastName =
          cleanString(
            row.field_10473214
          );


        const spouseFirstName =
          cleanString(
            row.field_10227562
          );


        const spouseLastName =
          cleanString(
            row.field_10473216
          );


        const email =
          cleanString(
            row.field_10281594
          );


        const mobileNumber =
          cleanString(
            row.field_10281595
          );


        const address =
          cleanString(
            row.field_10281618
          );


        const noOfAdults =
          safeNumber(
            row.field_10281686
          );


        const noOfKids =
          safeNumber(
            row.field_10281655
          );


        const volunteerInterest =
          getMultiSelectValues(
            row.field_10281690
          );


        const areasOfInterest =
          getMultiSelectValues(
            row.field_10281806
          );


        let registrationDate = null;


        if (
          createdOnFieldKey &&
          row[createdOnFieldKey]
        ) {

          registrationDate =
            formatRegistrationDate(
              row[createdOnFieldKey]
            );
        }



        // ----------------------------------------------
        // Fields available to Board + Admin
        // ----------------------------------------------

        const member = {

          firstName,

          lastName,

          spouseFirstName,

          spouseLastName,

          email,

          mobileNumber,

          address,

          noOfAdults,

          noOfKids,

          volunteerInterest,

          areasOfInterest,

          registrationDate

        };


        // ----------------------------------------------
        // Admin-only information
        //
        // Board will NOT receive Role or Status.
        // ----------------------------------------------

        if (isAdmin) {

          member.role =
            getSingleSelectValue(
              row.field_10493689
            );


          member.status =
            getSingleSelectValue(
              row.field_10227507
            );
        }


        // ----------------------------------------------
        // Internal search value
        //
        // Removed before returning to browser.
        // ----------------------------------------------

        member._search =
          [
            firstName,
            lastName,
            spouseFirstName,
            spouseLastName,
            email,
            mobileNumber,
            address,
            ...volunteerInterest,
            ...areasOfInterest
          ]
            .join(" ")
            .toLowerCase();


        return member;
      });



    // ==================================================
    // 10. Search
    // ==================================================

    if (searchQuery) {

      // Support simple multi-word search.
      //
      // Example:
      //
      // "sid cumming"
      //
      // requires BOTH words to occur somewhere
      // within the member's searchable data.

      const searchTerms =
        searchQuery
          .split(/\s+/)
          .filter(Boolean);


      members =
        members.filter(member => {

          return searchTerms.every(term =>
            member._search.includes(term)
          );

        });
    }



    // ==================================================
    // 11. Sort alphabetically
    // ==================================================

    members.sort(
      (a, b) => {

        const nameA =
          `${a.firstName} ${a.lastName}`
            .trim()
            .toLowerCase();


        const nameB =
          `${b.firstName} ${b.lastName}`
            .trim()
            .toLowerCase();


        return nameA.localeCompare(
          nameB
        );
      }
    );



    // ==================================================
    // 12. Pagination
    // ==================================================

    const total =
      members.length;


    const totalPages =
      Math.max(
        1,
        Math.ceil(
          total / size
        )
      );


    // If requested page is higher than available
    // pages, return the last page.

    if (page > totalPages) {
      page = totalPages;
    }


    const start =
      (page - 1) * size;


    const end =
      start + size;


    const paginatedMembers =
      members
        .slice(
          start,
          end
        )
        .map(member => {

          // Never send internal search string.

          const {
            _search,
            ...safeMember
          } = member;


          return safeMember;
        });



    // ==================================================
    // 13. Return approved directory information
    // ==================================================

    return res.status(200).json({

      success: true,

      viewerRole,

      directory: {

        total,

        page,

        size,

        totalPages,

        hasPreviousPage:
          page > 1,

        hasNextPage:
          page < totalPages,

        members:
          paginatedMembers

      }

    });



  } catch (error) {

    console.error(
      "Member directory API error:",
      error
    );


    return res.status(500).json({

      success: false,

      message:
        "Unable to load member directory."

    });
  }
}





// ====================================================
// Find Baserow automatic Created on field
// ====================================================

async function findCreatedOnFieldKey(
  tableId,
  token
) {

  const url =
    `https://api.baserow.io/api/database/fields/table/${tableId}/`;


  const response =
    await fetch(
      url,
      {
        headers: {
          Authorization:
            `Token ${token}`
        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `Unable to retrieve Baserow field schema: ${response.status}`
    );
  }


  const fields =
    await response.json();


  if (!Array.isArray(fields)) {
    return null;
  }


  const createdOnField =
    fields.find(field =>
      field?.type === "created_on"
    );


  if (
    !createdOnField ||
    !createdOnField.id
  ) {
    return null;
  }


  return `field_${createdOnField.id}`;
}





// ====================================================
// Fetch every Baserow row server-side
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
      await fetch(
        url,
        {
          headers: {
            Authorization:
              `Token ${token}`
          }
        }
      );


    if (!response.ok) {

      throw new Error(
        `Baserow rows request failed: ${response.status}`
      );
    }


    const data =
      await response.json();


    if (
      Array.isArray(
        data.results
      )
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
// Convert Baserow multi-select values
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
// Convert Baserow single select
// ====================================================

function getSingleSelectValue(value) {

  if (!value) {
    return "";
  }


  if (
    typeof value === "string"
  ) {
    return value;
  }


  return (
    value?.value ||
    value?.name ||
    ""
  );
}





// ====================================================
// Safely convert number
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
// Safely convert text
// ====================================================

function cleanString(value) {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }


  return String(value)
    .trim();
}





// ====================================================
// Registration date
//
// Display according to Atlanta local time.
// ====================================================

function formatRegistrationDate(value) {

  if (!value) {
    return null;
  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return null;
  }


  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/New_York",

      year:
        "numeric",

      month:
        "short",

      day:
        "numeric"
    }
  ).format(date);
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
          decodeURIComponent(
            value
          );
      }
    });


  return cookies;
}
