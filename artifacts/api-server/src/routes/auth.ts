import { Router, type IRouter } from "express";
import jwt from "jsonwebtoken";
import { LoginBody, LoginResponse, GetMeResponse } from "@workspace/api-zod";
import { authMiddleware, type AuthRequest } from "../middlewares/auth";

const router: IRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!JWT_SECRET || !ADMIN_USERNAME || !ADMIN_PASSWORD) {
  throw new Error("Missing required env vars: JWT_SECRET, ADMIN_USERNAME, ADMIN_PASSWORD");
}

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { username, password } = parsed.data;
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: "24h" });
  res.json(LoginResponse.parse({ token, username }));
});

router.get("/auth/me", authMiddleware, async (req: AuthRequest, res): Promise<void> => {
  res.json(GetMeResponse.parse({ username: req.user!.username }));
});

export default router;
