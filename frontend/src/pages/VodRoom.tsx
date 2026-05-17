import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import ViewingRoom from "../components/ViewingRoom";
import type { ChatMsg } from "../components/ChatSidebar";

const API = "http://localhost:8000";

interface ApiChatMessage {
    ID: number;
    user: string;
    text: string;
    color: string;
    video_offset: number;
}

interface ChannelInfo {
    stream_key: string;
    username: string;
    title: string;
    thumbnail_url: string;
    status: string;
}

export default function VodRoom() {
    const { vodId = "test" } = useParams<{ vodId: string }>();

    const [isReady, setIsReady] = useState(false);
    const [channel, setChannel] = useState<ChannelInfo | null>(null);
    const [allMessages, setAllMessages] = useState<ChatMsg[]>([]);
    const [chatLoaded, setChatLoaded] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);

    const vodSrc = `http://localhost:4566/vod-bucket/vod/${vodId}.m3u8`;

    /* ── Mount fade-in ── */
    useEffect(() => {
        const t = setTimeout(() => setIsReady(true), 50);
        return () => clearTimeout(t);
    }, []);

    /* ── Resolve channel from stream list ── */
    useEffect(() => {
        axios
            .get<{ data: ChannelInfo[] }>(`${API}/streams`)
            .then(({ data }) => {
                const match = (data.data ?? []).find(
                    (s) => s.stream_key === vodId,
                );
                if (match) setChannel(match);
            })
            .catch(() => {});
    }, [vodId]);

    /* ── Fetch full chat history once ── */
    useEffect(() => {
        axios
            .get<{ data: ApiChatMessage[] }>(`${API}/chat/${vodId}`)
            .then(({ data }) => {
                const msgs: ChatMsg[] = (data.data ?? []).map((r, i) => ({
                    id: i,
                    user: r.user,
                    color: r.color ?? "#39ff14",
                    text: r.text,
                    videoOffset: r.video_offset ?? 0,
                }));
                setAllMessages(msgs);
            })
            .catch(() => {})
            .finally(() => setChatLoaded(true));
    }, [vodId]);

    const handleTimeUpdate = useCallback((t: number) => {
        setPlaybackTime(t);
    }, []);

    return (
        <div
            className={`flex h-full min-h-0 transition-opacity duration-500 ${isReady ? "opacity-100" : "opacity-0"}`}>
            <ViewingRoom
                /* Video */
                videoSrc={vodSrc}
                isLive={false}
                streamStatus="vod"
                onTimeUpdate={handleTimeUpdate}
                /* Channel info */
                channel={{
                    username: channel?.username ?? vodId,
                    title: channel?.title ?? "VOD Replay",
                    thumbnailUrl: channel?.thumbnail_url,
                    categories: [],
                    isLive: false,
                }}
                /* Chat */
                chatMode="replay"
                chatMessages={allMessages}
                chatLoaded={chatLoaded}
                playbackTime={playbackTime}
            />
        </div>
    );
}
