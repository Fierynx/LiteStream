import { useRef, useEffect, useState } from "react";
import {
    MessageSquare,
    Send,
    SmilePlus,
    Gift,
    Wifi,
    WifiOff,
    Clock,
} from "lucide-react";

/* ─── Types ─── */
export interface ChatMsg {
    id: string | number;
    user: string;
    color: string;
    text: string;
    badge?: string;
    /** Only present on VOD replay messages */
    videoOffset?: number;
}

interface ChatSidebarProps {
    /** Array of messages to display */
    messages: ChatMsg[];
    /** Whether we have live messages loading (shows skeleton) */
    historyLoaded: boolean;
    /** Show WebSocket connected state */
    connected?: boolean;
    /** Display name for the connected user */
    viewerName?: string;
    /** Live stream status — controls input enabled state */
    streamStatus?: "live" | "vod" | "offline";
    /** "live" = real-time chat with input; "replay" = read-only VOD replay */
    mode: "live" | "replay";
    /** Current VOD playback time (seconds) — used in replay mode header */
    playbackTime?: number;
    /** Provide the username of the channel owner to highlight their messages */
    channelUsername?: string;
    /** Called when user submits a message (live mode only) */
    onSend?: (text: string) => void;
    /** Called when user clicks the close chat button */
    onCloseChat?: () => void;
}

/* ─── formatTime helper ─── */
function fmtTime(s: number): string {
    const t = Math.floor(s);
    const m = Math.floor(t / 60);
    const sec = t % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
}

