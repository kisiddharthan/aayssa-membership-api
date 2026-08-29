export default async function handler(req, res) {
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
      emailUpdates
    } = req.body;

    const normalizedEmail = String(email || "")
      .trim()
      .toLowerCase();

    const normalizedPhone = String(mobileNumber || "")
      .replace(/\D/g, "")
      .slice(-10);

    if (!fullName || !normalizedEmail || !normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Full Name, Email and Mobile Number are required."
      });
    }

    if (normalizedPhone.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid 10-digit mobile number."
      });
    }

    const BASEROW_TOKEN = process.env.BASEROW_TOKEN;
    const TABLE_ID = process.env.BASEROW_TABLE_ID;

    if (!BASEROW_TOKEN || !TABLE_ID) {
      throw new Error("Server configuration is missing.");
    }

    const headers = {
      Authorization: `Token ${BASEROW_TOKEN}`,
      "Content-Type": "application/json"
    };

    // Check for duplicate normalized email
    const emailUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464593__equal=${encodeURIComponent(normalizedEmail)}`;

    const emailResponse = await fetch(emailUrl, { headers });

    if (!emailResponse.ok) {
      throw new Error("Unable to check email duplicates.");
    }

    const emailData = await emailResponse.json();

    // Check for duplicate normalized phone
    const phoneUrl =
      `https://api.baserow.io/api/database/rows/table/${TABLE_ID}/` +
      `?user_field_names=false` +
      `&filter__field_10464626__equal=${encodeURIComponent(normalizedPhone)}`;

    const phoneResponse = await fetch(phoneUrl, { headers });

    if (!phoneResponse.ok) {
      throw new Error("Unable to check phone duplicates.");
    }

    const phoneData = await phoneResponse.json();

    const emailExists = emailData.count > 0;
    const phoneExists = phoneData.count > 0;

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

    return res.status(200).json({
      success: true,
      duplicate: false,
      message: "No duplicate found.",
      normalizedEmail,
      normalizedPhone
    });

  } catch (error) {
    console.error("Registration API error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to process registration at this time."
    });
  }
}
