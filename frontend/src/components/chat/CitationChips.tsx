import { Badge } from "@/components/ui/badge";
import { nb } from "@/lib/nb";
import type { Citation } from "@/types/api";

interface CitationChipsProps {
    citations: Citation[];
}

function formatCitation(citation: Citation): string {
    const law = citation.law.trim() || nb.chat.lovdata;
    return `${law} ${citation.section}`;
}

export default function CitationChips({ citations }: CitationChipsProps) {
    if (citations.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {citations.map((citation) => (
                <Badge
                    key={`${citation.url}-${citation.section}`}
                    variant="outline"
                    asChild
                    className="border-[var(--color-accent-gold-dim)] bg-transparent font-sans text-xs font-normal text-[var(--color-accent-gold)] transition hover:border-[var(--color-accent-gold-mid)] hover:bg-transparent"
                >
                    <a
                        href={citation.url}
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        {formatCitation(citation)}
                    </a>
                </Badge>
            ))}
        </div>
    );
}
