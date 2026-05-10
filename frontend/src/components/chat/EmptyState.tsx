"use client";

import { Paperclip } from "lucide-react";

import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    onSuggestion: (suggestion: string) => void;
    disabled?: boolean;
}

export default function EmptyState({
    onSuggestion,
    disabled = false,
}: EmptyStateProps) {
    return (
        <section className="flex min-h-full items-center justify-center px-5 py-12">
            <div className="flex w-full max-w-[720px] flex-col items-center gap-12">
                <div className="text-center">
                    <h1 className="font-serif text-[28px] font-normal leading-tight text-[var(--color-text-primary)]">
                        {nb.chat.wordmark}
                    </h1>
                    <p 
                        className="mt-3 font-sans text-[15px] font-light text-[var(--color-accent-gold)]"
                        style={{ textShadow: "0 1px 12px rgba(0, 0, 0, 0.8)" }}
                    >
                        {nb.chat.emptySubtitle}
                    </p>
                </div>
                <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-2">
                    {nb.chat.suggestions.map((suggestion, index) => (
                        <button
                            key={suggestion}
                            type="button"
                            disabled={disabled}
                            onClick={() => onSuggestion(suggestion)}
                            className={cn(
                                "glass-surface relative min-h-24 rounded-xl border border-[var(--color-border-whisper)] bg-[var(--color-surface-card)] p-5 text-left",
                                "font-sans text-sm font-normal leading-6 text-[var(--color-text-primary)] transition duration-200 ease-out",
                                "hover:-translate-y-0.5 hover:border-[var(--color-border-focus)] disabled:pointer-events-none disabled:opacity-50"
                            )}
                        >
                            {index === 1 ? (
                                <Paperclip
                                    aria-hidden="true"
                                    className="absolute right-5 top-5 size-3.5 text-[var(--color-accent-gold)]"
                                />
                            ) : null}
                            <span className="block pr-6">{suggestion}</span>
                        </button>
                    ))}
                </div>
                <p className="text-center font-sans text-xs text-[var(--color-text-secondary)]">
                    {nb.chat.emptyHint}
                </p>
            </div>
        </section>
    );
}
