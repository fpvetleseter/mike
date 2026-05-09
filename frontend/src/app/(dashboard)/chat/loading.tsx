export default function ChatLoading() {
    return (
        <div className="flex h-screen bg-white">
            <aside className="hidden w-[260px] border-r border-slate-200 bg-slate-50 p-3 md:block">
                <div className="mb-5 h-11 rounded bg-slate-200" />
                <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, index) => (
                        <div
                            key={index}
                            className="h-14 animate-pulse rounded bg-slate-200"
                        />
                    ))}
                </div>
            </aside>
            <main className="flex flex-1 flex-col">
                <div className="h-14 border-b border-slate-200" />
                <div className="flex-1 space-y-5 p-6">
                    <div className="h-20 w-3/4 animate-pulse rounded-2xl bg-slate-100" />
                    <div className="ml-auto h-16 w-1/2 animate-pulse rounded-2xl bg-slate-200" />
                    <div className="h-24 w-2/3 animate-pulse rounded-2xl bg-slate-100" />
                </div>
                <div className="h-28 border-t border-slate-200 bg-slate-50" />
            </main>
        </div>
    );
}
