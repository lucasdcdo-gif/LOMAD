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
                    {/* Redes Sociais */}
                    <div className="flex gap-4 pt-2">
                        <a href="https://linkedin.com/in/lomad-ia-82ab033a7" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors" aria-label="LinkedIn">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path fillRule="evenodd" d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" clipRule="evenodd" />
                            </svg>
                        </a>
                        <a href="https://www.instagram.com/lomad_ia?igsh=MTk3dWN2emVpZWVyaQ%3D%3D&utm_source=qr" target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-cyan-400 transition-colors" aria-label="Instagram">
                            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                                <path fillRule="evenodd" d="M12.315 2c2.43 0 2.784.013 3.808.06 1.064.049 1.791.218 2.427.465a4.902 4.902 0 011.772 1.153 4.902 4.902 0 011.153 1.772c.247.636.416 1.363.465 2.427.048 1.067.06 1.407.06 4.123v.08c0 2.643-.012 2.987-.06 4.043-.049 1.064-.218 1.791-.465 2.427a4.902 4.902 0 01-1.153 1.772 4.902 4.902 0 01-1.772 1.153c-.636.247-1.363.416-2.427.465-1.067.048-1.407.06-4.123.06h-.08c-2.643 0-2.987-.012-4.043-.06-1.064-.049-1.791-.218-2.427-.465a4.902 4.902 0 01-1.772-1.153 4.902 4.902 0 01-1.153-1.772c-.247-.636-.416-1.363-.465-2.427-.047-1.024-.06-1.379-.06-3.808v-.63c0-2.43.013-2.784.06-3.808.049-1.064.218-1.791.465-2.427a4.902 4.902 0 011.153-1.772 4.902 4.902 0 011.772-1.153c.636-.247 1.363-.416 2.427-.465 1.067-.047 1.409-.06 3.809-.06zm0-2c-2.739 0-3.09.01-4.088.056-1.637.076-2.775.376-3.763.76a6.902 6.902 0 00-2.518 1.637 6.902 6.902 0 00-1.637 2.518c-.384.988-.684 2.126-.76 3.763-.046.999-.056 1.349-.056 4.088 0 2.739.01 3.09.056 4.088.076 1.637.376 2.775.76 3.763.53 1.353 1.415 2.239 2.768 2.768.988.384 2.126.684 3.763.76.999.046 1.349.056 4.088.056 2.739 0 3.09-.01 4.088-.056 1.637-.076 2.775-.376 3.763-.76a6.899 6.899 0 002.518-1.637 6.9 6.9 0 001.637-2.518c.384-.988.684-2.126.76-3.763.046-.999.056-1.349.056-4.088s-.01-3.09-.056-4.088c-.076-1.637-.376-2.775-.76-3.763a6.9 6.9 0 00-1.637-2.518 6.9 6.9 0 00-2.518-1.637c-.988-.384-2.126-.684-3.763-.76C15.405 2.01 15.055 2 12.315 2zm6.406 3.843a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881zM12.315 7.427a4.907 4.907 0 11-4.906 4.907 4.907 4.907 0 014.906-4.907zm0 2a2.907 2.907 0 102.906 2.907 2.907 2.907 0 00-2.906-2.907z" clipRule="evenodd" />
                            </svg>
                        </a>
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
