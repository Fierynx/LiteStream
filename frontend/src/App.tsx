import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import LiveRoom from "./pages/LiveRoom";
import VodRoom from "./pages/VodRoom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import VideoStudio from "./pages/VideoStudio";
import ChannelProfile from "./pages/ChannelProfile";
import { AdminDashboard } from "./pages/AdminDashboard";
import { MiniPlayerProvider } from "./contexts/MiniPlayerContext";
import GlobalVideoPlayer from "./components/GlobalVideoPlayer";

import { ConfigProvider } from "./contexts/ConfigContext";

export default function App() {
    return (
        <ConfigProvider>
            <MiniPlayerProvider>
                <div className="flex flex-col h-screen w-screen bg-surface-950 text-neutral-100 font-display overflow-hidden">
                    <Navbar />
                    <main className="flex flex-col flex-1 min-h-0 relative overflow-y-auto">
                        <Routes>
                            <Route path="/" element={<Home />} />
                            <Route path="/channel/:username" element={<ChannelProfile />} />
                            <Route path="/live/:username" element={<LiveRoom />} />
                            <Route path="/vod/:vodId" element={<VodRoom />} />
                            <Route path="/login" element={<Login />} />
                            <Route path="/register" element={<Register />} />
                            <Route path="/dashboard" element={<Dashboard />} />
                            <Route path="/studio" element={<VideoStudio />} />
                            <Route path="/admin" element={<AdminDashboard />} />
                        </Routes>
                        <GlobalVideoPlayer />
                    </main>
                </div>
            </MiniPlayerProvider>
        </ConfigProvider>
    );
}
