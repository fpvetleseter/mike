// SECURITY: This route writes to Airtable using a server-side token.
// The token is never exposed to the client.
// AIRTABLE_API_TOKEN and AIRTABLE_BASE_ID are backend-only env vars.
// They must never be prefixed with NEXT_PUBLIC_.

import { NextRequest, NextResponse } from "next/server";

const AIRTABLE_API_TOKEN = process.env.AIRTABLE_API_TOKEN;
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_TABLE_ID = process.env.AIRTABLE_TABLE_ID;

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(req: NextRequest): Promise<NextResponse> {
    try {
        const body = (await req.json()) as { email?: unknown };
        const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

        if (!email || !isValidEmail(email)) {
            return NextResponse.json({ error: "invalid_email" }, { status: 400 });
        }

        if (!AIRTABLE_API_TOKEN || !AIRTABLE_BASE_ID || !AIRTABLE_TABLE_ID) {
            console.error("[waitlist] Missing Airtable env vars");
            return NextResponse.json({ error: "server_error" }, { status: 500 });
        }

        const airtableRes = await fetch(
            `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`,
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${AIRTABLE_API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    fields: {
                        Email: email,
                        Created: new Date().toISOString(),
                    },
                }),
            }
        );

        if (!airtableRes.ok) {
            const errBody = await airtableRes.json().catch(() => ({}));
            const errMsg = JSON.stringify(errBody);

            // Airtable returns 422 with INVALID_VALUE_FOR_COLUMN for duplicate
            // unique field -- check for that specifically.
            if (airtableRes.status === 422 && errMsg.includes("INVALID_VALUE")) {
                return NextResponse.json(
                    { error: "already_signed_up" },
                    { status: 409 }
                );
            }

            console.error("[waitlist] Airtable error", airtableRes.status, errBody);
            return NextResponse.json({ error: "server_error" }, { status: 500 });
        }

        return NextResponse.json({ success: true }, { status: 201 });
    } catch (err) {
        console.error("[waitlist] Unexpected error", err);
        return NextResponse.json({ error: "server_error" }, { status: 500 });
    }
}

// Only POST is allowed
export async function GET(): Promise<NextResponse> {
    return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
