import { Badge } from "@/components/ui/badge";
import { nb } from "@/lib/nb";
import { cn } from "@/lib/utils";

interface TierBadgeProps {
    tier: "free" | "pro";
    usageLabel?: string;
}

export default function TierBadge({ tier, usageLabel }: TierBadgeProps) {
    if (tier === "pro") {
        return (
            <Badge
                className="border-transparent bg-[var(--color-accent-gold)] font-sans text-[11px] font-medium uppercase tracking-wide text-[#1a1008] hover:bg-[var(--color-accent-gold)]"
            >
                {nb.settings.pro}
            </Badge>
        );
    }

    return (
        <div className="flex flex-col items-start gap-1">
            <Badge
                variant="outline"
                className={cn(
                    "border-[var(--color-border-whisper)] bg-transparent font-sans text-[11px] font-medium uppercase tracking-wide",
                    "text-[var(--color-text-secondary)]"
                )}
            >
                {nb.settings.free}
            </Badge>
            <p className="font-sans text-[11px] text-[var(--color-text-secondary)]">
                {usageLabel ?? nb.chat.freeUsage}
            </p>
        </div>
    );
}
