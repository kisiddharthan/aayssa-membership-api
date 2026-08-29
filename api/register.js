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

    return res.status(200).json({
      success: true,
      message: "Normalization test passed.",
      normalizedEmail,
      normalizedPhone
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Unable to process registration."
    });
  }
}
