"use client";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { nb } from "@/lib/nb";

interface AttachedFilePillProps {
    filename: string;
    onRemove: () => void;
}

function truncateFilename(filename: string): string {
    return filename.length > 24 ? `${filename.slice(0, 21)}...` : filename;
}

export default function AttachedFilePill({
    filename,
    onRemove,
}: AttachedFilePillProps) {
    return (
        <div className="inline-flex max-w-full animate-[attachedFileIn_150ms_ease-out] items-center gap-2 rounded-md bg-[var(--color-accent-amber)] px-2.5 py-1 font-sans text-xs font-medium text-[var(--color-text-primary)]">
            <span className="truncate">{truncateFilename(filename)}</span>
            <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={nb.chat.removeFile}
                onClick={onRemove}
                className="size-5 rounded-sm text-[var(--color-text-primary)] hover:bg-black/10 hover:text-[var(--color-text-primary)]"
            >
                <X data-icon="inline-start" className="size-3" aria-hidden="true" />
            </Button>
        </div>
    );
}
