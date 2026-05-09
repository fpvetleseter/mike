import type { MessageStreamEvent } from "@anthropic-ai/sdk/resources/messages";
import { Router } from "express";
import { z } from "zod";
import { createServerSupabase } from "../lib/supabase";
import {
  TOKEN_BUDGET,
  chunkCountForQuery,
  classifyQuery,
} from "../lib/tokenBudget";
import { authMiddleware } from "../middleware/auth";
import { checkQueryLimit, incrementQueryCount } from "../middleware/ratelimit";
import { validateBody } from "../middleware/validate";
import { streamLegalResponse } from "../services/anthropic";
import { searchDocumentChunks } from "../services/documents";
import { searchLovdata } from "../services/lovdata";

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().nullable().optional(),
  documentId: z.string().uuid().nullable().optional(),
});

type ChatRequestBody = z.infer<typeof ChatRequestSchema>;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface Citation {
  law: string;
  section: string;
  url: string;
}

const DISCLAIMER_NB =
  "*Dette er ikke juridisk rådgivning. Konsulter en advokat for bindende beslutninger.*";

const aiRouter = Router();

aiRouter.post(
  "/chat",
  authMiddleware,
  checkQueryLimit,
  validateBody(ChatRequestSchema),
  async (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ data: null, error: "Du må logge inn." });
      return;
    }

    const { message, documentId } = req.body as ChatRequestBody;
    let conversationId = req.body.conversationId ?? null;
    const supabase = createServerSupabase();
    let headersFlushed = false;

    try {
      if (documentId) {
        // SECURITY: document context must belong to the authenticated user.
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

      if (conversationId) {
        // SECURITY: service role bypasses RLS, so app-level ownership is explicit.
        const { data: conversation, error: conversationError } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", conversationId)
          .eq("user_id", userId)
          .single();

        if (conversationError || !conversation) {
          res.status(404).json({ data: null, error: "Samtalen ble ikke funnet." });
          return;
        }
      } else {
        // SECURITY: conversation user_id comes from JWT only.
        const { data: createdConversation, error: createConversationError } =
          await supabase
            .from("conversations")
            .insert({
              user_id: userId,
              document_id: documentId ?? null,
              title: message.slice(0, 80),
            })
            .select("id")
            .single();

        if (createConversationError || !createdConversation) {
          res.status(500).json({ data: null, error: "Kunne ikke opprette samtalen." });
          return;
        }
        conversationId = createdConversation.id;
      }

      // SECURITY: message is stored against authenticated user's conversation only.
      const { error: userMessageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: message,
      });

      if (userMessageError) throw userMessageError;

      const queryType = classifyQuery(message);
      const lovdataPromise = searchLovdata(message, {
        maxResults: TOKEN_BUDGET.MAX_LOVDATA_RESULTS,
        threshold: TOKEN_BUDGET.MIN_LOVDATA_RELEVANCE_SCORE,
      });
      const documentContextPromise = documentId
        ? Promise.all([
            searchDocumentChunks(message, documentId, userId, {
              matchThreshold: TOKEN_BUDGET.MIN_CHUNK_RELEVANCE_SCORE,
              matchCount: chunkCountForQuery(queryType),
            }),
            loadDocumentSummaryText(documentId, userId),
          ]).catch((error: unknown) => {
            console.error("Document context retrieval failed", {
              error: error instanceof Error ? error.message : String(error),
              documentId,
            });
            return [[], null] as const;
          })
        : Promise.resolve([[], null] as const);

      const historyPromise = loadConversationHistory(conversationId, userId, message);
      const [lovdata, [documentChunks, documentSummaryText], history] =
        await Promise.all([lovdataPromise, documentContextPromise, historyPromise]);

      const lovdataResults = lovdata.results.filter(
        (result) => result.similarity >= TOKEN_BUDGET.MIN_LOVDATA_RELEVANCE_SCORE,
      );

      const { stream, getUsage, model, abort } = await streamLegalResponse({
        userMessage: message,
        conversationHistory: history,
        documentSummaryText: documentSummaryText ?? undefined,
        documentChunks: documentChunks.map((chunk) => ({
          content: chunk.content,
          chunk_index: chunk.chunkIndex,
        })),
        lovdataResults,
        userId,
      });

      req.on("close", () => abort());

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      headersFlushed = true;

      let fullContent = "";
      for await (const event of stream) {
        const text = extractTextDelta(event);
        if (!text) continue;
        fullContent += text;
        res.write(
          `data: ${JSON.stringify({ type: "delta", text, content: text })}\n\n`,
        );
      }

      const enforced = enforceDisclaimer(fullContent);
      if (enforced !== fullContent) {
        const appended = enforced.slice(fullContent.length);
        fullContent = enforced;
        res.write(
          `data: ${JSON.stringify({
            type: "delta",
            text: appended,
            content: appended,
          })}\n\n`,
        );
      }

      const usage = await getUsage();
      const citations = extractCitations(fullContent);

      // SECURITY: assistant content is persisted only to the authenticated user's conversation.
      const { data: assistantMessage, error: assistantMessageError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversationId,
          user_id: userId,
          role: "assistant",
          content: fullContent,
          citations,
          model,
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
        })
        .select(
          "id, conversation_id, role, content, citations, model, input_tokens, output_tokens, created_at",
        )
        .single();

      if (assistantMessageError || !assistantMessage) throw assistantMessageError;

      await incrementQueryCount(userId);
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          message: assistantMessage,
          conversationId,
        })}\n\n`,
      );
      res.end();
    } catch (error) {
      if (error instanceof Error && error.name === "APIUserAbortError") {
        // Client disconnected mid-stream; stream was already cancelled.
        return;
      }
      console.error("AI chat failed", {
        error: error instanceof Error ? error.message : String(error),
        conversationId,
      });

      if (!headersFlushed) {
        res.status(500).json({ data: null, error: "Noe gikk galt. Prøv igjen." });
        return;
      }

      res.write(
        `data: ${JSON.stringify({
          type: "error",
          message: "Noe gikk galt. Prøv igjen.",
        })}\n\n`,
      );
      res.end();
    }
  },
);

async function loadConversationHistory(
  conversationId: string,
  userId: string,
  currentMessage: string,
): Promise<ChatMessage[]> {
  const supabase = createServerSupabase();
  // SECURITY: history retrieval is explicitly scoped to the authenticated user.
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  const ordered = ((data ?? []) as Array<{ role: string; content: string }>).reverse();
  const history = ordered
    .filter(
      (storedMessage, index) =>
        !(
          index === ordered.length - 1 &&
          storedMessage.role === "user" &&
          storedMessage.content === currentMessage
        ),
    )
    .filter(
      (storedMessage): storedMessage is ChatMessage =>
        storedMessage.role === "user" || storedMessage.role === "assistant",
    );

  return history;
}

async function loadDocumentSummaryText(
  documentId: string,
  userId: string,
): Promise<string | null> {
  const supabase = createServerSupabase();
  // SECURITY: summary metadata is scoped to authenticated user and document.
  const { data, error } = await supabase
    .from("documents")
    .select("summary_text")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return typeof data.summary_text === "string" ? data.summary_text : null;
}

function extractTextDelta(event: MessageStreamEvent): string {
  if (event.type !== "content_block_delta") return "";
  const delta = event.delta;
  if (delta.type !== "text_delta") return "";
  return delta.text;
}

function extractCitations(text: string): Citation[] {
  const urlRegex = /https:\/\/lovdata\.no\/[^\s)]+/g;
  const citationRegex =
    /([A-ZÆØÅ][A-Za-zÆØÅæøå\s-]+?)\s+§\s*([\dA-Za-zÆØÅæøå-]+)/g;
  const urls = text.match(urlRegex) ?? [];
  const citations = new Map<string, Citation>();

  for (const url of urls) {
    citations.set(url, { law: "", section: "", url });
  }

  for (const match of text.matchAll(citationRegex)) {
    const law = match[1].trim();
    const section = `§ ${match[2].trim()}`;
    const url = urls.find((candidate) => candidate.includes(match[2])) ?? "";
    const key = url || `${law}:${section}`;
    citations.set(key, { law, section, url });
  }

  return Array.from(citations.values());
}

function enforceDisclaimer(content: string): string {
  if (content.includes("ikke juridisk rådgivning")) return content;
  return `${content}\n\n---\n${DISCLAIMER_NB}`;
}

export default aiRouter;
