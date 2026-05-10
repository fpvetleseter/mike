import { redirect } from "next/navigation";
import { nb } from "@/lib/nb";
import { createServerClient } from "@/lib/supabase/server";
import type { ApiResponse } from "@/types/api";

interface CheckoutResponse {
    url: string;
}

interface PortalResponse {
    url: string;
}

interface Profile {
    tier: "free" | "pro";
    queries_today: number;
    stripe_customer_id: string | null;
}

const FREE_DAILY_LIMIT = 10;

export default async function SettingsPage() {
    const supabase = await createServerClient();
    // SECURITY: Settings page validates the Supabase session server-side before rendering billing state.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("tier, queries_today, stripe_customer_id")
        .eq("id", user.id)
        .single();

    const safeProfile: Profile = {
        tier: profile?.tier === "pro" ? "pro" : "free",
        queries_today:
            typeof profile?.queries_today === "number"
                ? profile.queries_today
                : 0,
        stripe_customer_id:
            typeof profile?.stripe_customer_id === "string"
                ? profile.stripe_customer_id
                : null,
    };

    const isPro = safeProfile.tier === "pro";
    const usageText = isPro
        ? `${nb.settings.usageLabel} ${safeProfile.queries_today} (${nb.settings.unlimited})`
        : `${nb.settings.usageLabel} ${safeProfile.queries_today} av ${FREE_DAILY_LIMIT}`;

    return (
        <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-950 md:px-8">
            <section className="mx-auto flex max-w-3xl flex-col gap-6">
                <div className="flex flex-col gap-2">
                    <p className="text-sm font-medium text-slate-500">
                        {nb.settings.account}
                    </p>
                    <h1 className="text-2xl font-semibold tracking-normal">
                        {nb.settings.title}
                    </h1>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <p className="text-sm font-medium text-slate-500">
                                    {nb.settings.currentPlan}
                                </p>
                                <span
                                    className={
                                        isPro
                                            ? "inline-flex rounded-full bg-slate-950 px-3 py-1 text-sm font-medium text-white"
                                            : "inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700"
                                    }
                                >
                                    {isPro ? nb.settings.pro : nb.settings.free}
                                </span>
                            </div>
                            <p className="text-sm text-slate-700">
                                {usageText}
                            </p>
                        </div>

                        {isPro ? (
                            <form action={startPortalSession}>
                                <button
                                    type="submit"
                                    className="min-h-11 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                                >
                                    {nb.settings.manageSubscription}
                                </button>
                            </form>
                        ) : (
                            <form action={startCheckoutSession}>
                                <button
                                    type="submit"
                                    className="min-h-11 rounded bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
                                >
                                    {nb.settings.upgradePrice}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </section>
        </main>
    );
}

async function startCheckoutSession() {
    "use server";

    const url = await createBillingSession<CheckoutResponse>("checkout");
    redirect(url);
}

async function startPortalSession() {
    "use server";

    const url = await createBillingSession<PortalResponse>("portal");
    redirect(url);
}

async function createBillingSession<
    T extends CheckoutResponse | PortalResponse,
>(path: "checkout" | "portal"): Promise<string> {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
        throw new Error("NEXT_PUBLIC_BACKEND_URL must be set");
    }

    const supabase = await createServerClient();
    // SECURITY: Server action forwards only the current user's Supabase access token.
    const {
        data: { session },
    } = await supabase.auth.getSession();

    if (!session?.access_token) {
        redirect("/login");
    }

    const response = await fetch(`${backendUrl}/api/v1/billing/${path}`, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
    });

    const result = (await response.json()) as ApiResponse<T>;
    if (!response.ok || !result.data?.url) {
        throw new Error(result.error ?? nb.errors.generic);
    }

    return result.data.url;
}
