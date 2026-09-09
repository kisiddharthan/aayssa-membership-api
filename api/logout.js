export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed."
    });
  }

  res.setHeader("Set-Cookie", [
    "aayssa_access=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0",
    "aayssa_refresh=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
  ]);

  return res.status(200).json({
    success: true
  });
}
