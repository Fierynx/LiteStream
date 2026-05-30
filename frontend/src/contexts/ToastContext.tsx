import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { X, Info, CheckCircle, AlertTriangle, XCircle } from "lucide-react";

export type ToastType = "info" | "success" | "warning" | "error";

interface Toast {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextValue {
    showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = "info") => {
        const id = Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 4000);
    }, []);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-sm px-4">
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className="animate-slide-up pointer-events-auto bg-surface-900 border border-white/10 shadow-[0_8px_30px_rgba(0,0,0,0.5)] rounded-xl p-4 flex items-start gap-3 backdrop-blur-xl"
                    >
                        <div className="shrink-0 mt-0.5">
                            {toast.type === "info" && <Info size={18} className="text-neon-cyan" />}
                            {toast.type === "success" && <CheckCircle size={18} className="text-neon-green" />}
                            {toast.type === "warning" && <AlertTriangle size={18} className="text-yellow-500" />}
                            {toast.type === "error" && <XCircle size={18} className="text-red-500" />}
                        </div>
                        <div className="flex-1">
                            <p className="text-sm text-neutral-200 font-medium leading-relaxed">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                            className="shrink-0 text-neutral-500 hover:text-white transition-colors p-1 -mr-2 -mt-1 rounded-md hover:bg-white/5"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx;
}
