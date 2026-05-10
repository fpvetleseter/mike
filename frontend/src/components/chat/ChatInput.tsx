"use client";

import { useEffect, useRef, useState } from "react";
import { nb } from "@/lib/nb";

interface ChatInputProps {
    onSend: (message: string) => void;
    isStreaming: boolean;
    disabled?: boolean;
}

export default function ChatInput({
    onSend,
    isStreaming,
    disabled = false,
}: ChatInputProps) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }, [value]);

    function sendMessage() {
        const trimmed = value.trim();
        if (!trimmed || isStreaming || disabled) return;
        onSend(trimmed);
        setValue("");
    }

    return (
        <div className="bg-white px-4 py-3">
            <div className="flex items-end gap-3">
                <textarea
                    ref={textareaRef}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            sendMessage();
                        }
                    }}
                    rows={1}
                    disabled={disabled || isStreaming}
                    placeholder={nb.chat.placeholder}
                    className="min-h-11 flex-1 resize-none border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                <button
                    type="button"
                    onClick={sendMessage}
                    disabled={disabled || isStreaming || value.trim().length === 0}
                    className="min-h-11 min-w-20 bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                    {isStreaming ? (
                        <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                        nb.chat.send
                    )}
                </button>
            </div>
        </div>
    );
}
