"use client";

import { useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import CitationChips from "@/components/chat/CitationChips";
import EmptyState from "@/components/chat/EmptyState";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/api";

interface MessageListProps {
    messages: Message[];
    isStreaming: boolean;
    streamingContent: string;
    onSuggestion: (suggestion: string) => void;
    disabled?: boolean;
}

export default function MessageList({
    messages,
    isStreaming,
    streamingContent,
    onSuggestion,
    disabled = false,
}: MessageListProps) {
    const bottomRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }, [messages, streamingContent]);

    const streamingMessage: Message | null =
        isStreaming && streamingContent
            ? {
                  id: "streaming",
                  conversation_id: "streaming",
                  role: "assistant",
                  content: streamingContent,
                  citations: [],
                  created_at: new Date().toISOString(),
              }
            : null;

    if (messages.length === 0 && !streamingMessage) {
        return <EmptyState onSuggestion={onSuggestion} disabled={disabled} />;
    }

    return (
        <div className="mx-auto flex min-h-full w-full max-w-[720px] flex-col gap-4 px-0 py-6 md:py-8">
            {messages.length === 0 && isStreaming && !streamingContent ? (
                <div className="flex flex-col gap-3">
                    <div className="glass-surface h-20 w-full animate-pulse rounded-[10px] border border-[var(--color-border-whisper)] bg-[var(--color-surface-message-ai)]" />
                    <div className="glass-surface h-16 w-full animate-pulse rounded-[10px] border border-[var(--color-border-whisper)] bg-[var(--color-surface-message-ai)]" />
                    <div className="glass-surface h-24 w-full animate-pulse rounded-[10px] border border-[var(--color-border-whisper)] bg-[var(--color-surface-message-ai)]" />
                </div>
            ) : null}
            {messages.map((message) => (
                <MessageCard key={message.id} message={message} />
            ))}
            {streamingMessage ? (
                <MessageCard message={streamingMessage} isStreaming />
            ) : null}
            <div ref={bottomRef} />
        </div>
    );
}

function MessageCard({
    message,
    isStreaming = false,
}: {
    message: Message;
    isStreaming?: boolean;
}) {
    const isUser = message.role === "user";

    return (
        <article
            className={cn(
                "glass-surface rounded-[10px] border border-[var(--color-border-whisper)] px-5 py-4 text-left",
                isUser
                    ? "bg-[var(--color-surface-message-user)]"
                    : "bg-[var(--color-surface-message-ai)]"
            )}
        >
            <div
                className={cn(
                    "mb-2 font-sans text-[11px] font-medium uppercase tracking-widest",
                    isUser
                        ? "text-[var(--color-accent-gold)]"
                        : "text-[var(--color-text-secondary)]"
                )}
            >
                {isUser ? nb.chat.userLabel : nb.chat.assistantLabel}
            </div>
            {isUser ? (
                <p className="whitespace-pre-wrap font-sans text-[15px] leading-6 text-[var(--color-text-primary)]">
                    {message.content}
                </p>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="juridisk-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                        </ReactMarkdown>
                        {isStreaming ? (
                            <span
                                aria-hidden="true"
                                className="streaming-cursor ml-1 inline-block h-4 w-0.5 translate-y-0.5 bg-[var(--color-accent-gold)]"
                            />
                        ) : null}
                    </div>
                    <CitationChips citations={message.citations} />
                </div>
            )}
        </article>
    );
}
