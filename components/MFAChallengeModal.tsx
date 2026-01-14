import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    onSuccess: () => void;
    onCancel: () => void; // Usually logs out
}

export const MFAChallengeModal: React.FC<Props> = ({ onSuccess, onCancel }) => {
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (code.length !== 6) return;

        try {
            setLoading(true);
            setError(null);

            // 1. Get available factors
            const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
            if (factorsError) throw factorsError;

            const totpFactor = factors.totp[0]; // Assuming one factor for simplicity

            if (!totpFactor) {
                throw new Error("Nenhum fator MFA encontrado.");
            }

            // 2. Challenge and Verify
            const { data, error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                factorId: totpFactor.id,
                code: code,
            });

            if (verifyError) throw verifyError;

            console.log("MFA Login Verified:", data);
            onSuccess();
        } catch (err: any) {
            console.error("MFA Challenge Error:", err);
            setError("Código incorreto. Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-2">Verificação em Duas Etapas</h2>
                <p className="text-sm text-gray-600 mb-6">
                    Sua conta está protegida com MFA. Insira o código do seu aplicativo autenticador.
                </p>

                {error && <div className="bg-red-100 text-red-700 p-2 rounded mb-4 text-sm text-center">{error}</div>}

                <form onSubmit={handleSubmit}>
                    <input
                        type="text"
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        className="w-full p-3 border rounded text-2xl text-center tracking-[0.5em] font-mono mb-6 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-900 bg-white"
                        placeholder="000000"
                        autoFocus
                    />

                    <div className="space-y-3">
                        <button
                            type="submit"
                            disabled={loading || code.length !== 6}
                            className="w-full bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors font-medium"
                        >
                            {loading ? 'Verificando...' : 'Confirmar'}
                        </button>

                        <button
                            type="button"
                            onClick={onCancel}
                            className="w-full text-gray-500 text-sm hover:underline"
                        >
                            Cancelar e Sair
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
