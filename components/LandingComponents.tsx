import React, { useState, useEffect, useRef } from 'react';

// COMPONENTE: Pílula Neon (Ajustado para alinhamento perfeito)
export const HighlightPill = ({ children, theme = 'dark', pullLeft = false }: { children: React.ReactNode, theme?: 'dark' | 'light', pullLeft?: boolean }) => {
    const innerBg = theme === 'dark' ? 'bg-[#020617]' : 'bg-white';
    const glowColor = 'bg-brand-cyan/80';
    return (
        <span className={`relative flex items-center justify-center whitespace-nowrap align-middle transition-all duration-300 ${pullLeft ? 'lg:-ml-8 mx-1' : 'mx-1 md:mx-2'}`}>
            <span className={`absolute inset-0 bg-cyan-500/80 rounded-full blur-[8px] md:blur-[12px] opacity-70 animate-pulse-slow`}></span>
            <span className={`absolute inset-0 bg-cyan-500 rounded-full`}></span>
            <span className={`absolute inset-[2px] md:inset-[3px] ${innerBg} rounded-full`}></span>
            <span className="relative z-10 block px-5 py-2.5 md:px-8 md:py-3.5 font-black flex items-center justify-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-emerald-400 leading-none">
                {children}
            </span>
        </span>
    );
};

export const WordRotator = () => {
    const words = ["Reuniões", "E-mails", "Brainstorms", "Vendas"];
    const [index, setIndex] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => setIndex((prev) => (prev + 1) % words.length), 2500);
        return () => clearInterval(interval);
    }, []);
    return <span className="transition-all duration-500">{words[index]}</span>;
};

export const SimpleTranscriptLine = ({ text, delay }: { text: string, delay: number }) => {
    const [isVisible, setIsVisible] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setIsVisible(true), delay);
        return () => clearTimeout(timer);
    }, [delay]);
    return isVisible ? <span className="animate-fade-in-up block mb-2">{text}</span> : null;
};

export const ScrollStep = ({ onStepEnter, children, stepIndex }: { onStepEnter: (index: number) => void, children: React.ReactNode, stepIndex: number }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) onStepEnter(stepIndex); }, { rootMargin: '-40% 0px -40% 0px' });
        if (ref.current) observer.observe(ref.current);
        return () => { if (ref.current) observer.unobserve(ref.current); };
    }, [stepIndex, onStepEnter]);
    return <div ref={ref} className="min-h-[50vh] lg:min-h-[70vh] flex flex-col justify-center py-10">{children}</div>;
};

