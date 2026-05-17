import { Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import LiveRoom from "./pages/LiveRoom";
import VodRoom from "./pages/VodRoom";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

export default function App() {
    return (
        <div className="flex flex-col h-screen w-screen bg-surface-950 text-neutral-100 font-display overflow-hidden">
            <Navbar />
            <main className="flex flex-col flex-1 min-h-0">
                <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/live/:streamKey" element={<LiveRoom />} />
                    <Route path="/vod/:vodId" element={<VodRoom />} />
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                </Routes>
            </main>
        </div>
    );
}
