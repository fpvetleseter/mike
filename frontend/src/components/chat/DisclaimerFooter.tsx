import { nb } from "@/lib/nb";

export default function DisclaimerFooter() {
    return (
        <footer className="px-4 pb-3 pt-2 text-center font-sans text-[11px] font-light text-[var(--color-text-secondary)] md:pb-4">
            {nb.disclaimer.persistent}
        </footer>
    );
}
