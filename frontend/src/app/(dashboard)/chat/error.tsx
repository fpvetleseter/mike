"use client";

import { nb } from "@/lib/nb";

interface ChatErrorProps {
    reset: () => void;
}

export default function ChatError({ reset }: ChatErrorProps) {
    return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
            <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center">
                <h2 className="text-xl font-semibold text-slate-950">
                    {nb.errors.generic}
                </h2>
                <button
                    type="button"
                    onClick={reset}
                    className="mt-5 min-h-11 rounded bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-700"
                >
                    Prøv igjen
                </button>
                <p className="mt-5 text-xs text-slate-500">{nb.disclaimer.short}</p>
            </div>
        </div>
    );
}
