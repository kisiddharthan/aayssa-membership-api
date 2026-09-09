const {
  fetchFamilyVolunteerRows,
  getAuthenticatedMember,
  getMultiSelectValues,
  getPrimaryName,
  getSpouseName,
  mapVolunteerRow
} = require("../lib/aayssa.js");

async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  try {
    const auth =
      await getAuthenticatedMember(req);

    if (auth.status !== 200) {
      return res.status(auth.status).json({
        success: false,
        message: auth.error
      });
    }

    const rows =
      await fetchFamilyVolunteerRows(
        auth.memberRow.id
      );

    const volunteers =
      rows
        .map(mapVolunteerRow)
        .filter(volunteer =>
          volunteer.active
        );

    return res.status(200).json({
      success: true,
      volunteers:
        volunteers.length > 0
          ? volunteers
          : buildLegacyVolunteers(auth.memberRow)
    });

  } catch (error) {
    console.error(
      "My volunteers API error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load volunteer records."
    });
  }
}

function buildLegacyVolunteers(memberRow) {
  const primaryName =
    getPrimaryName(memberRow);

  const spouseName =
    getSpouseName(memberRow);

  const interestedMembers =
    getMultiSelectValues(
      memberRow.field_10281690
    );

  const areas =
    getMultiSelectValues(
      memberRow.field_10281806
    );

  const volunteers = [];

  if (
    interestedMembers.includes("Primary Member") ||
    areas.length > 0
  ) {
    volunteers.push({
      id: null,
      name: primaryName,
      memberType: "primary",
      memberTypeLabel: "Primary Member",
      relationship: "",
      interested:
        interestedMembers.includes("Primary Member") ||
        areas.length > 0,
      areas,
      active: true
    });
  }

  if (
    spouseName &&
    interestedMembers.includes("Spouse")
  ) {
    volunteers.push({
      id: null,
      name: spouseName,
      memberType: "spouse",
      memberTypeLabel: "Spouse",
      relationship: "",
      interested: true,
      areas,
      active: true
    });
  }

  return volunteers;
}

module.exports = handler;
