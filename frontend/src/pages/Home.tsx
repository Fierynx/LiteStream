import { useState } from "react";
import { Link } from "react-router-dom";
import {
    Play,
    RefreshCw,
    WifiOff,
    ImageOff,
    Video,
} from "lucide-react";
import { formatTimeAgo, formatDuration, formatViews } from "../utils/timeFormat";
import { useStreams, type StreamItem } from "../hooks/useStreams";

/* ─── API type matching the Go Stream model ─── */
type StreamRecord = StreamItem;

/* ─── Fallback gradient thumbnails ─── */
const VOD_ACCENTS = [
    "from-surface-800 to-surface-900",
];

/* ─── Thumbnail component with image/fallback (strictly 16:9) ─── */
function Thumbnail({
    url,
    accent,
    overlay,
}: {
    url: string;
    accent: string;
    overlay?: React.ReactNode;
}) {
    const [imgFailed, setImgFailed] = useState(false);
    const hasImage = url && !imgFailed;

    return (
        <div className="relative w-full aspect-video overflow-hidden bg-surface-900 shrink-0">
            {hasImage ? (
                <img
                    src={url}
                    alt="thumbnail"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    onError={() => setImgFailed(true)}
                />
            ) : (
                <div
                    className={`absolute inset-0 bg-gradient-to-br ${accent} flex items-center justify-center`}>
                    <div className="absolute inset-0 opacity-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPjxyZWN0IHdpZHRoPSI0IiBoZWlnaHQ9IjQiIGZpbGw9IiNmZmYiIGZpbGwtb3BhY2l0eT0iMC4wNSIvPjwvc3ZnPg==')] pointer-events-none" />
                    {url ? (
                        <ImageOff
                            size={28}
                            className="text-white/20 relative z-10"
                        />
                    ) : (
                        <Video
                            size={32}
                            className="text-white/10 relative z-10"
                        />
                    )}
                </div>
            )}

            {/* Overlay badge / play button passed by parent */}
            {overlay}
        </div>
    );
}

