const {
  getAuthenticatedMember
} = require("../lib/aayssa.js");

const ZEFFY_API_BASE_URL =
  "https://api.zeffy.com/api/v1";

const DEFAULT_CURRENCY =
  "usd";

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

    const donations =
      await fetchDonationSummaryForEmail(
        auth.normalizedEmail
      );

    return res.status(200).json({
      success: true,
      donations
    });

  } catch (error) {
    console.error(
      "My donations API error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to load donation records."
    });
  }
}

async function fetchDonationSummaryForEmail(email) {
  const apiKey =
    process.env.ZEFFY_API_KEY;

  if (!apiKey) {
    throw new Error("Missing ZEFFY_API_KEY.");
  }

  const normalizedEmail =
    String(email || "")
      .trim()
      .toLowerCase();

  if (!normalizedEmail) {
    return buildEmptySummary();
  }

  const year =
    new Date().getUTCFullYear();

  const yearStart =
    Math.floor(Date.UTC(year, 0, 1) / 1000);

  const nextYearStart =
    Math.floor(Date.UTC(year + 1, 0, 1) / 1000);

  const contacts =
    await fetchAllZeffyPages(
      "/contacts",
      {
        email:
          normalizedEmail
      },
      apiKey
    );

  const matchingContacts =
    contacts.filter(contact =>
      String(contact.email || "")
        .trim()
        .toLowerCase() === normalizedEmail
    );

  const paymentsById =
    new Map();

  for (const contact of matchingContacts) {
    if (!contact.id) {
      continue;
    }

    const contactPayments =
      await fetchSucceededPayments(
        {
          contact:
            contact.id,
          "created[gte]":
            yearStart,
          "created[lte]":
            nextYearStart - 1
        },
        apiKey
      );

    for (const payment of contactPayments) {
      paymentsById.set(
        payment.id,
        payment
      );
    }
  }

  const payments =
    Array.from(paymentsById.values())
      .map(mapPayment)
      .sort((a, b) =>
        b.createdTimestamp - a.createdTimestamp
      );

  const currency =
    payments[0]?.currency ||
    matchingContacts[0]?.currency ||
    DEFAULT_CURRENCY;

  const totalPaidThisYear =
    payments.reduce(
      (total, payment) =>
        total + payment.amount,
      0
    );

  const taxReceiptCount =
    payments.filter(payment =>
      Boolean(payment.receiptUrl)
    ).length;

  return {
    available:
      true,
    year,
    currency:
      currency.toUpperCase(),
    totalPaidThisYear,
    taxReceiptCount,
    payments:
      payments.map(payment => ({
        id:
          payment.id,
        date:
          payment.date,
        amount:
          payment.amount,
        eligibleAmount:
          payment.eligibleAmount,
        currency:
          payment.currency.toUpperCase(),
        description:
          payment.description,
        campaignId:
          payment.campaignId,
        receiptUrl:
          payment.receiptUrl
      }))
  };
}

async function fetchSucceededPayments(params, apiKey) {
  return fetchAllZeffyPages(
    "/payments",
    {
      ...params,
      status:
        "succeeded"
    },
    apiKey
  );
}

async function fetchAllZeffyPages(path, params, apiKey) {
  const rows = [];
  let cursor = "";

  do {
    const url =
      new URL(`${ZEFFY_API_BASE_URL}${path}`);

    url.searchParams.set(
      "limit",
      "100"
    );

    Object.entries(params || {}).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(
          key,
          String(value)
        );
      }
    });

    if (cursor) {
      url.searchParams.set(
        "starting_after",
        cursor
      );
    }

    const response =
      await fetch(
        url,
        {
          headers: {
            Authorization:
              `Bearer ${apiKey}`
          }
        }
      );

    if (!response.ok) {
      console.error(
        "Zeffy API request failed:",
        response.status,
        path
      );

      throw new Error(
        "Unable to load Zeffy donation records."
      );
    }

    const data =
      await response.json();

    if (Array.isArray(data.data)) {
      rows.push(...data.data);
    }

    cursor =
      data.has_more && data.next_cursor
        ? data.next_cursor
        : "";
  } while (cursor);

  return rows;
}

function mapPayment(payment) {
  const createdTimestamp =
    Number(payment.created || 0);

  const currency =
    String(payment.currency || DEFAULT_CURRENCY)
      .toUpperCase();

  return {
    id:
      String(payment.id || ""),
    createdTimestamp,
    date:
      createdTimestamp
        ? new Date(createdTimestamp * 1000).toISOString()
        : "",
    amount:
      toDollarAmount(payment.amount),
    eligibleAmount:
      toDollarAmount(
        payment.eligible_amount ?? payment.amount
      ),
    currency,
    description:
      cleanString(payment.description),
    campaignId:
      cleanString(payment.campaign_id),
    receiptUrl:
      cleanString(payment.receipt_url)
  };
}

function toDollarAmount(value) {
  const amount =
    Number(value || 0);

  if (!Number.isFinite(amount)) {
    return 0;
  }

  return Math.round(amount) / 100;
}

function buildEmptySummary() {
  const year =
    new Date().getUTCFullYear();

  return {
    available:
      true,
    year,
    currency:
      DEFAULT_CURRENCY.toUpperCase(),
    totalPaidThisYear:
      0,
    taxReceiptCount:
      0,
    payments:
      []
  };
}

function cleanString(value) {
  return String(value ?? "")
    .trim();
}

module.exports = handler;
