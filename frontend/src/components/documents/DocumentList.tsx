"use client";

import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";
import type { Document } from "@/types/api";

interface DocumentListProps {
    documents: Document[];
    onSelectDocument: (id: string) => void;
    activeDocumentId: string | null;
    isLoading: boolean;
}

function truncateFilename(filename: string): string {
    return filename.length > 24 ? `${filename.slice(0, 21)}...` : filename;
}

function getStatus(document: Document): {
    label: string;
    className: string;
} {
    if (document.status === "ready") {
        return {
            label: nb.upload.ready,
            className: "bg-emerald-50 text-emerald-700",
        };
    }

    if (document.status === "error") {
        return {
            label: "Feil",
            className: "bg-red-50 text-red-700",
        };
    }

    return {
        label: nb.upload.processing,
        className: "animate-pulse bg-amber-50 text-amber-700",
    };
}

export default function DocumentList({
    documents,
    onSelectDocument,
    activeDocumentId,
    isLoading,
}: DocumentListProps) {
    return (
        <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                {nb.chat.documents}
            </p>
            {isLoading
                ? Array.from({ length: 3 }).map((_, index) => (
                      <div
                          key={index}
                          className="h-12 animate-pulse rounded bg-slate-100"
                      />
                  ))
                : null}
            {!isLoading && documents.length === 0 ? (
                <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                    Ingen dokumenter lastet opp ennå.
                </p>
            ) : null}
            {!isLoading
                ? documents.map((document) => {
                      const status = getStatus(document);
                      return (
                          <button
                              key={document.id}
                              type="button"
                              onClick={() => onSelectDocument(document.id)}
                              className={cn(
                                  "min-h-11 w-full rounded border border-slate-200 bg-white px-3 py-2 text-left transition hover:border-slate-300",
                                  activeDocumentId === document.id &&
                                      "border-blue-200 bg-blue-50"
                              )}
                          >
                              <span className="flex items-center justify-between gap-3">
                                  <span className="truncate text-sm font-medium text-slate-900">
                                      {truncateFilename(document.filename)}
                                  </span>
                                  <span
                                      className={cn(
                                          "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                                          status.className
                                      )}
                                  >
                                      {status.label}
                                  </span>
                              </span>
                          </button>
                      );
                  })
                : null}
        </div>
    );
}
