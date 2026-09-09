const {
  buildVolunteerPayload,
  cleanString,
  createVolunteerRow,
  fetchFamilyVolunteerRows,
  getAuthenticatedMember,
  getPrimaryName,
  getSpouseName,
  mapVolunteerRow,
  VOLUNTEER_FIELDS,
  updateVolunteerRow
} = require("../lib/aayssa.js");

async function handler(req, res) {
  if (req.method !== "POST") {
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

    const requestedVolunteers =
      normalizeSubmittedVolunteers(
        req.body?.volunteers
      );

    const existingRows =
      await fetchFamilyVolunteerRows(
        auth.memberRow.id
      );

    const existingVolunteers =
      existingRows.map(row => ({
        row,
        volunteer:
          mapVolunteerRow(row)
      }));

    const primaryName =
      getPrimaryName(auth.memberRow);

    const spouseName =
      getSpouseName(auth.memberRow);

    const primaryRequest =
      requestedVolunteers.find(volunteer =>
        volunteer.memberType === "primary"
      ) || {
        memberType: "primary",
        interested: false,
        areas: []
      };

    await upsertTypedVolunteer({
      existingVolunteers,
      familyRowId: auth.memberRow.id,
      memberType: "primary",
      name: primaryName,
      relationship: "",
      interested: primaryRequest.interested,
      areas: primaryRequest.areas
    });

    const spouseRequest =
      requestedVolunteers.find(volunteer =>
        volunteer.memberType === "spouse"
      );

    if (spouseName) {
      await upsertTypedVolunteer({
        existingVolunteers,
        familyRowId: auth.memberRow.id,
        memberType: "spouse",
        name: spouseName,
        relationship: "",
        interested:
          Boolean(spouseRequest?.interested),
        areas:
          spouseRequest?.areas || []
      });
    } else {
      await deactivateTypedVolunteers(
        existingVolunteers,
        "spouse"
      );
    }

    await syncAdditionalVolunteers({
      requestedVolunteers:
        requestedVolunteers.filter(volunteer =>
          volunteer.memberType === "additional"
        ),
      existingVolunteers,
      familyRowId: auth.memberRow.id
    });

    const updatedRows =
      await fetchFamilyVolunteerRows(
        auth.memberRow.id
      );

    const volunteers =
      updatedRows
        .map(mapVolunteerRow)
        .filter(volunteer =>
          volunteer.active
        );

    return res.status(200).json({
      success: true,
      volunteers
    });

  } catch (error) {
    console.error(
      "Update volunteers API error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to update volunteer records."
    });
  }
}

async function upsertTypedVolunteer({
  existingVolunteers,
  familyRowId,
  memberType,
  name,
  relationship,
  interested,
  areas
}) {
  const existing =
    existingVolunteers.find(item =>
      item.volunteer.memberType === memberType
    );

  const payload =
    buildVolunteerPayload({
      familyRowId,
      name,
      memberType,
      relationship,
      interested,
      areas,
      active: true
    });

  if (existing) {
    await updateVolunteerRow(
      existing.row.id,
      payload
    );

    return;
  }

  await createVolunteerRow(payload);
}

async function deactivateTypedVolunteers(
  existingVolunteers,
  memberType
) {
  const matches =
    existingVolunteers.filter(item =>
      item.volunteer.memberType === memberType &&
      item.volunteer.active
    );

  for (const match of matches) {
    await updateVolunteerRow(
      match.row.id,
      {
        [VOLUNTEER_FIELDS.active]:
          false
      }
    );
  }
}

async function syncAdditionalVolunteers({
  requestedVolunteers,
  existingVolunteers,
  familyRowId
}) {
  const existingAdditional =
    existingVolunteers.filter(item =>
      item.volunteer.memberType === "additional"
    );

  const seenIds =
    new Set();

  for (const requested of requestedVolunteers) {
    if (!requested.name) {
      continue;
    }

    const existing =
      requested.id
        ? existingAdditional.find(item =>
            Number(item.row.id) === Number(requested.id)
          )
        : null;

    const payload =
      buildVolunteerPayload({
        familyRowId,
        name: requested.name,
        memberType: "additional",
        relationship: requested.relationship,
        interested: requested.interested,
        areas: requested.areas,
        active: true
      });

    if (existing) {
      seenIds.add(Number(existing.row.id));

      await updateVolunteerRow(
        existing.row.id,
        payload
      );
    } else {
      await createVolunteerRow(payload);
    }
  }

  for (const existing of existingAdditional) {
    if (
      existing.volunteer.active &&
      !seenIds.has(Number(existing.row.id))
    ) {
      await updateVolunteerRow(
        existing.row.id,
        {
          [VOLUNTEER_FIELDS.active]:
            false
        }
      );
    }
  }
}

function normalizeSubmittedVolunteers(volunteers) {
  if (!Array.isArray(volunteers)) {
    return [];
  }

  return volunteers
    .map(volunteer => ({
      id:
        volunteer?.id
          ? Number(volunteer.id)
          : null,
      name:
        cleanString(volunteer?.name),
      memberType:
        normalizeSubmittedMemberType(
          volunteer?.memberType
        ),
      relationship:
        cleanString(volunteer?.relationship),
      interested:
        Boolean(volunteer?.interested),
      areas:
        Array.isArray(volunteer?.areas)
          ? volunteer.areas.map(cleanString)
          : []
    }))
    .filter(volunteer =>
      Boolean(volunteer.memberType)
    );
}

function normalizeSubmittedMemberType(value) {
  const normalized =
    cleanString(value)
      .toLowerCase();

  if (normalized === "primary") {
    return "primary";
  }

  if (normalized === "spouse") {
    return "spouse";
  }

  if (
    normalized === "additional" ||
    normalized === "additional member" ||
    normalized === "additional family member"
  ) {
    return "additional";
  }

  return "";
}

module.exports = handler;
