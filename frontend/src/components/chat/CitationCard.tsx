import type { Citation } from "@/types/api";

interface CitationCardProps {
    citation: Citation;
}

function getLawTag(law: string): string {
    const [firstWord] = law.trim().split(/\s+/);
    return firstWord || "Lovdata";
}

export default function CitationCard({ citation }: CitationCardProps) {
    const isLovdataUrl = citation.url.startsWith("https://lovdata.no");

    return (
        <div className="rounded border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-slate-900 px-2 py-0.5 font-medium text-slate-50">
                    {getLawTag(citation.law)}
                </span>
                <span className="font-medium text-slate-900">
                    {citation.section}
                </span>
                {citation.sectionTitle ? (
                    <span className="text-slate-500">{citation.sectionTitle}</span>
                ) : null}
            </div>
            <div className="mt-1 break-all text-slate-500">
                {isLovdataUrl ? (
                    <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded border border-transparent hover:border-slate-400 hover:text-slate-900"
                    >
                        → {citation.url}
                    </a>
                ) : (
                    <span>→ {citation.url}</span>
                )}
            </div>
        </div>
    );
}