/* ─── Live Stream Card ─── */
function LiveCard({ stream }: { stream: StreamRecord }) {
    return (
        <Link to={`/live/${stream.username}`} className="group block">
            <div className="relative rounded-lg overflow-hidden border border-white/5 bg-surface-850 hover:border-brand-primary/50 transition-colors duration-200">
                <Thumbnail
                    url={stream.thumbnail_url}
                    accent={VOD_ACCENTS[0]}
                    overlay={
                        <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-brand-danger text-white text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded z-10">
                            LIVE
                        </div>
                    }
                />

                {/* Info */}
                <div className="p-3">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-surface-800 border border-white/10 shrink-0 flex items-center justify-center text-sm font-bold text-white uppercase">
                            {stream.username?.charAt(0) ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-100 truncate leading-tight group-hover:text-brand-primary transition-colors duration-200">
                                {stream.title || "Untitled Stream"}
                            </p>
                            <p className="text-[13px] text-neutral-400 mt-0.5 hover:text-neutral-200 transition-colors">
                                {stream.username}
                            </p>
                            <div className="flex items-center gap-1 mt-1 text-xs text-neutral-500 font-medium">
                                <span>{formatViews(stream.views)} • Streaming {formatTimeAgo(stream.CreatedAt)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

/* ─── VOD Card ─── */
function VodCard({ stream }: { stream: StreamRecord }) {
    const durationStr = formatDuration(stream.CreatedAt, undefined);

    return (
        <Link to={`/vod/${stream.stream_key}`} className="group block">
            <div className="relative rounded-lg overflow-hidden border border-white/5 bg-surface-850 hover:border-white/20 transition-colors duration-200">
                <Thumbnail
                    url={stream.thumbnail_url}
                    accent={VOD_ACCENTS[0]}
                    overlay={
                        <>
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center z-10 transition-opacity duration-200">
                                <div className="w-12 h-12 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-200">
                                    <Play
                                        size={20}
                                        className="text-white ml-0.5"
                                        fill="white"
                                    />
                                </div>
                            </div>
                            {durationStr && (
                                <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded z-10">
                                    {durationStr}
                                </div>
                            )}
                        </>
                    }
                />

                {/* Info */}
                <div className="p-3">
                    <div className="flex items-start gap-3">
                        <Link to={`/channel/${stream.username}`} onClick={(e) => e.stopPropagation()} className="w-10 h-10 rounded-full bg-surface-800 border border-white/10 shrink-0 flex items-center justify-center text-sm font-bold text-white uppercase hover:border-white/30 transition-colors">
                            {stream.username?.charAt(0) ?? "?"}
                        </Link>
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-neutral-100 truncate leading-tight group-hover:text-brand-primary transition-colors duration-200">
                                {stream.title || "Untitled VOD"}
                            </p>
                            <Link to={`/channel/${stream.username}`} onClick={(e) => e.stopPropagation()} className="text-[13px] text-neutral-400 mt-0.5 hover:text-neutral-200 transition-colors block">
                                {stream.username}
                            </Link>
                            <div className="flex items-center gap-1 mt-1 text-xs text-neutral-500 font-medium">
                                <span>{formatViews(stream.views)} • Streamed {formatTimeAgo(stream.CreatedAt)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

/* ─── Section Header ─── */
function SectionHeader({
    title,
}: {
    title: string;
}) {
    return (
        <div className="mb-6">
            <h2 className="text-xl font-bold tracking-tight text-white">
                {title}
            </h2>
        </div>
    );
}

/* ─── Skeleton Card ─── */
function SkeletonCard() {
    return (
        <div className="rounded-lg border border-white/5 bg-surface-850 animate-pulse overflow-hidden">
            <div className="w-full aspect-video bg-surface-800" />
            <div className="p-3 flex gap-3">
                <div className="w-10 h-10 rounded-full bg-surface-700 shrink-0" />
                <div className="space-y-2 flex-1 pt-1">
                    <div className="h-4 rounded bg-surface-600 w-3/4" />
                    <div className="h-3 rounded bg-surface-700 w-1/2" />
                </div>
            </div>
        </div>
    );
}

/* ─── Empty State ─── */
function EmptyState({ message }: { message: string }) {
    return (
        <div className="col-span-full flex flex-col items-center justify-center py-20 gap-4 text-neutral-500 bg-surface-900 border border-white/5 rounded-lg">
            <WifiOff size={32} className="opacity-20" />
            <p className="text-sm px-4 text-center">
                {message}
            </p>
        </div>
    );
}

/* ─── Home Page ─── */
export default function Home() {
    const { data: streams = [], isLoading: loading, error, refetch } = useStreams();

    const liveStreams = streams.filter((s) => s.status === "live");
    const vodStreams = streams.filter((s) => s.status === "vod");

    return (
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-surface-950">
            {/* Minimalist Hero Section */}
            <div className="w-full border-b border-white/5 bg-surface-900">
                <div className="max-w-[1600px] mx-auto px-6 py-12 md:py-16 flex flex-col items-start justify-center">
                    <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-white max-w-2xl">
                        Welcome to LiteStream
                    </h1>
                    <p className="text-neutral-400 mt-3 md:mt-4 max-w-xl text-sm md:text-base leading-relaxed">
                        A clean and simple platform to broadcast, watch, and discover live streams.
                    </p>
                    <div className="mt-8 flex items-center gap-4">
                        <Link
                            to="/dashboard"
                            className="bg-brand-primary text-surface-950 px-6 py-2.5 rounded font-bold hover:bg-[#45eb12] transition-colors text-sm">
                            Go to Dashboard
                        </Link>
                        <button
                            onClick={() => refetch()}
                            className="flex items-center gap-2 px-4 py-2.5 rounded bg-surface-800 border border-white/10 text-neutral-300 text-sm font-semibold hover:bg-surface-700 hover:text-white transition-colors">
                            <RefreshCw
                                size={14}
                                className={loading ? "animate-spin" : ""}
                            />
                            Refresh
                        </button>
                    </div>
                </div>
            </div>

            <div className="max-w-[1600px] mx-auto px-6 py-10 space-y-12">
                {error && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded border border-brand-danger/30 bg-brand-danger/10 text-brand-danger text-sm">
                        <WifiOff size={16} className="shrink-0" />
                        {error?.message || "Failed to load streams"}
                    </div>
                )}

                {/* Live Channels */}
                <section>
                    <SectionHeader title="Live Channels" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))
                        ) : liveStreams.length === 0 ? (
                            <EmptyState message="No live channels at the moment." />
                        ) : (
                            liveStreams.map((s) => (
                                <LiveCard key={s.id} stream={s} />
                            ))
                        )}
                    </div>
                </section>

                {/* Recent VODs */}
                <section>
                    <SectionHeader title="Recent Broadcasts" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                        {loading ? (
                            Array.from({ length: 5 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))
                        ) : vodStreams.length === 0 ? (
                            <EmptyState message="No past broadcasts available." />
                        ) : (
                            vodStreams.map((s) => (
                                <VodCard key={s.id} stream={s} />
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
