import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import { Eye, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";

interface VideoPlayerProps {
    src: string;
    viewerCount?: number;
    isLive?: boolean;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
    src,
    viewerCount = 847,
    isLive = true,
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isMuted, setIsMuted] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showOverlay, setShowOverlay] = useState(true);
    const [hasError, setHasError] = useState(false);
    const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-hide overlay after inactivity
    const resetOverlayTimer = useCallback(() => {
        setShowOverlay(true);
        if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => setShowOverlay(false), 3000);
    }, []);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        // Start muted to satisfy autoplay policies
        video.muted = true;

        if (Hls.isSupported()) {
            const hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 30,
            });

            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                video.play().catch(() => {
                    console.warn(
                        "[LiteStream] Autoplay blocked by browser policy.",
                    );
                });
            });

            hls.on(Hls.Events.ERROR, (_event, data) => {
                if (data.fatal) {
                    setHasError(true);
                    console.error(
                        "[LiteStream] Fatal HLS error:",
                        data.type,
                        data.details,
                    );
                }
            });

            return () => hls.destroy();
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
            video.addEventListener("loadedmetadata", () => {
                video.play().catch(() => {});
            });
        }
    }, [src]);

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = !video.muted;
        setIsMuted(video.muted);
    };

    const toggleFullscreen = async () => {
        const container = containerRef.current;
        if (!container) return;

        if (!document.fullscreenElement) {
            await container.requestFullscreen();
            setIsFullscreen(true);
        } else {
            await document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    return (
        <div
            ref={containerRef}
            className="relative aspect-video bg-surface-950 rounded-xl overflow-hidden cursor-pointer group ring-1 ring-white/5"
            onMouseMove={resetOverlayTimer}
            onMouseEnter={() => setShowOverlay(true)}>
            <video
                ref={videoRef}
                className="w-full h-full object-contain bg-black"
                playsInline
                onClick={toggleMute}
            />

            {/* Top gradient overlay */}
            <div
                className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/80 via-black/30 to-transparent 
          pointer-events-none transition-opacity duration-500 ${showOverlay ? "opacity-100" : "opacity-0"}`}
            />

            {/* Bottom gradient overlay */}
            <div
                className={`absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/80 via-black/30 to-transparent 
          pointer-events-none transition-opacity duration-500 ${showOverlay ? "opacity-100" : "opacity-0"}`}
            />

            {/* Top-left: LIVE badge + Viewers */}
            <div
                className={`absolute top-4 left-4 flex items-center gap-3 transition-all duration-500
          ${showOverlay ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"}`}>
                {isLive && (
                    <div className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur-sm px-3 py-1 rounded-md shadow-lg">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse-slow" />
                        <span className="text-xs font-bold tracking-widest uppercase">
                            Live
                        </span>
                    </div>
                )}
                <div className="flex items-center gap-1.5 bg-black/60 backdrop-blur-sm px-3 py-1 rounded-md">
                    <Eye size={14} className="text-neutral-300" />
                    <span className="text-xs font-semibold text-neutral-200">
                        {viewerCount.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Bottom-right: Controls */}
            <div
                className={`absolute bottom-4 right-4 flex items-center gap-2 transition-all duration-500
          ${showOverlay ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"}`}>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleMute();
                    }}
                    className="p-2 rounded-lg bg-black/50 backdrop-blur-sm hover:bg-white/10 transition-all duration-200"
                    title={isMuted ? "Unmute" : "Mute"}>
                    {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        toggleFullscreen();
                    }}
                    className="p-2 rounded-lg bg-black/50 backdrop-blur-sm hover:bg-white/10 transition-all duration-200"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                    {isFullscreen ? (
                        <Minimize size={18} />
                    ) : (
                        <Maximize size={18} />
                    )}
                </button>
            </div>

            {/* Offline / Error state */}
            {hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-950/95 backdrop-blur-md animate-fade-in">
                    <div className="w-16 h-16 rounded-full bg-surface-700 flex items-center justify-center mb-4">
                        <VolumeX size={28} className="text-neutral-400" />
                    </div>
                    <p className="text-neutral-300 font-semibold text-lg">
                        Stream Offline
                    </p>
                    <p className="text-neutral-500 text-sm mt-1">
                        Waiting for broadcast…
                    </p>
                </div>
            )}
        </div>
    );
};

export default VideoPlayer;