/* ─── Chat Sidebar ─── */
export default function ChatSidebar({
    messages,
    historyLoaded,
    connected = false,
    viewerName,
    streamStatus = "live",
    mode,
    playbackTime = 0,
    onSend,
    channelUsername = "",
    onCloseChat,
}: ChatSidebarProps) {
    const [input, setInput] = useState("");
    const chatEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isScrolledUp, setIsScrolledUp] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    const isLiveMode = mode === "live";
    const isReplayMode = mode === "replay";
    const inputDisabled = !connected || streamStatus !== "live";

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        const atBottom = scrollHeight - scrollTop - clientHeight < 50;
        
        setIsScrolledUp(!atBottom);
        if (atBottom) {
            setUnreadCount(0);
        }
    };

    // Auto-scroll logic
    useEffect(() => {
        if (!isScrolledUp) {
            chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
        } else {
            setUnreadCount((prev) => prev + 1);
        }
    }, [messages.length]);

    // Force scroll to bottom on mount
    useEffect(() => {
        if (historyLoaded && !isScrolledUp) {
            chatEndRef.current?.scrollIntoView();
        }
    }, [historyLoaded]);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const text = input.trim();
        if (!text || !onSend) return;
        onSend(text);
        setInput("");
    };

    return (
        <aside className="flex flex-col w-full h-full bg-surface-900/70 backdrop-blur-md">
            {/* ── Header ── */}
            <div className="h-12 px-4 flex items-center justify-between border-b border-white/[0.04] shrink-0">
                <div className="flex items-center gap-2">
                    {isReplayMode ? (
                        <Clock size={14} className="text-neon-cyan hidden md:block" />
                    ) : (
                        <MessageSquare size={14} className="text-neon-green hidden md:block" />
                    )}
                    <span className="text-[13px] font-bold tracking-widest uppercase text-neutral-300">
                        {isReplayMode ? "Replay Chat" : "Stream Chat"}
                    </span>
                </div>

                <div className="flex items-center gap-2">
                    {!isReplayMode && (
                    /* Live: show connection dot */
                    <div className="flex items-center gap-1.5">
                        <span
                            className={`w-1.5 h-1.5 rounded-full transition-colors duration-500 ${
                                streamStatus === "live" && connected
                                    ? "bg-neon-green animate-pulse"
                                    : "bg-neutral-600"
                            }`}
                        />
                        <span className="text-[11px] text-neutral-500 font-medium">
                            {streamStatus === "live"
                                ? connected
                                    ? "Live"
                                    : "Connecting…"
                                : "Offline"}
                        </span>
                    </div>
                )}
                    
                {onCloseChat && (
                    <button onClick={onCloseChat} className="ml-2 p-1.5 hover:bg-white/10 rounded-md text-neutral-400 hover:text-white transition-colors" title="Close Chat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                    </button>
                )}
                </div>
            </div>

            {/* ── Messages ── */}
            <div 
                className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 scrollbar-thin min-h-0 relative"
                ref={scrollContainerRef}
                onScroll={handleScroll}
            >
                {/* Floating Chat Paused Button */}
                {isScrolledUp && (
                    <div className="sticky top-4 flex justify-center z-20 pointer-events-none mb-2">
                        <button 
                            onClick={(e) => {
                                e.preventDefault();
                                setIsScrolledUp(false);
                                setUnreadCount(0);
                                chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
                            }}
                            className="pointer-events-auto bg-black/80 hover:bg-black text-white text-xs px-4 py-2 rounded-full border border-white/20 shadow-lg backdrop-blur-sm transition-all whitespace-nowrap flex items-center gap-2"
                        >
                            <span>Chat paused due to scroll</span>
                            {unreadCount > 0 && (
                                <span className="bg-neon-cyan text-black px-1.5 py-0.5 rounded-full text-[10px] font-bold">
                                    {unreadCount}
                                </span>
                            )}
                        </button>
                    </div>
                )}

                {/* Skeleton while loading */}
                {!historyLoaded && (
                    <div className="space-y-3 animate-pulse pt-2">
                        {[80, 60, 90, 55, 72, 65].map((w, i) => (
                            <div key={i} className="flex gap-2 items-center">
                                <div
                                    className="h-2.5 rounded-full bg-surface-600"
                                    style={{ width: `${w}%` }}
                                />
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty states */}
                {historyLoaded && messages.length === 0 && isLiveMode && (
                    <div className="flex flex-col items-center justify-center gap-2 mt-12 text-neutral-600">
                        <MessageSquare size={28} className="opacity-30" />
                        <p className="text-xs text-center">
                            No messages yet.
                            <br />
                            Be the first to say something!
                        </p>
                    </div>
                )}

                {historyLoaded && messages.length === 0 && isReplayMode && (
                    <p className="text-xs text-neutral-600 text-center mt-12 leading-relaxed">
                        No chat recorded for this VOD.
                    </p>
                )}

                {historyLoaded &&
                    messages.length > 0 &&
                    isReplayMode &&
                    messages.filter((m) => (m.videoOffset ?? 0) <= playbackTime)
                        .length === 0 && (
                        <p className="text-[11px] text-neutral-500 italic text-center mt-4">
                            Chat will appear as the video plays…
                        </p>
                    )}

                {/* System Message */}
                {historyLoaded && messages.length > 0 && (
                    <div className="text-[11px] text-neutral-500 italic px-2 py-1 mb-2 mt-2 text-center">
                        Welcome to the chat room! Be respectful and follow the rules.
                    </div>
                )}

                {/* Message list */}
                {(isLiveMode
                    ? messages
                    : messages.filter(
                          (m) => (m.videoOffset ?? 0) <= playbackTime,
                      )
                ).map((msg) => (
                    <div
                        key={msg.id}
                        className="text-[13px] leading-relaxed animate-slide-up group/msg hover:bg-white/[0.02] px-2 -mx-2 rounded transition-colors duration-150">
                        {/* Timestamp for replay */}
                        {isReplayMode && msg.videoOffset !== undefined && (
                            <span className="text-[10px] font-mono text-neutral-500 mr-1.5 tabular-nums">
                                {fmtTime(msg.videoOffset)}
                            </span>
                        )}
                        {msg.user === channelUsername && (
                            <span className="mr-1 inline-flex items-center justify-center bg-[#E53E3E] text-white rounded text-[9px] font-bold px-1.5 py-0.5 uppercase tracking-wider translate-y-[-1px]">
                                Broadcaster
                            </span>
                        )}
                        {msg.badge && (
                            <span className="mr-1 text-[11px]">
                                {msg.badge}
                            </span>
                        )}
                        <span
                            className="font-bold cursor-pointer hover:underline"
                            style={{ color: msg.color }}>
                            {msg.user}
                        </span>
                        <span className="text-neutral-500 mx-1">:</span>
                        <span className="text-neutral-200 break-words">
                            {msg.text}
                        </span>
                    </div>
                ))}

                <div ref={chatEndRef} className="h-2" />



                {/* Live: connection status */}
                {isLiveMode && historyLoaded && (
                    <div
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-500 mt-2
                        ${connected ? "bg-neon-green/5 border-neon-green/15" : "bg-surface-700/40 border-white/[0.04]"}`}>
                        {connected ? (
                            <Wifi
                                size={13}
                                className="text-neon-green shrink-0"
                            />
                        ) : (
                            <WifiOff
                                size={13}
                                className="text-neutral-500 shrink-0"
                            />
                        )}
                        <span
                            className={`text-[11px] truncate ${connected ? "text-neon-green/70" : "text-neutral-500"}`}>
                            {connected
                                ? `Chatting as ${viewerName}`
                                : "Connecting to chat…"}
                        </span>
                    </div>
                )}

                <div ref={chatEndRef} />
            </div>

            {/* ── Input (live mode only) ── */}
            {isLiveMode && (
                <div className="p-3 border-t border-white/[0.04] shrink-0 relative">
                    {!localStorage.getItem("ls_token") ? (
                        <div className="absolute inset-0 bg-surface-900/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center p-4">
                            <p className="text-xs text-neutral-400 mb-2 font-medium">You must be logged in to chat.</p>
                            <button
                                onClick={() => window.location.href = "/"}
                                className="w-full bg-neon-green text-black font-bold text-[13px] rounded-lg py-2 hover:bg-neon-green/90 transition-all shadow-[0_0_15px_rgba(57,255,20,0.2)]">
                                Log in to chat
                            </button>
                        </div>
                    ) : (
                        <form onSubmit={submit}>
                            <div
                                className={`relative rounded-xl border bg-surface-800/60 backdrop-blur-sm transition-all duration-300
                                ${
                                    inputDisabled
                                        ? "border-white/[0.04] opacity-50"
                                        : "border-white/[0.06] focus-within:border-neon-green/30 focus-within:shadow-[0_0_16px_rgba(57,255,20,0.06)]"
                                }`}>
                                <input
                                    type="text"
                                    placeholder={
                                        streamStatus !== "live"
                                            ? "Chat is disabled while offline…"
                                            : connected
                                              ? "Send a message…"
                                              : "Connecting…"
                                    }
                                    disabled={inputDisabled}
                                    value={input}
                                    maxLength={500}
                                    onChange={(e) => setInput(e.target.value)}
                                    className="w-full bg-transparent px-4 pt-3 pb-7 text-sm text-neutral-200 placeholder-neutral-600 outline-none"
                                />
                                
                                {/* Character count */}
                                <div className="absolute right-3 bottom-1.5 flex items-center gap-1.5 pointer-events-none">
                                    <span className={`text-[10px] font-mono ${input.length >= 480 ? "text-red-500 font-bold" : "text-neutral-600"}`}>
                                        {input.length}/500
                                    </span>
                                </div>

                                <div className="absolute right-2 top-2.5 flex items-center gap-1">
                                    <button
                                        type="button"
                                        disabled={inputDisabled}
                                        className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-all duration-200 disabled:pointer-events-none">
                                        <SmilePlus size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        disabled={inputDisabled}
                                        className="p-1.5 rounded-md text-neutral-500 hover:text-neon-cyan hover:bg-neon-cyan/5 transition-all duration-200 disabled:pointer-events-none">
                                        <Gift size={16} />
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={inputDisabled || !input.trim()}
                                        className="p-1.5 rounded-md bg-neon-green/10 text-neon-green hover:bg-neon-green/20 transition-all duration-200 disabled:opacity-40 disabled:pointer-events-none">
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </form>
                    )}
                </div>
            )}
        </aside>
    );
}
