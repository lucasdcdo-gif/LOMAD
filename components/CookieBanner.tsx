import React, { useState, useEffect } from 'react';

interface CookieBannerProps {
    onPrivacyClick: () => void;
}

export const CookieBanner: React.FC<CookieBannerProps> = ({ onPrivacyClick }) => {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const consent = localStorage.getItem('cookie_consent');
        if (!consent) {
            setVisible(true);
        }
    }, []);

    const handleAccept = () => {
        localStorage.setItem('cookie_consent', 'accepted');
        setVisible(false);
    };

    const handleReject = () => {
        localStorage.setItem('cookie_consent', 'rejected');
        setVisible(false);
    };

    if (!visible) return null;

    return (
        <div className="fixed bottom-0 left-0 w-full bg-slate-900/95 backdrop-blur border-t border-white/10 p-6 z-[200] animate-fade-in-up shadow-2xl">
            <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="max-w-2xl">
                    <h3 className="text-white font-bold mb-2 flex items-center gap-2">
                        <span className="text-xl">🍪</span> Sua privacidade importa
                    </h3>
                    <p className="text-slate-400 text-sm leading-relaxed">
                        Utilizamos cookies para melhorar sua experiência, analisar o tráfego e personalizar conteúdo, em conformidade com a LGPD.
                        Ao clicar em "Aceitar", você concorda com nossa <button onClick={onPrivacyClick} className="text-cyan-400 underline hover:text-cyan-300">Política de Privacidade</button>.
                    </p>
                </div>
                <div className="flex gap-4">
                    <button onClick={handleReject} className="px-6 py-2.5 rounded-xl border border-white/10 text-slate-300 font-bold hover:bg-white/5 transition-colors text-sm hover:text-white">
                        Continuar sem aceitar
                    </button>
                    <button onClick={handleAccept} className="px-8 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-white font-bold transition-all text-sm shadow-lg shadow-cyan-500/20 transform hover:scale-105">
                        Aceitar Cookies
                    </button>
                </div>
            </div>
        </div>
    );
};
