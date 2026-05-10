"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ChatInput from "@/components/chat/ChatInput";
import MessageList from "@/components/chat/MessageList";
import DocumentList from "@/components/documents/DocumentList";
import DocumentUpload from "@/components/documents/DocumentUpload";
import ConversationSidebar from "@/components/layout/ConversationSidebar";
import DisclaimerFooter from "@/components/layout/DisclaimerFooter";
import { createBrowserClient } from "@/lib/supabase/client";
import { nb } from "@/lib/nb";
import type {
    ApiResponse,
    Citation,
    Conversation,
    Document,
    Message,
} from "@/types/api";

interface ChatLayoutProps {
    initialConversations: Conversation[];
}

interface CreateConversationData {
    id: string;
    createdAt?: string;
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

function isCreateConversationData(value: unknown): value is CreateConversationData {
    if (!value || typeof value !== "object") return false;
    return typeof (value as Record<string, unknown>).id === "string";
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
        law: "Lovdata",
        section: "Se kilde",
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

export default function ChatLayout({ initialConversations }: ChatLayoutProps) {
    const router = useRouter();
    const [conversations, setConversations] =
        useState<Conversation[]>(initialConversations);
    const [activeConversationId, setActiveConversationId] = useState<string | null>(
        initialConversations[0]?.id ?? null
    );
    const [messages, setMessages] = useState<Message[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const [streamingContent, setStreamingContent] = useState("");
    const [documents, setDocuments] = useState<Document[]>([]);
    const [activeDocumentId, setActiveDocumentId] = useState<string | null>(null);
    const [rateLimited, setRateLimited] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [documentPanelOpen, setDocumentPanelOpen] = useState(false);
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [isLoadingDocuments, setIsLoadingDocuments] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

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
            if (!response.ok) return;
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

        setIsLoadingDocuments(true);
        try {
            const response = await fetch(`${backendUrl}/api/v1/documents`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) return;
            const result = (await response.json()) as ApiResponse<Document[]>;
            setDocuments(result.data ?? []);
        } finally {
            setIsLoadingDocuments(false);
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

    async function createConversation(): Promise<string | null> {
        if (!backendUrl) return null;
        const token = await getAccessToken();
        if (!token) return null;

        const response = await fetch(`${backendUrl}/api/v1/conversations`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ title: null }),
        });

        if (!response.ok) {
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
    }

    async function handleNewConversation(): Promise<void> {
        const id = await createConversation();
        if (id) {
            setMessages([]);
            setActiveDocumentId(null);
            setRateLimited(false);
            setSidebarOpen(false);
        }
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
                showError(nb.errors.conversationLoad);
                return;
            }
            const result = (await response.json()) as ApiResponse<Message[]>;
            setMessages(result.data ?? []);
            setActiveConversationId(id);
            setSidebarOpen(false);
        } catch {
            showError(nb.errors.conversationLoad);
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
        if (!conversationId) return;

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
                setRateLimited(true);
                return;
            }

            if (!response.ok || !response.body) {
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
                                await fetchConversations();
                            }
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
            }
        } catch (caughtError: unknown) {
            if (
                caughtError instanceof DOMException &&
                caughtError.name === "AbortError"
            ) {
                return;
            }
            showError(nb.errors.streamFailed);
        } finally {
            setIsStreaming(false);
            readerRef.current = null;
            abortControllerRef.current = null;
        }
    }

    const activeDocument = documents.find(
        (document) => document.id === activeDocumentId
    );

    const sidebar = (
        <ConversationSidebar
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={(id) => void handleSelectConversation(id)}
            onNewConversation={() => void handleNewConversation()}
            isLoading={isLoadingConversations}
        />
    );

    return (
        <div className="flex h-screen bg-white">
            <div className="hidden md:block">{sidebar}</div>
            {sidebarOpen ? (
                <>
                    <button
                        type="button"
                        aria-label="Lukk samtalemeny"
                        className="fixed inset-0 z-30 bg-black/20 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                    <div className="fixed inset-y-0 left-0 z-40 w-72 shadow-xl md:hidden">
                        {sidebar}
                    </div>
                </>
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col">
                <header className="flex h-14 items-center gap-3 border-b border-slate-200 px-4">
                    <button
                        type="button"
                        aria-label="Åpne samtalemeny"
                        onClick={() => setSidebarOpen(true)}
                        className="min-h-11 min-w-11 rounded border border-slate-200 text-slate-700 md:hidden"
                    >
                        ☰
                    </button>
                    <div className="hidden text-sm font-semibold text-slate-950 md:block">
                        Juridisk
                    </div>
                    {activeDocument ? (
                        <div className="min-w-0 rounded bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
                            <span className="block max-w-40 truncate">
                                {activeDocument.filename}
                            </span>
                        </div>
                    ) : null}
                    <button
                        type="button"
                        aria-label="Dokumenter"
                        onClick={() => setDocumentPanelOpen((open) => !open)}
                        className="ml-auto flex min-h-11 min-w-11 items-center justify-center rounded border border-slate-200 text-slate-700 transition hover:bg-slate-50"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            className="h-5 w-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                        >
                            <path d="M21 8.5 10.2 19.3a5 5 0 0 1-7.1-7.1L14.3 1" />
                            <path d="m17 5-11.1 11.1a2 2 0 1 0 2.8 2.8L20 7.7" />
                        </svg>
                    </button>
                </header>
                <div className="flex-1 overflow-y-auto">
                    <MessageList
                        messages={messages}
                        isStreaming={isStreaming}
                        streamingContent={streamingContent}
                    />
                </div>
                {documentPanelOpen ? (
                    <section className="max-h-64 overflow-y-auto border-t border-slate-200 bg-slate-50 p-4">
                        <div className="grid gap-4 md:grid-cols-2">
                            <DocumentUpload
                                onUploadComplete={(document) => {
                                    setDocuments((previous) => [document, ...previous]);
                                    setActiveDocumentId(document.id);
                                    setDocumentPanelOpen(false);
                                    void fetchDocuments();
                                }}
                            />
                            <DocumentList
                                documents={documents}
                                onSelectDocument={(id) => {
                                    setActiveDocumentId(id);
                                    setDocumentPanelOpen(false);
                                }}
                                activeDocumentId={activeDocumentId}
                                isLoading={isLoadingDocuments}
                            />
                        </div>
                    </section>
                ) : null}
                <div className="border-t border-slate-200">
                    <ChatInput
                        onSend={(message) => void handleSend(message)}
                        isStreaming={isStreaming}
                        disabled={rateLimited}
                    />
                    {rateLimited ? (
                        <div className="border-t border-amber-200 bg-amber-50 px-4 py-3">
                            <div className="mx-auto flex max-w-4xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm font-medium text-amber-900">
                                    {nb.errors.rateLimit}
                                </p>
                                <button
                                    type="button"
                                    onClick={() => router.push("/settings")}
                                    className="min-h-10 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                                >
                                    {nb.chat.upgradeToPro}
                                </button>
                            </div>
                        </div>
                    ) : null}
                    <DisclaimerFooter />
                </div>
            </div>
            {error ? (
                <div className="fixed bottom-24 right-4 z-50 max-w-sm rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                    <div className="flex items-start gap-3">
                        <p>{error}</p>
                        <button
                            type="button"
                            onClick={() => setError(null)}
                            className="min-h-8 min-w-8 rounded text-red-700 hover:bg-red-100"
                            aria-label="Lukk feilmelding"
                        >
                            ×
                        </button>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
