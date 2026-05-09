import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { NextFunction, Request, Response, Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { deleteDocumentObject, processDocument } from "../services/documents";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

const documentsRouter = Router();

documentsRouter.post(
  "/upload",
  authMiddleware,
  handleUpload,
  async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ data: null, error: "Du må logge inn." });
      return;
    }

    if (!req.file) {
      res.status(422).json({
        data: null,
        error: "Kun PDF- og Word-dokumenter støttes.",
      });
      return;
    }

    const documentId = randomUUID();
    const safeFilename = basename(req.file.originalname).replace(/\s+/g, "_");
    const r2Key = `${userId}/${documentId}/${safeFilename}`;
    const supabase = createServerSupabase();

    // SECURITY: document row is created for authenticated user only.
    const { error } = await supabase.from("documents").insert({
      id: documentId,
      user_id: userId,
      filename: req.file.originalname,
      r2_key: r2Key,
      mime_type: req.file.mimetype,
      file_size_bytes: req.file.size,
      status: "processing",
    });

    if (error) {
      res.status(500).json({ data: null, error: "Kunne ikke opprette dokumentet." });
      return;
    }

    void processDocument(req.file, userId, documentId);

    res.status(202).json({
      data: { documentId, status: "processing" },
      error: null,
    });
  },
);

documentsRouter.get("/", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ data: null, error: "Du må logge inn." });
    return;
  }

  const supabase = createServerSupabase();
  // SECURITY: document listing is scoped to authenticated user.
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, filename, mime_type, file_size_bytes, status, page_count, extracted_text_preview, error_message, created_at, updated_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ data: null, error: "Kunne ikke hente dokumenter." });
    return;
  }

  res.json({ data: data ?? [], error: null });
});

documentsRouter.delete("/:id", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ data: null, error: "Du må logge inn." });
    return;
  }

  const supabase = createServerSupabase();
  const { id } = req.params;
  // SECURITY: load object key only after explicit ownership check.
  const { data: document, error: documentError } = await supabase
    .from("documents")
    .select("id, r2_key")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (documentError || !document) {
    res.status(404).json({ data: null, error: "Dokumentet ble ikke funnet." });
    return;
  }

  try {
    await deleteDocumentObject(document.r2_key);
  } catch (error) {
    console.error("R2 delete failed", {
      error: error instanceof Error ? error.message : String(error),
      documentId: id,
    });
  }

  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    res.status(500).json({ data: null, error: "Kunne ikke slette dokumentet." });
    return;
  }

  res.json({ data: { deleted: true }, error: null });
});

export default documentsRouter;

function handleUpload(req: Request, res: Response, next: NextFunction): void {
  upload.single("file")(req, res, (error: unknown) => {
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(422).json({
        data: null,
        error: "Filen er for stor. Maksimal filstørrelse er 10 MB.",
      });
      return;
    }

    if (error) {
      res.status(400).json({
        data: null,
        error: "Dokumentet kunne ikke lastes opp.",
      });
      return;
    }

    next();
  });
}
