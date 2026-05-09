import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const publicRoutes = new Set([
    "/",
    "/login",
    "/callback",
    "/personvern",
    "/vilkar",
]);

function isProtectedPath(pathname: string): boolean {
    return pathname === "/chat" || pathname.startsWith("/chat/");
}

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
        return response;
    }

    // SECURITY: Middleware refreshes the Supabase session before protected pages render.
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
        cookies: {
            getAll() {
                return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
                cookiesToSet.forEach(({ name, value }) => {
                    request.cookies.set(name, value);
                });
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => {
                    response.cookies.set(name, value, options);
                });
            },
        },
    });

    const pathname = request.nextUrl.pathname;

    if (publicRoutes.has(pathname)) {
        await supabase.auth.getUser();
        return response;
    }

    if (isProtectedPath(pathname)) {
        const {
            data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
            const redirectUrl = request.nextUrl.clone();
            redirectUrl.pathname = "/login";
            redirectUrl.searchParams.set("redirectedFrom", pathname);
            return NextResponse.redirect(redirectUrl);
        }
    }

    return response;
}

export const config = {
    matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
