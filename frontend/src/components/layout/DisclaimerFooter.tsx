import { nb } from "@/lib/nb";

export default function DisclaimerFooter() {
    return (
        <footer className="sticky bottom-0 border-t border-slate-200 bg-slate-50 px-4 py-2 text-center text-xs text-slate-500">
            {nb.disclaimer.short}
        </footer>
    );
}
