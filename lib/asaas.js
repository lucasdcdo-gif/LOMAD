import axios from 'axios';

const ASAAS_API_URL = 'https://sandbox.asaas.com/api/v3';

// Create axios instance with default headers
const asaas = axios.create({
    baseURL: ASAAS_API_URL,
    headers: {
        'access_token': process.env.ASAAS_API_KEY,
        'Content-Type': 'application/json'
    }
});

export const AsaasService = {
    /**
     * Search for a customer by email
     */
    async getCustomer(email) {
        try {
            const response = await asaas.get(`/customers?email=${email}`);
            if (response.data.data && response.data.data.length > 0) {
                return response.data.data[0];
            }
            return null;
        } catch (error) {
            console.error('Asaas getCustomer Error:', error.response?.status, error.response?.data || error.message);
            throw new Error(`Falha ao buscar cliente no Asaas: ${error.response?.data?.errors?.[0]?.description || error.message}`);
        }
    },

    /**
     * Create a new customer
     */
    async createCustomer(user) {
        try {
            const response = await asaas.post('/customers', {
                name: user.name,
                email: user.email,
                externalReference: user.id
            });
            return response.data;
        } catch (error) {
            console.error('Asaas createCustomer Error:', error.response?.status, error.response?.data || error.message);
            throw new Error('Falha ao criar cliente no Asaas');
        }
    },

    /**
     * Update an existing customer
     */
    async updateCustomer(customerId, userData) {
        try {
            const response = await asaas.post(`/customers/${customerId}`, {
                phone: userData.phone,
                postalCode: userData.postalCode,
                addressNumber: userData.addressNumber
            });
            return response.data;
        } catch (error) {
            console.error('Asaas updateCustomer Error:', error.response?.status, error.response?.data || error.message);
            throw new Error('Falha ao atualizar cliente no Asaas');
        }
    },

    /**
     * Create a new credit card payment
     * @param {string} customerId Asaas Customer ID
     * @param {object} paymentData { value, description, creditCard, creditCardHolderInfo }
     */
    async createPayment(customerId, paymentData) {
        try {
            const payload = {
                customer: customerId,
                billingType: 'CREDIT_CARD',
                value: paymentData.value,
                dueDate: new Date().toISOString().split('T')[0], // Due today
                description: paymentData.description,
                creditCard: paymentData.creditCard,
                creditCardHolderInfo: paymentData.creditCardHolderInfo,
                remoteIp: paymentData.remoteIp
            };

            const response = await asaas.post('/payments', payload);
            return response.data;
        } catch (error) {
            // Extract Asaas error message if available
            const asaasError = error.response?.data?.errors?.[0]?.description;
            throw new Error(asaasError || 'Falha ao processar pagamento');
        }
    },

    /**
     * Create a new subscription
     */
    async createSubscription(customerId, subscriptionData) {
        try {
            const payload = {
                customer: customerId,
                billingType: 'CREDIT_CARD',
                value: subscriptionData.value,
                nextDueDate: new Date().toISOString().split('T')[0], // Starts today
                description: subscriptionData.description,
                cycle: subscriptionData.cycle, // 'MONTHLY' or 'YEARLY'
                creditCard: subscriptionData.creditCard,
                creditCardHolderInfo: subscriptionData.creditCardHolderInfo,
                remoteIp: subscriptionData.remoteIp
            };

            const response = await asaas.post('/subscriptions', payload);
            return response.data;
        } catch (error) {
            console.error('Asaas createSubscription Error:', error.response?.status, error.response?.data || error.message);
            const asaasError = error.response?.data?.errors?.[0]?.description;
            throw new Error(asaasError || 'Falha ao criar assinatura');
        }
    },

    /**
     * Cancel a subscription
     */
    async cancelSubscription(subscriptionId) {
        try {
            const response = await asaas.delete(`/subscriptions/${subscriptionId}`);
            return response.data;
        } catch (error) {
            throw new Error('Falha ao cancelar assinatura');
        }
    },

    /**
     * Get a subscription by ID
     */
    async getSubscription(subscriptionId) {
        try {
            const response = await asaas.get(`/subscriptions/${subscriptionId}`);
            return response.data;
        } catch (error) {
            throw new Error('Falha ao buscar assinatura');
        }
    },

    /**
     * Get payments for a specific subscription
     */
    async getSubscriptionPayments(subscriptionId) {
        try {
            const response = await asaas.get(`/subscriptions/${subscriptionId}/payments`);
            return response.data.data; // Returns array of payments
        } catch (error) {
            console.error('Asaas getSubscriptionPayments Error:', error.response?.data || error.message);
            throw new Error('Falha ao buscar pagamentos da assinatura');
        }
    },

    /**
     * Refund a specific payment
     */
    async refundPayment(paymentId) {
        try {
            const response = await asaas.post(`/payments/${paymentId}/refund`, {
                value: null, // Full refund if null
                description: "Cancelamento no prazo de 7 dias (CDC Art. 49)"
            });
            return response.data;
        } catch (error) {
            console.error('Asaas refundPayment Error:', error.response?.data || error.message);
            const asaasError = error.response?.data?.errors?.[0]?.description;
            // Ignore if already refunded to avoid breaking the flow
            if (asaasError && asaasError.includes('estornado')) return { status: 'REFUNDED' };
            throw new Error(asaasError || 'Falha ao estornar pagamento');
        }
    }
};
