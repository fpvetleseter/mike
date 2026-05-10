"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { History, MessageSquare, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";

import DisclaimerFooter from "@/components/chat/DisclaimerFooter";
import InputBar from "@/components/chat/InputBar";
import MessageList from "@/components/chat/MessageList";
import Sidebar from "@/components/layout/Sidebar";
import { Button } from "@/components/ui/button";
import { createBrowserClient } from "@/lib/supabase/client";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type {
    ApiResponse,
    Citation,
    Conversation,
    Document,
    Message,
} from "@/types/api";

interface ChatLayoutProps {
    initialConversations: Conversation[];
    userEmail: string;
    tier: "free" | "pro";
    queriesToday: number;
}

interface CreateConversationData {
    id: string;
    createdAt?: string;
}

interface UploadResponseData {
    documentId: string;
    status: Document["status"];
}

interface SseDoneEvent {
    type: "done";
    message?: Message;
    conversationId?: string;
}

interface SseDeltaEvent {
    type: "delta";
    text?: string;
    content?: string;
}

interface SseErrorEvent {
    type: "error";
    message?: string;
}

type SseEvent = SseDeltaEvent | SseDoneEvent | SseErrorEvent;

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
const maxFileSize = 10 * 1024 * 1024;
const freeDailyLimit = 10;
const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isCreateConversationData(value: unknown): value is CreateConversationData {
    if (!value || typeof value !== "object") return false;
    return typeof (value as Record<string, unknown>).id === "string";
}

function isUploadResponseData(value: unknown): value is UploadResponseData {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.documentId === "string" &&
        (record.status === "processing" ||
            record.status === "ready" ||
            record.status === "error")
    );
}

function isSseEvent(value: unknown): value is SseEvent {
    if (!value || typeof value !== "object") return false;
    const type = (value as Record<string, unknown>).type;
    return type === "delta" || type === "done" || type === "error";
}

function extractClientCitations(content: string): Citation[] {
    const urlRegex = /https:\/\/lovdata\.no\/[^\s)]+/g;
    const urls = Array.from(new Set(content.match(urlRegex) ?? []));
    return urls.map((url) => ({
        law: nb.chat.lovdata,
        section: nb.chat.source,
        url,
    }));
}

