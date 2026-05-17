import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import {
    Radio,
    Play,
    Users,
    Clock,
    Zap,
    RefreshCw,
    WifiOff,
    ImageOff,
} from "lucide-react";

/* ─── API type matching the Go Stream model ─── */
interface StreamRecord {
    ID: number;
    stream_key: string;
    username: string;
    title: string;
    thumbnail_url: string;
    status: "live" | "vod" | "offline";
    CreatedAt: string;
}

/* ─── Fallback gradient thumbnails ─── */
const LIVE_ACCENTS = [
    "from-neon-green/40 to-neon-cyan/20",
    "from-neon-pink/40 to-neon-violet/20",
    "from-neon-cyan/40 to-neon-green/10",
    "from-neon-violet/40 to-neon-pink/20",
];
const VOD_ACCENTS = [
    "from-neon-green/30 to-transparent",
    "from-neon-violet/30 to-transparent",
    "from-neon-cyan/30 to-transparent",
    "from-neon-pink/30 to-transparent",
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
        <div className="relative w-full aspect-video overflow-hidden bg-surface-700 shrink-0">
            {hasImage ? (
                <img
                    src={url}
                    alt="thumbnail"
                    className="absolute inset-0 w-full h-full object-cover"
                    onError={() => setImgFailed(true)}
                />
            ) : (
                <div
                    className={`absolute inset-0 bg-gradient-to-br ${accent} flex items-center justify-center`}>
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(0,0,0,0.6))]" />
                    <div
                        className="absolute inset-0 opacity-10"
                        style={{
                            backgroundImage:
                                "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(255,255,255,.03) 2px,rgba(255,255,255,.03) 4px)",
                        }}
                    />
                    {url ? (
                        <ImageOff
                            size={28}
                            className="text-white/20 relative z-10"
                        />
                    ) : (
                        <Zap
                            size={40}
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
function LiveCard({
    stream,
    accent,
}: {
    stream: StreamRecord;
    accent: string;
}) {
    return (
        <Link to={`/live/${stream.username}`} className="group block">
            <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-surface-850 hover:border-neon-green/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <Thumbnail
                    url={stream.thumbnail_url}
                    accent={accent}
                    overlay={
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md z-10">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                            LIVE
                        </div>
                    }
                />

                {/* Info */}
                <div className="p-3">
                    <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-green to-neon-cyan shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold text-surface-950 uppercase">
                            {stream.username?.charAt(0) ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-neutral-100 truncate leading-tight group-hover:text-neon-green transition-colors duration-200">
                                {stream.title || "Untitled Stream"}
                            </p>
                            <p className="text-[12px] text-neon-green/70 mt-0.5 font-semibold">
                                {stream.username}
                            </p>
                            <div className="flex items-center gap-1 mt-1 text-[11px] text-neutral-600">
                                <Users size={9} />
                                <span>Watching now</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

/* ─── VOD Card ─── */
function VodCard({ stream, accent }: { stream: StreamRecord; accent: string }) {
    const daysAgo = Math.max(
        0,
        Math.floor(
            (Date.now() - new Date(stream.CreatedAt).getTime()) / 86_400_000,
        ),
    );

    return (
        <Link to={`/vod/${stream.stream_key}`} className="group block">
            <div className="relative rounded-xl overflow-hidden border border-white/[0.06] bg-surface-850 hover:border-neon-cyan/30 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <Thumbnail
                    url={stream.thumbnail_url}
                    accent={accent}
                    overlay={
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center z-10">
                            <div className="w-12 h-12 rounded-full bg-white/10 border border-white/20 flex items-center justify-center group-hover:bg-white/20 transition-all duration-200 backdrop-blur-sm">
                                <Play
                                    size={20}
                                    className="text-white ml-0.5"
                                    fill="white"
                                />
                            </div>
                        </div>
                    }
                />

                {/* Info */}
                <div className="p-3">
                    <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-cyan to-neon-violet shrink-0 mt-0.5 flex items-center justify-center text-[10px] font-bold text-surface-950 uppercase">
                            {stream.username?.charAt(0) ?? "?"}
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-neutral-100 truncate leading-tight group-hover:text-neon-cyan transition-colors duration-200">
                                {stream.title || "Untitled VOD"}
                            </p>
                            <p className="text-[12px] text-neon-cyan/70 mt-0.5 font-semibold">
                                {stream.username}
                            </p>
                            <div className="flex items-center gap-3 mt-1 text-[11px] text-neutral-600">
                                <span className="flex items-center gap-1">
                                    <Clock size={9} />
                                    {daysAgo === 0
                                        ? "Today"
                                        : `${daysAgo}d ago`}
                                </span>
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
    icon,
    title,
    accent,
    count,
}: {
    icon: React.ReactNode;
    title: string;
    accent: string;
    count?: number;
}) {
    return (
        <div className="flex items-center gap-2.5 mb-5">
            <div className={`p-1.5 rounded-lg ${accent}`}>{icon}</div>
            <h2 className="text-base font-bold tracking-wide text-neutral-100">
                {title}
            </h2>
            {count !== undefined && (
                <span className="text-xs text-neutral-600 font-mono">
                    ({count})
                </span>
            )}
            <div className="flex-1 h-px bg-gradient-to-r from-white/[0.06] to-transparent ml-2" />
        </div>
    );
}

/* ─── Skeleton Card ─── */
function SkeletonCard() {
    return (
        <div className="rounded-xl border border-white/[0.04] bg-surface-850 animate-pulse overflow-hidden">
            <div className="w-full aspect-video bg-surface-700" />
            <div className="p-3 space-y-2">
                <div className="h-3 rounded-full bg-surface-600 w-3/4" />
                <div className="h-2.5 rounded-full bg-surface-700 w-1/2" />
            </div>
        </div>
    );
}

/* ─── Empty State ─── */
function EmptyState({ message }: { message: string }) {
    return (
        <div className="col-span-full flex flex-col items-center justify-center py-16 gap-3 text-neutral-600 bg-surface-900/20 rounded-2xl border border-dashed border-white/[0.04]">
            <WifiOff size={32} className="opacity-30 animate-pulse" />
            <p className="text-sm px-4 text-center leading-relaxed">
                {message}
            </p>
        </div>
    );
}

/* ─── Home Page ─── */
export default function Home() {
    const [streams, setStreams] = useState<StreamRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchStreams = () => {
        setLoading(true);
        setError(null);
        axios
            .get<{ data: StreamRecord[] }>("http://localhost:8000/streams")
            .then(({ data }) => setStreams(data.data ?? []))
            .catch((err) => {
                console.error("[LiteStream] Failed to fetch streams:", err);
                setError(
                    "Could not reach the backend. Is it running on :8000?",
                );
            })
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        fetchStreams();
    }, []);

    const liveStreams = streams.filter((s) => s.status === "live");
    const vodStreams = streams.filter((s) => s.status === "vod");

    return (
        <div className="flex-1 overflow-y-auto scrollbar-thin">
            {/* Hero banner */}
            <div className="relative overflow-hidden bg-surface-900 border-b border-white/[0.04] py-12 px-8 flex items-center md:py-16 md:px-12">
                {/* Premium CSS-only animated background mesh/glow */}
                <div
                    className="absolute top-0 right-0 -mr-24 -mt-24 w-96 h-96 rounded-full bg-gradient-to-br from-neon-green/10 via-neon-cyan/5 to-neon-purple/10 blur-3xl animate-pulse"
                    style={{ animationDuration: "8s" }}
                />
                <div
                    className="absolute bottom-0 left-0 -ml-24 -mb-24 w-96 h-96 rounded-full bg-gradient-to-tr from-neon-purple/10 via-neon-pink/5 to-transparent blur-3xl animate-pulse"
                    style={{ animationDuration: "12s" }}
                />

                <div className="relative z-10 max-w-2xl">
                    <div className="flex items-center gap-2 mb-3">
                        <Zap size={16} className="text-neon-green" />
                        <span className="text-xs font-bold uppercase tracking-widest text-neon-green">
                            Next-Gen Broadcasting
                        </span>
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight leading-none text-white">
                        Your stage.
                        <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-green via-neon-cyan to-neon-purple">
                            Your rules.
                        </span>
                    </h1>
                    <p className="text-base text-neutral-400 mt-4 leading-relaxed max-w-lg">
                        Welcome to LiteStream — the ultimate decentralized
                        streaming lounge. High performance, zero delay, absolute
                        ownership.
                    </p>
                    <div className="flex items-center gap-4 mt-8 flex-wrap">
                        <Link
                            to="/dashboard"
                            className="inline-flex items-center justify-center px-5 py-3 rounded-xl bg-neon-green text-surface-950 font-bold text-sm shadow-[0_0_24px_rgba(57,255,20,0.3)] hover:shadow-[0_0_36px_rgba(57,255,20,0.45)] hover:scale-[1.02] transition-all duration-300">
                            Start Broadcasting
                        </Link>
                        <button
                            onClick={fetchStreams}
                            className="inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-surface-800 border border-white/[0.06] text-neutral-300 text-sm font-semibold hover:text-neutral-100 hover:bg-surface-700/60 transition-all duration-200">
                            <RefreshCw
                                size={14}
                                className={loading ? "animate-spin" : ""}
                            />
                            Refresh Feeds
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-6 space-y-10 max-w-[1400px] mx-auto">
                {/* Error banner */}
                {error && (
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                        <WifiOff size={16} className="shrink-0" />
                        {error}
                    </div>
                )}

                {/* Live Now */}
                <section>
                    <SectionHeader
                        icon={<Radio size={14} className="text-red-400" />}
                        title="On Air"
                        accent="bg-red-500/10"
                        count={!loading ? liveStreams.length : undefined}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {loading ? (
                            Array.from({ length: 4 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))
                        ) : liveStreams.length === 0 ? (
                            <EmptyState message="No one's live yet. Be the first." />
                        ) : (
                            liveStreams.map((s, i) => (
                                <LiveCard
                                    key={s.ID}
                                    stream={s}
                                    accent={
                                        LIVE_ACCENTS[i % LIVE_ACCENTS.length]
                                    }
                                />
                            ))
                        )}
                    </div>
                </section>

                {/* Recent VODs */}
                <section>
                    <SectionHeader
                        icon={
                            <Play
                                size={14}
                                className="text-neon-cyan"
                                fill="currentColor"
                            />
                        }
                        title="Past Broadcasts"
                        accent="bg-neon-cyan/10"
                        count={!loading ? vodStreams.length : undefined}
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                        {loading ? (
                            Array.from({ length: 3 }).map((_, i) => (
                                <SkeletonCard key={i} />
                            ))
                        ) : vodStreams.length === 0 ? (
                            <EmptyState message="Nothing archived yet. Broadcasts appear here after streams end." />
                        ) : (
                            vodStreams.map((s, i) => (
                                <VodCard
                                    key={s.ID}
                                    stream={s}
                                    accent={VOD_ACCENTS[i % VOD_ACCENTS.length]}
                                />
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
