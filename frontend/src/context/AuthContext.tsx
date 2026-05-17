import {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
} from "react";
import type { ReactNode } from "react";
import axios from "axios";
import { jwtDecode } from "jwt-decode";

const API = "http://localhost:8000";

interface AuthUser {
    id: number;
    username: string;
    streamKey: string;
}

interface AuthContextValue {
    user: AuthUser | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Restore session from localStorage on mount.
    useEffect(() => {
        const stored = localStorage.getItem("ls_token");
        if (stored) {
            try {
                const decoded = jwtDecode<{
                    sub: number;
                    username: string;
                    exp: number;
                }>(stored);
                if (decoded.exp * 1000 > Date.now()) {
                    setToken(stored);
                    // Fetch the full profile (includes stream_key) from the server.
                    axios
                        .get<{
                            id: number;
                            username: string;
                            stream_key: string;
                        }>(`${API}/auth/me`, {
                            headers: { Authorization: `Bearer ${stored}` },
                        })
                        .then(({ data }) => {
                            setUser({
                                id: data.id,
                                username: data.username,
                                streamKey: data.stream_key,
                            });
                        })
                        .catch(() => {
                            localStorage.removeItem("ls_token");
                        })
                        .finally(() => setIsLoading(false));
                    return;
                }
            } catch {
                localStorage.removeItem("ls_token");
            }
        }
        setIsLoading(false);
    }, []);

    const saveSession = useCallback(
        (
            tokenStr: string,
            username: string,
            streamKey: string,
            id?: number,
        ) => {
            localStorage.setItem("ls_token", tokenStr);
            setToken(tokenStr);
            const decoded = jwtDecode<{ sub: number }>(tokenStr);
            setUser({ id: id ?? decoded.sub, username, streamKey });
        },
        [],
    );

    const login = useCallback(
        async (username: string, password: string) => {
            const { data } = await axios.post<{
                token: string;
                username: string;
                stream_key: string;
            }>(`${API}/auth/login`, { username, password });
            saveSession(data.token, data.username, data.stream_key);
        },
        [saveSession],
    );

    const register = useCallback(
        async (username: string, password: string) => {
            const { data } = await axios.post<{
                token: string;
                username: string;
                stream_key: string;
            }>(`${API}/auth/register`, { username, password });
            saveSession(data.token, data.username, data.stream_key);
        },
        [saveSession],
    );

    const logout = useCallback(() => {
        localStorage.removeItem("ls_token");
        setToken(null);
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{ user, token, login, register, logout, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
    return ctx;
}
