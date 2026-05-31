import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Tv, Video, MessageSquare } from "lucide-react";
import ChannelInfoBar, { type ChannelInfoProps } from "./ChannelInfoBar";
import ChatSidebar, { type ChatMsg } from "./ChatSidebar";
import { useMiniPlayer } from "../contexts/MiniPlayerContext";

/* ─── Types ─── */
interface ViewingRoomProps {
    /* Video */
    videoSrc: string;
    isLive: boolean;
    streamStatus: "live" | "vod" | "offline";
    viewerCount?: number;
    /** Link to redirect when status === "vod" (live→vod redirect card) */
    vodRedirectKey?: string;

    /* Channel info bar */
    channel: ChannelInfoProps;

    /* Chat */
    chatMode: "live" | "replay";
    chatMessages: ChatMsg[];
    chatLoaded: boolean;
    connected?: boolean;
    viewerName?: string;
    playbackTime?: number;
    onSend?: (text: string) => void;
}

/* ─── Shared viewing shell ─── */
export default function ViewingRoom({
    videoSrc,
    isLive,
    streamStatus,
    viewerCount,
    vodRedirectKey,
    channel,
    chatMode,
    chatMessages,
    chatLoaded,
    connected,
    viewerName,
    playbackTime = 0,
    onSend,
}: ViewingRoomProps) {
    const { playStream, setMinimized, setPlaceholderRect } = useMiniPlayer();
    const placeholderRef = useRef<HTMLDivElement>(null);

    // Track placeholder position
    useEffect(() => {
        const updateRect = () => {
            if (placeholderRef.current) {
                setPlaceholderRect(placeholderRef.current.getBoundingClientRect());
            }
        };

        if (placeholderRef.current) {
            const observer = new ResizeObserver(updateRect);
            observer.observe(placeholderRef.current);
            window.addEventListener("scroll", updateRect, true);
            updateRect();
            
            return () => {
                observer.disconnect();
                window.removeEventListener("scroll", updateRect, true);
                setPlaceholderRect(null);
            };
        }
    }, [streamStatus, isLive]);

    // Handle stream playback lifecycle
    useEffect(() => {
        if (streamStatus === "live" || (!isLive && streamStatus !== "offline")) {
            playStream({
                src: videoSrc,
                url: window.location.pathname,
                isLive,
                viewerCount,
                title: channel.title,
                username: channel.username,
                thumbnailUrl: channel.thumbnailUrl,
            });
            setMinimized(false);
        }
        
        return () => {
            // Unmount -> auto-minimize if playing
            setMinimized(true);
        };
    }, [videoSrc, isLive, streamStatus, channel.title, channel.username]);

    const [isChatOpen, setIsChatOpen] = useState(true);

    return (
        <div className="flex flex-col md:flex-row h-full w-full min-h-0 bg-surface-950 relative overflow-hidden">
            {/* ═══ LEFT/TOP: Video column ═══ */}
            <main id="viewing-room-scroll" className={`flex flex-col min-w-0 flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin transition-all duration-300 ${isChatOpen ? "md:pr-0" : ""}`}>
                {/* Desktop Breadcrumb */}
                <div className="hidden md:flex px-4 pt-3 pb-2 shrink-0">
                    <Link
                        to="/"
                        className="inline-flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-300 transition-colors duration-200 group">
                        <ArrowLeft
                            size={12}
                            className="group-hover:-translate-x-0.5 transition-transform duration-200"
                        />
                        Discover
                    </Link>
                </div>

                {/* ── Video slot - Sticky on Mobile ── */}
                <div className="sticky top-0 z-40 w-full shrink-0 bg-surface-950 md:px-4 md:static">
                    {/* Mobile Breadcrumb Overlay */}
                    <div className="absolute top-3 left-3 z-50 md:hidden bg-black/50 backdrop-blur-md rounded-full px-3 py-1.5 border border-white/10 shadow-lg">
                        <Link to="/" className="flex items-center gap-1.5 text-xs font-bold text-white uppercase tracking-wider">
                            <ArrowLeft size={14} /> Back
                        </Link>
                    </div>

                    <div className="w-full">
                        {streamStatus === "live" || (!isLive && streamStatus !== "offline") ? (
                            /* Placeholder for GlobalVideoPlayer */
                            <div ref={placeholderRef} className="w-full aspect-video md:rounded-xl bg-surface-900 md:border border-white/[0.04]" />
                        ) : streamStatus === "vod" && isLive ? (
                        /* Live page but stream ended — redirect to VOD */
                        <div className="relative w-full aspect-video md:rounded-xl bg-surface-900 md:border border-white/[0.04] flex flex-col items-center justify-center text-center p-6 overflow-hidden">
                            <div className="absolute -inset-3 bg-neon-cyan/[0.03] rounded-2xl blur-2xl pointer-events-none" />
                            <div className="w-16 h-16 rounded-full bg-neon-cyan/10 border border-neon-cyan/20 flex items-center justify-center mb-4">
                                <Tv size={26} className="text-neon-cyan" />
                            </div>
                            <h2 className="text-lg font-bold text-neutral-200">
                                Broadcast Ended
                            </h2>
                            <p className="text-sm text-neutral-500 mt-1.5 max-w-sm">
                                This stream is over, but a full VOD replay has
                                been saved and is ready to watch.
                            </p>
                            {vodRedirectKey && (
                                <Link
                                    to={`/vod/${vodRedirectKey}`}
                                    className="mt-5 px-5 py-2.5 rounded-lg bg-neon-cyan text-sm font-bold text-surface-950 uppercase shrink-0 hover:bg-neutral-200 transition-all duration-300">
                                    Watch VOD Replay
                                </Link>
                            )}
                        </div>
                    ) : (
                        /* Offline — stream not started yet */
                        <div className="relative w-full aspect-video md:rounded-xl bg-surface-900 md:border border-white/[0.04] flex flex-col items-center justify-center text-center p-6 overflow-hidden">
                            <div className="absolute -inset-3 bg-neon-purple/[0.03] rounded-2xl blur-2xl pointer-events-none" />
                            <div className="relative w-16 h-16 rounded-full bg-surface-800 border border-white/[0.04] flex items-center justify-center mb-4">
                                <Video
                                    size={26}
                                    className="text-neutral-600 animate-pulse"
                                />
                                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-neutral-700 border-2 border-surface-900" />
                            </div>
                            <h2 className="text-lg font-bold text-neutral-400">
                                Stream Offline
                            </h2>
                            <p className="text-sm text-neutral-600 mt-1.5 max-w-sm">
                                Waiting for the broadcast to begin.
                            </p>
                            <div className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-800 border border-white/[0.04]">
                                <span className="w-1.5 h-1.5 rounded-full bg-neon-purple animate-pulse" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                                    Listening…
                                </span>
                            </div>
                        </div>
                    )}
                    </div>
                </div>

                {/* ── Channel Info Bar ── */}
                <ChannelInfoBar
                    {...channel}
                    isLive={isLive && streamStatus === "live"}
                    viewerCount={viewerCount}
                />
            </main>

            {/* ═══ RIGHT/BOTTOM: Chat sidebar ═══ */}
            <div className={`transition-all duration-300 ease-in-out shrink-0 flex flex-col border-t md:border-t-0 md:border-l border-white/[0.04] bg-surface-900/70 backdrop-blur-md ${isChatOpen ? "h-[50vh] md:h-full w-full md:w-[350px] lg:w-[400px]" : "h-0 md:h-full md:w-0 overflow-hidden border-none"}`}>
                <ChatSidebar
                    messages={chatMessages}
                    historyLoaded={chatLoaded}
                    connected={connected}
                    viewerName={viewerName}
                    streamStatus={streamStatus}
                    mode={chatMode}
                    playbackTime={playbackTime}
                    onSend={onSend}
                    onCloseChat={() => setIsChatOpen(false)}
                />
            </div>
            
            {/* Floating button when chat is closed */}
            {!isChatOpen && (
                <button
                    onClick={() => setIsChatOpen(true)}
                    className="absolute top-4 right-4 z-50 p-2.5 bg-surface-800/80 hover:bg-surface-700 backdrop-blur-md text-white rounded-lg border border-white/10 shadow-xl transition-all hover:scale-105"
                    title="Show Chat"
                >
                    <MessageSquare size={20} />
                </button>
            )}
        </div>
    );
}
