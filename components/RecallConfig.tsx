import React, { useState } from 'react';
import { User } from '../types';

interface RecallConfigProps {
    user: User;
    onUpdateUser: () => void;
    onClose: () => void;
    setView: (view: any) => void;
    onDisconnectCalendar?: (platform: string) => void;
}

export const RecallConfig: React.FC<RecallConfigProps> = ({ user, onUpdateUser, onClose, setView, onDisconnectCalendar }) => {
    const [botName, setBotName] = useState(user.botName?.replace('.LOMAD.IA', '') || '');
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [meetingUrl, setMeetingUrl] = useState(''); // State for Instant Bot in Modal

    const handleSaveBotName = async () => {
        try {
            setLoading(true);
            setMsg(null);
            const res = await fetch('/api/recall/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id, botName })
            });

            if (!res.ok) throw new Error("Erro ao salvar nome.");

            const data = await res.json();
            setMsg({ type: 'success', text: `Bot renomeado para: ${data.botName}` });
            onUpdateUser();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleConnectCalendar = async (platform: 'google_calendar' | 'outlook_calendar') => {
        try {
            setLoading(true);
            // Call backend to get auth URL or perform mock connection
            const res = await fetch(`/api/recall/calendar-auth?userId=${user.id}&platform=${platform}`);
            const data = await res.json();

            if (res.ok) {
                if (data.url) {
                    // Real flow: redirect
                    window.location.href = data.url;
                } else {
                    // Mock flow
                    setMsg({ type: 'success', text: data.message });
                    onUpdateUser();
                }
            } else {
                throw new Error(data.error);
            }
        } catch (e: any) {
            setMsg({ type: 'error', text: e.message });
        } finally {
            setLoading(false);
        }
    };

    const handleDisconnectCalendar = async () => {
        if (onDisconnectCalendar) {
            // Determine platform based on user state
            const platform = user.googleCalendarConnected ? 'google_calendar' : 'outlook_calendar';
            onDisconnectCalendar(platform);
            return;
        }

        // Fallback for standalone usage (though App.tsx should always provide the handler)
        try {
            setLoading(true);
            const res = await fetch('/api/recall/calendar-disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            setMsg({ type: 'success', text: 'Agenda desconectada. Você pode conectar novamente.' });
            onUpdateUser();
        } catch (e: any) {
            setMsg({ type: 'error', text: e.message });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-all duration-300">
            {/* Modal Card - Auto Height, No Scroll, Minimalist */}
            <div className="bg-slate-950 border border-white/10 rounded-2xl w-full max-w-lg relative shadow-2xl transition-all">

                {/* Close Button - Absolute for cleaner header */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white transition-colors rounded-full hover:bg-white/5"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="p-6 md:p-8 space-y-8">

                    {/* Header */}
                    <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-600/20 text-cyan-400 mb-4 ring-1 ring-white/5">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <h2 className="text-xl font-bold text-white tracking-tight">Configuração do Bot</h2>
                        <p className="text-slate-400 text-sm mt-1">Gerencie a identidade e conexões do seu assistente.</p>
                    </div>

                    {/* Content Group (Inputs) */}
                    <div className="space-y-6">

                        {/* 1. Bot Name - Minimalist Input */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Identidade</label>
                            </div>
                            <div className="flex gap-2">
                                <div className="flex-1 relative">
                                    <input
                                        type="text"
                                        value={botName}
                                        onChange={e => setBotName(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-4 py-2.5 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 outline-none text-sm transition-all text-white placeholder:text-slate-600"
                                        placeholder="Nome do Bot"
                                    />
                                    <span className="absolute right-3 top-3 text-slate-600 text-xs font-medium select-none">.LOMAD.IA</span>
                                </div>
                                <button
                                    onClick={handleSaveBotName}
                                    disabled={loading}
                                    className="bg-slate-800 hover:bg-slate-700 text-white px-4 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 border border-slate-700"
                                >
                                    Salvar
                                </button>
                            </div>
                        </div>

                        {/* 2. Calendar - Buttons or Status */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">Conexão de Agenda</label>

                            {user.calendarConnected ? (
                                <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                                        <span className="text-sm font-medium text-emerald-100">Sincronização Ativa</span>
                                    </div>
                                    <button
                                        onClick={handleDisconnectCalendar}
                                        disabled={loading}
                                        className="text-xs font-medium text-slate-400 hover:text-red-400 transition-colors"
                                    >
                                        Desconectar
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <button
                                        onClick={() => handleConnectCalendar('google_calendar')}
                                        disabled={loading}
                                        className="flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-slate-900 py-2.5 rounded-lg transition-all font-bold text-sm"
                                    >
                                        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a5/Google_Calendar_icon_%282020%29.svg" className="w-5 h-5" alt="Google" />
                                        Google Calendar
                                    </button>
                                    <button
                                        onClick={() => handleConnectCalendar('outlook_calendar')}
                                        disabled={loading}
                                        className="flex items-center justify-center gap-2 bg-[#0078D4] hover:bg-[#006cbd] text-white py-2.5 rounded-lg transition-all font-bold text-sm"
                                    >
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                        Outlook / Teams
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* 3. Actions - Minimal List */}
                        <div>
                            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 block">Ações Rápidas</label>

                            <div className="space-y-3">
                                <button
                                    onClick={() => { onClose(); setView('FULL_AGENDA'); }}
                                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-900/20 flex items-center justify-center gap-2"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Ver Agenda Completa
                                </button>

                                {/* Instant Bot Input */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Cole o link da reunião para enviar o bot..."
                                        value={meetingUrl}
                                        onChange={(e) => setMeetingUrl(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-4 pr-20 py-2.5 text-sm text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-slate-600"
                                    />
                                    <button
                                        onClick={async () => {
                                            if (!meetingUrl) return;
                                            setLoading(true);
                                            try {
                                                const response = await fetch('/api/recall/bot-join', {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ userId: user.id, meetingUrl, botName: user.botName })
                                                });
                                                const data = await response.json();
                                                if (!response.ok) throw new Error(data.error);
                                                setMsg({ type: 'success', text: 'Bot enviado!' });
                                                setMeetingUrl('');
                                            } catch (e: any) {
                                                setMsg({ type: 'error', text: e.message });
                                            } finally {
                                                setLoading(false);
                                            }
                                        }}
                                        disabled={!meetingUrl || loading}
                                        className="absolute right-1 top-1 bottom-1 bg-slate-800 hover:bg-slate-700 text-white px-3 rounded-md text-xs font-bold transition-all disabled:opacity-50"
                                    >
                                        Enviar
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {msg && (
                        <div className={`p-3 rounded-lg text-sm text-center animate-fade-in font-medium ${msg.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                            {msg.text}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
};
