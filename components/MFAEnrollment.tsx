import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface Props {
    onEnrolled: () => void;
    onCancel: () => void;
}

export const MFAEnrollment: React.FC<Props> = ({ onEnrolled, onCancel }) => {
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [factorId, setFactorId] = useState<string | null>(null);
    const [verifyCode, setVerifyCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const enroll = async () => {
            try {
                setLoading(true);
                const { data, error } = await supabase.auth.mfa.enroll({
                    factorType: 'totp',
                });

                if (error) throw error;

                setFactorId(data.id);
                // Supabase returns an SVG string in data.totp.qr_code
                setQrCode(data.totp.qr_code);
            } catch (err: any) {
                console.error("MFA Enroll Error:", err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        enroll();
    }, []);

    const handleVerify = async () => {
        if (!factorId || !verifyCode) return;

        try {
            setLoading(true);
            setError(null);

            const { data, error } = await supabase.auth.mfa.challengeAndVerify({
                factorId,
                code: verifyCode,
            });

            if (error) throw error;

            console.log("MFA Verified successfully:", data);
            onEnrolled();
        } catch (err: any) {
            console.error("MFA Verify Error:", err);
            setError("Código incorreto ou expirado. Tente novamente.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg max-w-md mx-auto">
            <h3 className="text-xl font-bold mb-4 text-gray-800">Coonfigurar Autenticação de Dois Fatores (2FA)</h3>

            {loading && !qrCode && <p className="text-gray-600">Gerando QR Code...</p>}

            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

            {qrCode && (
                <div className="space-y-6">
                    <div className="flex flex-col items-center">
                        <p className="text-sm text-gray-600 mb-2 text-center">
                            Escaneie este QR Code com seu aplicativo autenticador (Google Authenticator, Authy, etc).
                        </p>
                        <div className="border p-2 rounded bg-gray-50">
                            <img src={qrCode} alt="QR Code" className="w-48 h-48" />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Código de Verificação (6 dígitos)
                        </label>
                        <input
                            type="text"
                            value={verifyCode}
                            onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            className="w-full p-2 border rounded focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center text-xl tracking-widest text-gray-900 bg-white"
                            placeholder="000 000"
                            disabled={loading}
                        />
                    </div>

                    <div className="flex space-x-3">
                        <button
                            onClick={handleVerify}
                            disabled={loading || verifyCode.length !== 6}
                            className="flex-1 bg-indigo-600 text-white py-2 rounded hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                        >
                            {loading ? 'Verificando...' : 'Ativar 2FA'}
                        </button>
                        <button
                            onClick={onCancel}
                            disabled={loading}
                            className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
