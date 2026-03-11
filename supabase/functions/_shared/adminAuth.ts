import { jwtVerify } from "https://esm.sh/jose@5";

export async function verifyAdminToken(req: Request, jwtSecret: string) {
  const authHeader =
    req.headers.get("x-admin-authorization") ??
    req.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or invalid authorization header");
  }

  const token = authHeader.replace("Bearer ", "");
  const secret = new TextEncoder().encode(jwtSecret);
  const { payload } = await jwtVerify(token, secret);

  if (payload.role !== "lms_admin") {
    throw new Error("Unauthorized: not an admin");
  }

  return payload;
}
