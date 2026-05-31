import { useParams, Link } from "react-router-dom";
import ViewingRoom from "../components/ViewingRoom";
import { useChat } from "../hooks/useChat";

const VIEWER_NAME = "Viewer" + Math.floor(Math.random() * 9000 + 1000);
const CATEGORIES = ["FPS", "Esports", "Competitive", "English"];

import { useChannel } from "../hooks/useStreams";

export default function LiveRoom() {
    const { username = "test" } = useParams<{
        username: string;
    }>();

    const { data: channelResp, isLoading, isError: channelError } = useChannel(username, true);
    const channel = channelResp?.data;

    const streamStatus = channel?.status || "offline";

    const { messages, connected, historyLoaded, sendMessage } = useChat(
        channel?.stream_key || "",
        channel?.stream_key || "",
        VIEWER_NAME,
    );

    /* ── Error / loading states ── */
    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center text-neutral-400 animate-pulse">
                Loading...
            </div>
        );
    }

    if (channelError) {
        return (
            <div className="flex flex-1 items-center justify-center text-center p-8">
                <div>
                    <h2 className="text-xl font-bold text-neutral-300">
                        Channel Not Found
                    </h2>
                    <p className="text-neutral-500 text-sm mt-2">
                        No channel exists for{" "}
                        <code className="text-neon-green">{username}</code>
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
            videoSrc={`${import.meta.env.VITE_HLS_URL_PREFIX}${channel.stream_key}.m3u8`}
            isLive={true}
            streamStatus={streamStatus}
            viewerCount={1247}
            vodRedirectKey={channel.vod_id || channel.stream_key}
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
