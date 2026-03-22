import { type Request, type Response, type NextFunction } from "express";

export interface AuthRequest extends Request {
  user?: { username: string };
}

export function authMiddleware(req: AuthRequest, _res: Response, next: NextFunction): void {
  req.user = { username: "admin" };
  next();
}
