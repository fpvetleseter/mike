import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServerSupabase } from "./lib/supabase";
import { chatRouter } from "./routes/chat";
import { projectsRouter } from "./routes/projects";
import { projectChatRouter } from "./routes/projectChat";
import { documentsRouter } from "./routes/documents";
import { userRouter } from "./routes/user";
import { downloadsRouter } from "./routes/downloads";

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

app.use("/chat", chatRouter);
app.use("/projects", projectsRouter);
app.use("/projects/:projectId/chat", projectChatRouter);
app.use("/single-documents", documentsRouter);
app.use("/user", userRouter);
app.use("/users", userRouter);
app.use("/download", downloadsRouter);

app.get("/health", async (_req, res) => {
  try {
    const db = createServerSupabase();
    await db.from("profiles").select("id").limit(1);
    res.json({
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

app.listen(PORT, () => {
  console.log(`Juridisk backend running on port ${PORT}`);
});
