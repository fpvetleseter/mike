import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "../middleware/auth";
import { checkQueryLimit, incrementQueryCount } from "../middleware/ratelimit";
import { validateBody } from "../middleware/validate";
import { createServerSupabase } from "../lib/supabase";
import { streamLegalResponse } from "../services/anthropic";
import { searchDocumentChunks } from "../services/documents";
import { LovdataChunk, searchLovdata } from "../services/lovdata";
import { buildLegalAssistantPrompt } from "../proprietary/prompts/legal-assistant";

const ChatRequestSchema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid(),
  documentId: z.string().uuid().optional(),
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

    const { message, conversationId, documentId } = req.body as ChatRequestBody;
    const supabase = createServerSupabase();
    let headersFlushed = false;

    try {
      // SECURITY: confirm conversation ownership because service role bypasses RLS.
      const { data: conversation, error: conversationError } = await supabase
        .from("conversations")
        .select("id, document_id")
        .eq("id", conversationId)
        .eq("user_id", userId)
        .single();

      if (conversationError || !conversation) {
        res.status(404).json({ data: null, error: "Samtalen ble ikke funnet." });
        return;
      }

      if (documentId) {
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

      // SECURITY: message is stored against authenticated user's conversation only.
      const { error: userMessageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "user",
        content: message,
      });

      if (userMessageError) {
        throw userMessageError;
      }

      const history = await loadConversationHistory(conversationId, userId);
      const lovdataPromise = searchLovdata(message, { maxResults: 5 });
      const documentChunksPromise = documentId
        ? searchDocumentChunks(message, documentId, userId).catch((error: unknown) => {
            console.error("Document chunk retrieval failed", {
              error: error instanceof Error ? error.message : String(error),
              documentId,
            });
            return [];
          })
        : Promise.resolve([]);

      const [lovdata, documentChunks] = await Promise.all([
        lovdataPromise,
        documentChunksPromise,
      ]);

      const systemPrompt = buildLegalAssistantPrompt({
        lovdataContext: formatLovdataContext(lovdata.results, lovdata.available),
        documentContext: formatDocumentContext(documentChunks),
        conversationHistory: formatConversationHistory(history),
      });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      headersFlushed = true;

      const model = process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7";
      const { stream, getUsage } = await streamLegalResponse({
        systemPrompt,
        messages: history,
        model,
        maxTokens: 2048,
        conversationId,
      });

      let fullContent = "";
      for await (const chunk of stream) {
        fullContent += chunk;
        res.write(`data: ${JSON.stringify({ type: "delta", content: chunk })}\n\n`);
      }

      const enforced = enforceDisclaimer(fullContent);
      if (enforced !== fullContent) {
        const appended = enforced.slice(fullContent.length);
        fullContent = enforced;
        res.write(
          `data: ${JSON.stringify({ type: "delta", content: appended })}\n\n`,
        );
      }

      const usage = await getUsage();
      const citations = extractCitations(fullContent);

      // SECURITY: assistant content is persisted only to the authenticated user's conversation.
      const { error: assistantMessageError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        user_id: userId,
        role: "assistant",
        content: fullContent,
        citations,
        model,
        input_tokens: usage.inputTokens,
        output_tokens: usage.outputTokens,
      });

      if (assistantMessageError) {
        throw assistantMessageError;
      }

      await incrementQueryCount(userId);
      res.write(`data: ${JSON.stringify({ type: "done" })}\n\n`);
      res.end();
    } catch (error) {
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
): Promise<ChatMessage[]> {
  const supabase = createServerSupabase();
  // SECURITY: history retrieval is explicitly scoped to the authenticated user.
  const { data, error } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  const ordered = ((data ?? []) as Array<{ role: string; content: string }>).reverse();
  const truncated: ChatMessage[] = [];
  let tokenEstimate = 0;
  for (const message of ordered) {
    if (message.role !== "user" && message.role !== "assistant") continue;
    const nextEstimate = Math.ceil(message.content.length / 4);
    if (tokenEstimate + nextEstimate > 4000) break;
    tokenEstimate += nextEstimate;
    truncated.push({ role: message.role, content: message.content });
  }
  return truncated;
}

function formatLovdataContext(results: LovdataChunk[], available: boolean): string {
  if (!available) {
    return "Lovdata-tilkobling er midlertidig utilgjengelig.";
  }
  if (results.length === 0) {
    return "Ingen Lovdata-resultater tilgjengelig for dette spørsmålet.";
  }
  return results
    .map(
      (result) =>
        `### ${result.lawName} ${result.section} — ${result.sectionTitle}\n${result.text}\nKilde: ${result.url}`,
    )
    .join("\n\n");
}

function formatDocumentContext(
  chunks: Array<{ text: string; chunkIndex: number }> | null,
): string {
  if (!chunks || chunks.length === 0) {
    return "Ingen dokumentkontekst. Brukeren stiller et generelt spørsmål.";
  }
  return `### Dokumentinnhold (utdrag)\n${chunks
    .map((chunk) => `[Utdrag ${chunk.chunkIndex + 1}]\n${chunk.text}`)
    .join("\n---\n")}`;
}

function formatConversationHistory(messages: ChatMessage[]): string {
  if (messages.length === 0) {
    return "Ingen tidligere meldinger.";
  }
  return messages
    .map((message) => {
      const label = message.role === "user" ? "Bruker" : "Assistent";
      return `${label}: ${message.content}`;
    })
    .join("\n");
}

function extractCitations(text: string): Citation[] {
  const urlRegex = /https:\/\/lovdata\.no\/[^\s)]+/g;
  const citationRegex = /([A-ZÆØÅ][A-Za-zÆØÅæøå\s-]+?)\s+§\s*([\dA-Za-zÆØÅæøå-]+)/g;
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
  if (content.includes("ikke juridisk rådgivning")) {
    return content;
  }
  return `${content}\n\n---\n${DISCLAIMER_NB}`;
}

export default aiRouter;
