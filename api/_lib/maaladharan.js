import {
  cleanString,
  getAuthenticatedMember,
  getBaserowBaseUrl,
  getBaserowHeaders
} from "./aayssa.js";

const TABLE_ID =
  process.env.BASEROW_MAALADHARAN_TABLE_ID || "1210688";

const SEASON = "2026-27 Mandalam";
const SEASON_START = "2026-10-25";
const SEASON_END = "2026-12-04";

export async function handleMaaladharan(req, res) {
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
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

    const fields =
      await fetchRegistrationFields();

    const registrations =
      await fetchFamilyRegistrations(
        auth.memberRow.id,
        fields
      );

    if (req.method === "GET") {
      return res.status(200).json({
        success: true,
        season: SEASON,
        seasonStart: SEASON_START,
        seasonEnd: SEASON_END,
        registrations
      });
    }

    if (req.method === "PATCH") {
      const registrationId =
        Number(req.body?.id);

      const existing =
        registrations.find(item =>
          Number(item.id) === registrationId
        );

      if (!existing) {
        return res.status(404).json({
          success: false,
          message:
            "Maaladharan registration not found."
        });
      }

      if (existing.status === "Cancelled") {
        return res.status(409).json({
          success: false,
          message:
            "A withdrawn registration cannot be edited."
        });
      }

      const update =
        normalizeRegistrationUpdate(req.body);

      const validationError =
        validateRegistrationUpdate(update);

      if (validationError) {
        return res.status(400).json({
          success: false,
          message: validationError
        });
      }

      await updateRegistration({
        registrationId,
        fields,
        update
      });

      const updatedRegistrations =
        await fetchFamilyRegistrations(
          auth.memberRow.id,
          fields
        );

      return res.status(200).json({
        success: true,
        season: SEASON,
        seasonStart: SEASON_START,
        seasonEnd: SEASON_END,
        registrations: updatedRegistrations
      });
    }

    const registration =
      normalizeRegistration(req.body);

    const validationError =
      validateRegistration(registration);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError
      });
    }

    const duplicate =
      registrations.find(item =>
        item.participantName.toLowerCase() ===
          registration.participantName.toLowerCase() &&
        item.status !== "Cancelled"
      );

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message:
          "This participant is already registered for the 2026-27 season."
      });
    }

    await createRegistration({
      auth,
      fields,
      registration
    });

    const updatedRegistrations =
      await fetchFamilyRegistrations(
        auth.memberRow.id,
        fields
      );

    return res.status(201).json({
      success: true,
      season: SEASON,
      seasonStart: SEASON_START,
      seasonEnd: SEASON_END,
      registrations: updatedRegistrations
    });
  } catch (error) {
    console.error(
      "Maaladharan registration API error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        error instanceof Error &&
        error.message.startsWith("Registration table")
          ? error.message
          : "Unable to process Maaladharan registration."
    });
  }
}

async function fetchRegistrationFields() {
  const response =
    await fetch(
      `${getBaserowBaseUrl()}/api/database/fields/table/${TABLE_ID}/`,
      {
        headers: getBaserowHeaders()
      }
    );

  if (!response.ok) {
    console.error(
      "Registration field lookup failed:",
      response.status,
      await response.text()
    );

    throw new Error(
      "Registration table configuration is unavailable."
    );
  }

  const fields =
    await response.json();

  const byName =
    new Map(
      fields.map(field => [
        normalizeFieldName(field.name),
        field
      ])
    );

  const requiredNames = [
    "Family",
    "Season",
    "Participant Name",
    "Participant Type",
    "Age",
    "Phone Number",
    "Email",
    "Maaladharan Date",
    "First Deeksha",
    "Padi Count",
    "Registration Status",
    "Joining AAYSSA Yatra",
    "Member Notes"
  ];

  const missing =
    requiredNames.filter(name =>
      !byName.has(normalizeFieldName(name))
    );

  if (missing.length > 0) {
    throw new Error(
      `Registration table is missing fields: ${missing.join(", ")}.`
    );
  }

  return {
    all: fields,
    byName
  };
}

