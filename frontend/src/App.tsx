import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
    Heart,
    Share2,
    Users,
    Zap,
    Send,
    SmilePlus,
    Gift,
    Gamepad2,
    Flame,
    Sparkles,
    Wifi,
    WifiOff,
} from "lucide-react";
import VideoPlayer from "./components/VideoPlayer";

/* ─── Chat message type ─── */
interface ChatMessage {
    id: number;
    user: string;
    color: string; // hex or Tailwind class
    text: string;
    badge?: string;
}

/* ─── useChat — History-first, then live WebSocket ─── */
function useChat(streamKey: string, username: string) {
    // Start empty — history will be loaded before WS connects.
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [connected, setConnected] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const msgIdRef = useRef(1);
    // Track DB IDs already shown so live WS dupes are silently dropped.
    const seenDbIds = useRef<Set<number>>(new Set());

    // ── Phase 1: Fetch persisted history ───────────────────────────────────────
    useEffect(() => {
        let cancelled = false;

        axios
            .get<{
                data: Array<{
                    id: number;
                    user: string;
                    text: string;
                    color: string;
                }>;
            }>(`http://localhost:8000/chat/${streamKey}`)
            .then(({ data }) => {
                if (cancelled) return;
                const history: ChatMessage[] = (data.data ?? []).map((r) => {
                    seenDbIds.current.add(r.id);
                    return {
                        id: msgIdRef.current++,
                        user: r.user,
                        color: r.color ?? "#39ff14",
                        text: r.text,
                    };
                });
                setMessages(history);
            })
            .catch((err) => {
                if (!cancelled) {
                    console.warn(
                        "[LiteStream] Could not load chat history:",
                        err,
                    );
                }
            })
            .finally(() => {
                if (!cancelled) setHistoryLoaded(true);
            });

        return () => {
            cancelled = true;
        };
    }, [streamKey]);

    // ── Phase 2: Open WebSocket ONLY after history is loaded ───────────────────
    useEffect(() => {
        if (!historyLoaded) return; // wait for history fetch to settle

        const ws = new WebSocket(`ws://localhost:8000/ws/chat/${streamKey}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log("[LiteStream] WS connected");
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                // The server may batch frames — split on newline
                const lines = (event.data as string)
                    .split("\n")
                    .filter(Boolean);
                setMessages((prev) => {
                    let next = [...prev];
                    for (const line of lines) {
                        const parsed = JSON.parse(line) as {
                            user: string;
                            text: string;
                            color: string;
                        };
                        next = [
                            ...next,
                            {
                                id: msgIdRef.current++,
                                user: parsed.user,
                                color: parsed.color ?? "#39ff14",
                                text: parsed.text,
                            },
                        ];
                    }
                    // Keep the last 200 messages to avoid unbounded memory growth
                    return next.slice(-200);
                });
            } catch (err) {
                console.warn("[LiteStream] Failed to parse WS message", err);
            }
        };

        ws.onclose = () => {
            setConnected(false);
            console.log("[LiteStream] WS disconnected");
        };

        ws.onerror = (err) => {
            console.error("[LiteStream] WS error", err);
            setConnected(false);
        };

        return () => {
            ws.close();
        };
    }, [streamKey, historyLoaded]);

    const sendMessage = useCallback(
        (text: string) => {
            if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN)
                return;
            wsRef.current.send(JSON.stringify({ user: username, text }));
        },
        [username],
    );

    return { messages, connected, historyLoaded, sendMessage };
}

/* ─── Category pills data ─── */
const CATEGORIES = ["FPS", "Esports", "Competitive", "English"];

const STREAM_KEY = "test";
const USERNAME = "Viewer" + Math.floor(Math.random() * 9000 + 1000);

function App() {
    const [loading, setLoading] = useState(false);
    const [streamStarted, setStreamStarted] = useState(false);
    const [isFollowing, setIsFollowing] = useState(false);
    const [chatInput, setChatInput] = useState("");

    const { messages, connected, historyLoaded, sendMessage } = useChat(
        STREAM_KEY,
        USERNAME,
    );

    const chatEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll chat to bottom on new messages
    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const startStream = async () => {
        setLoading(true);
        try {
            await axios.post("http://localhost:8000/stream/start", {
                stream_key: "test",
                title: "My Local Stream",
            });
            setStreamStarted(true);
        } catch (error) {
            console.error("Failed to start stream:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-screen w-screen bg-surface-950 text-neutral-100 font-display overflow-hidden">
            {/* ═══ TOP NAV ═══ */}
            <nav className="h-14 bg-surface-900/80 backdrop-blur-xl border-b border-white/[0.04] flex items-center justify-between px-5 shrink-0 z-50">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-green to-neon-cyan flex items-center justify-center shadow-neon-green">
                        <Zap
                            size={18}
                            className="text-surface-950"
                            strokeWidth={2.5}
                        />
                    </div>
                    <span className="text-lg font-bold tracking-tight">
                        Lite<span className="text-neon-green">Stream</span>
                    </span>
                </div>

                <div className="flex items-center gap-4">
                    <button className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors duration-200">
                        Browse
                    </button>
                    <button className="text-sm text-neutral-400 hover:text-neutral-100 transition-colors duration-200">
                        Following
                    </button>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-purple to-neon-pink ring-2 ring-neon-purple/30" />
                </div>
            </nav>

            {/* ═══ MAIN CONTENT ═══ */}
            <div className="flex flex-1 min-h-0">
                {/* ─── LEFT: Player + Info (75%) ─── */}
                <main className="flex-[3] flex flex-col overflow-y-auto">
                    {/* Video Player */}
                    <div className="p-4 pb-0">
                        <VideoPlayer
                            src="http://localhost:8080/live/test.m3u8"
                            viewerCount={1247}
                            isLive={true}
                        />
                    </div>

                    {/* Stream Info */}
                    <div className="p-4 animate-fade-in">
                        <div className="bg-surface-850 rounded-xl border border-white/[0.04] p-5">
                            {/* Channel Header Row */}
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex gap-4 min-w-0">
                                    {/* Avatar */}
                                    <div className="relative shrink-0">
                                        <div className="w-14 h-14 rounded-full bg-gradient-to-br from-neon-green via-neon-cyan to-neon-purple p-[2px]">
                                            <div className="w-full h-full rounded-full bg-surface-800 flex items-center justify-center">
                                                <Gamepad2
                                                    size={22}
                                                    className="text-neon-green"
                                                />
                                            </div>
                                        </div>
                                        <span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 border-2 border-surface-850" />
                                    </div>

                                    {/* Title & Meta */}
                                    <div className="min-w-0">
                                        <h1 className="text-lg font-bold truncate leading-tight">
                                            Building a Streaming Platform From
                                            Scratch — Day 1
                                        </h1>
                                        <p className="text-neon-green font-semibold text-sm mt-0.5">
                                            LiteStreamDev
                                        </p>
                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                            {CATEGORIES.map((cat) => (
                                                <span
                                                    key={cat}
                                                    className="text-[11px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full 
                            bg-surface-600/50 text-neutral-300 border border-white/[0.06]
                            hover:bg-neon-green/10 hover:text-neon-green hover:border-neon-green/20 
                            transition-all duration-300 cursor-pointer">
                                                    {cat}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Follow */}
                                    <button
                                        onClick={() =>
                                            setIsFollowing(!isFollowing)
                                        }
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300
                      ${
                          isFollowing
                              ? "bg-surface-600/50 text-neutral-300 border border-white/[0.06] hover:border-red-500/30 hover:text-red-400"
                              : "bg-neon-green text-surface-950 shadow-neon-green hover:shadow-[0_0_30px_rgba(57,255,20,0.4)] hover:scale-[1.03]"
                      }`}>
                                        <Heart
                                            size={16}
                                            fill={
                                                isFollowing
                                                    ? "currentColor"
                                                    : "none"
                                            }
                                        />
                                        {isFollowing ? "Following" : "Follow"}
                                    </button>

                                    {/* Share */}
                                    <button
                                        className="p-2.5 rounded-lg bg-surface-600/40 border border-white/[0.06] text-neutral-400
                    hover:text-neutral-100 hover:bg-surface-500/50 hover:border-white/10 transition-all duration-200">
                                        <Share2 size={16} />
                                    </button>

                                    {/* API Test Button */}
                                    <button
                                        onClick={startStream}
                                        disabled={loading}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all duration-300
                      ${
                          streamStarted
                              ? "bg-neon-green/10 text-neon-green border border-neon-green/20"
                              : "bg-neon-purple text-white shadow-neon-purple hover:shadow-[0_0_30px_rgba(145,70,255,0.4)] hover:scale-[1.03]"
                      } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}>
                                        <Zap size={14} />
                                        {loading
                                            ? "Connecting…"
                                            : streamStarted
                                              ? "API Connected"
                                              : "Start Stream"}
                                    </button>
                                </div>
                            </div>

                            {/* Description */}
                            <div className="mt-5 pt-4 border-t border-white/[0.04]">
                                <div className="flex items-center gap-2 mb-2">
                                    <Flame
                                        size={14}
                                        className="text-neon-pink"
                                    />
                                    <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-400">
                                        About This Stream
                                    </h3>
                                </div>
                                <p className="text-sm text-neutral-300 leading-relaxed">
                                    Welcome to{" "}
                                    <span className="text-neon-green font-semibold">
                                        LiteStream
                                    </span>{" "}
                                    — a next-gen local streaming platform built
                                    from scratch with NGINX-RTMP, Go, and React.
                                    Zero cloud dependencies. Infinite
                                    possibilities.
                                    <span className="text-neon-cyan">
                                        {" "}
                                        #OpenSource #SelfHosted
                                    </span>
                                </p>
                            </div>

                            {/* Stats row */}
                            <div className="mt-4 flex items-center gap-6">
                                <div className="flex items-center gap-1.5 text-neutral-400 text-sm">
                                    <Users size={14} />
                                    <span>
                                        <strong className="text-neutral-200">
                                            1,247
                                        </strong>{" "}
                                        watching
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-neutral-400 text-sm">
                                    <Heart
                                        size={14}
                                        className="text-neon-pink"
                                    />
                                    <span>
                                        <strong className="text-neutral-200">
                                            12.4k
                                        </strong>{" "}
                                        followers
                                    </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-neutral-400 text-sm">
                                    <Sparkles
                                        size={14}
                                        className="text-neon-violet"
                                    />
                                    <span>
                                        Streaming for{" "}
                                        <strong className="text-neutral-200">
                                            2h 14m
                                        </strong>
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* ─── RIGHT: Chat Sidebar (25%) ─── */}
                <aside className="flex-[1] min-w-[320px] max-w-[420px] bg-surface-900/60 backdrop-blur-md border-l border-white/[0.04] flex flex-col h-full">
                    {/* Chat Header */}
                    <div className="h-12 px-4 flex items-center justify-between border-b border-white/[0.04] shrink-0">
                        <span className="text-sm font-bold tracking-wider uppercase text-neutral-300">
                            Stream Chat
                        </span>
                        <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-neon-green animate-glow-breathe" />
                            <span className="text-[11px] text-neutral-500 font-medium">
                                Live
                            </span>
                        </div>
                    </div>

                    {/* Chat Messages */}
                    <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 scrollbar-thin">
                        {/* Loading skeleton while history is being fetched */}
                        {!historyLoaded && (
                            <div className="space-y-3 animate-pulse">
                                {[80, 60, 90, 55, 70].map((w, i) => (
                                    <div
                                        key={i}
                                        className="flex gap-2 items-center">
                                        <div
                                            className="h-3 rounded-full bg-surface-600"
                                            style={{ width: `${w}%` }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {historyLoaded && messages.length === 0 && (
                            <p className="text-xs text-neutral-600 text-center mt-8">
                                No messages yet. Be the first!
                            </p>
                        )}

                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className="text-[13px] leading-relaxed animate-slide-up">
                                {msg.badge && (
                                    <span className="mr-1">{msg.badge}</span>
                                )}
                                <span
                                    className="font-bold cursor-pointer hover:underline"
                                    style={{ color: msg.color }}>
                                    {msg.user}
                                </span>
                                <span className="text-neutral-500 mx-1">:</span>
                                <span className="text-neutral-200">
                                    {msg.text}
                                </span>
                            </div>
                        ))}

                        {/* Connection status banner */}
                        <div
                            className={`flex items-center gap-2 mt-4 px-3 py-2.5 rounded-lg border transition-all duration-500
              ${
                  connected
                      ? "bg-neon-green/5 border-neon-green/20"
                      : "bg-surface-700/40 border-white/[0.04]"
              }`}>
                            {connected ? (
                                <Wifi
                                    size={14}
                                    className="text-neon-green shrink-0"
                                />
                            ) : (
                                <WifiOff
                                    size={14}
                                    className="text-neutral-500 shrink-0"
                                />
                            )}
                            <span
                                className={`text-xs ${connected ? "text-neon-green/80" : "text-neutral-500"}`}>
                                {connected
                                    ? `Connected as ${USERNAME}`
                                    : "Connecting to chat… (start the Go backend on :8000)"}
                            </span>
                        </div>

                        <div ref={chatEndRef} />
                    </div>

                    {/* Chat Input (Glassmorphic) */}
                    <div className="p-3 border-t border-white/[0.04] shrink-0">
                        <form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const text = chatInput.trim();
                                if (!text) return;
                                sendMessage(text);
                                setChatInput("");
                            }}>
                            <div
                                className="relative bg-surface-800/60 backdrop-blur-sm rounded-xl border border-white/[0.06]
                focus-within:border-neon-green/30 focus-within:shadow-[0_0_15px_rgba(57,255,20,0.08)] transition-all duration-300">
                                <input
                                    type="text"
                                    placeholder={
                                        connected
                                            ? "Send a message…"
                                            : "Connecting…"
                                    }
                                    disabled={!connected}
                                    value={chatInput}
                                    onChange={(e) =>
                                        setChatInput(e.target.value)
                                    }
                                    className="w-full bg-transparent px-4 py-3 pr-24 text-sm text-neutral-200 placeholder-neutral-600 outline-none disabled:opacity-40"
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                                    <button
                                        type="button"
                                        className="p-1.5 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-white/5 transition-all duration-200">
                                        <SmilePlus size={16} />
                                    </button>
                                    <button
                                        type="button"
                                        className="p-1.5 rounded-md text-neutral-500 hover:text-neon-cyan hover:bg-neon-cyan/5 transition-all duration-200">
                                        <Gift size={16} />
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={!connected}
                                        className="p-1.5 rounded-md bg-neon-green/10 text-neon-green hover:bg-neon-green/20 transition-all duration-200 disabled:opacity-40">
                                        <Send size={16} />
                                    </button>
                                </div>
                            </div>
                        </form>
                    </div>
                </aside>
            </div>
        </div>
    );
}

export default App;
