import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import { createServerSupabase } from "./lib/supabase";
import documentsRouter from "./routes/documents";
import aiRouter from "./routes/ai";
import conversationsRouter from "./routes/conversations";

const app = express();
const PORT = process.env.PORT ?? 3001;

// SECURITY: helmet sets secure HTTP headers
app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.use(express.json({ limit: "10mb" }));

app.get("/health", async (_req, res) => {
  try {
    const db = createServerSupabase();
    await db.from("profiles").select("id").limit(1);
    res.json({
      status: "ok",
      db: "connected",
      ok: true,
      service: "juridisk-backend",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch {
    res.status(503).json({
      ok: false,
      service: "juridisk-backend",
      timestamp: new Date().toISOString(),
      database: "error",
    });
  }
});

app.use("/api/v1/ai", aiRouter);
app.use("/api/v1/conversations", conversationsRouter);
app.use("/api/v1/documents", documentsRouter);

app.use((req, res) => {
  res.status(404).json({ data: null, error: "Ikke funnet" });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  // SECURITY: never expose stack traces in production.
  const message =
    process.env.NODE_ENV === "production"
      ? "Noe gikk galt. Prøv igjen."
      : err.message;
  res.status(500).json({ data: null, error: message });
});

app.listen(PORT, () => {
  console.log(`Juridisk backend running on port ${PORT}`);
});
