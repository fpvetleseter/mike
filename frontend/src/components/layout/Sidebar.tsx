"use client";

import { useEffect, useState } from "react";
import { FileText, LogOut, Paperclip, Plus } from "lucide-react";

import { ScrollArea } from "@/components/ui/scroll-area";
import {
    Sidebar as SidebarRoot,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
} from "@/components/ui/sidebar";
import { nb } from "@/lib/nb";
import { cn, safeFormatDate } from "@/lib/utils";
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

function formatDate(dateString: string): string {
    const fallback = safeFormatDate(dateString);
    if (!fallback) return "";

    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return nb.chat.today;
    if (date.toDateString() === yesterday.toDateString()) return nb.chat.yesterday;

    return fallback;
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
    const showUpgradeCard = tier === "free" && queriesUsed >= 6;
    const showAmbientCopy = tier === "free" && queriesUsed < 6;

    const [cardVisible, setCardVisible] = useState(false);
    useEffect(() => {
        if (showUpgradeCard) {
            const t = window.setTimeout(() => setCardVisible(true), 40);
            return () => window.clearTimeout(t);
        }
    }, [showUpgradeCard]);

    const avatarInitial = userEmail ? userEmail[0].toUpperCase() : "?";
    const truncatedEmail =
        userEmail.length > 22 ? userEmail.slice(0, 22) + "…" : userEmail;

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
            <SidebarHeader className="h-[72px] flex-col justify-center px-6">
                <span className="font-serif text-[20px] font-normal leading-none text-[var(--color-text-primary)]">
                    {nb.chat.wordmark}
                </span>
                <div
                    style={{
                        width: 28,
                        height: 2,
                        background: "rgba(201, 168, 76, 0.60)",
                        marginTop: 8,
                    }}
                />
            </SidebarHeader>
            <div className="h-px w-full bg-[var(--color-border-whisper)]" />

            <SidebarContent>
                {/* Zone 2 — Usage */}
                <div className="px-4 pb-2 pt-3">
                    <p
                        className="mb-1.5 font-sans text-[11px] text-[var(--color-text-secondary)]"
                        style={{ paddingBottom: 6 }}
                    >
                        {nb.sidebar.queriesUsed(queriesUsed, 10)}
                    </p>
                    <div
                        style={{
                            height: 4,
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
                </div>

                {/* Zone 2b — Ambient copy or upgrade card */}
                <div className="px-3 pb-2 pt-1">
                    {showAmbientCopy && (
                        <p
                            className="px-1 font-sans text-[11px] font-light italic text-[var(--color-text-secondary)]"
                            style={{ opacity: 0.5 }}
                        >
                            {nb.sidebar.ambientCopy}
                        </p>
                    )}
                    {showUpgradeCard && (
                        <div
                            className="flex flex-col gap-3 rounded-[10px] p-[14px]"
                            style={{
                                background: "rgba(201, 168, 76, 0.07)",
                                border: "1px solid rgba(201, 168, 76, 0.28)",
                                backdropFilter: "blur(10px)",
                                WebkitBackdropFilter: "blur(10px)",
                                opacity: cardVisible ? 1 : 0,
                                transform: cardVisible
                                    ? "translateY(0)"
                                    : "translateY(4px)",
                                transition:
                                    "opacity 300ms ease-out, transform 300ms ease-out",
                                animation: isAtLimit
                                    ? "pulse-bar 700ms ease-in-out forwards"
                                    : undefined,
                            }}
                        >
                            <div className="flex flex-col gap-1">
                                <p className="font-sans text-[13px] font-medium text-[var(--color-accent-gold)]">
                                    {nb.sidebar.upgradeTitle}
                                </p>
                                <p className="font-sans text-[11px] font-light text-[var(--color-text-secondary)]">
                                    {nb.sidebar.upgradeSubtitle}
                                </p>
                            </div>
                            <UpgradeButton onClick={onUpgrade} />
                            {isAtLimit && (
                                <p className="font-sans text-[11px] text-[var(--color-text-secondary)]">
                                    {nb.sidebar.limitReached}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Zone 3 — New conversation */}
                <div className="px-3">
                    <NewConversationButton onClick={onNewConversation} />
                </div>
                <div className="my-[10px] h-px w-full bg-[var(--color-border-whisper)]" />

                {/* Zone 4 — Conversation list */}
                <div className="min-h-0 flex-1">
                    <ScrollArea className="h-full">
                        {isLoading ? (
                            <div className="flex flex-col gap-2 px-4 py-2">
                                {Array.from({ length: 5 }).map((_, i) => (
                                    <div
                                        key={i}
                                        className="h-12 w-full animate-pulse rounded-md bg-white/5"
                                    />
                                ))}
                            </div>
                        ) : conversations.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-[10px] px-6 py-8 text-center">
                                <FileText
                                    className="size-[22px]"
                                    style={{
                                        color: "var(--color-text-secondary)",
                                        opacity: 0.35,
                                    }}
                                />
                                <div>
                                    <p
                                        className="font-sans text-[13px] text-[var(--color-text-secondary)]"
                                        style={{ opacity: 0.6 }}
                                    >
                                        {nb.sidebar.noConversations}
                                    </p>
                                    <p
                                        className="mt-1.5 flex items-center justify-center gap-1 font-sans text-[12px] font-light text-[var(--color-text-secondary)]"
                                        style={{ opacity: 0.55 }}
                                    >
                                        <Paperclip
                                            className="inline size-3"
                                            style={{
                                                color: "var(--color-accent-gold)",
                                                opacity: 0.7,
                                            }}
                                        />
                                        {nb.sidebar.noConversationsHint}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col">
                                {conversations.map((conversation) => {
                                    const active =
                                        activeConversationId === conversation.id;
                                    return (
                                        <button
                                            key={conversation.id}
                                            type="button"
                                            onClick={() =>
                                                onSelectConversation(conversation.id)
                                            }
                                            className={cn(
                                                "relative flex flex-col gap-0.5 px-4 py-3 text-left transition-colors duration-[120ms] hover:bg-white/[0.04]",
                                                active && "bg-[rgba(201,168,76,0.07)]"
                                            )}
                                        >
                                            {active && (
                                                <div className="absolute left-0 top-0 h-full w-[2px] bg-[var(--color-accent-gold)]" />
                                            )}
                                            <span className="text-right font-sans text-[10px] text-[var(--color-text-secondary)]">
                                                {formatDate(conversation.updated_at)}
                                            </span>
                                            <span className="truncate font-sans text-[13px] text-[var(--color-text-primary)]">
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
            <div className="h-px w-full bg-[var(--color-border-whisper)]" />
            <SidebarFooter className="h-[56px] justify-center p-0">
                <div className="group flex h-full w-full items-center justify-between px-4 transition-colors duration-[120ms] hover:bg-white/[0.03]">
                    <div className="flex items-center gap-[10px]">
                        <div
                            className="flex size-7 shrink-0 items-center justify-center rounded-full"
                            style={{
                                background: "rgba(13, 10, 7, 0.80)",
                                border: "1px solid rgba(201, 168, 76, 0.5)",
                            }}
                        >
                            <span className="font-sans text-[12px] font-medium text-[var(--color-accent-gold)]">
                                {avatarInitial}
                            </span>
                        </div>
                        <p className="font-sans text-[11px] text-[var(--color-text-secondary)]">
                            {truncatedEmail}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onLogout}
                        className="text-[var(--color-text-secondary)] transition-colors duration-[120ms] hover:text-[var(--color-text-primary)]"
                        aria-label={nb.chat.logout}
                    >
                        <LogOut className="size-[14px]" />
                    </button>
                </div>
            </SidebarFooter>
        </SidebarRoot>
    );
}

function UpgradeButton({ onClick }: { onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="w-full rounded-[6px] py-2 font-sans text-[12px] font-medium uppercase tracking-wide text-[var(--color-accent-gold)]"
            style={{
                background: hovered ? "rgba(201, 168, 76, 0.10)" : "transparent",
                border: hovered
                    ? "1px solid rgba(201, 168, 76, 0.80)"
                    : "1px solid rgba(201, 168, 76, 0.50)",
                transition: "background 150ms, border-color 150ms",
            }}
        >
            {nb.sidebar.upgradeButton}
        </button>
    );
}

function NewConversationButton({ onClick }: { onClick: () => void }) {
    const [hovered, setHovered] = useState(false);
    return (
        <button
            type="button"
            onClick={onClick}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            className="flex w-full items-center gap-2 rounded-[8px] px-4 py-[10px] font-sans text-[13px] text-[var(--color-text-primary)]"
            style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: hovered
                    ? "1px solid var(--color-border-focus)"
                    : "1px solid var(--color-border-whisper)",
                backgroundColor: hovered
                    ? "rgba(201, 168, 76, 0.06)"
                    : "rgba(255, 255, 255, 0.04)",
                transition: "background-color 150ms, border-color 150ms",
            }}
        >
            <Plus
                className="size-[14px]"
                style={{
                    color: hovered
                        ? "var(--color-accent-gold)"
                        : "var(--color-text-secondary)",
                    transition: "color 150ms",
                }}
            />
            {nb.sidebar.newConversation}
        </button>
    );
}
