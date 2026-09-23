import type { Request, Response, NextFunction } from "express";
import type { UserRole } from "@workspace/db";

export interface SessionUser {
  id: number;
  username: string;
  name: string;
  role: UserRole;
  department: string | null;
  email: string;
  profileImagePath?: string | null;
}

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
  }
}

export function getSessionUser(req: Request): SessionUser | null {
  return req.session?.user ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session?.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.session?.user;
    if (!user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    if (!roles.includes(user.role)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  };
}