async function getAccessToken(): Promise<string | null> {
    const supabase = createBrowserClient();
    // SECURITY: Client forwards only the current user's Supabase JWT to the backend.
    const {
        data: { session },
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
}

export default function ChatLayout({
    initialConversations,
    userEmail,
    tier,
    queriesToday,
}: ChatLayoutProps) {
    console.log("[Juridisk] env check", {
        backendUrl: process.env.NEXT_PUBLIC_BACKEND_URL,
        hasSupabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    });

    const router = useRouter();
    const [conversations, setConversations] =
        useState<Conversation[]>(initialConversations);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(
        null
    );
    const [messages, setMessages] = useState<Message[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [documents, setDocuments] = useState<Document[]>([]);
    const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
    const [attachedFileName, setAttachedFileName] = useState<string | null>(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
    const [uploadRequestId, setUploadRequestId] = useState(0);
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    useEffect(() => {
        if (!backendUrl) {
            console.error(
                "[Juridisk] NEXT_PUBLIC_BACKEND_URL is not set. " +
                    "Add it to frontend/.env.local (local) or Vercel env vars (production). " +
                    "Value must be the full Railway URL, e.g. https://juridisk-backend.railway.app"
            );
        }
    }, [backendUrl]);

    useEffect(() => {
        if (!backendUrl) return;
        fetch(`${backendUrl}/health`)
            .then((response) => {
                if (!response.ok) {
                    console.warn(
                        "[Juridisk] Backend health check failed:",
                        response.status
                    );
                } else {
                    console.info("[Juridisk] Backend reachable.");
                }
            })
            .catch((caughtError: unknown) => {
                const message =
                    caughtError instanceof Error
                        ? caughtError.message
                        : "Unknown error";
                console.error("[Juridisk] Backend unreachable:", message);
            });
    }, [backendUrl]);

    const usageLabel =
        tier === "free"
            ? nb.chat.usageToday(
                  Math.min(queriesToday, freeDailyLimit),
                  freeDailyLimit
              )
            : undefined;

    const showError = useCallback((message: string) => {
        setError(message);
        window.setTimeout(() => setError(null), 5000);
    }, []);

    const fetchConversations = useCallback(async () => {
        if (!backendUrl) return;
        const token = await getAccessToken();
        if (!token) return;

        setIsLoadingConversations(true);
        try {
            const response = await fetch(`${backendUrl}/api/v1/conversations`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                return;
            }
            const result = (await response.json()) as ApiResponse<Conversation[]>;
            setConversations(result.data ?? []);
        } finally {
            setIsLoadingConversations(false);
        }
    }, []);

    const fetchDocuments = useCallback(async () => {
        if (!backendUrl) return;
        const token = await getAccessToken();
        if (!token) return;

        try {
            const response = await fetch(`${backendUrl}/api/v1/documents`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                return;
            }
            const result = (await response.json()) as ApiResponse<Document[]>;
            setDocuments(result.data ?? []);
        } catch {
            return;
        }
    }, []);

    useEffect(() => {
        void fetchDocuments();
        const interval = window.setInterval(() => {
            void fetchDocuments();
        }, 3000);

        return () => window.clearInterval(interval);
    }, [fetchDocuments]);

    useEffect(() => {
        return () => {
            abortControllerRef.current?.abort();
            void readerRef.current?.cancel();
        };
    }, []);

    useEffect(() => {
        if (!activeDocumentId) {
            setAttachedFileName(null);
            return;
        }

        const activeDocument = documents.find(
            (document) => document.id === activeDocumentId
        );
        if (activeDocument) {
            setAttachedFileName(activeDocument.filename);
        }
    }, [activeDocumentId, documents]);

    async function createConversation(): Promise<string | null> {
        if (!backendUrl) {
            console.error(
                "[Juridisk] NEXT_PUBLIC_BACKEND_URL is not set. " +
                    "Add it to frontend/.env.local (local) or Vercel env vars (production). " +
                    "Value must be the full Railway URL, e.g. https://juridisk-backend.railway.app"
            );
            return null;
        }
        const token = await getAccessToken();
        if (!token) return null;

        try {
            const response = await fetch(`${backendUrl}/api/v1/conversations`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ title: null }),
            });

            if (!response.ok) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                showError(nb.errors.generic);
                return null;
            }

            const result = (await response.json()) as ApiResponse<unknown>;
            if (!isCreateConversationData(result.data)) {
                showError(nb.errors.generic);
                return null;
            }

            setActiveConversationId(result.data.id);
            await fetchConversations();
            return result.data.id;
        } catch (error: unknown) {
            console.error("[Juridisk] createConversation failed:", {
                url: `${backendUrl}/api/v1/conversations`,
                error: error instanceof Error ? error.message : error,
                backendUrl,
            });
            showError(nb.errors.generic);
            return null;
        }
    }

    function handleNewConversation(): void {
        setMessages([]);
        setActiveConversationId(null);
        setActiveDocumentId(null);
        setAttachedFileName(null);
        setRateLimited(false);
        setMobileHistoryOpen(false);
    }

    async function handleSelectConversation(id: string): Promise<void> {
        if (!backendUrl) return;
        const token = await getAccessToken();
        if (!token) {
            showError(nb.errors.unauthorized);
            return;
        }

        try {
            const response = await fetch(
                `${backendUrl}/api/v1/conversations/${id}/messages`,
                {
                    headers: { Authorization: `Bearer ${token}` },
                }
            );
            if (!response.ok) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                showError(nb.errors.conversationLoad);
                return;
            }
            const result = (await response.json()) as ApiResponse<Message[]>;
            setMessages(result.data ?? []);
            setActiveConversationId(id);
            setRateLimited(false);
            setMobileHistoryOpen(false);
        } catch {
            showError(nb.errors.conversationLoad);
        }
    }

    async function handleFileSelected(file: File): Promise<void> {
        if (!backendUrl) {
            showError(nb.errors.generic);
            return;
        }

        if (file.size > maxFileSize) {
            showError(nb.errors.fileTooLarge);
            return;
        }

        if (!allowedMimeTypes.has(file.type)) {
            showError(nb.errors.invalidFileType);
            return;
        }

        const token = await getAccessToken();
        if (!token) {
            showError(nb.errors.unauthorized);
            return;
        }

        setAttachedFileName(file.name);

        try {
            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(`${backendUrl}/api/v1/documents/upload`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                },
                body: formData,
            });

            if (response.status === 413) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                showError(nb.errors.fileTooLarge);
                setAttachedFileName(null);
                return;
            }

            if (!response.ok) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                showError(nb.errors.generic);
                setAttachedFileName(null);
                return;
            }

            const result = (await response.json()) as ApiResponse<unknown>;
            if (!isUploadResponseData(result.data)) {
                showError(nb.errors.generic);
                setAttachedFileName(null);
                return;
            }

            const uploadedDocument: Document = {
                id: result.data.documentId,
                user_id: "",
                filename: file.name,
                status: result.data.status,
                created_at: new Date().toISOString(),
            };
            setDocuments((previous) => [uploadedDocument, ...previous]);
            setActiveDocumentId(uploadedDocument.id);
            await fetchDocuments();
        } catch {
            showError(nb.errors.generic);
            setAttachedFileName(null);
        }
    }

    async function handleSend(userMessage: string): Promise<void> {
        if (!backendUrl) {
            showError(nb.errors.generic);
            return;
        }

        const token = await getAccessToken();
        if (!token) {
            showError(nb.errors.unauthorized);
            return;
        }

        const conversationId = activeConversationId ?? (await createConversation());
        if (!conversationId) {
            if (!backendUrl) {
                showError(
                    "Tilkoblingen til serveren er ikke konfigurert. Kontakt support."
                );
            }
            return;
        }

        const optimisticMessage: Message = {
            id: `temp-${Date.now()}`,
            conversation_id: conversationId,
            role: "user",
            content: userMessage,
            citations: [],
            created_at: new Date().toISOString(),
        };

        setMessages((previous) => [...previous, optimisticMessage]);
        setIsStreaming(true);
        setStreamingContent("");
        setRateLimited(false);
        setError(null);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await fetch(`${backendUrl}/api/v1/ai/chat`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    message: userMessage,
                    conversationId,
                    documentId: activeDocumentId ?? undefined,
                }),
                signal: controller.signal,
            });

            if (response.status === 429) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                setRateLimited(true);
                return;
            }

            if (!response.ok || !response.body) {
                if (!response.ok) {
                    console.error("[Juridisk] fetch error response:", {
                        status: response.status,
                        statusText: response.statusText,
                        url: response.url,
                        body: await response.text(),
                    });
                }
                showError(nb.errors.generic);
                return;
            }

            const reader = response.body.getReader();
            readerRef.current = reader;
            const decoder = new TextDecoder();
            let accumulated = "";
            let buffer = "";
            let finalMessageReceived = false;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const parts = buffer.split("\n\n");
                buffer = parts.pop() ?? "";

                for (const part of parts) {
                    const line = part
                        .split("\n")
                        .find((candidate) => candidate.startsWith("data: "));
                    if (!line) continue;

                    const payload = line.slice(6).trim();
                    if (payload === "[DONE]") continue;

                    try {
                        const parsed = JSON.parse(payload) as unknown;
                        if (!isSseEvent(parsed)) continue;

                        if (parsed.type === "delta") {
                            const delta = parsed.text ?? parsed.content ?? "";
                            accumulated += delta;
                            setStreamingContent(accumulated);
                        } else if (parsed.type === "done") {
                            finalMessageReceived = true;
                            const finalMessage =
                                parsed.message ??
                                ({
                                    id: `assistant-${Date.now()}`,
                                    conversation_id: conversationId,
                                    role: "assistant",
                                    content: accumulated,
                                    citations: extractClientCitations(accumulated),
                                    created_at: new Date().toISOString(),
                                } satisfies Message);
                            setMessages((previous) => [...previous, finalMessage]);
                            setStreamingContent("");
                            if (parsed.conversationId && !activeConversationId) {
                                setActiveConversationId(parsed.conversationId);
                            }
                            await fetchConversations();
                        } else if (parsed.type === "error") {
                            showError(parsed.message || nb.errors.streamFailed);
                        }
                    } catch {
                        continue;
                    }
                }
            }

            if (!finalMessageReceived && accumulated) {
                setMessages((previous) => [
                    ...previous,
                    {
                        id: `assistant-${Date.now()}`,
                        conversation_id: conversationId,
                        role: "assistant",
                        content: accumulated,
                        citations: extractClientCitations(accumulated),
                        created_at: new Date().toISOString(),
                    },
                ]);
                setStreamingContent("");
                await fetchConversations();
            }
        } catch (caughtError: unknown) {
            if (
                caughtError instanceof DOMException &&
                caughtError.name === "AbortError"
            ) {
                return;
            }
            console.error("[Juridisk] handleSend failed:", {
                error:
                    caughtError instanceof Error
                        ? caughtError.message
                        : caughtError,
                conversationId,
                backendUrl,
            });
            showError(nb.errors.streamFailed);
        } finally {
            setIsStreaming(false);
            readerRef.current = null;
            abortControllerRef.current = null;
        }
    }

    async function handleLogout(): Promise<void> {
        const supabase = createBrowserClient();
        await supabase.auth.signOut();
        router.push("/login");
    }

    async function handleUpgrade(): Promise<void> {
        if (!backendUrl) return;
        const token = await getAccessToken();
        if (!token) {
            showError(nb.errors.unauthorized);
            return;
        }

        try {
            const response = await fetch(`${backendUrl}/api/v1/billing/checkout`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "application/json",
                },
            });

            if (!response.ok) {
                console.error("[Juridisk] fetch error response:", {
                    status: response.status,
                    statusText: response.statusText,
                    url: response.url,
                    body: await response.text(),
                });
                showError(nb.errors.generic);
                return;
            }

            const result = (await response.json()) as ApiResponse<{ url: string }>;
            if (result.data?.url) {
                window.location.href = result.data.url;
            } else {
                showError(nb.errors.generic);
            }
        } catch {
            showError(nb.errors.generic);
        }
    }

    const sidebar = (
        <Sidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => void handleSelectConversation(id)}
            onNewConversation={handleNewConversation}
            onLogout={() => void handleLogout()}
            onUpgrade={() => void handleUpgrade()}
            isLoading={isLoadingConversations}
            userEmail={userEmail}
            tier={tier}
            queriesToday={queriesToday}
        />
    );

    return (
        <div className="min-h-svh bg-transparent text-[var(--color-text-primary)]">
            <div className="flex h-svh bg-transparent">
                <div className="hidden shrink-0 md:block">{sidebar}</div>
                <main className="isolate flex min-w-0 flex-1 flex-col">
                    <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 md:px-8">
                        <MessageList
                            messages={messages}
                            isStreaming={isStreaming}
                            streamingContent={streamingContent}
                            onSuggestion={(suggestion) => void handleSend(suggestion)}
                            disabled={rateLimited || isStreaming}
                        />
                    </div>

                    <div className="px-5 pb-[76px] md:px-8 md:pb-0">
                        <div className="mx-auto w-full max-w-[720px]">
                            {rateLimited ? (
                                <div className="glass-surface mb-3 rounded-[10px] border border-[var(--color-border-whisper)] bg-[var(--color-surface-card)] px-4 py-3">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <p className="font-sans text-sm font-medium text-[var(--color-text-primary)]">
                                            {nb.errors.rateLimit}
                                        </p>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => void handleUpgrade()}
                                            className="h-10 border-[var(--color-border-whisper)] bg-transparent font-sans text-[13px] font-medium uppercase tracking-wide text-[var(--color-text-primary)] shadow-none hover:border-[var(--color-border-focus)] hover:bg-[rgba(201,168,76,0.06)] hover:text-[var(--color-text-primary)]"
                                        >
                                            {nb.chat.upgradeToPro}
                                        </Button>
                                    </div>
                                </div>
                            ) : null}
                            <InputBar
                                onSend={(message) => void handleSend(message)}
                                onFileSelected={(file) =>
                                    void handleFileSelected(file)
                                }
                                onClearFile={() => {
                                    setActiveDocumentId(null);
                                    setAttachedFileName(null);
                                }}
                                isStreaming={isStreaming}
                                disabled={rateLimited}
                                attachedFileName={attachedFileName}
                                uploadRequestId={uploadRequestId}
                            />
                            <DisclaimerFooter />
                        </div>
                    </div>
                </main>
            </div>

            {mobileHistoryOpen ? (
                <div className="fixed inset-x-3 bottom-20 top-3 z-40 md:hidden">
                    {sidebar}
                </div>
            ) : null}

            <nav className="glass-surface fixed inset-x-0 bottom-0 z-50 grid h-16 grid-cols-3 border-t border-[var(--color-border-whisper)] bg-[var(--color-surface-sidebar)] md:hidden">
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/10">
                    <div 
                        className="h-full transition-all duration-500"
                        style={{ 
                            width: `${Math.min((queriesToday / 10) * 100, 100)}%`,
                            backgroundColor: queriesToday >= 10 ? "#c94a2a" : queriesToday >= 7 ? "#c97a2a" : "var(--color-accent-gold)"
                        }}
                    />
                </div>
                <MobileNavButton
                    label={nb.chat.wordmark}
                    active={!mobileHistoryOpen}
                    onClick={() => setMobileHistoryOpen(false)}
                    icon={<MessageSquare aria-hidden="true" className="size-5" />}
                />
                <MobileNavButton
                    label={nb.chat.history}
                    active={mobileHistoryOpen}
                    onClick={() => setMobileHistoryOpen((open) => !open)}
                    icon={<History aria-hidden="true" className="size-5" />}
                />
                <MobileNavButton
                    label={nb.chat.upload}
                    active={Boolean(activeDocumentId)}
                    onClick={() => {
                        setMobileHistoryOpen(false);
                        setUploadRequestId((value) => value + 1);
                    }}
                    icon={<Upload aria-hidden="true" className="size-5" />}
                />
            </nav>

            {error ? (
                <div className="glass-surface fixed bottom-24 right-4 z-50 max-w-sm rounded-lg border border-[var(--color-border-whisper)] bg-[var(--color-surface-card)] px-4 py-3 font-sans text-sm text-[var(--color-text-primary)]">
                    <div className="flex items-start gap-3">
                        <p>{error}</p>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setError(null)}
                            className="min-h-8 min-w-8 rounded text-[var(--color-text-secondary)] hover:bg-white/[0.04] hover:text-[var(--color-accent-gold)]"
                            aria-label={nb.chat.closePanel}
                        >
                            <X aria-hidden="true" className="size-4" />
                        </Button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function MobileNavButton({
    label,
    icon,
    active,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex flex-col items-center justify-center gap-1 font-sans text-[11px] transition",
                active
                    ? "text-[var(--color-accent-gold)]"
                    : "text-[var(--color-text-secondary)]"
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
