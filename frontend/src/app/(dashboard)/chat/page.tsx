import { redirect } from "next/navigation";
import ChatLayout from "@/app/(dashboard)/chat/ChatLayout";
import { createServerClient } from "@/lib/supabase/server";
import type { ApiResponse, Conversation } from "@/types/api";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

function normalizeTier(value: unknown): "free" | "pro" {
    return value === "pro" ? "pro" : "free";
}

function normalizeQueriesToday(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export default async function ChatPage() {
    const supabase = await createServerClient();
    // SECURITY: Protected chat route validates the Supabase session server-side before rendering.
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
        redirect("/login");
    }

    const {
        data: { session },
    } = await supabase.auth.getSession();

    let initialConversations: Conversation[] = [];
    let tier: "free" | "pro" = "free";
    let queriesToday = 0;

    const { data: profile } = await supabase
        .from("profiles")
        .select("tier, queries_today")
        .eq("id", user.id)
        .single();

    tier = normalizeTier(profile?.tier);
    queriesToday = normalizeQueriesToday(profile?.queries_today);

    if (backendUrl && session?.access_token) {
        const response = await fetch(`${backendUrl}/api/v1/conversations`, {
            headers: {
                Authorization: `Bearer ${session.access_token}`,
            },
            cache: "no-store",
        });

        if (response.ok) {
            const result = (await response.json()) as ApiResponse<Conversation[]>;
            initialConversations = result.data ?? [];
        }
    }

    return (
        <ChatLayout
            initialConversations={initialConversations}
            userEmail={user.email ?? ""}
            tier={tier}
            queriesToday={queriesToday}
        />
    );
}
