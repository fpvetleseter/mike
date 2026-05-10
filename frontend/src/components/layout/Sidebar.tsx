"use client";

import { FileText, LogOut, Paperclip, Plus } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sidebar as SidebarRoot,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
} from "@/components/ui/sidebar";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/types/api";

interface JuridiskSidebarProps {
    conversations: Conversation[];
    activeConversationId: string | null;
    onSelectConversation: (id: string) => void;
    onNewConversation: () => void;
    onLogout: () => void;
    onUpgrade: () => void;
    isLoading: boolean;
    userEmail: string;
    tier: "free" | "pro";
    queriesToday: number;
}

function getBarColor(queriesUsed: number): string {
    if (queriesUsed >= 10) return "#c93a2a";
    if (queriesUsed >= 8) return "#c96a2a";
    if (queriesUsed >= 6) return "#c9922a";
    return "#4a9e6b";
}

function conversationTitle(conversation: Conversation): string {
    return conversation.title?.trim() || nb.chat.newConversation;
}

export default function Sidebar({
    conversations,
    activeConversationId,
    onSelectConversation,
    onNewConversation,
    onLogout,
    onUpgrade,
    isLoading,
    userEmail,
    tier,
    queriesToday,
}: JuridiskSidebarProps) {
    const queriesUsed = Math.min(queriesToday, 10);
    const usagePercent = (queriesUsed / 10) * 100;
    const isAtLimit = queriesUsed >= 10;
    const showUpgradeLink = tier === "free" && queriesUsed >= 6;

    const emailPrefix = userEmail.includes("@")
        ? userEmail.split("@")[0]
        : userEmail;
    const displayName =
        emailPrefix.length > 20 ? emailPrefix.slice(0, 20) + "…" : emailPrefix;
    const avatarInitial = emailPrefix ? emailPrefix[0].toUpperCase() : "?";
    const footerLabel =
        tier === "pro"
            ? `${displayName} · ${nb.sidebar.userProSuffix}`
            : displayName;

    return (
        <SidebarRoot
            className="h-svh w-[260px] border-r border-[var(--color-border-whisper)] text-[var(--color-text-primary)]"
            style={{
                background: "rgba(18, 14, 10, 0.68)",
                backdropFilter: "blur(16px) saturate(1.5)",
                WebkitBackdropFilter: "blur(16px) saturate(1.5)",
                isolation: "isolate",
            }}
        >
            {/* Zone 1 — Wordmark */}
            <SidebarHeader className="h-[72px] flex-col justify-center px-5">
                <span className="font-serif text-[20px] font-normal leading-none text-[var(--color-text-primary)]">
                    {nb.chat.wordmark}
                </span>
            </SidebarHeader>

            <SidebarContent>
                {/* Zone 2 — New conversation row */}
                <button
                    type="button"
                    onClick={onNewConversation}
                    className="group flex w-full items-center gap-[10px] rounded-[6px] px-5 py-2 text-left transition-colors duration-[120ms] hover:bg-white/[0.05]"
                >
                    <Plus
                        size={15}
                        className="text-[var(--color-text-secondary)] transition-colors duration-[120ms] group-hover:text-[var(--color-text-primary)]"
                    />
                    <span className="font-sans text-[14px] font-normal text-[var(--color-text-primary)]">
                        {nb.sidebar.newConversation}
                    </span>
                </button>
                <div style={{ height: 16 }} />

                {/* Zone 3 — Usage row (free users only) */}
                {tier === "free" && (
                    <>
                        <div className="px-5 py-2">
                            <div
                                style={{
                                    height: 3,
                                    borderRadius: 999,
                                    background: "rgba(255, 255, 255, 0.07)",
                                }}
                            >
                                <div
                                    style={{
                                        height: "100%",
                                        borderRadius: 999,
                                        width: `${usagePercent}%`,
                                        backgroundColor: getBarColor(queriesUsed),
                                        transition:
                                            "width 600ms ease-out, background-color 400ms ease",
                                        animation: isAtLimit
                                            ? "pulse-bar 700ms ease-in-out forwards"
                                            : "none",
                                    }}
                                />
                            </div>
                            <p
                                className="font-sans text-[11px] text-[var(--color-text-secondary)]"
                                style={{ marginTop: 5 }}
                            >
                                {nb.sidebar.queriesUsed(queriesUsed, 10)}
                            </p>
                            {showUpgradeLink && (
                                <button
                                    type="button"
                                    onClick={onUpgrade}
                                    className="mt-[6px] font-sans text-[11px] text-[var(--color-accent-gold)] underline-offset-2 transition-opacity duration-[120ms] hover:opacity-80 hover:underline"
                                    style={{
                                        opacity: isAtLimit ? 1 : 0.9,
                                        background: "none",
                                        border: "none",
                                        padding: 0,
                                    }}
                                >
                                    {nb.sidebar.upgradeLink}
                                </button>
                            )}
                        </div>
                        <div style={{ height: 16 }} />
                    </>
                )}

                {/* Zone 4 — Conversation list */}
                <div className="min-h-0 flex-1">
                    <ScrollArea className="h-full">
                        {isLoading ? (
                            <div className="flex flex-col gap-2 px-5 py-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-8 w-full animate-pulse rounded-md bg-white/5"
                                    />
                                ))}
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="flex flex-col px-5 py-4">
                                <FileText
                                    size={16}
                                    style={{
                                        color: "var(--color-text-secondary)",
                                        opacity: 0.3,
                                        marginBottom: 8,
                                    }}
                                />
                                <p
                                    className="font-sans text-[12px] text-[var(--color-text-secondary)]"
                                    style={{ opacity: 0.5 }}
                                >
                                    {nb.sidebar.noConversations}
                                </p>
                                <p
                                    className="mt-1 flex items-center gap-1 font-sans text-[11px] font-light text-[var(--color-text-secondary)]"
                                    style={{ opacity: 0.45 }}
                                >
                                    <Paperclip
                                        size={11}
                                        style={{
                                            color: "var(--color-accent-gold)",
                                            opacity: 0.6,
                                            flexShrink: 0,
                                        }}
                                    />
                                    {nb.sidebar.noConversationsHint}
                                </p>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                <p
                                    className="mb-1 font-sans text-[10px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]"
                                    style={{ opacity: 0.5, padding: "0 20px" }}
                                >
                                    {nb.sidebar.conversations}
                                </p>
                                {conversations.map((conversation) => {
                                    const active =
                                        activeConversationId === conversation.id;
                                    return (
                                        <button
                                            key={conversation.id}
                                            type="button"
                                            onClick={() =>
                                                onSelectConversation(
                                                    conversation.id
                                                )
                                            }
                                            className={cn(
                                                "w-full rounded-[6px] px-5 py-[6px] text-left font-sans text-[13px] font-normal text-[var(--color-text-primary)] transition-all duration-[120ms]",
                                                active
                                                    ? "bg-white/[0.08] opacity-100"
                                                    : "opacity-75 hover:bg-white/[0.05] hover:opacity-90"
                                            )}
                                        >
                                            <span className="block truncate">
                                                {conversationTitle(conversation)}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </ScrollArea>
                </div>
            </SidebarContent>

            {/* Zone 5 — User footer */}
            <div
                style={{
                    height: 1,
                    background: "rgba(255, 255, 255, 0.06)",
                }}
            />
            <SidebarFooter className="h-[56px] justify-center p-0">
                <div className="flex h-full w-full items-center justify-between px-4">
                    <div className="flex min-w-0 items-center gap-2">
                        <div
                            className="flex size-[26px] shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: "rgba(13, 10, 7, 0.90)",
                                border: "1px solid rgba(201, 168, 76, 0.4)",
                            }}
                        >
                            <span className="font-sans text-[11px] font-medium text-[var(--color-accent-gold)]">
                                {avatarInitial}
                            </span>
                        </div>
                        <span className="min-w-0 truncate font-sans text-[12px] text-[var(--color-text-primary)]">
                            {footerLabel}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="ml-2 shrink-0 text-[var(--color-text-secondary)] transition-colors duration-[120ms] hover:text-[var(--color-text-primary)]"
                        aria-label={nb.chat.logout}
                    >
                        <LogOut size={13} />
                    </button>
                </div>
            </SidebarFooter>
        </SidebarRoot>
    );
}