async function fetchFamilyRegistrations(
  familyRowId,
  fields
) {
  const familyField =
    getField(fields, "Family");

  const url =
    `${getBaserowBaseUrl()}/api/database/rows/table/${TABLE_ID}/` +
    `?user_field_names=false` +
    `&filter__field_${familyField.id}__link_row_has=${encodeURIComponent(familyRowId)}`;

  const response =
    await fetch(url, {
      headers: getBaserowHeaders()
    });

  if (!response.ok) {
    console.error(
      "Registration lookup failed:",
      response.status,
      await response.text()
    );

    throw new Error(
      "Unable to load Maaladharan registrations."
    );
  }

  const data =
    await response.json();

  return (Array.isArray(data.results)
    ? data.results
    : [])
    .map(row =>
      mapRegistrationRow(row, fields)
    )
    .filter(item =>
      item.season === SEASON
    );
}

async function createRegistration({
  auth,
  fields,
  registration
}) {
  const values = {};

  setField(
    values,
    fields,
    "Registration Name",
    `${registration.participantName} - ${SEASON}`,
    { optional: true, writableOnly: true }
  );
  setField(
    values,
    fields,
    "Family",
    [Number(auth.memberRow.id)]
  );
  setSelectField(
    values,
    fields,
    "Season",
    SEASON
  );
  setField(
    values,
    fields,
    "Participant Name",
    registration.participantName
  );
  setSelectField(
    values,
    fields,
    "Participant Type",
    displayParticipantType(
      registration.participantType
    )
  );
  setField(
    values,
    fields,
    "Age",
    registration.age
  );
  setField(
    values,
    fields,
    "Phone Number",
    registration.phoneNumber
  );
  setField(
    values,
    fields,
    "Email",
    auth.normalizedEmail
  );
  setField(
    values,
    fields,
    "Maaladharan Date",
    registration.maaladharanDate
  );
  setField(
    values,
    fields,
    "First Deeksha",
    registration.firstDeeksha
  );
  setSelectField(
    values,
    fields,
    "Padi Count",
    registration.firstDeeksha
      ? "1 (Kanni Swamy)"
      : registration.padiStatus
  );
  setField(
    values,
    fields,
    "Joining AAYSSA Yatra",
    registration.joiningYatra
  );
  setSelectField(
    values,
    fields,
    "Registration Status",
    "Submitted"
  );
  setField(
    values,
    fields,
    "Member Notes",
    registration.memberNotes,
    { optional: true }
  );

  const response =
    await fetch(
      `${getBaserowBaseUrl()}/api/database/rows/table/${TABLE_ID}/?user_field_names=false`,
      {
        method: "POST",
        headers: getBaserowHeaders(),
        body: JSON.stringify(values)
      }
    );

  if (!response.ok) {
    console.error(
      "Registration creation failed:",
      response.status,
      await response.text()
    );

    throw new Error(
      "Unable to save Maaladharan registration."
    );
  }
}

async function updateRegistration({
  registrationId,
  fields,
  update
}) {
  const values = {};

  if (update.action === "withdraw") {
    setSelectField(
      values,
      fields,
      "Registration Status",
      "Cancelled"
    );
  } else {
    setField(
      values,
      fields,
      "Maaladharan Date",
      update.maaladharanDate
    );
    setSelectField(
      values,
      fields,
      "Padi Count",
      update.padiStatus
    );
    setField(
      values,
      fields,
      "First Deeksha",
      update.padiStatus ===
        "1 (Kanni Swamy)"
    );
    setField(
      values,
      fields,
      "Joining AAYSSA Yatra",
      update.joiningYatra
    );
  }

  setField(
    values,
    fields,
    "Member Notes",
    update.memberNotes,
    { optional: true }
  );

  const response =
    await fetch(
      `${getBaserowBaseUrl()}/api/database/rows/table/${TABLE_ID}/${registrationId}/?user_field_names=false`,
      {
        method: "PATCH",
        headers: getBaserowHeaders(),
        body: JSON.stringify(values)
      }
    );

  if (!response.ok) {
    console.error(
      "Registration update failed:",
      response.status,
      await response.text()
    );

    throw new Error(
      "Unable to update Maaladharan registration."
    );
  }
}

