import { Link } from "react-router-dom";
import { ArrowLeft, Tv, Video } from "lucide-react";
import VideoPlayer from "./VideoPlayer";
import ChannelInfoBar, { type ChannelInfoProps } from "./ChannelInfoBar";
import ChatSidebar, { type ChatMsg } from "./ChatSidebar";

/* ─── Types ─── */
interface ViewingRoomProps {
    /* Video */
    videoSrc: string;
    isLive: boolean;
    streamStatus: "live" | "vod" | "offline";
    viewerCount?: number;
    /** Link to redirect when status === "vod" (live→vod redirect card) */
    vodRedirectKey?: string;
    onTimeUpdate?: (t: number) => void;

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
    onTimeUpdate,
    channel,
    chatMode,
    chatMessages,
    chatLoaded,
    connected,
    viewerName,
    playbackTime = 0,
    onSend,
}: ViewingRoomProps) {
    return (
        <div className="flex h-full w-full min-h-0">
            {/* ═══ LEFT: Video column ═══ */}
            <main className="flex-1 flex flex-col min-w-0 overflow-y-auto scrollbar-thin">
                {/* Back breadcrumb */}
                <div className="px-4 pt-3 pb-2 shrink-0">
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

                {/* ── Video slot ── */}
                <div className="px-4 shrink-0">
                    {streamStatus === "live" ? (
                        /* Live player */
                        <VideoPlayer
                            src={videoSrc}
                            isLive={true}
                            viewerCount={viewerCount}
                            onTimeUpdate={onTimeUpdate}
                        />
                    ) : streamStatus === "vod" && isLive ? (
                        /* Live page but stream ended — redirect to VOD */
                        <div className="relative w-full aspect-video rounded-xl bg-surface-900 border border-white/[0.04] flex flex-col items-center justify-center text-center p-6">
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
                                    className="mt-5 px-5 py-2.5 rounded-lg bg-neon-cyan text-surface-950 font-bold text-sm
                                               hover:shadow-[0_0_28px_rgba(0,229,255,0.35)] hover:scale-[1.03] transition-all duration-300">
                                    Watch VOD Replay
                                </Link>
                            )}
                        </div>
                    ) : !isLive ? (
                        /* VOD player */
                        <VideoPlayer
                            src={videoSrc}
                            isLive={false}
                            onTimeUpdate={onTimeUpdate}
                        />
                    ) : (
                        /* Offline — stream not started yet */
                        <div className="relative w-full aspect-video rounded-xl bg-surface-900 border border-white/[0.04] flex flex-col items-center justify-center text-center p-6">
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

                {/* ── Channel Info Bar ── */}
                <ChannelInfoBar
                    {...channel}
                    isLive={isLive && streamStatus === "live"}
                    viewerCount={viewerCount}
                />
            </main>

            {/* ═══ RIGHT: Chat sidebar ═══ */}
            <ChatSidebar
                messages={chatMessages}
                historyLoaded={chatLoaded}
                connected={connected}
                viewerName={viewerName}
                streamStatus={streamStatus}
                mode={chatMode}
                playbackTime={playbackTime}
                onSend={onSend}
            />
        </div>
    );
}
