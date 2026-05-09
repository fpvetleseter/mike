export interface Message {
    id: string;
    conversation_id: string;
    role: "user" | "assistant";
    content: string;
    citations: Citation[];
    model?: string;
    created_at: string;
}

export interface Citation {
    law: string;
    section: string;
    url: string;
    sectionTitle?: string;
}

export interface Conversation {
    id: string;
    user_id: string;
    document_id?: string;
    title?: string;
    created_at: string;
    updated_at: string;
}

export interface Document {
    id: string;
    user_id: string;
    filename: string;
    status: "processing" | "ready" | "error";
    page_count?: number;
    extracted_text_preview?: string;
    created_at: string;
}

export interface ApiResponse<T> {
    data: T | null;
    error: string | null;
}
