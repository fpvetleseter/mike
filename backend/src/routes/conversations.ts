import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { validateBody } from "../middleware/validate";
import { createServerSupabase } from "../lib/supabase";

const CreateConversationSchema = z.object({
  documentId: z
    .preprocess(
      (v) => (v === "" || v === null || v === undefined ? undefined : v),
      z.string().uuid().optional(),
    ),
  title: z.preprocess(
    (val) =>
      val === null || val === undefined || val === ""
        ? "Ny samtale"
        : val,
    z.string().max(200),
  ),
});

type CreateConversationBody = z.infer<typeof CreateConversationSchema>;

const conversationsRouter = Router();

conversationsRouter.post(
  "/",
  authMiddleware,
  (req, _res, next) => {
    console.log("[conversations] POST body:", req.body);
    console.log("[conversations] POST user:", req.user);
    next();
  },
  validateBody(CreateConversationSchema),
  async (req, res) => {
    console.log("[conversations] POST called", { userId: req.user?.id });
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ data: null, error: "Du må logge inn." });
        return;
      }

      const { documentId, title } = req.body as CreateConversationBody;
      const supabase = createServerSupabase();

      if (documentId) {
        // SECURITY: document association must belong to the authenticated user.
        const { data: document, error: documentError } = await supabase
          .from("documents")
          .select("id")
          .eq("id", documentId)
          .eq("user_id", userId)
          .single();
        if (documentError || !document) {
          res.status(404).json({ data: null, error: "Dokumentet ble ikke funnet." });
          return;
        }
      }

      // SECURITY: user_id comes from validated JWT only.
      const { data, error } = await supabase
        .from("conversations")
        .insert({
          user_id: userId,
          document_id: documentId ?? null,
          title,
        })
        .select("id, created_at")
        .single();

      if (error || !data) {
        res.status(500).json({ data: null, error: "Kunne ikke opprette samtalen." });
        return;
      }

      const conversation = data;
      console.log("[conversations] created", { id: conversation.id });

      res.status(201).json({
        data: { id: data.id, createdAt: data.created_at },
        error: null,
      });
    } catch (error) {
      console.error("[conversations] error", error);
      res.status(500).json({ data: null, error: "Kunne ikke opprette samtalen." });
    }
  },
);

conversationsRouter.get("/", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ data: null, error: "Du må logge inn." });
    return;
  }

  const supabase = createServerSupabase();
  // SECURITY: list is scoped to authenticated user.
  const { data: conversations, error } = await supabase
    .from("conversations")
    .select("id, document_id, title, created_at, updated_at")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(20);

  if (error) {
    res.status(500).json({ data: null, error: "Kunne ikke hente samtaler." });
    return;
  }

  const ids = (conversations ?? []).map((conversation) => conversation.id);
  const { data: messages } =
    ids.length > 0
      ? await supabase
          .from("messages")
          .select("conversation_id, content, created_at")
          .in("conversation_id", ids)
          .eq("user_id", userId)
          .eq("role", "user")
          .order("created_at", { ascending: true })
      : { data: [] };

  const previews = new Map<string, string>();
  for (const message of messages ?? []) {
    if (!previews.has(message.conversation_id)) {
      previews.set(message.conversation_id, message.content.slice(0, 140));
    }
  }

  res.json({
    data: (conversations ?? []).map((conversation) => ({
      id: conversation.id,
      documentId: conversation.document_id,
      title: conversation.title,
      createdAt: conversation.created_at,
      updatedAt: conversation.updated_at,
      preview: previews.get(conversation.id) ?? null,
    })),
    error: null,
  });
});

conversationsRouter.get("/:id/messages", authMiddleware, async (req, res) => {
  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ data: null, error: "Du må logge inn." });
    return;
  }

  const supabase = createServerSupabase();
  const { id } = req.params;

  // SECURITY: explicit ownership check before messages are returned.
  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (conversationError || !conversation) {
    res.status(404).json({ data: null, error: "Samtalen ble ikke funnet." });
    return;
  }

  const { data: messages, error } = await supabase
    .from("messages")
    .select("id, role, content, citations, model, input_tokens, output_tokens, created_at")
    .eq("conversation_id", id)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({ data: null, error: "Kunne ikke hente meldinger." });
    return;
  }

  res.json({ data: messages ?? [], error: null });
});

export default conversationsRouter;
