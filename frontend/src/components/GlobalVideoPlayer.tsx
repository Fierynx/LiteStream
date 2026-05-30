import { useEffect, useRef, useState, useCallback } from "react";
import Hls from "hls.js";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Wifi,
    WifiOff,
    X,
} from "lucide-react";

/* ─── Utility: format seconds → m:ss or h:mm:ss ─── */
function fmtTime(s: number): string {
    const t = Math.floor(s);
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const sec = t % 60;
    if (h > 0)
        return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    return `${m}:${String(sec).padStart(2, "0")}`;
}

/* ─── Volume slider — CSS-variable trick for neon-green fill ─── */
function VolumeSlider({
    value,
    onChange,
}: {
    value: number;
    onChange: (v: number) => void;
}) {
    return (
        <div className="relative flex items-center w-20 h-4 group/vol">
            <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="vol-slider w-full h-1 appearance-none rounded-full cursor-pointer bg-white/20 outline-none"
                style={
                    { "--vol-pct": `${value * 100}%` } as React.CSSProperties
                }
            />
        </div>
    );
}

/* ─── Premium Progress/Scrubber bar (VOD only) ─── */
function Scrubber({
    currentTime,
    duration,
    onSeek,
}: {
    currentTime: number;
    duration: number;
    onSeek: (t: number) => void;
}) {
    const trackRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [hoverPct, setHoverPct] = useState<number | null>(null);

    const getPctFromEvent = (e: React.PointerEvent | PointerEvent) => {
        if (!trackRef.current) return 0;
        const rect = trackRef.current.getBoundingClientRect();
        let val = (e.clientX - rect.left) / rect.width;
        if (val < 0) val = 0;
        if (val > 1) val = 1;
        return val;
    };

    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsDragging(true);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        onSeek(getPctFromEvent(e) * duration);
    };

    const handlePointerMove = (e: React.PointerEvent) => {
        const pct = getPctFromEvent(e);
        setHoverPct(pct * 100);
        if (isDragging) {
            onSeek(pct * duration);
        }
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        e.stopPropagation();
        if (isDragging) {
            setIsDragging(false);
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            onSeek(getPctFromEvent(e) * duration);
        }
    };

    const handlePointerLeave = () => {
        setHoverPct(null);
    };

    const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
    const isHovering = hoverPct !== null || isDragging;

    return (
        <div
            className="w-full relative cursor-pointer group/scrub py-2"
            ref={trackRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerLeave}
        >
            {/* The visual track */}
            <div className={`w-full bg-white/20 rounded-full relative transition-all duration-150 ${isHovering ? "h-1.5" : "h-1"}`}>
                {/* Hover progress / buffer (simulated) */}
                {hoverPct !== null && (
                    <div
                        className="absolute inset-y-0 left-0 bg-white/30 rounded-full pointer-events-none"
                        style={{ width: `${hoverPct}%` }}
                    />
                )}
                {/* Main progress */}
                <div
                    className="absolute inset-y-0 left-0 bg-neon-green rounded-full pointer-events-none"
                    style={{ width: `${pct}%` }}
                />
                {/* Thumb */}
                <div
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-neon-green shadow-[0_0_10px_rgba(57,255,20,0.5)] pointer-events-none transition-[width,height,opacity,transform] duration-150 ${isHovering ? "w-3.5 h-3.5 opacity-100 scale-100" : "w-0 h-0 opacity-0 scale-50"}`}
                    style={{ left: `${pct}%` }}
                />
            </div>
            {/* Hover Tooltip */}
            {hoverPct !== null && duration > 0 && (
                <div
                    className="absolute -top-7 -translate-x-1/2 bg-surface-800 text-white text-[11px] font-bold px-2 py-1 rounded shadow-lg pointer-events-none border border-white/10 tabular-nums"
                    style={{ left: `${hoverPct}%` }}
                >
                    {fmtTime((hoverPct / 100) * duration)}
                </div>
            )}
        </div>
    );
}

import { useMiniPlayer } from "../contexts/MiniPlayerContext";
import { useNavigate } from "react-router-dom";

/* ─── GlobalVideoPlayer ─── */
const GlobalVideoPlayer: React.FC = () => {
    const { streamData, isMinimized, placeholderRect, stopStream } = useMiniPlayer();
    const navigate = useNavigate();
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const rafRef = useRef<number | null>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Default to true if not specified
    const isLive = streamData?.isLive ?? true;
    const src = streamData?.src ?? "";
    const viewerCount = streamData?.viewerCount;

    const [isPlaying, setIsPlaying] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const [volume, setVolume] = useState(0.8);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [hasError, setHasError] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);

    /* ── Control auto-hide ── */
    const resetHideTimer = useCallback(() => {
        setShowControls(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
    }, []);

    /* ── rAF loop for smooth time updates ── */
    useEffect(() => {
        const tick = () => {
            const v = videoRef.current;
            if (v && !v.paused && !v.ended) {
                setCurrentTime(v.currentTime);
                window.dispatchEvent(new CustomEvent("liteStreamTimeUpdate", { detail: v.currentTime }));
                if (v.duration && !isNaN(v.duration)) setDuration(v.duration);
            }
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, []);

    /* ── HLS init + retry ── */
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.muted = true;
        video.volume = volume;

        let hls: Hls | null = null;
        let retryId: ReturnType<typeof setTimeout> | null = null;

        const onPlay = () => setIsPlaying(true);
        const onPause = () => setIsPlaying(false);
        const onDurationChange = () => {
            if (video.duration && !isNaN(video.duration))
                setDuration(video.duration);
        };
        video.addEventListener("play", onPlay);
        video.addEventListener("pause", onPause);
        video.addEventListener("durationchange", onDurationChange);

        if (Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: isLive,
                backBufferLength: 30,
                startPosition: isLive ? -1 : 0,
            });
            hls.loadSource(src);
            hls.attachMedia(video);

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                setHasError(false);
                video.play().catch(() => {});
            });

            hls.on(Hls.Events.ERROR, (_e, data) => {
                if (!data.fatal) return;
                setHasError(true);
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                    if (retryId) clearTimeout(retryId);
                    retryId = setTimeout(() => {
                        hls?.loadSource(src);
                    }, 3000);
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    hls?.recoverMediaError();
                }
            });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
            const onMeta = () => {
                setHasError(false);
                video.play().catch(() => {});
            };
            const onError = () => {
                setHasError(true);
                if (retryId) clearTimeout(retryId);
                retryId = setTimeout(() => {
                    video.src = src;
                    video.load();
                }, 3000);
            };
            video.addEventListener("loadedmetadata", onMeta);
            video.addEventListener("error", onError);
            return () => {
                if (retryId) clearTimeout(retryId);
                video.removeEventListener("loadedmetadata", onMeta);
                video.removeEventListener("error", onError);
                video.removeEventListener("play", onPlay);
                video.removeEventListener("pause", onPause);
                video.removeEventListener("durationchange", onDurationChange);
            };
        }

        return () => {
            if (retryId) clearTimeout(retryId);
            hls?.destroy();
            video.removeEventListener("play", onPlay);
            video.removeEventListener("pause", onPause);
            video.removeEventListener("durationchange", onDurationChange);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    /* ── Fullscreen change listener ── */
    useEffect(() => {
        const onFsChange = () => setIsFullscreen(!!document.fullscreenElement);
        document.addEventListener("fullscreenchange", onFsChange);
        return () =>
            document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    /* ── Controls ── */
    const togglePlay = () => {
        const v = videoRef.current;
        if (!v) return;
        v.paused ? v.play().catch(() => {}) : v.pause();
    };

    const handleVolumeChange = (val: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.volume = val;
        v.muted = val === 0;
        setVolume(val);
        setIsMuted(val === 0);
    };

    const toggleMute = () => {
        const v = videoRef.current;
        if (!v) return;
        if (v.muted) {
            v.muted = false;
            v.volume = volume || 0.8;
            setIsMuted(false);
        } else {
            v.muted = true;
            setIsMuted(true);
        }
    };

    const toggleFullscreen = async () => {
        const el = containerRef.current;
        if (!el) return;
        if (!document.fullscreenElement) await el.requestFullscreen();
        else await document.exitFullscreen();
    };

    const handleSeek = (t: number) => {
        const v = videoRef.current;
        if (!v) return;
        v.currentTime = t;
        setCurrentTime(t);
    };

    const effectiveVolume = isMuted ? 0 : volume;

    if (!streamData) return null;

    let style: React.CSSProperties = {};
    if (isMinimized) {
        style = {
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            width: '360px',
            height: '202px', // 16:9
            zIndex: 50,
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.1)'
        };
    } else if (placeholderRect) {
        style = {
            position: 'fixed',
            top: placeholderRect.top + 'px',
            left: placeholderRect.left + 'px',
            width: placeholderRect.width + 'px',
            height: placeholderRect.height + 'px',
            zIndex: 40,
        };
    } else {
        return null;
    }

    /* ─────────────────────────────────────────────────── */
    const handleContainerClick = () => {
        if (isMinimized) {
            navigate(streamData?.url || "/");
        } else {
            togglePlay();
        }
    };

    const handleWheel = (e: React.WheelEvent) => {
        if (!isMinimized) {
            const scrollContainer = document.getElementById("viewing-room-scroll");
            if (scrollContainer) {
                scrollContainer.scrollTop += e.deltaY;
            }
        }
    };

    return (
        <div
            ref={containerRef}
            className="group/player bg-black/50 overflow-hidden cursor-pointer select-none"
            style={style}
            onWheel={handleWheel}
            onMouseMove={resetHideTimer}
            onMouseEnter={() => setShowControls(true)}
            onMouseLeave={() => {
                if (isPlaying) setShowControls(false);
            }}
            onClick={handleContainerClick}
            onDoubleClick={isMinimized ? undefined : toggleFullscreen}
        >
            {/* ── Raw video element — NO native controls ── */}
            <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-contain bg-black"
                playsInline
            />

            {/* ── Offline / Error placeholder ── */}
            {hasError && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-surface-950/96 backdrop-blur-md z-20 animate-fade-in">
                    <div className="relative mb-5">
                        <div className="w-20 h-20 rounded-full bg-surface-800 border border-white/[0.06] flex items-center justify-center">
                            <WifiOff size={32} className="text-neutral-600" />
                        </div>
                        <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-surface-700 border border-surface-800 flex items-center justify-center">
                            <span className="w-2 h-2 rounded-full bg-neutral-600 animate-pulse" />
                        </span>
                    </div>
                    <p className="text-neutral-200 font-bold text-lg tracking-tight">
                        {isLive ? "Stream Offline" : "VOD Unavailable"}
                    </p>
                    <p className="text-neutral-500 text-sm mt-1.5 flex items-center gap-1.5 animate-pulse">
                        <Wifi size={12} />
                        {isLive ? "Waiting for broadcast…" : "Retrying…"}
                    </p>
                </div>
            )}

            {/* ── Top gradient ── */}
            <div
                className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/70 to-transparent pointer-events-none z-10 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
            />

            {/* ── Top-left: LIVE badge + viewer count + Mini Player Info ── */}
            <div
                className={`absolute top-3 left-3 right-3 flex items-start justify-between gap-2 z-20 transition-all duration-300 ${showControls || isMinimized ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-1"}`}>
                <div className="flex flex-col gap-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                        {isLive && !hasError && (
                            <div className="flex items-center gap-1.5 bg-red-600 px-2.5 py-1 rounded-md shadow-lg shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                <span className="text-[10px] font-extrabold tracking-[0.15em] uppercase text-white">
                                    Live
                                </span>
                            </div>
                        )}
                        {viewerCount !== undefined && !hasError && !isMinimized && (
                            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-md shrink-0">
                                <span className="w-1.5 h-1.5 rounded-full bg-neon-green" />
                                <span className="text-[11px] font-semibold text-neutral-200">
                                    {viewerCount.toLocaleString()}
                                </span>
                            </div>
                        )}
                    </div>
                    {isMinimized && streamData?.username && (
                        <div className="bg-black/70 backdrop-blur-sm px-2.5 py-1 rounded-md border border-white/10 max-w-full">
                            <span className="text-xs font-bold text-white truncate block">
                                {streamData.username}
                            </span>
                            {streamData.title && (
                                <span className="text-[10px] text-neutral-300 truncate block mt-0.5">
                                    {streamData.title}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── Center play/pause flash indicator ── */}
            {!hasError && (
                <div
                    className={`absolute inset-0 flex items-center justify-center z-10 pointer-events-none transition-opacity duration-200 ${showControls && !isPlaying ? "opacity-100" : "opacity-0"}`}>
                    <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                        <Play
                            size={28}
                            className="text-white ml-1"
                            fill="white"
                        />
                    </div>
                </div>
            )}

            {/* ── Bottom gradient ── */}
            <div
                className={`absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none z-10 transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0"}`}
            />

            {/* ── Controls bar ── */}
            <div
                className={`absolute inset-x-0 bottom-0 z-20 px-4 pb-3 pt-6 transition-all duration-300 ${showControls ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"}`}
                onClick={(e) => e.stopPropagation()}>
                {/* VOD scrubber */}
                {!isLive && !hasError && (
                    <div className="mb-3">
                        <Scrubber
                            currentTime={currentTime}
                            duration={duration}
                            onSeek={handleSeek}
                        />
                    </div>
                )}

                {/* Control row */}
                <div className="flex items-center justify-between gap-3">
                    {/* Left cluster */}
                    <div className="flex items-center gap-2">
                        {/* Play / Pause */}
                        <button
                            onClick={togglePlay}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:text-neon-green hover:bg-white/10 transition-all duration-150"
                            title={isPlaying ? "Pause" : "Play"}>
                            {isPlaying ? (
                                <Pause size={18} fill="currentColor" />
                            ) : (
                                <Play size={18} fill="currentColor" />
                            )}
                        </button>

                        {/* Volume */}
                        <button
                            onClick={toggleMute}
                            className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:text-neon-green hover:bg-white/10 transition-all duration-150"
                            title={isMuted ? "Unmute" : "Mute"}>
                            {isMuted || volume === 0 ? (
                                <VolumeX size={18} />
                            ) : (
                                <Volume2 size={18} />
                            )}
                        </button>
                        <VolumeSlider
                            value={effectiveVolume}
                            onChange={handleVolumeChange}
                        />

                        {/* VOD time display */}
                        {!isLive && duration > 0 && (
                            <span className="text-[11px] font-mono text-neutral-300 ml-1 tabular-nums">
                                {fmtTime(currentTime)}{" "}
                                <span className="text-neutral-600">/</span>{" "}
                                {fmtTime(duration)}
                            </span>
                        )}
                    </div>

                    {/* Right cluster */}
                    <div className="flex items-center gap-2">
                        {isMinimized ? (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigate(streamData?.url || "/"); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:text-neon-cyan hover:bg-white/10 transition-all duration-150"
                                    title="Expand">
                                    <Maximize size={17} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); stopStream(); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:text-red-500 hover:bg-white/10 transition-all duration-150"
                                    title="Close">
                                    <X size={17} />
                                </button>
                            </>
                        ) : (
                            <>
                                <button
                                    onClick={(e) => { e.stopPropagation(); navigate('/'); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:text-neon-cyan hover:bg-white/10 transition-all duration-150"
                                    title="Minimize Player">
                                    <Minimize size={17} />
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                                    className="w-8 h-8 flex items-center justify-center rounded-lg text-white hover:text-neon-green hover:bg-white/10 transition-all duration-150"
                                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                                    {isFullscreen ? <Minimize size={17} /> : <Maximize size={17} />}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GlobalVideoPlayer;
