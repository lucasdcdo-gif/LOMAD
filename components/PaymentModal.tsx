// Payment Modal Component
export const PaymentModal = ({
    isOpen,
    onClose,
    selectedPlan,
    setSelectedPlan,
    publicPricing,
    cardForm,
    setCardForm,
    handleCheckout,
    paymentLoading,
    error
}: any) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-start justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-white/10 text-white rounded-3xl shadow-2xl p-6 md:p-8 max-w-lg w-full mt-16 mb-8 animate-bounce-in">
                <div className="text-center mb-6">
                    <h2 className="text-3xl font-black text-white mb-2">Dados do Pagamento</h2>
                    <p className="text-slate-400 text-sm">Complete seus dados para finalizar a assinatura {selectedPlan === 'monthly' ? 'Mensal' : 'Anual'}</p>
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
                    <div className="space-y-2">
                        <button
                            type="button"
                            onClick={() => setSelectedPlan('monthly')}
                            className={`w-full p-4 rounded-xl border-2 transition-all ${selectedPlan === 'monthly'
                                ? 'border-cyan-500 bg-cyan-500/10'
                                : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPlan === 'monthly' ? 'border-cyan-500' : 'border-white/30'
                                        }`}>
                                        {selectedPlan === 'monthly' && (
                                            <div className="w-3 h-3 rounded-full bg-cyan-500"></div>
                                        )}
                                    </div>
                                    <span className="font-bold text-white">Mensal</span>
                                </div>
                                <span className="text-cyan-400 font-black">R$ {publicPricing.monthly.toFixed(2).replace('.', ',')}/mês</span>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSelectedPlan('yearly')}
                            className={`w-full p-4 rounded-xl border-2 transition-all ${selectedPlan === 'yearly'
                                ? 'border-emerald-500 bg-emerald-500/10'
                                : 'border-white/10 bg-slate-950/50 hover:border-white/20'
                                }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedPlan === 'yearly' ? 'border-emerald-500' : 'border-white/30'
                                        }`}>
                                        {selectedPlan === 'yearly' && (
                                            <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
                                        )}
                                    </div>
                                    <span className="font-bold text-white">Anual</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-emerald-400 font-black block">R$ {publicPricing.yearly.toFixed(2).replace('.', ',')}/ano</span>
                                    <span className="text-xs text-emerald-400">💰 Economize 2 meses!</span>
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                <form onSubmit={handleCheckout} className="space-y-4">
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

                    <div className="grid grid-cols-2 gap-4">
                        <div>
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
                        <div>
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
                    </div>

                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={() => {
                                onClose();
                                setCardForm({ number: '', name: '', expiry: '', cvc: '', cpf: '', phone: '', postalCode: '', addressNumber: '' });
                            }}
                            className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-bold rounded-xl transition-colors"
                            disabled={paymentLoading}
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            disabled={paymentLoading}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-emerald-500 text-white font-bold rounded-xl hover:shadow-lg hover:shadow-cyan-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                        >
                            {paymentLoading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                    Processando...
                                </>
                            ) : (
                                <>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                    Pagar R$ {selectedPlan === 'monthly' ? publicPricing.monthly.toFixed(2).replace('.', ',') : publicPricing.yearly.toFixed(2).replace('.', ',')}
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
