import React, { useEffect, useState } from 'react';
import LomadLogo from './LomadLogo';
import { FooterCompliance } from './FooterCompliance';

export const TermsPage: React.FC = () => {
    const [content, setContent] = useState<string>('Carregando...');

    useEffect(() => {
        fetch('/api/terms')
            .then(res => res.json())
            .then(data => setContent(data.content))
            .catch(err => setContent("Erro ao carregar termos."));
    }, []);

    return (
        <div className="min-h-screen bg-black text-white flex flex-col">
            <header className="p-6 border-b border-white/10 flex justify-center">
                <div className="w-32">
                    <LomadLogo />
                </div>
            </header>

            <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
                <h1 className="text-3xl font-bold mb-6 text-purple-400">Termos de Uso</h1>
                <div className="prose prose-invert max-w-none whitespace-pre-wrap text-gray-300 bg-gray-900/50 p-8 rounded-xl border border-white/5 shadow-2xl">
                    {content}
                </div>
            </main>

            <FooterCompliance />
        </div>
    );
};
