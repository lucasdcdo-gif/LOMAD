import React, { useState } from 'react';

// Payment Modal Component
interface PaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCheckout: (plan: 'monthly' | 'yearly' | 'PRO_PLUS' | 'LOMAD_PLUS' | 'ADDON_10H', cardData: any, couponCode?: string) => Promise<void>;
    loading: boolean;
    userRole: string; // To detect if upgrading
    translations?: any;
    pricing?: { monthly: number; yearly: number }; // Pricing from DB
    cardForm: any; // Assuming cardForm is still passed as a prop
    setCardForm: (form: any) => void; // Assuming setCardForm is still passed as a prop
    error: string | null; // Assuming error is still passed as a prop
    selectedPlan: 'monthly' | 'yearly' | 'PRO_PLUS' | 'LOMAD_PLUS' | 'ADDON_10H';
    setSelectedPlan: (plan: 'monthly' | 'yearly' | 'PRO_PLUS' | 'LOMAD_PLUS' | 'ADDON_10H') => void;
}

export const PaymentModal = ({
    isOpen,
    onClose,
    onCheckout,
    loading,
    userRole,
    translations,
    pricing,
    cardForm,
    setCardForm,
    error,
    selectedPlan,
    setSelectedPlan
}: PaymentModalProps) => {
    if (!isOpen) return null;

    const publicPricing = pricing || {
        monthly: { price: 27.90, active: true },
        yearly: { price: 287.90, active: true },
        pro_plus: { price: 98.00, active: true },
        lomad_plus: { price: 199.00, active: true },
        addon_10h: { price: 129.00, active: true }
    };

    const getPlanInfo = (planKey: string) => {
        const p = (publicPricing as any)[planKey.toLowerCase()];
        if (!p) return { price: 0, active: false };
        // Handle legacy number format
        if (typeof p === 'number') return { price: p, active: true };
        return { price: p.price, active: p.active !== false };
    };

    const getPlanPrice = (plan: 'monthly' | 'yearly' | 'PRO_PLUS' | 'LOMAD_PLUS' | 'ADDON_10H') => {
        return getPlanInfo(plan).price;
    };

    const isPlanActive = (plan: 'monthly' | 'yearly' | 'PRO_PLUS' | 'LOMAD_PLUS' | 'ADDON_10H') => {
        return getPlanInfo(plan).active;
    };

    const [couponInput, setCouponInput] = useState('');
    const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
    const [couponLoadingState, setCouponLoadingState] = useState(false);
    const [couponMessage, setCouponMessage] = useState<{ type: 'error' | 'success', text: string } | null>(null);

    const getFinalPrice = (plan: 'monthly' | 'yearly' | 'PRO_PLUS' | 'LOMAD_PLUS' | 'ADDON_10H') => {
        const basePrice = getPlanPrice(plan);
        if (!appliedCoupon) return basePrice;
        if (appliedCoupon.type === 'PERCENTAGE') {
            return basePrice - (basePrice * (appliedCoupon.value / 100));
        }
        return Math.max(0, basePrice - appliedCoupon.value);
    };

    const handleApplyCoupon = async () => {
        if (!couponInput.trim()) return;
        setCouponLoadingState(true);
        setCouponMessage(null);
        try {
            const res = await fetch(`/api/coupons/validate?code=${encodeURIComponent(couponInput.trim())}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Cupom inválido');
            setAppliedCoupon(data.coupon);
            setCouponMessage({ type: 'success', text: `Cupom aplicado! Desconto de ${data.coupon.type === 'PERCENTAGE' ? data.coupon.value + '%' : 'R$ ' + data.coupon.value}.` });
            setCouponInput('');
        } catch (e: any) {
            setAppliedCoupon(null);
            setCouponMessage({ type: 'error', text: e.message || 'Erro ao validar cupom.' });
        } finally {
            setCouponLoadingState(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onCheckout(selectedPlan, cardForm, appliedCoupon?.code);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-white/10 text-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-lg w-full mt-16 mb-8 animate-bounce-in">
                <div className="text-center mb-6">
                    <h2 className="text-3xl font-black text-white mb-2">Dados do Pagamento</h2>
                    <p className="text-slate-400 text-sm">Complete seus dados para finalizar a assinatura</p>
                </div>

                {error && (
                    <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
                        <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <p className="text-sm font-bold text-red-400 text-left">{error}</p>
                    </div>
                )}

                {/* Plan Selection Toggle */}
                <div className="mb-6 space-y-3">
                    <label className="block text-sm font-bold text-slate-300 mb-2">ESCOLHA SEU PLANO</label>
                    {/* PLAN SELECTION - DYNAMIC */}
                    <div className="space-y-4 mb-6">
                        {/* Standard PRO Plans */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => isPlanActive('monthly') && setSelectedPlan('monthly')}
                                disabled={!isPlanActive('monthly')}
                                className={`p-4 rounded-xl border-2 transition-all text-left relative ${!isPlanActive('monthly') ? 'opacity-50 cursor-not-allowed border-white/5 bg-slate-950/30' :
                                    selectedPlan === 'monthly'
                                        ? 'border-cyan-500 bg-cyan-500/10'
                                        : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-white">PRO Mensal</span>
                                    {selectedPlan === 'monthly' && <div className="w-3 h-3 rounded-full bg-cyan-500"></div>}
                                </div>
                                {isPlanActive('monthly') ? (
                                    <div className="text-cyan-400 font-black text-xl">R$ {getPlanPrice('monthly').toFixed(2).replace('.', ',')}<span className="text-xs text-slate-400 font-normal">/mês</span></div>
                                ) : (
                                    <div className="text-slate-500 font-bold text-lg uppercase">Em Breve</div>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => isPlanActive('yearly') && setSelectedPlan('yearly')}
                                disabled={!isPlanActive('yearly')}
                                className={`p-4 rounded-xl border-2 transition-all text-left relative ${!isPlanActive('yearly') ? 'opacity-50 cursor-not-allowed border-white/5 bg-slate-950/30' :
                                    selectedPlan === 'yearly'
                                        ? 'border-emerald-500 bg-emerald-500/10'
                                        : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                                    }`}
                            >
                                {isPlanActive('yearly') && <div className="absolute -top-3 right-4 bg-emerald-600 text-xs px-2 py-0.5 rounded-full font-bold text-white">ECONOMIZE 14%</div>}
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-white">PRO Anual</span>
                                    {selectedPlan === 'yearly' && <div className="w-3 h-3 rounded-full bg-emerald-500"></div>}
                                </div>
                                {isPlanActive('yearly') ? (
                                    <div className="text-emerald-400 font-black text-xl">R$ {getPlanPrice('yearly').toFixed(2).replace('.', ',')}<span className="text-xs text-slate-400 font-normal">/ano</span></div>
                                ) : (
                                    <div className="text-slate-500 font-bold text-lg uppercase">Em Breve</div>
                                )}
                            </button>
                        </div>

                        {/* HIGH TIER PLANS */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <button
                                type="button"
                                onClick={() => isPlanActive('PRO_PLUS') && setSelectedPlan('PRO_PLUS')}
                                disabled={!isPlanActive('PRO_PLUS')}
                                className={`p-4 rounded-xl border-2 transition-all text-left relative ${!isPlanActive('PRO_PLUS') ? 'opacity-50 cursor-not-allowed border-white/5 bg-slate-950/30' :
                                    selectedPlan === 'PRO_PLUS'
                                        ? 'border-purple-500 bg-purple-500/10'
                                        : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-purple-400">PRO+</span>
                                    {selectedPlan === 'PRO_PLUS' && <div className="w-3 h-3 rounded-full bg-purple-500"></div>}
                                </div>
                                {isPlanActive('PRO_PLUS') ? (
                                    <div className="text-white font-black text-xl">R$ {getPlanPrice('PRO_PLUS').toFixed(2).replace('.', ',')}<span className="text-xs text-slate-400 font-normal">/mês</span></div>
                                ) : (
                                    <div className="text-slate-500 font-bold text-lg uppercase">Em Breve</div>
                                )}
                                <ul className="mt-2 text-xs text-slate-300 space-y-1">
                                    <li>• Bot em Reuniões</li>
                                    <li>• 10 Horas mensais</li>
                                </ul>
                            </button>

                            <button
                                type="button"
                                onClick={() => isPlanActive('LOMAD_PLUS') && setSelectedPlan('LOMAD_PLUS')}
                                disabled={!isPlanActive('LOMAD_PLUS')}
                                className={`p-4 rounded-xl border-2 transition-all text-left relative ${!isPlanActive('LOMAD_PLUS') ? 'opacity-50 cursor-not-allowed border-white/5 bg-slate-950/30' :
                                    selectedPlan === 'LOMAD_PLUS'
                                        ? 'border-amber-500 bg-amber-500/10'
                                        : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                                    }`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-amber-400">LOMAD+</span>
                                    {selectedPlan === 'LOMAD_PLUS' && <div className="w-3 h-3 rounded-full bg-amber-500"></div>}
                                </div>
                                {isPlanActive('LOMAD_PLUS') ? (
                                    <div className="text-white font-black text-xl">R$ {getPlanPrice('LOMAD_PLUS').toFixed(2).replace('.', ',')}<span className="text-xs text-slate-400 font-normal">/mês</span></div>
                                ) : (
                                    <div className="text-slate-500 font-bold text-lg uppercase">Em Breve</div>
                                )}
                                <ul className="mt-2 text-xs text-slate-300 space-y-1">
                                    <li>• Horas ILIMITADAS</li>
                                    <li>• Suporte Prioritário</li>
                                </ul>
                            </button>
                        </div>

                        {/* Add-on Option - ONLY VISIBLE TO PRO+ USERS */}
                        {userRole === 'PRO_PLUS' && (
                            <button
                                type="button"
                                onClick={() => isPlanActive('ADDON_10H') && setSelectedPlan('ADDON_10H')}
                                disabled={!isPlanActive('ADDON_10H')}
                                className={`w-full p-3 rounded-xl border border-dashed transition-all flex items-center justify-between ${!isPlanActive('ADDON_10H') ? 'opacity-50 cursor-not-allowed border-slate-700 bg-slate-900' :
                                    selectedPlan === 'ADDON_10H'
                                        ? 'border-blue-400 bg-blue-400/10'
                                        : 'border-slate-600 hover:border-slate-400 hover:bg-slate-800'
                                    }`}
                            >
                                <div className="text-left">
                                    <span className="block font-bold text-sm text-slate-200">+ 10 Horas Avulsas</span>
                                    <span className="text-xs text-slate-500">Válido indefinidamente</span>
                                </div>
                                <div className="text-right">
                                    {isPlanActive('ADDON_10H') ? (
                                        <span className="block font-bold text-white">R$ {getPlanPrice('ADDON_10H').toFixed(2).replace('.', ',')}</span>
                                    ) : (
                                        <span className="block font-bold text-slate-500 text-xs uppercase">Em Breve</span>
                                    )}
                                    {selectedPlan === 'ADDON_10H' && <span className="text-[10px] text-blue-400 font-bold uppercase">Selecionado</span>}
                                </div>
                            </button>
                        )}
                    </div>
                </div>

                {/* Coupon Section */}
                <div className="mb-6 p-4 rounded-xl border border-white/10 bg-slate-900/50 flex flex-col gap-3">
                    <label className="block text-sm font-bold text-slate-300">CUPOM DE DESCONTO (OPCIONAL)</label>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={couponInput}
                            onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                            className="flex-1 bg-slate-950/80 border border-white/10 rounded-lg px-4 py-2 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 uppercase transition-all"
                            placeholder="INSERIR CÓDIGO"
                            disabled={couponLoadingState || !!appliedCoupon}
                        />
                        {appliedCoupon ? (
                            <button
                                type="button"
                                onClick={() => { setAppliedCoupon(null); setCouponMessage(null); }}
                                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/40 text-red-400 font-bold rounded-lg transition-colors border border-red-500/30"
                            >
                                Remover
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={handleApplyCoupon}
                                disabled={!couponInput.trim() || couponLoadingState}
                                className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 font-bold rounded-lg transition-colors disabled:opacity-50 border border-white/5"
                            >
                                {couponLoadingState ? 'Validando...' : 'Aplicar'}
                            </button>
                        )}
                    </div>
                    {couponMessage && (
                        <p className={`text-xs font-bold ${couponMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                            {couponMessage.text}
                        </p>
                    )}
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">NOME NO CARTÃO</label>
                        <input
                            type="text"
                            required
                            value={cardForm.name}
                            onChange={e => setCardForm({ ...cardForm, name: e.target.value.toUpperCase() })}
                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all uppercase"
                            placeholder="COMO NO CARTÃO"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">NÚMERO DO CARTÃO</label>
                        <input
                            type="text"
                            required
                            maxLength={19}
                            value={cardForm.number}
                            onChange={e => {
                                const val = e.target.value.replace(/\s/g, '').replace(/(\d{4})/g, '$1 ').trim();
                                setCardForm({ ...cardForm, number: val });
                            }}
                            className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                            placeholder="0000 0000 0000 0000"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-2">VALIDADE</label>
                            <input
                                type="text"
                                required
                                maxLength={5}
                                value={cardForm.expiry}
                                onChange={e => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.length >= 2) val = val.slice(0, 2) + '/' + val.slice(2, 4);
                                    setCardForm({ ...cardForm, expiry: val });
                                }}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="MM/AA"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-2">CVC</label>
                            <input
                                type="text"
                                required
                                maxLength={3}
                                value={cardForm.cvc}
                                onChange={e => setCardForm({ ...cardForm, cvc: e.target.value.replace(/\D/g, '') })}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="123"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-2">CPF/CNPJ</label>
                            <input
                                type="text"
                                required
                                maxLength={18}
                                value={cardForm.cpf}
                                onChange={e => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    if (val.length <= 11) {
                                        val = val.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
                                    } else {
                                        val = val.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
                                    }
                                    setCardForm({ ...cardForm, cpf: val });
                                }}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="000.000.000-00"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-slate-300 mb-2">TELEFONE</label>
                            <input
                                type="text"
                                required
                                maxLength={15}
                                value={cardForm.phone}
                                onChange={e => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    val = val.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2');
                                    setCardForm({ ...cardForm, phone: val });
                                }}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="(00) 00000-0000"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-12 gap-4">
                        <div className="col-span-6 md:col-span-5">
                            <label className="block text-sm font-bold text-slate-300 mb-2">CEP</label>
                            <input
                                type="text"
                                required
                                maxLength={9}
                                value={cardForm.postalCode}
                                onChange={e => {
                                    let val = e.target.value.replace(/\D/g, '');
                                    val = val.replace(/^(\d{5})(\d)/, '$1-$2');
                                    setCardForm({ ...cardForm, postalCode: val });
                                }}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="00000-000"
                            />
                        </div>
                        <div className="col-span-6 md:col-span-3">
                            <label className="block text-sm font-bold text-slate-300 mb-2">NÚMERO</label>
                            <input
                                type="text"
                                required
                                value={cardForm.addressNumber}
                                onChange={e => setCardForm({ ...cardForm, addressNumber: e.target.value })}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="123"
                            />
                        </div>
                        <div className="col-span-12 md:col-span-4">
                            <label className="block text-sm font-bold text-slate-300 mb-2 whitespace-nowrap overflow-hidden text-ellipsis">COMPLEMENTO</label>
                            <input
                                type="text"
                                value={cardForm.complement || ''}
                                onChange={e => setCardForm({ ...cardForm, complement: e.target.value })}
                                className="w-full bg-slate-950/50 border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 transition-all"
                                placeholder="Ex: Apto 101"
                            />
                        </div>
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                setCardForm({ number: '', name: '', expiry: '', cvc: '', cpf: '', phone: '', postalCode: '', addressNumber: '', complement: '' });
                            }}
                            className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors"
                            disabled={loading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Processando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    {appliedCoupon ? (
                                        <span className="flex flex-col items-center leading-tight">
                                            <span className="line-through text-[10px] text-white/50">R$ {getPlanPrice(selectedPlan).toFixed(2).replace('.', ',')}</span>
                                            <span>Pagar R$ {getFinalPrice(selectedPlan).toFixed(2).replace('.', ',')}</span>
                                        </span>
                                    ) : (
                                        <span>Pagar R$ {getPlanPrice(selectedPlan).toFixed(2).replace('.', ',')}</span>
                                    )}
                                </>
                            )}
                        </button>
                    </div>
                    <p className="mt-4 text-center text-[10px] text-slate-500 leading-tight">
                        Em conformidade com o Art. 49 do CDC, você tem 7 dias para cancelamento e reembolso total em caso de arrependimento.
                    </p>
                </form>
            </div>
        </div>
    );
};
