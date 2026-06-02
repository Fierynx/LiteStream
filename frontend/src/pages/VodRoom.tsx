import { useEffect, useState, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import ViewingRoom from "../components/ViewingRoom";
import type { ChatMsg } from "../components/ChatSidebar";
import { useConfig } from "../contexts/ConfigContext";
import { useStreams } from "../hooks/useStreams";
import { useChatHistory, useIncrementView } from "../hooks/useVod";

export default function VodRoom() {
    const { vodId = "test" } = useParams<{ vodId: string }>();
    const { config } = useConfig();

    const [isReady, setIsReady] = useState(false);
    const [playbackTime, setPlaybackTime] = useState(0);

    const { data: streams = [] } = useStreams();
    const { mutate: incrementView } = useIncrementView();

    /* ── Mount fade-in ── */
    useEffect(() => {
        const t = setTimeout(() => setIsReady(true), 50);
        return () => clearTimeout(t);
    }, []);

    const channel = useMemo(() => {
        let match = streams.find((s) => s.vod_id === vodId);
        if (!match) {
            match = streams.find((s) => s.stream_key === vodId && s.status === "vod");
        }
        return match;
    }, [streams, vodId]);

    const vID = channel?.vod_id || channel?.stream_key || vodId;
    const { data: rawMessages, isSuccess: chatLoaded } = useChatHistory(vID, !!channel);

    const incrementedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (channel && vID && !incrementedRef.current.has(vID)) {
            incrementedRef.current.add(vID);
            incrementView(vID);
        }
    }, [channel, vID, incrementView]);

    const vodSrc = channel
        ? `${config.PUBLIC_VOD_BASE_URL || import.meta.env.VITE_VOD_URL_PREFIX}${vID}/${channel.stream_key}.m3u8`
        : `${config.PUBLIC_VOD_BASE_URL || import.meta.env.VITE_VOD_URL_PREFIX}${vodId}/${vodId}.m3u8`;

    const allMessages: ChatMsg[] = useMemo(() => {
        return (rawMessages || []).map((r, i) => ({
            id: i,
            user: r.user,
            color: r.color ?? "#39ff14",
            text: r.text,
            videoOffset: r.video_offset ?? 0,
        }));
    }, [rawMessages]);

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
