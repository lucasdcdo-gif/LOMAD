import React, { useEffect, useState } from 'react';

interface CalendarEvent {
    id: string;
    title: string;
    start_time: string;
    end_time: string;
    meeting_url: string;
    platform: string;
}

interface UpcomingMeetingsProps {
    userId: string;
    onJoinMeeting: (url: string) => void;
}

export const UpcomingMeetings: React.FC<UpcomingMeetingsProps> = ({ userId, onJoinMeeting }) => {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetchEvents();
    }, [userId]);

    const fetchEvents = async () => {
        try {
            setLoading(true);
            const res = await fetch(`/api/recall/events?userId=${userId}`);
            if (!res.ok) throw new Error('Falha ao carregar eventos');
            const data = await res.json();
            setEvents(data);
        } catch (err) {
            console.error(err);
            setError('Não foi possível carregar as reuniões.');
        } finally {
            setLoading(false);
        }
    };

    if (loading) return <div className="p-4 text-center text-slate-400">Carregando reuniões...</div>;
    if (error) return <div className="p-4 text-center text-red-400">{error}</div>;
    if (events.length === 0) return <div className="p-4 text-center text-slate-400">Nenhuma reunião encontrada para os próximos 7 dias.</div>;

    return (
        <div className="space-y-4">
            {events.map(event => (
                <div key={event.id} className="bg-slate-800/50 border border-white/5 rounded-xl p-4 flex justify-between items-center hover:border-cyan-500/30 transition-all">
                    <div>
                        <h4 className="font-bold text-white">{event.title}</h4>
                        <p className="text-sm text-slate-400">
                            {new Date(event.start_time).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} •
                            {new Date(event.start_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} -
                            {new Date(event.end_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <span className="text-xs text-slate-500 uppercase">{event.platform}</span>
                    </div>
                    {event.meeting_url && (
                        <button
                            onClick={() => onJoinMeeting(event.meeting_url)}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-lg transition-colors shadow-lg shadow-blue-600/20"
                        >
                            Enviar Bot
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
};
