import React, { useState } from 'react';
import { User } from '../types';

interface FullAgendaProps {
    user: User;
    setView: (view: any) => void;
}

export const FullAgenda: React.FC<FullAgendaProps> = ({ user, setView }) => {
    const [meetingUrl, setMeetingUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
    const [currentDate, setCurrentDate] = useState(new Date());

    const handleInstantBot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!meetingUrl) return;

        setLoading(true);
        setMessage(null);

        try {
            const response = await fetch('/api/recall/bot-join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: user.id,
                    meetingUrl,
                    botName: user.botName
                })
            });

            const data = await response.json();

            if (!response.ok) throw new Error(data.error || 'Erro ao enviar bot');

            setMessage({ type: 'success', text: 'Bot enviado com sucesso! Ele entrará na reunião em instantes.' });
            setMeetingUrl('');
        } catch (error: any) {
            setMessage({ type: 'error', text: error.message });
        } finally {
            setLoading(false);
        }
    };

    // State for events
    const [events, setEvents] = useState<any[]>([]);
    const [eventsLoading, setEventsLoading] = useState(true);

    const fetchEvents = async () => {
        try {
            const res = await fetch(`/api/recall/events?userId=${user.id}`);
            if (!res.ok) throw new Error('Falha ao sincronizar');
            const data = await res.json();
            setEvents(data);
        } catch (err) {
            console.error("Erro ao carregar agenda:", err);
            // Optionally set error state, but for polling we might just ignore transient errors
        } finally {
            setEventsLoading(false);
        }
    };

    // Initial fetch and Polling (every 60s)
    useEffect(() => {
        fetchEvents();
        const interval = setInterval(fetchEvents, 60000);
        return () => clearInterval(interval);
    }, [user.id]);

    // Calendar Helper Functions
    const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
    const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

    const changeMonth = (offset: number) => {
        const newDate = new Date(currentDate.setMonth(currentDate.getMonth() + offset));
        setCurrentDate(new Date(newDate));
    };

    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    const renderCalendarGrid = () => {
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        const days = [];

        // Empty slots for days before start of month
        for (let i = 0; i < firstDay; i++) {
            days.push(<div key={`empty-${i}`} className="h-32 bg-slate-900/30 border border-white/5 p-2"></div>);
        }

        // Days of month
        for (let day = 1; day <= daysInMonth; day++) {
            // Filter real events for this day
            const dayEvents = events.filter(e => {
                const eDate = new Date(e.start_time);
                return eDate.getDate() === day &&
                    eDate.getMonth() === month &&
                    eDate.getFullYear() === year;
            });

            const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();

            days.push(
                <div key={day} className={`h-32 bg-slate-900/50 border border-white/5 p-2 transition-colors hover:bg-white/5 flex flex-col gap-1 ${isToday ? 'bg-blue-900/10 border-blue-500/30' : ''}`}>
                    <span className={`text-sm font-bold block mb-1 ${isToday ? 'text-blue-400' : 'text-slate-400'}`}>
                        {day} {isToday && '(Hoje)'}
                    </span>
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-1">
                        {dayEvents.map(event => (
                            <div key={event.id} className="text-xs p-1.5 rounded bg-blue-600/20 border border-blue-500/20 text-blue-200 truncate cursor-pointer hover:bg-blue-600/30 transition-colors" title={`${new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${event.title}`}>
                                <span className="font-bold mr-1">{new Date(event.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                {event.title}
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        return days;
    };

    return (
        <div className="w-full max-w-6xl mx-auto py-12 px-6 animate-fade-in pb-32"> {/* Added pb-32 for footer clearance */}
            <div className="flex justify-between items-center mb-10">
                <div>
                    <h1 className="text-4xl font-black text-white mb-2">Agenda Inteligente</h1>
                    <p className="text-slate-400">Visão geral de suas reuniões e monitoramento do bot.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => setView('RECALL_CONFIG')}
                        className="px-4 py-2 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors flex items-center gap-2 font-bold text-sm"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Configurações
                    </button>
                    <button onClick={() => setView('MAIN')} className="px-4 py-2 glass rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors font-bold text-sm">
                        Voltar
                    </button>
                </div>
            </div>

            {/* Instant Bot Section - Compact */}
            <div className="glass p-6 rounded-2xl border border-blue-500/20 bg-blue-500/5 mb-8 flex flex-col md:flex-row items-center gap-6 justify-between">
                <div className="flex-1">
                    <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                        <div className="p-1.5 bg-blue-500 rounded-lg"><svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                        Bot Instantâneo
                    </h2>
                    <p className="text-slate-400 text-sm">Cole o link de uma reunião (Meet, Zoom, Teams) para o bot entrar agora.</p>
                </div>
                <form onSubmit={handleInstantBot} className="flex-1 w-full max-w-lg">
                    <div className="flex gap-2">
                        <input
                            type="url"
                            placeholder="Link da reunião..."
                            value={meetingUrl}
                            onChange={(e) => setMeetingUrl(e.target.value)}
                            required
                            className="flex-1 bg-slate-950/50 border border-white/10 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600 text-sm"
                        />
                        <button
                            type="submit"
                            disabled={loading}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap text-sm"
                        >
                            {loading ? 'Enviando...' : 'Enviar Bot'}
                        </button>
                    </div>
                </form>
            </div>
            {message && (
                <div className={`mb-8 p-3 rounded-lg border text-sm font-bold flex items-center gap-2 animate-fade-in ${message.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'
                    }`}>
                    {message.type === 'success' ? <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> : <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                    {message.text}
                </div>
            )}

            {/* Calendar Grid */}
            <div className="glass rounded-[2rem] border border-white/10 overflow-hidden">
                {/* Calendar Header */}
                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <div className="flex items-center gap-4">
                        <h2 className="text-2xl font-black text-white capitalize">
                            {monthNames[currentDate.getMonth()]} <span className="text-slate-500">{currentDate.getFullYear()}</span>
                        </h2>
                        <div className="flex gap-1 bg-slate-800 rounded-lg p-1">
                            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-700 rounded text-slate-300"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg></button>
                            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-700 rounded text-slate-300"><svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg></button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${user.calendarConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        <span className="text-xs font-bold text-slate-400 uppercase">{user.calendarConnected ? 'Sincronizado' : 'Não Sincronizado'}</span>
                    </div>
                </div>

                {!user.calendarConnected ? (
                    <div className="p-20 text-center">
                        <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        </div>
                        <h3 className="text-2xl font-bold text-white mb-2">Agenda Desconectada</h3>
                        <p className="text-slate-400 mb-8 max-w-md mx-auto text-lg">Conecte seu Google Calendar ou Outlook para ver seus eventos aqui.</p>
                        <button onClick={() => setView('RECALL_CONFIG')} className="px-8 py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition-colors shadow-lg">
                            Conectar Agenda Agora
                        </button>
                    </div>
                ) : (
                    <div className="bg-slate-950/30">
                        {/* Week Days Header */}
                        <div className="grid grid-cols-7 border-b border-white/5 bg-slate-900/50">
                            {weekDays.map(day => (
                                <div key={day} className="py-3 text-center text-xs font-bold text-slate-500 uppercase tracking-wider">
                                    {day}
                                </div>
                            ))}
                        </div>
                        {/* Days Grid */}
                        <div className="grid grid-cols-7 auto-rows-fr">
                            {renderCalendarGrid()}
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-8 text-center">
                <p className="text-slate-500 text-xs">O bot entrará automaticamente nas reuniões agendadas conforme suas configurações.</p>
            </div>
        </div>
    );
};
