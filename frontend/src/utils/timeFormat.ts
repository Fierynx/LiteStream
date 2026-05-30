export function formatTimeAgo(dateString?: string): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + " years ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + " months ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + " days ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + " hours ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + " mins ago";
    return Math.floor(seconds) + " seconds ago";
}

export function formatDuration(startStr?: string, endStr?: string): string {
    if (!startStr) return "";
    
    let durationSeconds = 0;
    if (endStr) {
        const start = new Date(startStr);
        const end = new Date(endStr);
        durationSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
    } else {
        // If no end time, it's either currently live or bugged. We assume LIVE is handled externally,
        // but let's return current elapsed time just in case.
        const start = new Date(startStr);
        const now = new Date();
        durationSeconds = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
    }

    const h = Math.floor(durationSeconds / 3600);
    const m = Math.floor((durationSeconds % 3600) / 60);
    const s = durationSeconds % 60;

    if (h > 0) {
        return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatViews(views: number): string {
    if (views >= 1000000) {
        return (views / 1000000).toFixed(1).replace(/\.0$/, '') + "M views";
    }
    if (views >= 1000) {
        return (views / 1000).toFixed(1).replace(/\.0$/, '') + "K views";
    }
    return `${views} views`;
}
