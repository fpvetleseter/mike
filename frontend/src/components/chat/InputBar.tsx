"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Paperclip } from "lucide-react";

import AttachedFilePill from "@/components/ui/AttachedFilePill";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";

interface InputBarProps {
    onSend: (message: string) => void;
    onFileSelected: (file: File) => void;
    onClearFile: () => void;
    isStreaming: boolean;
    disabled?: boolean;
    attachedFileName?: string | null;
    uploadRequestId: number;
}

export default function InputBar({
    onSend,
    onFileSelected,
    onClearFile,
    isStreaming,
    disabled = false,
    attachedFileName,
    uploadRequestId,
}: InputBarProps) {
    const [value, setValue] = useState("");
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const hasContent = value.trim().length > 0;

    useEffect(() => {
        const textarea = textareaRef.current;
        if (!textarea) return;

        textarea.style.height = "auto";
        textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
    }, [value]);

    useEffect(() => {
        if (uploadRequestId > 0) {
            fileInputRef.current?.click();
        }
    }, [uploadRequestId]);

    function sendMessage() {
        const trimmed = value.trim();
        if (!trimmed || isStreaming || disabled) return;
        onSend(trimmed);
        setValue("");
    }

    return (
        <div className="glass-surface-strong rounded-[14px] border border-[var(--color-border-whisper)] bg-[var(--color-surface-input)] px-4 py-3 transition duration-150 focus-within:border-[var(--color-border-focus)]">
            <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                onChange={(event) => {
                    const file = event.target.files?.item(0);
                    if (file) {
                        onFileSelected(file);
                    }
                    event.currentTarget.value = "";
                }}
            />
            {attachedFileName ? (
                <div className="mb-2 flex">
                    <AttachedFilePill
                        filename={attachedFileName}
                        onRemove={onClearFile}
                    />
                </div>
            ) : null}
            <div className="flex items-end gap-2">
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={nb.chat.openFilePicker}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isStreaming}
                    className="size-9 shrink-0 rounded-md text-[var(--color-text-secondary)] transition duration-150 hover:bg-transparent hover:text-[var(--color-accent-gold)] disabled:opacity-40"
                >
                    <Paperclip aria-hidden="true" className="size-[18px]" />
                </Button>
                <Textarea
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
                    className="max-h-36 min-h-9 flex-1 resize-none border-0 bg-transparent px-1 py-2 font-sans text-[15px] leading-6 text-[var(--color-text-primary)] shadow-none outline-none placeholder:text-[var(--color-text-secondary)] focus-visible:border-transparent focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50"
                />
                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={nb.chat.send}
                    onClick={sendMessage}
                    disabled={disabled || isStreaming || !hasContent}
                    className={cn(
                        "size-9 shrink-0 rounded-md transition duration-150 hover:bg-transparent disabled:opacity-40",
                        hasContent
                            ? "text-[var(--color-accent-gold)]"
                            : "text-[var(--color-text-secondary)]"
                    )}
                >
                    <ArrowUp aria-hidden="true" className="size-[18px]" />
                </Button>
            </div>
        </div>
    );
}
