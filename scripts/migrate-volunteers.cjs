#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const MEMBERS_TABLE_ID = "1142367";
const VOLUNTEERS_TABLE_ID = "1179938";

const MEMBER_FIELDS = {
  firstName: "field_10227506",
  lastName: "field_10473214",
  spouseFirstName: "field_10227562",
  spouseLastName: "field_10473216",
  volunteerInterest: "field_10281690",
  areas: "field_10281806"
};

const VOLUNTEER_FIELDS = {
  name: "field_10642219",
  memberType: "field_10642220",
  active: "field_10642221",
  family: "field_10642228",
  relationship: "field_10642229",
  interested: "field_10642230",
  areas: "field_10642231"
};

const MEMBER_TYPE_OPTIONS = {
  primary: 7582778,
  spouse: 7582779
};

const AREA_OPTIONS = {
  Bhajan: 7582773,
  Pooja: 7582774,
  Annadhanam: 7582775,
  Media: 7582776,
  Decorations: 7582777
};

const VALID_AREAS = Object.keys(AREA_OPTIONS);

async function main() {
  const mode = process.argv.includes("--apply")
    ? "apply"
    : "dry-run";

  if (
    mode === "apply" &&
    process.argv.includes("--dry-run")
  ) {
    throw new Error(
      "Use either --dry-run or --apply, not both."
    );
  }

  const env =
    loadEnv(
      path.join(process.cwd(), ".env.local")
    );

  const baseUrl =
    (env.BASEROW_URL || "https://api.baserow.io")
      .replace(/\/$/, "");

  const token =
    env.BASEROW_TOKEN;

  if (!token) {
    throw new Error(
      "Missing BASEROW_TOKEN in .env.local."
    );
  }

  const membersTableId =
    env.BASEROW_TABLE_ID || MEMBERS_TABLE_ID;

  const volunteersTableId =
    env.BASEROW_VOLUNTEERS_TABLE_ID ||
    VOLUNTEERS_TABLE_ID;

  const client =
    createBaserowClient({
      baseUrl,
      token
    });

  const members =
    await client.fetchAllRows(membersTableId);

  const summary = {
    mode,
    membersScanned: members.length,
    familiesWithLegacyVolunteerData: 0,
    primaryCreates: 0,
    primaryUpdates: 0,
    spouseCreates: 0,
    spouseUpdates: 0,
    skippedAreaOnlyFamilies: 0,
    skippedSpouseSelectionsWithoutSpouseName: 0,
    skippedOtherFamilyMemberSelections: 0,
    skippedNoVolunteerData: 0
  };

  for (const member of members) {
    const plan =
      buildFamilyMigrationPlan(member);

    if (plan.hasOtherFamilyMemberSelection) {
      summary.skippedOtherFamilyMemberSelections += 1;
    }

    if (plan.hasAreaOnlyVolunteerData) {
      summary.skippedAreaOnlyFamilies += 1;
    }

    if (plan.hasSpouseSelectionWithoutSpouseName) {
      summary.skippedSpouseSelectionsWithoutSpouseName += 1;
    }

    if (!plan.hasLegacyVolunteerData) {
      summary.skippedNoVolunteerData += 1;
      continue;
    }

    summary.familiesWithLegacyVolunteerData += 1;

    if (plan.rows.length === 0) {
      continue;
    }

    const existing =
      await fetchExistingFamilyVolunteers({
        client,
        volunteersTableId,
        memberRowId: member.id
      });

    for (const plannedRow of plan.rows) {
      const existingRow =
        existing.find(row =>
          normalizeMemberType(
            getSingleSelectValue(
              row[VOLUNTEER_FIELDS.memberType]
            )
          ) === plannedRow.memberType
        );

      if (existingRow) {
        incrementSummary(
          summary,
          plannedRow.memberType,
          "Updates"
        );

        if (mode === "apply") {
          await client.updateRow(
            volunteersTableId,
            existingRow.id,
            plannedRow.payload
          );
        }
      } else {
        incrementSummary(
          summary,
          plannedRow.memberType,
          "Creates"
        );

        if (mode === "apply") {
          await client.createRow(
            volunteersTableId,
            plannedRow.payload
          );
        }
      }
    }
  }

  console.log(
    JSON.stringify(summary, null, 2)
  );

  if (mode === "dry-run") {
    console.log(
      "Dry run only. Re-run with --apply to write rows to Baserow."
    );
  }
}

