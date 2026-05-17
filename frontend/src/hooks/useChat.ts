import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";

export interface ChatMessage {
    id: number;
    user: string;
    color: string;
    text: string;
    badge?: string;
}

export function useChat(streamKey: string, username: string) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [connected, setConnected] = useState(false);
    const [historyLoaded, setHistoryLoaded] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const msgIdRef = useRef(1);
    const seenDbIds = useRef<Set<number>>(new Set());

    // ── Phase 1: Fetch persisted history ───────────────────────────────────
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
                if (!cancelled)
                    console.warn("[LiteStream] Could not load chat history:", err);
            })
            .finally(() => {
                if (!cancelled) setHistoryLoaded(true);
            });

        return () => {
            cancelled = true;
        };
    }, [streamKey]);

    // ── Phase 2: Open WebSocket ONLY after history is loaded ───────────────
    useEffect(() => {
        if (!historyLoaded) return;

        const ws = new WebSocket(`ws://localhost:8000/ws/chat/${streamKey}`);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log("[LiteStream] WS connected");
        };

        ws.onmessage = (event: MessageEvent) => {
            try {
                const lines = (event.data as string).split("\n").filter(Boolean);
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
