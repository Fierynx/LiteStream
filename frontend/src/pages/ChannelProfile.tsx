import { useParams, Link } from "react-router-dom";
import { Play, Video, Loader2, WifiOff, Heart, HeartOff } from "lucide-react";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";
import { formatTimeAgo, formatDuration, formatViews } from "../utils/timeFormat";
import { useChannel } from "../hooks/useStreams";
import { useIsFollowing, useFollow, useUnfollow } from "../hooks/useUser";

export default function ChannelProfile() {
    const { showToast } = useToast();
    const { user } = useAuth();
    const { username = "" } = useParams<{ username: string }>();
    
    const { data: channelData, isLoading, isError } = useChannel(username);
    const { data: isFollowing = false } = useIsFollowing(username, !!user);
    
    const { mutate: follow, isPending: followLoading } = useFollow();
    const { mutate: unfollow } = useUnfollow();
    
    const channelInfo = channelData?.data;
    const vods = channelData?.vods ?? [];
    const isLive = channelInfo?.status === "live";

    const isOwnChannel = user?.username === username;

    const handleFollow = async () => {
        if (!user) {
            showToast("Please login to follow channels.", "warning");
            return;
        }
        if (isFollowing) {
            unfollow(username);
        } else {
            follow(username);
        }
    };

    if (isLoading) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <Loader2 className="w-8 h-8 text-neon-green animate-spin" />
            </div>
        );
    }

    if (isError || !channelData) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-neutral-400">
                <WifiOff size={48} className="opacity-20" />
                <p>Channel not found</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto scrollbar-thin bg-surface-950">
            {/* Hero Header */}
            <div className="relative h-64 md:h-80 border-b border-white/[0.04]">
                {/* Background Banner */}
                <div className="absolute inset-0 overflow-hidden bg-surface-900">
                    <div className="absolute inset-0 bg-gradient-to-br from-neon-purple/20 to-neon-cyan/20 opacity-50" />
                    <div className="absolute inset-0 bg-gradient-to-t from-surface-950 to-transparent" />
                </div>

                {/* Profile Info */}
                <div className="absolute -bottom-12 left-8 flex items-end gap-6">
                    <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-surface-900 border-4 border-surface-950 p-1 shrink-0">
                        <div className="w-full h-full bg-surface-900 rounded-full flex items-center justify-center text-4xl md:text-5xl font-bold uppercase text-white">
                            {username?.charAt(0)}
                        </div>
                    </div>
                    <div className="flex-1 mb-2">
                        <h1 className="text-3xl md:text-4xl font-extrabold text-white flex items-center gap-3">
                            {username}
                            {isLive && (
                                <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded uppercase tracking-wider animate-pulse flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-white rounded-full" />
                                    LIVE
                                </span>
                            )}
                        </h1>
                        <p className="text-neutral-400 mt-1">
                            {vods.length} past broadcasts
                        </p>
                    </div>
                    {isLive && (
                        <Link
                            to={`/live/${username}`}
                            className="mb-2 hidden md:flex items-center gap-2 bg-brand-primary text-surface-950 px-6 py-3 rounded-lg font-bold hover:scale-105 transition-transform">
                            <Play size={18} fill="currentColor" />
                            Watch Live
                        </Link>
                    )}
                    {isOwnChannel ? (
                        <Link
                            to="/dashboard"
                            className="mb-2 hidden md:flex items-center gap-2 bg-surface-800 text-neutral-300 px-6 py-3 rounded-lg font-bold hover:bg-surface-700 transition-colors">
                            Manage Stream
                        </Link>
                    ) : (
                        <button
                            onClick={handleFollow}
                            disabled={followLoading}
                            className={`mb-2 hidden md:flex items-center gap-2 px-6 py-3 rounded-lg font-bold transition-all ${
                                isFollowing 
                                ? "bg-surface-800 text-neutral-300 hover:bg-surface-700 hover:text-red-400" 
                                : "bg-brand-primary text-surface-950 hover:bg-[#45eb12] hover:scale-105"
                            }`}
                        >
                            {followLoading ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : isFollowing ? (
                                <>
                                    <HeartOff size={18} />
                                    Unfollow
                                </>
                            ) : (
                                <>
                                    <Heart size={18} />
                                    Follow
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>

            <div className="max-w-[1400px] mx-auto p-8 pt-20 md:px-12 md:pt-20 space-y-10">
                {/* Mobile Watch Live Button */}
                {isLive && (
                    <Link
                        to={`/live/${username}`}
                        className="md:hidden flex items-center justify-center gap-2 bg-neon-green text-surface-950 w-full px-6 py-3 rounded-lg font-bold">
                        <Play size={18} fill="currentColor" />
                        Watch Live Now
                    </Link>
                )}

                {/* Recent Broadcasts */}
                <section>
                    <div className="flex items-center gap-3 mb-6">
                        <Video size={20} className="text-neon-cyan" />
                        <h2 className="text-xl font-bold text-white">
                            Recent Broadcasts
                        </h2>
                    </div>

                    {vods.length === 0 ? (
                        <div className="text-center py-16 text-neutral-500 bg-surface-900/30 rounded-xl border border-white/[0.04]">
                            No past broadcasts available.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {vods.map((vod) => (
                                <Link
                                    key={vod.id}
                                    to={`/vod/${vod.vod_id || vod.stream_key}`}
                                    className="group block">
                                    <div className="relative rounded-xl overflow-hidden bg-surface-850 border border-white/[0.06] hover:border-neon-cyan/50 transition-colors">
                                        <div className="relative w-full aspect-video bg-surface-800 overflow-hidden">
                                            {vod.thumbnail_url ? (
                                                <img
                                                    src={vod.thumbnail_url}
                                                    alt={vod.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full bg-gradient-to-br from-surface-700 to-surface-800 flex items-center justify-center">
                                                    <Video
                                                        size={32}
                                                        className="text-white/10"
                                                    />
                                                </div>
                                            )}
                                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                                <div className="w-12 h-12 rounded-full bg-neon-cyan/90 text-surface-950 flex items-center justify-center transform scale-75 group-hover:scale-100 transition-transform">
                                                    <Play
                                                        size={20}
                                                        fill="currentColor"
                                                        className="ml-1"
                                                    />
                                                </div>
                                            </div>
                                            {formatDuration(vod.started_at || vod.CreatedAt, vod.ended_at) && (
                                                <div className="absolute bottom-1.5 right-1.5 bg-black/80 text-white text-[11px] font-bold px-1.5 py-0.5 rounded z-10">
                                                    {formatDuration(vod.started_at || vod.CreatedAt, vod.ended_at)}
                                                </div>
                                            )}
                                        </div>
                                        <div className="p-4">
                                            <h3 className="font-semibold text-white truncate group-hover:text-neon-cyan transition-colors">
                                                {vod.title || "Untitled VOD"}
                                            </h3>
                                            <p className="text-xs text-neutral-400 mt-1 font-medium">
                                                {formatViews(vod.views)} • Streamed {formatTimeAgo(vod.CreatedAt)}
                                            </p>
                                        </div>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
