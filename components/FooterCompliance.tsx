import React from 'react';

interface FooterProps {
    companyName?: string;
    cnpj?: string;
    address?: string;
    email?: string;
    onTermsClick: () => void;
    onPrivacyClick: () => void;
}

export const FooterCompliance: React.FC<FooterProps> = ({
    companyName = "LOMAD TECNOLOGIA", // Placeholder
    cnpj = "64.644.169/0001-67",
    address,
    email = "contato@LOMAD.com.br",
    onTermsClick,
    onPrivacyClick
}) => {
    return (
        <footer className="w-full bg-slate-950 border-t border-white/10 py-12 px-6 mt-auto">
            <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-8">
                {/* Identificação Legal (Decreto 7.962/2013) */}
                <div className="md:col-span-2 space-y-4">
                    <h4 className="text-white font-bold uppercase tracking-wider text-sm">Identificação</h4>
                    <div className="text-slate-400 text-sm space-y-1">
                        <p className="font-bold text-slate-300">{companyName}</p>
                        {cnpj && <p>CNPJ: {cnpj}</p>}
                        {address && <p>{address}</p>}
                        <p>Email: {email}</p>
                    </div>
                </div>

                {/* Links Úteis */}
                <div className="space-y-4">
                    <h4 className="text-white font-bold uppercase tracking-wider text-sm">Legal</h4>
                    <ul className="space-y-2 text-sm text-slate-400">
                        <li>
                            <button onClick={onTermsClick} className="hover:text-cyan-400 transition-colors">Termos de Uso</button>
                        </li>
                        <li>
                            <button onClick={onPrivacyClick} className="hover:text-cyan-400 transition-colors">Política de Privacidade</button>
                        </li>
                        <li>
                            <button className="hover:text-cyan-400 transition-colors" onClick={() => window.open('https://www.gov.br/defesa/pt-br', '_blank')}>Código de Defesa do Consumidor</button>
                        </li>
                    </ul>
                </div>

                {/* Segurança */}
                <div className="space-y-4">
                    <h4 className="text-white font-bold uppercase tracking-wider text-sm">Segurança</h4>
                    <div className="flex items-center gap-2 text-emerald-400 text-sm font-bold">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        <span>Site Seguro (SSL)</span>
                    </div>
                    <p className="text-xs text-slate-500">Seus dados estão protegidos conforme a LGPD.</p>
                </div>
            </div>
            <div className="mt-12 pt-8 border-t border-white/5 text-center text-slate-600 text-xs">
                <p>&copy; {new Date().getFullYear()} {companyName}. Todos os direitos reservados.</p>
            </div>
        </footer>
    );
};
