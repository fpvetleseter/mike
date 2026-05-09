import { redirect } from "next/navigation";
import ChatLayout from "@/app/(dashboard)/chat/ChatLayout";
import { createServerClient } from "@/lib/supabase/server";
import type { ApiResponse, Conversation } from "@/types/api";

const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

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

    return <ChatLayout initialConversations={initialConversations} />;
}
