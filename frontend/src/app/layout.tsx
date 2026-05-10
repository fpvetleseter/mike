import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const dmSans = DM_Sans({
    variable: "--font-dm-sans",
    subsets: ["latin"],
    weight: ["300", "400", "500"],
});

const dmSerifDisplay = DM_Serif_Display({
    variable: "--font-dm-serif-display",
    subsets: ["latin"],
    weight: "400",
});

export const metadata: Metadata = {
    title: "Juridisk",
    description: "AI-drevet juridisk assistent for norske gründere.",
    icons: {
        icon: [
            { url: "/icon.svg", type: "image/svg+xml" },
            { url: "/favicon.ico" },
        ],
        apple: "/apple-touch-icon.png",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="nb">
            <body
                className={`${dmSans.variable} ${dmSerifDisplay.variable} font-sans antialiased`}
            >
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
