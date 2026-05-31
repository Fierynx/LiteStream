import { createContext, useContext, useState, type ReactNode } from "react";

export interface StreamData {
    src: string;
    url: string; // The full path to navigate back to
    isLive?: boolean;
    viewerCount?: number;
    title?: string;
    username?: string;
    thumbnailUrl?: string;
}

interface MiniPlayerContextType {
    streamData: StreamData | null;
    isMinimized: boolean;
    placeholderRect: DOMRect | null;
    playStream: (data: StreamData) => void;
    stopStream: () => void;
    setMinimized: (val: boolean) => void;
    setPlaceholderRect: (rect: DOMRect | null) => void;
}

const MiniPlayerContext = createContext<MiniPlayerContextType | undefined>(undefined);

export function MiniPlayerProvider({ children }: { children: ReactNode }) {
    const [streamData, setStreamData] = useState<StreamData | null>(null);
    const [isMinimized, setIsMinimized] = useState(false);
    const [placeholderRect, setPlaceholderRect] = useState<DOMRect | null>(null);

    const playStream = (data: StreamData) => {
        setStreamData(data);
    };

    const stopStream = () => {
        setStreamData(null);
        setIsMinimized(false);
        setPlaceholderRect(null);
    };

    return (
        <MiniPlayerContext.Provider
            value={{
                streamData,
                isMinimized,
                placeholderRect,
                playStream,
                stopStream,
                setMinimized: setIsMinimized,
                setPlaceholderRect,
            }}
        >
            {children}
        </MiniPlayerContext.Provider>
    );
}

export function useMiniPlayer() {
    const ctx = useContext(MiniPlayerContext);
    if (!ctx) throw new Error("useMiniPlayer must be used within MiniPlayerProvider");
    return ctx;
}
