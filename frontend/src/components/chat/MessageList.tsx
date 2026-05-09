"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "@/components/chat/MessageBubble";
import type { Message } from "@/types/api";

interface MessageListProps {
    messages: Message[];
    isStreaming: boolean;
    streamingContent: string;
}

export default function MessageList({
    messages,
    isStreaming,
    streamingContent,
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

    return (
        <div className="flex min-h-full flex-col gap-4 px-4 py-6 md:px-8">
            {messages.length === 0 && isStreaming && !streamingContent ? (
                <div className="space-y-3">
                    <div className="h-20 w-3/4 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="h-16 w-1/2 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="h-24 w-2/3 animate-pulse rounded-2xl bg-slate-100" />
                </div>
            ) : null}
            {messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
            ))}
            {streamingMessage ? (
                <MessageBubble message={streamingMessage} isStreaming />
            ) : null}
            <div ref={bottomRef} />
        </div>
    );
}
