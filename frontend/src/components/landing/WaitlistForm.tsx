"use client";

import { useRef, useState, type FormEvent } from "react";
import { nb } from "@/lib/nb";

type FormState = "idle" | "loading" | "success" | "error";
type ErrorCode = "invalid_email" | "already_signed_up" | "server_error" | null;

function getErrorMessage(code: ErrorCode): string {
    if (code === "invalid_email") return nb.landing.errorInvalidEmail;
    if (code === "already_signed_up") return nb.landing.errorAlreadySignedUp;
    return nb.landing.errorGeneric;
}

function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export default function WaitlistForm() {
    const [email, setEmail] = useState("");
    const [state, setState] = useState<FormState>("idle");
    const [errorCode, setErrorCode] = useState<ErrorCode>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();

        if (state === "loading") {
            return;
        }

        const trimmed = email.trim();
        if (!trimmed || !isValidEmail(trimmed)) {
            setErrorCode("invalid_email");
            setState("error");
            inputRef.current?.focus();
            return;
        }

        setState("loading");
        setErrorCode(null);

        try {
            const res = await fetch("/api/waitlist", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ email: trimmed }),
            });

            if (res.status === 201) {
                setState("success");
                return;
            }

            const data = (await res.json().catch(() => ({}))) as {
                error?: string;
            };
            const code = (data.error ?? "server_error") as ErrorCode;
            setErrorCode(code);
            setState("error");
        } catch {
            setErrorCode("server_error");
            setState("error");
        }
    }

    if (state === "success") {
        return (
            <div
                className="rounded-xl border p-6 text-center"
                style={{
                    background: "rgba(201, 168, 76, 0.08)",
                    borderColor: "rgba(201, 168, 76, 0.25)",
                }}
            >
                <p
                    className="mb-1 text-lg"
                    style={{
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-dm-serif), serif",
                    }}
                >
                    {nb.landing.successHeadline}
                </p>
                <p
                    className="text-sm"
                    style={{ color: "var(--color-text-muted)" }}
                >
                    {nb.landing.successBody}
                </p>
            </div>
        );
    }

    return (
        <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 sm:flex-row">
                <input
                    ref={inputRef}
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => {
                        setEmail(event.target.value);
                        if (state === "error") {
                            setState("idle");
                            setErrorCode(null);
                        }
                    }}
                    placeholder={nb.landing.emailPlaceholder}
                    aria-label={nb.landing.emailPlaceholder}
                    aria-invalid={state === "error"}
                    aria-describedby={state === "error" ? "waitlist-error" : undefined}
                    disabled={state === "loading"}
                    className="landing-input min-w-0 flex-1 rounded-lg px-4 py-3 text-sm transition-colors placeholder:text-[rgba(240,230,211,0.45)]"
                    style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        border: state === "error"
                            ? "1px solid rgba(200, 64, 26, 0.6)"
                            : "1px solid rgba(255, 255, 255, 0.12)",
                        color: "var(--color-text-primary)",
                        fontFamily: "var(--font-dm-sans), sans-serif",
                    }}
                />
                <button
                    type="submit"
                    disabled={state === "loading"}
                    aria-busy={state === "loading"}
                    className="landing-btn rounded-lg px-6 py-3 text-sm font-medium transition-all"
                    style={{
                        background: state === "loading"
                            ? "rgba(201, 168, 76, 0.65)"
                            : "var(--color-accent)",
                        color: "#0d0b08",
                        cursor: state === "loading" ? "not-allowed" : "pointer",
                        fontFamily: "var(--font-dm-sans), sans-serif",
                        whiteSpace: "nowrap",
                    }}
                >
                    {state === "loading"
                        ? nb.landing.ctaLoading
                        : nb.landing.ctaButton}
                </button>
            </div>

            {state === "error" && errorCode && (
                <p
                    id="waitlist-error"
                    role="alert"
                    className="text-xs leading-5"
                    style={{
                        color: "var(--color-error)",
                        fontFamily: "var(--font-dm-sans), sans-serif",
                    }}
                >
                    {getErrorMessage(errorCode)}
                </p>
            )}
        </form>
    );
}