export const MeetingSimulator = ({ activeStep }: { activeStep: number }) => {
    return (
        <div className="w-full max-w-[480px] mx-auto h-[280px] md:h-[360px] bg-[#111827] rounded-2xl md:rounded-3xl border border-slate-800 shadow-2xl overflow-hidden relative transition-all duration-700">
            <div className={`absolute top-0 w-full p-3 md:p-4 flex justify-between items-center z-20 bg-gradient-to-b from-black/80 to-transparent transition-opacity duration-300 ${activeStep === 3 || activeStep === 0 ? 'opacity-0' : 'opacity-100'}`}>
                <div className="flex gap-2 items-center"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div><span className="text-white text-[10px] md:text-xs font-bold">00:{activeStep * 15 + 12}</span></div>
                <div className="px-2 py-1 bg-slate-800/80 rounded-md text-[9px] md:text-[10px] text-white backdrop-blur border border-slate-700">4 Participantes</div>
            </div>
            <div className={`absolute inset-0 transition-opacity duration-700 p-3 pt-12 md:p-4 md:pt-14 ${activeStep === 0 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <div className="w-full h-full bg-slate-800 rounded-xl md:rounded-2xl relative overflow-hidden border border-slate-700">
                    <img src="/Calendario.png" loading="lazy" className="absolute inset-0 w-full h-full object-cover" alt="Calendário" />
                </div>
            </div>
            <div className={`absolute inset-0 transition-opacity duration-700 p-3 pt-12 md:p-4 md:pt-14 ${activeStep === 1 || activeStep === 2 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <div className="grid grid-cols-2 grid-rows-2 gap-2 md:gap-3 h-full">
                    <div className="bg-slate-800 rounded-xl relative overflow-hidden"><img src="/FOTO_LUCAS.png" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-80" /></div>
                    <div className="bg-slate-800 rounded-xl relative overflow-hidden"><img src="/FOTO_THAIS.png" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-80" /></div>
                    <div className="bg-slate-800 rounded-xl relative overflow-hidden"><img src="/FOTO_MADALENA.png" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-80" /></div>
                    <div className="bg-slate-900 rounded-xl relative flex flex-col items-center justify-center p-2 border border-slate-700 text-center"><div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center mb-2 animate-pulse-slow text-lg">🤖</div><div className="text-[9px] text-cyan-400 font-bold uppercase tracking-wider">LOMAD AI BOT</div><div className="text-[8px] text-slate-400 mt-1">Sincronizado</div></div>
                </div>
            </div>
            <div className={`absolute inset-0 transition-opacity duration-700 bg-slate-900 ${activeStep === 3 ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'}`}>
                <img src="/FOTO_FINAL.png" loading="lazy" className="absolute inset-0 w-full h-full object-cover opacity-90" />
            </div>
        </div>
    );
};

export const EcosystemSection = () => {
    const [activeTab, setActiveTab] = useState(0);

    const features = [
        { title: "Gravação Integrada", desc: "Capture a chamada pelo navegador com nossa ferramenta nativa, de forma imersiva e livre de bots.", img: "/REC.png" },
        { title: "O LOMAD em seu Smartphone", desc: "Leve o LOMAD para onde você for. Grave, transcreva e acompanhe reuniões presenciais usando seu celular.", img: "/FOTO_MOBILE.png" },
        { title: "Produtividade por E-mail", desc: "Ao final da reunião, receba em sua caixa de entrada um relatório estruturado com os pontos-chave e o resumo completo.", img: "/FOTO_EMAIL.png" },
        { title: "Ecossistema Completo", desc: "Acesse todos os seus transcritos em um dashboard intuitivo, organizando sua semana e compromissos com facilidade.", img: "/FOTO_INTEGRACOES.png" }
    ];

    return (
        <section className="bg-white relative w-full py-24 md:py-32 rounded-t-[3rem] md:rounded-t-[4rem] z-40 -mt-10 border-t border-slate-200">
            <div className="max-w-7xl mx-auto px-6">
                <h2 className="text-3xl md:text-5xl font-black text-slate-900 mb-16 text-center lg:text-left">Integre IA ao seu dia a dia</h2>
                <div className="flex flex-col lg:flex-row gap-12 items-center">
                    <div className="w-full lg:w-1/2 flex justify-center order-1">
                        <div className="w-full max-w-[500px] aspect-[4/3] bg-slate-100 rounded-[2rem] overflow-hidden shadow-2xl border border-slate-200 relative">
                            {features.map((f, i) => (
                                <img key={i} src={f.img} loading="lazy" className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-500 ${activeTab === i ? 'opacity-100' : 'opacity-0'}`} />
                            ))}
                        </div>
                    </div>
                    <div className="w-full lg:w-1/2 grid grid-cols-1 sm:grid-cols-2 gap-4 order-2">
                        {features.map((item, index) => (
                            <div key={index} onMouseEnter={() => setActiveTab(index)} className={`p-6 rounded-2xl border-2 transition-all cursor-pointer min-h-[160px] flex flex-col justify-between ${activeTab === index ? 'border-cyan-500 bg-cyan-50/30' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}>
                                <div>
                                    <div className="flex justify-between items-center mb-4 text-slate-900">
                                        <h3 className="font-bold text-lg leading-tight">{item.title}</h3>
                                        <svg className={`w-5 h-5 transition-transform ${activeTab === index ? 'text-cyan-500 translate-x-1' : 'text-slate-300'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                    </div>
                                    <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
};
