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
    const [existingVerifiedId, setExistingVerifiedId] = useState<string | null>(null);

    const checkAndEnroll = async (forceReset = false) => {
        try {
            setLoading(true);
            setError(null);
            setQrCode(null); // Clear QR code when starting a new enrollment process
            setFactorId(null); // Clear factor ID
            setVerifyCode(''); // Clear verify code
            setExistingVerifiedId(null); // Clear existing verified ID

            // 1. List Factors
            const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
            if (listError) throw listError;

            // 2. Handle Existing Factors
            // 2. Handle Existing Factors
            if (factors.totp && factors.totp.length > 0) {
                // If we are forcing reset, unenroll ALL factors to be clean
                if (forceReset) {
                    // We iterate and await one by one
                    for (const f of factors.totp) {
                        try {
                            // console.log("Unenrolling factor:", f.id);
                            await supabase.auth.mfa.unenroll({ factorId: f.id });
                        } catch (unenrollErr) {
                            console.warn("Retrying unenrollment or ignoring error for:", f.id, unenrollErr);
                        }
                    }

                    // Small safety delay to ensure propagation
                    await new Promise(r => setTimeout(r, 500));
                } else {
                    // Check for VERIFIED factor
                    const verifiedFactor = factors.totp.find((f: any) => f.status === 'verified');
                    if (verifiedFactor) {
                        setExistingVerifiedId(verifiedFactor.id);
                        setLoading(false);
                        return; // Stop here, show UI to ask user what to do
                    }

                    // Check for UNVERIFIED and remove (stale)
                    const unverifiedFactor = factors.totp.find((f: any) => f.status === 'unverified');
                    if (unverifiedFactor) {
                        await supabase.auth.mfa.unenroll({ factorId: unverifiedFactor.id });
                    }
                }
            }

            // 3. Enroll new factor
            // Use a Friendly Name to avoid collision with default "" name if stubborn
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName: 'LOMAD',
            });

            if (error) throw error;

            setFactorId(data.id);
            setExistingVerifiedId(null); // Clear this state if we proceeded
            setQrCode(data.totp.qr_code);
        } catch (err: any) {
            console.error("MFA Enroll Error:", err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAndEnroll();
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

            // console.log("MFA Verified successfully");
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
            <h3 className="text-xl font-bold mb-4 text-gray-800">
                {existingVerifiedId ? 'Gerenciar Autenticação (2FA)' : 'Configurar Autenticação de Dois Fatores (2FA)'}
            </h3>

            {loading && !qrCode && <p className="text-gray-600">Carregando...</p>}

            {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4 text-sm">{error}</div>}

            {/* State: Already Verified */}
            {existingVerifiedId && !loading && (
                <div className="space-y-6 text-center">
                    <div className="bg-green-50 p-4 rounded-xl border border-green-200">
                        <div className="w-12 h-12 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h4 className="font-bold text-gray-800 mb-1">MFA Ativo</h4>
                        <p className="text-sm text-gray-600">Você já tem um método de autenticação configurado.</p>
                    </div>

                    <div className="space-y-3">
                        <button
                            onClick={() => checkAndEnroll(true)}
                            className="w-full py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors font-medium"
                        >
                            Redefinir / Configurar Novo
                        </button>
                        <button
                            onClick={onCancel}
                            className="w-full py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
                        >
                            Voltar
                        </button>
                    </div>
                </div>
            )}

            {/* State: Enrolling (Showing QR) */}
            {qrCode && !existingVerifiedId && (
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
