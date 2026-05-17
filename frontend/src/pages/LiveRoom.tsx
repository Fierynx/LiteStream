import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import axios from "axios";
import ViewingRoom from "../components/ViewingRoom";
import { useChat } from "../hooks/useChat";

const API = "http://localhost:8000";
const VIEWER_NAME = "Viewer" + Math.floor(Math.random() * 9000 + 1000);
const CATEGORIES = ["FPS", "Esports", "Competitive", "English"];

interface ChannelInfo {
    stream_key: string;
    username: string;
    title: string;
    thumbnail_url: string;
    status: "offline" | "live" | "vod";
}

export default function LiveRoom() {
    const { streamKey: usernameParam = "test" } = useParams<{
        streamKey: string;
    }>();

    const [channel, setChannel] = useState<ChannelInfo | null>(null);
    const [channelError, setChannelError] = useState(false);
    const [streamStatus, setStreamStatus] = useState<
        "offline" | "live" | "vod"
    >("offline");

    /* ── Fetch channel info once ── */
    useEffect(() => {
        axios
            .get<{ data: ChannelInfo }>(`${API}/channel/${usernameParam}`)
            .then(({ data }) => {
                setChannel(data.data);
                setStreamStatus(data.data.status);
            })
            .catch(() => setChannelError(true));
    }, [usernameParam]);

    /* ── Poll status every 3 s ── */
    useEffect(() => {
        if (!channel) return;
        let active = true;
        const iv = setInterval(() => {
            axios
                .get<{ data: { status: string } }>(
                    `${API}/channel/${usernameParam}`,
                )
                .then(({ data }) => {
                    if (active)
                        setStreamStatus(
                            data.data.status as "offline" | "live" | "vod",
                        );
                })
                .catch(() => {});
        }, 3000);
        return () => {
            active = false;
            clearInterval(iv);
        };
    }, [usernameParam, channel]);

    const streamKey = channel?.stream_key ?? "";
    const { messages, connected, historyLoaded, sendMessage } = useChat(
        streamKey,
        VIEWER_NAME,
    );

    /* ── Error / loading states ── */
    if (channelError) {
        return (
            <div className="flex flex-1 items-center justify-center text-center p-8">
                <div>
                    <h2 className="text-xl font-bold text-neutral-300">
                        Channel Not Found
                    </h2>
                    <p className="text-neutral-500 text-sm mt-2">
                        No channel exists for{" "}
                        <code className="text-neon-green">{usernameParam}</code>
                        .
                    </p>
                    <Link
                        to="/"
                        className="mt-4 inline-block text-neon-cyan hover:underline text-sm">
                        ← Discover
                    </Link>
                </div>
            </div>
        );
    }

    if (!channel) {
        return (
            <div className="flex flex-1 items-center justify-center">
                <div className="w-8 h-8 border-2 border-neon-green/30 border-t-neon-green rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <ViewingRoom
            /* Video */
            videoSrc={`http://localhost:8080/live/${streamKey}.m3u8`}
            isLive={true}
            streamStatus={streamStatus}
            viewerCount={1247}
            vodRedirectKey={streamKey}
            /* Channel info */
            channel={{
                username: channel.username,
                title: channel.title,
                thumbnailUrl: channel.thumbnail_url,
                categories: CATEGORIES,
                isLive: streamStatus === "live",
                viewerCount: 1247,
            }}
            /* Chat */
            chatMode="live"
            chatMessages={messages.map((m) => ({
                id: m.id,
                user: m.user,
                color: m.color,
                text: m.text,
                badge: m.badge,
            }))}
            chatLoaded={historyLoaded}
            connected={connected}
            viewerName={VIEWER_NAME}
            onSend={sendMessage}
        />
    );
}
