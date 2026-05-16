import type { Metadata } from "next";
import Link from "next/link";
import WaitlistForm from "@/components/landing/WaitlistForm";
import { nb } from "@/lib/nb";

export const metadata: Metadata = {
    title: "Paragraf -- Juridisk hjelp for norske gründere",
    description: nb.landing.subline,
};

export default function LandingPage() {
    return (
        <main className="relative min-h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text-primary)]">
            <div
                aria-hidden="true"
                className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/nocturne-night.jpg')" }}
            />
            <div
                aria-hidden="true"
                className="fixed inset-0 z-0"
                style={{ background: "rgba(8, 6, 4, 0.48)" }}
            />
            <div
                aria-hidden="true"
                className="fixed inset-0 z-0"
                style={{
                    background:
                        "radial-gradient(circle at top center, rgba(201, 168, 76, 0.12), transparent 34%), linear-gradient(180deg, rgba(6, 5, 4, 0.24), rgba(6, 5, 4, 0.52))",
                }}
            />

            <div className="relative z-10 flex min-h-screen flex-col">
                <div className="flex justify-end px-6 pt-6 sm:px-10 sm:pt-8">
                    <Link
                        href="/login"
                        className="landing-login rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 hover:text-[var(--color-text-primary)]"
                        style={{
                            background: "var(--color-surface)",
                            borderColor: "var(--color-border)",
                            color: "var(--color-text-muted)",
                            backdropFilter: "blur(14px)",
                            WebkitBackdropFilter: "blur(14px)",
                        }}
                    >
                        {nb.landing.loginButton}
                    </Link>
                </div>

                <div className="flex flex-1 items-center justify-center px-6 py-12 sm:px-10 sm:py-16 lg:px-12">
                    <section
                        className="w-full max-w-[520px] rounded-[2rem] border p-8 shadow-[0_24px_80px_rgba(0,0,0,0.42)] sm:p-10"
                        style={{
                            background: "var(--color-surface)",
                            borderColor: "var(--color-border)",
                            backdropFilter: "blur(24px)",
                            WebkitBackdropFilter: "blur(24px)",
                            isolation: "isolate",
                        }}
                    >
                        <p
                            className="mb-6 text-sm uppercase tracking-[0.28em]"
                            style={{
                                color: "var(--color-accent)",
                                fontFamily: "var(--font-dm-sans), sans-serif",
                                fontWeight: 500,
                            }}
                        >
                            {nb.landing.wordmark}
                        </p>

                        <h1
                            className="max-w-xl text-4xl leading-[1.02] tracking-[-0.015em] sm:text-5xl lg:text-6xl"
                            style={{
                                fontFamily: "var(--font-dm-serif), serif",
                                color: "var(--color-text-primary)",
                            }}
                        >
                            {nb.landing.tagline}
                        </h1>

                        <p
                            className="mt-5 max-w-xl text-base leading-7 sm:text-[1.05rem]"
                            style={{
                                color: "var(--color-text-muted)",
                                fontFamily: "var(--font-dm-sans), sans-serif",
                            }}
                        >
                            {nb.landing.subline}
                        </p>

                        <div className="mt-9 max-w-xl">
                            <WaitlistForm />
                        </div>

                        <p
                            className="mt-6 max-w-xl text-xs leading-6"
                            style={{
                                color: "rgba(240, 230, 211, 0.35)",
                                fontFamily: "var(--font-dm-sans), sans-serif",
                            }}
                        >
                            {nb.landing.disclaimer}
                        </p>
                    </section>
                </div>
            </div>

            <style>{`
                :root {
                    --color-bg: #0d0b08;
                    --color-surface: rgba(20, 16, 12, 0.55);
                    --color-border: rgba(255, 255, 255, 0.08);
                    --color-text-primary: #f0e6d3;
                    --color-text-muted: rgba(240, 230, 211, 0.55);
                    --color-accent: #c9a84c;
                    --color-accent-hover: #e0bc62;
                    --color-error: #c8401a;
                }
                .landing-input:focus-visible {
                    outline: 2px solid rgba(201, 168, 76, 0.6);
                    outline-offset: 0;
                    border-color: rgba(201, 168, 76, 0.45) !important;
                }
                .landing-btn:focus-visible {
                    outline: 2px solid rgba(201, 168, 76, 0.7);
                    outline-offset: 2px;
                }
                .landing-btn:not(:disabled):hover {
                    background: var(--color-accent-hover) !important;
                }
                .landing-login:focus-visible {
                    outline: 2px solid rgba(201, 168, 76, 0.7);
                    outline-offset: 2px;
                }
            `}</style>
        </main>
    );
}
