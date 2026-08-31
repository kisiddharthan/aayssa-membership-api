export default async function handler(req, res) {

  // =========================================================
  // CORS
  // Allow the AAYSSA website to call this API
  // =========================================================

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

  // Handle browser preflight request
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  try {

    // =========================================================
    // 1. Get submitted values
    // =========================================================

    const {
      firstName,
      lastName,
      spouseFirstName,
      spouseLastName,
      email,
      mobileNumber,
      address,
      noOfKids,
      noOfAdults,
      volunteerInterest,
      areasOfInterest,
      emailOptIn,
      textOptIn
    } = req.body || {};


    // =========================================================
    // 2. Normalize email and phone
    // =========================================================

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const normalizedPhone = String(mobileNumber || "")
      .replace(/\D/g, "")
      .slice(-10);


    // =========================================================
    // 3. Required field validation
    // =========================================================

    if (
      !String(firstName || "").trim() ||
      !String(lastName || "").trim() ||
      !normalizedEmail ||
      !normalizedPhone
    ) {

      return res.status(400).json({
        success: false,
        message:
          "First Name, Last Name, Email and Mobile Number are required."
      });
    }


    // =========================================================
    // 4. Validate phone
    // =========================================================

    if (normalizedPhone.length !== 10) {

      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid 10-digit U.S. mobile number."
      });
    }


    // =========================================================
    // 5. Validate email
    // =========================================================

    const emailPattern =
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(normalizedEmail)) {

      return res.status(400).json({
        success: false,
        message:
          "Please enter a valid email address."
      });
    }


    // =========================================================
    // 6. Load secure Vercel environment variables
    // =========================================================

    const BASEROW_TOKEN =
      process.env.BASEROW_TOKEN;

    const TABLE_ID =
      process.env.BASEROW_TABLE_ID;

    if (!BASEROW_TOKEN || !TABLE_ID) {
      throw new Error(
        "Server configuration is missing."
      );
    }


    const headers = {
      Authorization: `Token ${BASEROW_TOKEN}`,
      "Content-Type": "application/json"
    };


    // =========================================================
    // 7. Check duplicate normalized email
    //
    // Normalized Email field:
    // field_10464593
    // =========================================================

    const emailUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464593__equal=` +
      encodeURIComponent(normalizedEmail);


    const emailResponse =
      await fetch(emailUrl, {
        method: "GET",
        headers
      });


    if (!emailResponse.ok) {

      const errorText =
        await emailResponse.text();

      console.error(
        "Baserow email lookup failed:",
        errorText
      );

      throw new Error(
        "Unable to check email duplicates."
      );
    }


    const emailData =
      await emailResponse.json();


    // =========================================================
    // 8. Check duplicate normalized phone
    //
    // Normalized Phone field:
    // field_10464626
    // =========================================================

    const phoneUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464626__equal=` +
      encodeURIComponent(normalizedPhone);


    const phoneResponse =
      await fetch(phoneUrl, {
        method: "GET",
        headers
      });


    if (!phoneResponse.ok) {

      const errorText =
        await phoneResponse.text();

      console.error(
        "Baserow phone lookup failed:",
        errorText
      );

      throw new Error(
        "Unable to check phone duplicates."
      );
    }


    const phoneData =
      await phoneResponse.json();


    const emailExists =
      emailData.count > 0;

    const phoneExists =
      phoneData.count > 0;


    // =========================================================
    // 9. Block duplicate registration
    // =========================================================

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


    // =========================================================
    // 10. Prepare new Baserow member
    // =========================================================

    const newMember = {

      // First Name
      field_10227506:
        String(firstName).trim(),

      // Last Name
      field_10473214:
        String(lastName).trim(),

      // Membership Status
      field_10227507:
        "Active",

      // Every public registration starts as Member
      field_10493689: 7473604,
    
      // Spouse First Name
      field_10227562:
        spouseFirstName
          ? String(spouseFirstName).trim()
          : "",

      // Spouse Last Name
      field_10473216:
        spouseLastName
          ? String(spouseLastName).trim()
          : "",

      // Email
      // Store lowercase normalized version
      field_10281594:
        normalizedEmail,

      // Mobile Number
      // Store standardized 10-digit version
      field_10281595:
        normalizedPhone,

      // Address
      field_10281618:
        address
          ? String(address).trim()
          : "",

      // No. of Kids
      field_10281655:
        noOfKids === "" ||
        noOfKids === undefined ||
        noOfKids === null
          ? null
          : Number(noOfKids),

      // No. of Adults
      field_10281686:
        noOfAdults === "" ||
        noOfAdults === undefined ||
        noOfAdults === null
          ? null
          : Number(noOfAdults),

      // Interested in Volunteering?
      field_10281690:
        Array.isArray(volunteerInterest)
          ? volunteerInterest
          : volunteerInterest
            ? [volunteerInterest]
            : [],

      // Areas of Interest
      field_10281806:
        Array.isArray(areasOfInterest)
          ? areasOfInterest
          : areasOfInterest
            ? [areasOfInterest]
            : [],

      // Email Opt-in
      field_10281810:
        Boolean(emailOptIn),

      // Text Opt-in
      field_10281812:
        Boolean(textOptIn),
    
      // Role = Member
      field_10493689: 7473604
    };


    // =========================================================
    // 11. Create member in Baserow
    // =========================================================

    const createUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false`;


    const createResponse =
      await fetch(createUrl, {

        method: "POST",

        headers,

        body: JSON.stringify(
          newMember
        )
      });


    if (!createResponse.ok) {

      const errorText =
        await createResponse.text();

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


    const createdMember =
      await createResponse.json();


    // =========================================================
    // 12. Successful registration
    // =========================================================

    return res.status(201).json({

      success: true,

      duplicate: false,

      message:
        "Thank you! Your AAYSSA membership registration has been successfully submitted.",

      memberRowId:
        createdMember.id
    });


  } catch (error) {

    console.error(
      "AAYSSA Registration API:",
      error
    );

    return res.status(500).json({

      success: false,

      message:
        "Unable to process your registration at this time. Please try again later."
    });
  }
}
