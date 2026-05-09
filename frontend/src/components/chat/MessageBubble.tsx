"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import CitationCard from "@/components/chat/CitationCard";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/api";

interface MessageBubbleProps {
    message: Message;
    isStreaming?: boolean;
}

function formatTimestamp(value: string): string {
    return new Intl.DateTimeFormat("nb-NO", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
    }).format(new Date(value));
}

export default function MessageBubble({
    message,
    isStreaming = false,
}: MessageBubbleProps) {
    const isUser = message.role === "user";

    return (
        <div className={cn("flex flex-col", isUser ? "items-end" : "items-start")}>
            <div
                className={cn(
                    "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6 md:max-w-[70%]",
                    isUser
                        ? "rounded-br-sm bg-slate-900 text-white"
                        : "rounded-bl-sm border border-slate-200 bg-white text-slate-900"
                )}
            >
                {isUser ? (
                    <p className="whitespace-pre-wrap">{message.content}</p>
                ) : (
                    <div className="space-y-3">
                        <div className="prose prose-slate max-w-none text-sm prose-p:my-2 prose-ul:my-2 prose-li:my-1">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {message.content}
                            </ReactMarkdown>
                            {isStreaming ? (
                                <span className="ml-1 inline-block animate-pulse">▍</span>
                            ) : null}
                        </div>
                        {message.citations.length > 0 ? (
                            <div className="space-y-2">
                                <p className="text-xs font-medium text-slate-500">
                                    Rettskilder:
                                </p>
                                <div className="space-y-2">
                                    {message.citations.map((citation) => (
                                        <CitationCard
                                            key={`${citation.url}-${citation.section}`}
                                            citation={citation}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                        <p className="border-t border-slate-100 pt-2 text-xs italic text-slate-400">
                            {nb.disclaimer.short}
                        </p>
                    </div>
                )}
            </div>
            <time className="mt-1 text-xs text-slate-400">
                {formatTimestamp(message.created_at)}
            </time>
        </div>
    );
}
