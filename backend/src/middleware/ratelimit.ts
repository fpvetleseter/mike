import { Request, Response, NextFunction } from "express";
import { createServerSupabase } from "../lib/supabase";

const FREE_DAILY_LIMIT = parseInt(
  process.env.RATE_LIMIT_FREE_DAILY ?? "10",
  10,
);

export async function checkQueryLimit(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = res.locals.userId as string;
  const db = createServerSupabase();

  const { data: profile, error } = await db
    .from("profiles")
    .select("tier, queries_today, queries_reset_at")
    .eq("id", userId)
    .single();

  if (error || !profile) {
    res.status(500).json({
      data: null,
      error: "Kunne ikke hente brukerprofil.",
    });
    return;
  }

  // Pro users have no query limit
  if (profile.tier === "pro") {
    next();
    return;
  }

  // Reset counter if last reset was more than 24 hours ago
  const resetAt = new Date(profile.queries_reset_at);
  const now = new Date();
  const hoursSinceReset =
    (now.getTime() - resetAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceReset >= 24) {
    await db
      .from("profiles")
      .update({ queries_today: 0, queries_reset_at: now.toISOString() })
      .eq("id", userId);
    next();
    return;
  }

  if (profile.queries_today >= FREE_DAILY_LIMIT) {
    res.setHeader("Retry-After", "86400");
    res.status(429).json({
      data: null,
      error: `Du har brukt alle ${FREE_DAILY_LIMIT} gratis spørsmål i dag. Oppgrader til Pro for ubegrenset tilgang.`,
      remaining: 0,
      resetAt: new Date(
        resetAt.getTime() + 24 * 60 * 60 * 1000,
      ).toISOString(),
    });
    return;
  }

  next();
}

export async function incrementQueryCount(userId: string): Promise<void> {
  const db = createServerSupabase();
  await db.rpc("increment_queries_today", { user_id: userId });
}
