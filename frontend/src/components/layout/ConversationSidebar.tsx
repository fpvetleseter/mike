"use client";

import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/api";

interface ConversationSidebarProps {
    conversations: Conversation[];
    activeConversationId: string | null;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
    isLoading: boolean;
}

function formatDate(dateString: string): string {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return "i dag";
    }

    if (date.toDateString() === yesterday.toDateString()) {
        return "i går";
    }

    return new Intl.DateTimeFormat("nb-NO", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).format(date);
}

function truncateTitle(title: string | undefined): string {
    const value = title?.trim() || nb.chat.newConversation;
    return value.length > 40 ? `${value.slice(0, 40)}...` : value;
}

export default function ConversationSidebar({
    conversations,
    activeConversationId,
    onSelectConversation,
    onNewConversation,
    isLoading,
}: ConversationSidebarProps) {
    return (
        <aside className="flex h-full w-[260px] flex-col border-r border-slate-200 bg-slate-50 p-3">
            <div className="mb-5 flex items-center justify-between gap-3">
                <div className="text-lg font-semibold text-slate-950">Juridisk</div>
                <button
                    type="button"
                    onClick={onNewConversation}
                    className="min-h-11 rounded border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 transition hover:border-slate-300 hover:bg-slate-100"
                >
                    {nb.chat.newConversation}
                </button>
            </div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
                {nb.chat.conversations}
            </p>
            <div className="space-y-1 overflow-y-auto">
                {isLoading
                    ? Array.from({ length: 5 }).map((_, index) => (
                          <div
                              key={index}
                              className="h-14 animate-pulse rounded bg-slate-200"
                          />
                      ))
                    : null}
                {!isLoading && conversations.length === 0 ? (
                    <p className="rounded bg-white px-3 py-4 text-sm text-slate-500">
                        {nb.chat.noConversations}
                    </p>
                ) : null}
                {!isLoading
                    ? conversations.map((conversation) => (
                          <button
                              key={conversation.id}
                              type="button"
                              onClick={() => onSelectConversation(conversation.id)}
                              className={cn(
                                  "min-h-11 w-full rounded px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-white",
                                  activeConversationId === conversation.id &&
                                      "bg-slate-100 font-medium text-slate-950"
                              )}
                          >
                              <span className="block truncate">
                                  {truncateTitle(conversation.title)}
                              </span>
                              <span className="mt-1 block text-xs text-slate-400">
                                  {formatDate(conversation.updated_at)}
                              </span>
                          </button>
                      ))
                    : null}
            </div>
        </aside>
    );
}