function mapRegistrationRow(row, fields) {
  return {
    id: row.id,
    season:
      getSelectValue(
        row[fieldKey(fields, "Season")]
      ),
    participantName:
      cleanString(
        row[fieldKey(fields, "Participant Name")]
      ),
    participantType:
      getSelectValue(
        row[fieldKey(fields, "Participant Type")]
      ),
    age:
      Number(
        row[fieldKey(fields, "Age")] || 0
      ),
    maaladharanDate:
      cleanString(
        row[fieldKey(fields, "Maaladharan Date")]
      ),
    firstDeeksha:
      Boolean(
        row[fieldKey(fields, "First Deeksha")]
      ),
    padiStatus:
      getSelectValue(
        row[fieldKey(fields, "Padi Count")]
      ),
    status:
      getSelectValue(
        row[fieldKey(fields, "Registration Status")]
      ),
    joiningYatra:
      Boolean(
        row[fieldKey(fields, "Joining AAYSSA Yatra")]
      ),
    memberNotes:
      cleanString(
        row[fieldKey(fields, "Member Notes")]
      )
  };
}

function normalizeRegistrationUpdate(body) {
  return {
    action:
      cleanString(body?.action)
        .toLowerCase(),
    maaladharanDate:
      cleanString(body?.maaladharanDate),
    padiStatus:
      cleanString(body?.padiStatus),
    joiningYatra:
      Boolean(body?.joiningYatra),
    memberNotes:
      cleanString(body?.memberNotes)
        .slice(0, 1000)
  };
}

function validateRegistrationUpdate(update) {
  if (
    !["update", "withdraw"]
      .includes(update.action)
  ) {
    return "Select a valid registration action.";
  }

  if (update.action === "withdraw") {
    return "";
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(update.maaladharanDate) ||
    update.maaladharanDate < SEASON_START ||
    update.maaladharanDate > SEASON_END
  ) {
    return (
      "Maaladharan date must be between " +
      "October 25 and December 4, 2026."
    );
  }

  const validPadiValues = [
    "1 (Kanni Swamy)",
    ...Array.from(
      { length: 16 },
      (_, index) => String(index + 2)
    ),
    "18 (Guru Swamy)"
  ];

  if (
    !validPadiValues.includes(
      update.padiStatus
    )
  ) {
    return "Select a valid Padi count.";
  }

  return "";
}

function normalizeRegistration(body) {
  return {
    participantName:
      cleanString(body?.participantName),
    participantType:
      cleanString(body?.participantType)
        .toLowerCase(),
    age:
      Number(body?.age),
    phoneNumber:
      cleanString(body?.phoneNumber),
    maaladharanDate:
      cleanString(body?.maaladharanDate),
    firstDeeksha:
      Boolean(body?.firstDeeksha),
    padiStatus:
      cleanString(body?.padiStatus),
    joiningYatra:
      Boolean(body?.joiningYatra),
    memberNotes:
      cleanString(body?.memberNotes)
  };
}

function validateRegistration(registration) {
  if (!registration.participantName) {
    return "Participant name is required.";
  }

  if (
    !["primary", "spouse", "additional"]
      .includes(registration.participantType)
  ) {
    return "Select a valid participant type.";
  }

  if (
    !Number.isInteger(registration.age) ||
    registration.age < 1 ||
    registration.age > 120
  ) {
    return "Enter a valid participant age.";
  }

  if (!registration.phoneNumber) {
    return "Phone number is required.";
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/
      .test(registration.maaladharanDate) ||
    registration.maaladharanDate < SEASON_START ||
    registration.maaladharanDate > SEASON_END
  ) {
    return (
      "Maaladharan date must be between " +
      "October 25 and December 4, 2026."
    );
  }

  const validPadiValues = [
    "1 (Kanni Swamy)",
    ...Array.from(
      { length: 16 },
      (_, index) => String(index + 2)
    ),
    "18 (Guru Swamy)"
  ];

  if (
    !registration.firstDeeksha &&
    !validPadiValues.includes(
      registration.padiStatus
    )
  ) {
    return "Select a valid Padi status.";
  }

  return "";
}

