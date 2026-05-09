import { Request, Response, NextFunction } from "express";
import { createServerSupabase } from "../lib/supabase";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // SECURITY: Extract token from header only, never body
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({
      data: null,
      error: "Autentisering kreves. Vennligst logg inn igjen.",
    });
    return;
  }

  const token = authHeader.slice(7);
  const supabase = createServerSupabase();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({
      data: null,
      error: "Ugyldig sesjon. Vennligst logg inn igjen.",
    });
    return;
  }

  // SECURITY: attach from validated JWT, not from request body
  req.user = { id: user.id, email: user.email?.toLowerCase() ?? "" };
  res.locals.userId = user.id;
  res.locals.userEmail = user.email?.toLowerCase() ?? "";
  res.locals.token = token;
  next();
}

export const authMiddleware = requireAuth;
