"use client";

import { useRef, useState } from "react";
import { createBrowserClient } from "@/lib/supabase/client";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type { ApiResponse, Document } from "@/types/api";

interface DocumentUploadProps {
    onUploadComplete: (document: Document) => void;
}

interface UploadResponseData {
    documentId: string;
    status: Document["status"];
}

const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isUploadResponseData(value: unknown): value is UploadResponseData {
    if (!value || typeof value !== "object") return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record.documentId === "string" &&
        (record.status === "processing" ||
            record.status === "ready" ||
            record.status === "error")
    );
}

export default function DocumentUpload({
    onUploadComplete,
}: DocumentUploadProps) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function uploadFile(file: File): Promise<void> {
        setError(null);

        if (file.size > maxFileSize) {
            setError(nb.errors.fileTooLarge);
            return;
        }

        if (!allowedMimeTypes.has(file.type)) {
            setError(nb.errors.invalidFileType);
            return;
        }

        setIsUploading(true);

        try {
            const supabase = createBrowserClient();
            // SECURITY: The backend validates the bearer token and scopes document access to the user.
            const {
                data: { session },
            } = await supabase.auth.getSession();

            if (!session?.access_token) {
                setError(nb.errors.unauthorized);
                return;
            }

            const formData = new FormData();
            formData.append("file", file);

            const response = await fetch(
                `${process.env.NEXT_PUBLIC_BACKEND_URL}/api/v1/documents/upload`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${session.access_token}`,
                    },
                    body: formData,
                }
            );

            if (response.status === 413) {
                setError(nb.errors.fileTooLarge);
                return;
            }

            if (!response.ok) {
                setError(nb.errors.generic);
                return;
            }

            const result = (await response.json()) as ApiResponse<unknown>;
            if (!isUploadResponseData(result.data)) {
                setError(nb.errors.generic);
                return;
            }

            onUploadComplete({
                id: result.data.documentId,
                user_id: "",
                filename: file.name,
                status: result.data.status,
                created_at: new Date().toISOString(),
            });
            if (inputRef.current) {
                inputRef.current.value = "";
            }
        } catch {
            setError(nb.errors.generic);
        } finally {
            setIsUploading(false);
        }
    }

    function handleFiles(files: FileList | null): void {
        const file = files?.item(0);
        if (file) {
            void uploadFile(file);
        }
    }

    return (
        <div className="space-y-3">
            <div
                onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    handleFiles(event.dataTransfer.files);
                }}
                className={cn(
                    "rounded-lg border border-dashed border-slate-300 bg-slate-100 px-4 py-5 text-center transition",
                    isDragging && "border-blue-400 bg-blue-50"
                )}
            >
                <input
                    ref={inputRef}
                    type="file"
                    accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(event) => handleFiles(event.target.files)}
                />
                <p className="hidden text-sm text-slate-600 md:block">
                    {nb.upload.drag}
                </p>
                <p className="mt-1 hidden text-xs text-slate-400 md:block">
                    {nb.upload.maxSize}
                </p>
                <div className="mt-3 flex items-center justify-center gap-3">
                    <span className="hidden text-xs text-slate-400 md:inline">
                        {nb.upload.or}
                    </span>
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        disabled={isUploading}
                        className="min-h-11 rounded border border-slate-200 bg-white px-4 text-sm font-medium text-slate-900 transition hover:border-slate-300 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                        {nb.upload.browse}
                    </button>
                </div>
            </div>
            {isUploading ? (
                <div className="space-y-2">
                    <p className="text-sm text-slate-600">{nb.loading.uploading}</p>
                    <div className="h-2 overflow-hidden rounded bg-slate-100">
                        <div className="h-full w-full animate-pulse bg-slate-900" />
                    </div>
                </div>
            ) : null}
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
        </div>
    );
}
