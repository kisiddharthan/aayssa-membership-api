export default async function handler(req, res) {

  // Allow your website to call this API
  res.setHeader(
    "Access-Control-Allow-Origin",
    "https://atlantaayyappasevasangam.org"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "POST, OPTIONS"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type"
  );

  // Browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const {
      fullName,
      spouseName,
      email,
      mobileNumber,
      address,
      noOfKids,
      noOfAdults,
      volunteerInterest,
      areasOfInterest,
      emailOptIn,
      textOptIn
    } = req.body;

    // -----------------------------
    // 1. Normalize
    // -----------------------------

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const normalizedPhone = String(mobileNumber || "")
      .replace(/\D/g, "")
      .slice(-10);

    // -----------------------------
    // 2. Required-field validation
    // -----------------------------

    if (!fullName || !normalizedEmail || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Full Name, Email and Mobile Number are required."
      });
    }

    if (normalizedPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit U.S. mobile number."
      });
    }

    // Basic email validation
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email address."
      });
    }

    // -----------------------------
    // 3. Server configuration
    // -----------------------------

    const BASEROW_TOKEN = process.env.BASEROW_TOKEN;
    const TABLE_ID = process.env.BASEROW_TABLE_ID;

    if (!BASEROW_TOKEN || !TABLE_ID) {
      throw new Error("Server configuration is missing.");
    }

    const headers = {
      Authorization: `Token ${BASEROW_TOKEN}`,
      "Content-Type": "application/json"
    };

    // -----------------------------
    // 4. Check duplicate EMAIL
    // -----------------------------

    const emailUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464593__equal=${encodeURIComponent(normalizedEmail)}`;

    const emailResponse = await fetch(emailUrl, { headers });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Baserow email lookup failed:", errorText);
      throw new Error("Unable to check email duplicates.");
    }

    const emailData = await emailResponse.json();

    // -----------------------------
    // 5. Check duplicate PHONE
    // -----------------------------

    const phoneUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464626__equal=${encodeURIComponent(normalizedPhone)}`;

    const phoneResponse = await fetch(phoneUrl, { headers });

    if (!phoneResponse.ok) {
      const errorText = await phoneResponse.text();
      console.error("Baserow phone lookup failed:", errorText);
      throw new Error("Unable to check phone duplicates.");
    }

    const phoneData = await phoneResponse.json();

    const emailExists = emailData.count > 0;
    const phoneExists = phoneData.count > 0;

    // -----------------------------
    // 6. Block duplicates
    // -----------------------------

    if (emailExists && phoneExists) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        type: "both",
        message:
          "You are already registered with AAYSSA. Please use the Update My Profile link from your welcome email."
      });
    }

    if (emailExists) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        type: "email",
        message:
          "This email address is already registered with AAYSSA. Please use the Update My Profile link from your welcome email."
      });
    }

    if (phoneExists) {
      return res.status(409).json({
        success: false,
        duplicate: true,
        type: "phone",
        message:
          "This mobile number is already registered with AAYSSA. Please use the Update My Profile link or contact AAYSSA for assistance."
      });
    }

    // -----------------------------
    // 7. Prepare Baserow row
    // -----------------------------

    const newMember = {
      field_10227506: String(fullName).trim(),
      field_10227507: "Active",

      field_10227562: spouseName
        ? String(spouseName).trim()
        : "",

      // Store normalized email so the actual Email
      // column is lowercase too.
      field_10281594: normalizedEmail,

      // Store canonical 10-digit phone.
      field_10281595: normalizedPhone,

      field_10281618: address
        ? String(address).trim()
        : "",

      field_10281655:
        noOfKids === "" ||
        noOfKids === undefined ||
        noOfKids === null
          ? null
          : Number(noOfKids),

      field_10281686:
        noOfAdults === "" ||
        noOfAdults === undefined ||
        noOfAdults === null
          ? null
          : Number(noOfAdults),

      field_10281690: Array.isArray(volunteerInterest)
        ? volunteerInterest
        : volunteerInterest
          ? [volunteerInterest]
          : [],

      field_10281806: Array.isArray(areasOfInterest)
        ? areasOfInterest
        : areasOfInterest
          ? [areasOfInterest]
          : [],

      field_10281810: Boolean(emailOptIn),
      field_10281812: Boolean(textOptIn)
    };

    // -----------------------------
    // 8. CREATE MEMBER
    // -----------------------------

    const createUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false`;

    const createResponse = await fetch(createUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(newMember)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();

      console.error(
        "Baserow member creation failed:",
        errorText
      );

      return res.status(500).json({
        success: false,
        message:
          "We could not complete your registration. Please try again."
      });
    }

    const createdMember = await createResponse.json();

    // -----------------------------
    // 9. Success
    // -----------------------------

    return res.status(201).json({
      success: true,
      duplicate: false,
      message:
        "Thank you! Your AAYSSA membership registration has been successfully submitted.",
      memberRowId: createdMember.id
    });

  } catch (error) {
    console.error("AAYSSA Registration API:", error);

    return res.status(500).json({
      success: false,
      message:
        "Unable to process your registration at this time. Please try again later."
    });
  }
}
