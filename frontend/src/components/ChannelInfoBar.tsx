import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Heart, Share2, Users, Gamepad2, Loader2, HeartOff } from "lucide-react";
import axios from "axios";
import { useToast } from "../contexts/ToastContext";
import { useAuth } from "../contexts/AuthContext";

export interface ChannelInfoProps {
    username: string;
    title: string;
    thumbnailUrl?: string;
    categories?: string[];
    isLive: boolean;
    viewerCount?: number;
}

export default function ChannelInfoBar({
    username,
    title,
    categories = [],
    isLive,
    viewerCount,
}: ChannelInfoProps) {
    const { showToast } = useToast();
    const { user, token, isLoading } = useAuth();
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [shareFlash, setShareFlash] = useState(false);

    const isOwnChannel = user?.username === username;

    useEffect(() => {
        if (token && username) {
            axios
                .get(`${import.meta.env.VITE_API_URL}/user/isfollowing/${username}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                .then(({ data }) => setIsFollowing(data.following))
                .catch(() => {});
        }
    }, [username, token]);

    const handleFollow = async () => {
        if (!token) {
            showToast("Please login to follow channels.", "warning");
            return;
        }
        setFollowLoading(true);
        try {
            if (isFollowing) {
                await axios.delete(`${import.meta.env.VITE_API_URL}/user/unfollow/${username}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsFollowing(false);
            } else {
                await axios.post(`${import.meta.env.VITE_API_URL}/user/follow/${username}`, {}, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setIsFollowing(true);
            }
        } catch (e) {
            console.error("Follow error:", e);
        } finally {
            setFollowLoading(false);
        }
    };

    const handleShare = () => {
        navigator.clipboard.writeText(window.location.href).catch(() => {});
        setShareFlash(true);
        setTimeout(() => setShareFlash(false), 2000);
    };

    return (
        <div className="px-5 py-4 border-t border-white/[0.04] bg-surface-900/40">
            <div className="flex items-start justify-between gap-4 flex-wrap">
                {/* ── Left: avatar + title + meta ── */}
                <div className="flex items-start gap-4 min-w-0">
                    {/* Avatar with optional live ring */}
                    <div className="relative shrink-0">
                        <div
                            className={`w-12 h-12 rounded-full p-[2px] transition-all duration-500 ${
                                isLive
                                    ? "bg-gradient-to-br from-neon-green via-neon-cyan to-neon-purple"
                                    : "bg-surface-600"
                            }`}>
                            <div className="w-full h-full rounded-full bg-surface-800 flex items-center justify-center text-xl font-bold uppercase text-white">
                                {username?.charAt(0)}
                            </div>
                        </div>
                        {/* Online/offline dot */}
                        <span
                            className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-surface-900 transition-colors duration-500 ${
                                isLive ? "bg-red-500" : "bg-neutral-600"
                            }`}
                        />
                    </div>

                    {/* Text info */}
                    <div className="min-w-0">
                        <h1 className="text-base font-bold leading-snug text-neutral-100 truncate md:whitespace-normal">
                            {title || "Untitled Stream"}
                        </h1>
                        <Link
                            to={`/channel/${username}`}
                            className="text-neon-green font-semibold text-sm hover:underline mt-0.5 block">
                            {username}
                        </Link>
                        {/* Category tags */}
                        {categories.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                {categories.map((cat) => (
                                    <span
                                        key={cat}
                                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-surface-700/70 border border-white/[0.05] text-neutral-400
                                                   hover:bg-neon-green/10 hover:text-neon-green hover:border-neon-green/20 transition-all duration-200 cursor-pointer">
                                        {cat}
                                    </span>
                                ))}
                            </div>
                        )}
                        {/* Viewer count */}
                        {isLive && viewerCount !== undefined && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-neutral-500">
                                <Users size={12} className="text-neutral-600" />
                                <span>
                                    <strong className="text-neutral-300 font-semibold">
                                        {viewerCount.toLocaleString()}
                                    </strong>{" "}
                                    watching
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right: action buttons ── */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Follow / Manage */}
                    {isLoading ? (
                        <div className="w-24 h-9 bg-surface-700/30 rounded-lg animate-pulse" />
                    ) : isOwnChannel ? (
                        <Link
                            to="/dashboard"
                            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold bg-surface-700/60 border border-white/[0.06] text-neutral-300 hover:bg-surface-600 transition-all duration-300"
                        >
                            Manage Stream
                        </Link>
                    ) : (
                        <button
                            onClick={handleFollow}
                            disabled={followLoading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300 ${
                                isFollowing
                                    ? "bg-surface-700/60 border border-white/[0.06] text-neutral-300 hover:border-red-500/30 hover:text-red-400"
                                    : "bg-brand-primary text-surface-950 hover:bg-[#45eb12] hover:scale-105"
                            }`}>
                            {followLoading ? (
                                <Loader2 size={15} className="animate-spin shrink-0" />
                            ) : isFollowing ? (
                                <HeartOff size={15} className="shrink-0" />
                            ) : (
                                <Heart size={15} fill="none" className="shrink-0" />
                            )}
                            {isFollowing ? "Following" : "Follow"}
                        </button>
                    )}

                    {/* Share */}
                    <button
                        onClick={handleShare}
                        title="Copy link"
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-surface-700/50 border border-white/[0.06] text-neutral-400 hover:text-neutral-100 hover:bg-surface-600/50 text-sm transition-all duration-200">
                        <Share2 size={15} />
                        <span className="hidden sm:inline text-xs font-medium">
                            {shareFlash ? "Copied!" : "Share"}
                        </span>
                    </button>

                    {/* Gamepad placeholder — category quick-link */}
                    <button
                        title="Browse category"
                        className="p-2.5 rounded-lg bg-surface-700/50 border border-white/[0.06] text-neutral-500 hover:text-neon-violet hover:border-neon-violet/20 transition-all duration-200">
                        <Gamepad2 size={16} />
                    </button>
                </div>
            </div>
        </div>
    );
}