function setField(
  values,
  fields,
  name,
  value,
  {
    optional = false,
    writableOnly = false
  } = {}
) {
  const field =
    fields.byName.get(
      normalizeFieldName(name)
    );

  if (!field) {
    if (optional) {
      return;
    }

    throw new Error(
      `Registration table is missing field: ${name}.`
    );
  }

  if (
    writableOnly &&
    ["formula", "created_on", "last_modified"]
      .includes(field.type)
  ) {
    return;
  }

  values[`field_${field.id}`] = value;
}

function setSelectField(
  values,
  fields,
  name,
  optionValue
) {
  const field =
    getField(fields, name);

  const option =
    (field.select_options || [])
      .find(item =>
        cleanString(item.value)
          .toLowerCase() ===
        cleanString(optionValue)
          .toLowerCase()
      );

  if (!option) {
    throw new Error(
      `Registration table field "${name}" is missing option "${optionValue}".`
    );
  }

  values[`field_${field.id}`] =
    option.id;
}

function getField(fields, name) {
  const field =
    fields.byName.get(
      normalizeFieldName(name)
    );

  if (!field) {
    throw new Error(
      `Registration table is missing field: ${name}.`
    );
  }

  return field;
}

function fieldKey(fields, name) {
  return `field_${getField(fields, name).id}`;
}

export async function fetchMaaladharanDashboardSummary() {
  const fields =
    await fetchRegistrationFields();

  const rows = [];
  let page = 1;

  while (true) {
    const response =
      await fetch(
        `${getBaserowBaseUrl()}/api/database/rows/table/${TABLE_ID}/?user_field_names=false&page=${page}&size=200`,
        {
          headers: getBaserowHeaders()
        }
      );

    if (!response.ok) {
      console.error(
        "Maaladharan dashboard lookup failed:",
        response.status,
        await response.text()
      );

      throw new Error(
        "Unable to load Maaladharan dashboard data."
      );
    }

    const data =
      await response.json();

    rows.push(
      ...(Array.isArray(data.results)
        ? data.results
        : [])
    );

    if (!data.next) {
      break;
    }

    page += 1;
  }

  const registrations =
    rows
      .map(row =>
        mapRegistrationRow(row, fields)
      )
      .filter(registration =>
        registration.season === SEASON &&
        registration.status !== "Cancelled"
      );

  const padiValues = [
    "1 (Kanni Swamy)",
    ...Array.from(
      { length: 16 },
      (_, index) => String(index + 2)
    ),
    "18 (Guru Swamy)"
  ];

  const padiMap =
    new Map(
      padiValues.map(value => [
        value,
        0
      ])
    );

  const dateMap =
    new Map();

  for (const registration of registrations) {
    if (padiMap.has(registration.padiStatus)) {
      padiMap.set(
        registration.padiStatus,
        padiMap.get(registration.padiStatus) + 1
      );
    }

    if (
      /^\d{4}-\d{2}-\d{2}$/
        .test(registration.maaladharanDate)
    ) {
      dateMap.set(
        registration.maaladharanDate,
        (dateMap.get(
          registration.maaladharanDate
        ) || 0) + 1
      );
    }
  }

  return {
    available: true,
    season: SEASON,
    totalSwamies: registrations.length,
    padiCounts:
      padiValues.map((value, index) => ({
        value,
        label:
          index === 0
            ? "1 (Kanni)"
            : index === 17
              ? "18 (Guru)"
              : value,
        count: padiMap.get(value) || 0
      })),
    dateCounts:
      Array.from(dateMap.entries())
        .sort(([first], [second]) =>
          first.localeCompare(second)
        )
        .map(([date, count]) => ({
          date,
          label:
            formatMaaladharanDateLabel(date),
          count
        }))
  };
}

function formatMaaladharanDateLabel(value) {
  const date =
    new Date(`${value}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone: "UTC",
      month: "short",
      day: "numeric"
    }
  ).format(date);
}

function normalizeFieldName(value) {
  return cleanString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getSelectValue(value) {
  if (
    value &&
    typeof value === "object"
  ) {
    return cleanString(
      value.value || value.name
    );
  }

  return cleanString(value);
}

function displayParticipantType(value) {
  if (value === "primary") {
    return "Primary";
  }

  if (value === "spouse") {
    return "Spouse";
  }

  return "Additional Member";
}
