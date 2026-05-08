import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
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

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "juridisk-backend", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`Juridisk backend running on port ${PORT}`);
});