function buildFamilyMigrationPlan(member) {
  const primaryName =
    joinName(
      member[MEMBER_FIELDS.firstName],
      member[MEMBER_FIELDS.lastName]
    );

  const spouseName =
    joinName(
      member[MEMBER_FIELDS.spouseFirstName],
      member[MEMBER_FIELDS.spouseLastName]
    );

  const volunteerMembers =
    getMultiSelectValues(
      member[MEMBER_FIELDS.volunteerInterest]
    );

  const areas =
    sanitizeAreas(
      getMultiSelectValues(
        member[MEMBER_FIELDS.areas]
      )
    );

  const hasPrimarySelection =
    volunteerMembers.includes("Primary Member");

  const hasSpouseSelection =
    volunteerMembers.includes("Spouse");

  const hasOtherFamilyMemberSelection =
    volunteerMembers.includes("Other Family Member");

  const hasLegacyVolunteerData =
    volunteerMembers.length > 0 ||
    areas.length > 0;

  if (!hasLegacyVolunteerData) {
    return {
      rows: [],
      hasOtherFamilyMemberSelection,
      hasAreaOnlyVolunteerData: false,
      hasSpouseSelectionWithoutSpouseName: false,
      hasLegacyVolunteerData
    };
  }

  const rows = [];

  if (
    primaryName &&
    hasPrimarySelection
  ) {
    rows.push(
      buildPlannedVolunteerRow({
        familyRowId: member.id,
        name: primaryName,
        memberType: "primary",
        interested: true,
        areas
      })
    );
  }

  if (
    spouseName &&
    hasSpouseSelection
  ) {
    rows.push(
      buildPlannedVolunteerRow({
        familyRowId: member.id,
        name: spouseName,
        memberType: "spouse",
        interested: true,
        areas
      })
    );
  }

  const hasAreaOnlyVolunteerData =
    volunteerMembers.length === 0 &&
    areas.length > 0;

  const hasSpouseSelectionWithoutSpouseName =
    hasSpouseSelection &&
    !spouseName;

  return {
    rows,
    hasOtherFamilyMemberSelection,
    hasAreaOnlyVolunteerData,
    hasSpouseSelectionWithoutSpouseName,
    hasLegacyVolunteerData
  };
}

function buildPlannedVolunteerRow({
  familyRowId,
  name,
  memberType,
  interested,
  areas
}) {
  return {
    memberType,
    payload: {
      [VOLUNTEER_FIELDS.family]:
        [Number(familyRowId)],
      [VOLUNTEER_FIELDS.name]:
        name,
      [VOLUNTEER_FIELDS.memberType]:
        MEMBER_TYPE_OPTIONS[memberType],
      [VOLUNTEER_FIELDS.relationship]:
        "",
      [VOLUNTEER_FIELDS.interested]:
        Boolean(interested),
      [VOLUNTEER_FIELDS.areas]:
        areas.map(area =>
          AREA_OPTIONS[area]
        ),
      [VOLUNTEER_FIELDS.active]:
        true
    }
  };
}

async function fetchExistingFamilyVolunteers({
  client,
  volunteersTableId,
  memberRowId
}) {
  const url =
    `/api/database/rows/table/${volunteersTableId}/` +
    `?user_field_names=false` +
    `&filter__${VOLUNTEER_FIELDS.family}__link_row_has=${encodeURIComponent(memberRowId)}`;

  const data =
    await client.requestJson(url);

  return Array.isArray(data.results)
    ? data.results
    : [];
}

function createBaserowClient({
  baseUrl,
  token
}) {
  const headers = {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json"
  };

  return {
    async requestJson(
      url,
      options = {}
    ) {
      const response =
        await fetch(
          `${baseUrl}${url}`,
          {
            ...options,
            headers: {
              ...headers,
              ...(options.headers || {})
            }
          }
        );

      if (!response.ok) {
        throw new Error(
          `Baserow request failed: ${response.status} ${await response.text()}`
        );
      }

      return response.json();
    },

    async fetchAllRows(tableId) {
      const rows = [];
      let url =
        `/api/database/rows/table/${tableId}/?user_field_names=false&size=200`;

      while (url) {
        const data =
          await this.requestJson(url);

        rows.push(
          ...(
            Array.isArray(data.results)
              ? data.results
              : []
          )
        );

        url =
          data.next
            ? data.next.replace(baseUrl, "")
            : "";
      }

      return rows;
    },

    async createRow(tableId, payload) {
      return this.requestJson(
        `/api/database/rows/table/${tableId}/?user_field_names=false`,
        {
          method: "POST",
          body:
            JSON.stringify(payload)
        }
      );
    },

    async updateRow(
      tableId,
      rowId,
      payload
    ) {
      return this.requestJson(
        `/api/database/rows/table/${tableId}/${rowId}/?user_field_names=false`,
        {
          method: "PATCH",
          body:
            JSON.stringify(payload)
        }
      );
    }
  };
}

function incrementSummary(
  summary,
  memberType,
  suffix
) {
  const key =
    `${memberType}${suffix}`;

  if (Object.prototype.hasOwnProperty.call(summary, key)) {
    summary[key] += 1;
  }
}

function loadEnv(filePath) {
  const env = {};
  const contents =
    fs.readFileSync(filePath, "utf8");

  for (const line of contents.split(/\r?\n/)) {
    const trimmed =
      line.trim();

    const index =
      trimmed.indexOf("=");

    if (
      !trimmed ||
      trimmed.startsWith("#") ||
      index === -1
    ) {
      continue;
    }

    const key =
      trimmed.slice(0, index).trim();

    let value =
      trimmed.slice(index + 1).trim();

    if (
      (
        value.startsWith('"') &&
        value.endsWith('"')
      ) ||
      (
        value.startsWith("'") &&
        value.endsWith("'")
      )
    ) {
      value =
        value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function getMultiSelectValues(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map(item => {
      if (typeof item === "string") {
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

function getSingleSelectValue(item) {
  if (
    item &&
    typeof item === "object"
  ) {
    return (
      item.value ||
      item.name ||
      ""
    );
  }

  return item || "";
}

function normalizeMemberType(value) {
  const normalized =
    String(value || "")
      .trim()
      .toLowerCase();

  if (normalized === "primary") {
    return "primary";
  }

  if (normalized === "spouse") {
    return "spouse";
  }

  return "additional";
}

function sanitizeAreas(areas) {
  return areas.filter(area =>
    VALID_AREAS.includes(area)
  );
}

function joinName(
  firstName,
  lastName
) {
  return `${firstName || ""} ${lastName || ""}`
    .trim();
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
