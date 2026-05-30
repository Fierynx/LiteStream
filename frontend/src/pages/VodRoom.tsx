import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import ViewingRoom from "../components/ViewingRoom";
import type { ChatMsg } from "../components/ChatSidebar";

const API = import.meta.env.VITE_API_URL;

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

    const [vodSrc, setVodSrc] = useState("");

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
                const list = data.data ?? [];
                let match = list.find((s) => (s as any).vod_id === vodId);
                if (!match) {
                    match = list.find((s) => s.stream_key === vodId && s.status === "vod");
                }

                if (match) {
                    setChannel(match);
                    const vID = (match as any).vod_id || match.stream_key;
                    setVodSrc(`${import.meta.env.VITE_VOD_URL_PREFIX}${vID}/${match.stream_key}.m3u8`);
                } else {
                    setVodSrc(`${import.meta.env.VITE_VOD_URL_PREFIX}${vodId}/${vodId}.m3u8`);
                }
            })
            .catch(() => {
                setVodSrc(`${import.meta.env.VITE_VOD_URL_PREFIX}${vodId}/${vodId}.m3u8`);
            });
    }, [vodId]);

    /* ── Fetch full chat history once & Increment View ── */
    useEffect(() => {
        if (!channel) return;
        const vID = (channel as any).vod_id || channel.stream_key;
        
        axios.post(`${API}/streams/${vID}/view`).catch(() => {});
        
        axios
            .get<{ data: ApiChatMessage[] }>(`${API}/chat/${vID}`)
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
    }, [channel]);

    useEffect(() => {
        const handleTime = (e: any) => {
            setPlaybackTime(e.detail);
        };
        window.addEventListener("liteStreamTimeUpdate", handleTime);
        return () => window.removeEventListener("liteStreamTimeUpdate", handleTime);
    }, []);

    return (
        <div
            className={`flex h-full min-h-0 transition-opacity duration-500 ${isReady ? "opacity-100" : "opacity-0"}`}>
            <ViewingRoom
                /* Video */
                videoSrc={vodSrc}
                isLive={false}
                streamStatus="vod"
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
