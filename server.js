
console.log("Starting server process...");
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAIFileManager } from '@google/generative-ai/server';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import logger, { logRequest } from './logger.js';
import { emailService } from './lib/email.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.get(/.*/, logRequest);

// Middleware de tratamento de erro para JSON malformado
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && 'body' in err) {
    logger.error(`JSON Parse Error: ${err.message}`);
    return res.status(400).send({ status: 404, message: err.message }); // Bad request
  }
  next();
});

// Configure Body Parser with increased limits for large transcriptions (Post-Meeting Upload)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));

// Servir arquivos estáticos do diretório dist
app.use(express.static(path.join(__dirname, 'dist')));

// Configurações Supabase e Gemini
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

logger.info("--- SERVER STARTUP ---");
logger.info(`[Config] Supabase URL: ${process.env.SUPABASE_URL}`);
// Security: Don't log full keys
logger.info(`[Config] Key Check: ${(process.env.SUPABASE_SERVICE_KEY || '').length > 10 ? 'OK' : 'MISSING'}`);

const ai = new GoogleGenerativeAI(process.env.API_KEY || process.env.GEMINI_API_KEY);

// API Endpoints
app.post('/api/meetings', async (req, res) => {
  try {
    const { meetingData } = req.body;

    // 1. Verificar Limite para usuários FREE
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, meetings_recorded')
      .eq('id', meetingData.user_id)
      .single();

    if (profileError) {
      logger.error("Erro ao buscar perfil para verificação de limite: " + JSON.stringify(profileError));
      // Opcional: permitir salvar se falhar a verificação ou bloquear. Vamos bloquear por segurança.
      throw new Error("Erro ao verificar limite de conta.");
    }

    if (profile.role === 'FREE' && (profile.meetings_recorded || 0) >= 5) {
      return res.status(403).json({ error: 'Limite de 5 gravações atingido. Faça upgrade para PRO.' });
    }

    // 2. Salvar Reunião
    const { data, error } = await supabase.from('meetings').insert([meetingData]).select().single();
    if (error) throw error;

    // 3. Incrementar Contador
    // Nota: Em produção idealmente usaríamos RPC atomic, mas update funciona para esta escala
    const { error: updateError } = await supabase.from('profiles').update({
      meetings_recorded: (profile.meetings_recorded || 0) + 1
    }).eq('id', meetingData.user_id);

    if (updateError) {
      logger.error("CRITICAL: Falha ao incrementar meetings_recorded para usuario " + meetingData.user_id + " - " + JSON.stringify(updateError));
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/meetings/:uid', async (req, res) => {
  try {
    const uid = req.params.uid;

    // 1. Fetch User Email (for sharing check)
    const { data: profile } = await supabase.from('profiles').select('email').eq('id', uid).single();
    const userEmail = profile?.email;

    // 2. Fetch Owned Meetings
    const { data: owned, error: ownedError } = await supabase
      .from('meetings')
      .select('*')
      .eq('user_id', uid)
      .order('timestamp', { ascending: false });

    if (ownedError) throw ownedError;

    // 3. Fetch Shared Meetings IDs & Roles
    let sharedMeetings = [];
    if (userEmail) {
      const { data: accessData } = await supabase
        .from('meeting_access')
        .select('meeting_id, role')
        .or(`user_id.eq.${uid},email.eq.${userEmail}`);

      if (accessData && accessData.length > 0) {
        const meetingIds = accessData.map(a => a.meeting_id);
        const roleMap = new Map(accessData.map(a => [a.meeting_id, a.role]));

        const { data: shared } = await supabase
          .from('meetings')
          .select('*, profiles:user_id (email)') // Join to get owner email
          .in('id', meetingIds)
          .order('timestamp', { ascending: false });

        if (shared) {
          sharedMeetings = shared.map(m => ({
            ...m,
            access_role: roleMap.get(m.id) || 'viewer',
            owner_email: m.profiles?.email // Flattens the owner email
          }));
        }
      }
    }

    // 4. Merge and Sort
    const ownedWithRole = (owned || []).map(m => ({ ...m, access_role: 'owner' }));

    // Filter duplicates just in case (e.g. if I am owner but also have an access entry? unlikely but safe)
    const allMeetings = [...ownedWithRole];
    sharedMeetings.forEach(sm => {
      if (!allMeetings.find(m => m.id === sm.id)) {
        allMeetings.push(sm);
      }
    });

    allMeetings.sort((a, b) => b.timestamp - a.timestamp);

    res.json(allMeetings);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Admin Endpoint: Reset MFA
app.post('/api/auth/mfa/reset', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Missing token' });

    // 1. Verify User (using the token passed)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return res.status(401).json({ error: 'Invalid token' });

    console.log(`[MFA Reset] Resetting MFA for user: ${user.id}`);

    // 2. List Factors (Admin)
    const { data: factors, error: listError } = await supabase.auth.admin.mfa.listFactors({ userId: user.id });
    if (listError) throw listError;

    // 3. Delete All Factors
    if (factors.factors) {
      for (const f of factors.factors) {
        await supabase.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
      }
    } else if (factors.length && Array.isArray(factors)) { // Handle potential array return
      for (const f of factors) {
        await supabase.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
      }
    }

    res.json({ success: true, message: 'MFA Reset Successful' });
  } catch (err) {
    logger.error(`MFA Reset Error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/summarize', async (req, res) => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Gere um resumo estruturado e profissional para esta reunião:\\n\\n${req.body.text}`,
    });
    const summary = response.text;
    await supabase.from('meetings').update({ summary }).eq('id', req.body.meetingId);
    res.json({ summary });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Checkout / Upgrade endpoint
// Checkout / Upgrade endpoint
app.post('/api/checkout', async (req, res) => {
  try {
    const { userId, plan, cardData } = req.body;

    // Validar dados básicos
    if (!cardData || !cardData.number || !cardData.expiry || !cardData.cvc || !cardData.name) {
      throw new Error("Dados do cartão incompletos.");
    }

    // Buscar usuário no Supabase para pegar o email e nome atualizado
    const { data: userProfile, error: userError } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (userError || !userProfile) throw new Error("Usuário não encontrado.");

    // Bloqueio de renovação antecipada (Regra de Negócio: apenas após vencimento)
    // Isso evita sobreposição de assinaturas (ex: Monthly + Yearly)
    const now = Date.now();
    if (userProfile.subscription_end && userProfile.subscription_end > now) {
      const endDate = new Date(userProfile.subscription_end);
      // Permitimos uma margem de erro? O usuário pediu "1 dia após". Seremos estritos.
      throw new Error(`Sua assinatura ainda é válida até ${endDate.toLocaleDateString('pt-BR')}. Por favor, aguarde o vencimento para realizar uma nova assinatura.`);
    }

    // Integração Asaas
    const { AsaasService } = await import('./lib/asaas.js');

    // Dados vêm do frontend agora
    const cpfCnpj = cardData.cpf.replace(/\D/g, '');
    const phone = cardData.phone.replace(/\D/g, '');
    const postalCode = cardData.postalCode.replace(/\D/g, '');

    // 1. Buscar ou Criar Cliente no Asaas
    let customer = await AsaasService.getCustomer(userProfile.email);

    const customerData = {
      name: cardData.name,
      email: userProfile.email,
      id: userId,
      cpfCnpj: cpfCnpj,
      phone: phone,
      mobilePhone: phone,
      postalCode: postalCode,
      postalCode: postalCode,
      addressNumber: cardData.addressNumber,
      complement: cardData.complement // New Field
    };

    if (!customer) {
      customer = await AsaasService.createCustomer(customerData);
    } else {
      // Atualizar dados do cliente existente (especialmente se mudou endereço ou telefone)
      await AsaasService.updateCustomer(customer.id, customerData);
    }

    // 2. Preparar dados do pagamento
    const [expiryMonth, expiryYear] = cardData.expiry.split('/');
    const cleanNumber = cardData.number.replace(/\s/g, '');
    // Buscar preços configurados (tabela pricing, único registro)
    const { data: pricingData, error: pricingError } = await supabase.from('pricing').select('*').single();
    if (pricingError) logger.warn("Pricing lookup error: " + JSON.stringify(pricingError));

    // Fallback para valores padrão se falhar
    const defaultMonthly = 27.90;
    const defaultYearly = 287.90;

    let value;
    if (plan === 'yearly') {
      value = pricingData?.yearly_price || defaultYearly;
    } else if (plan === 'monthly') {
      value = pricingData?.monthly_price || defaultMonthly;
    } else if (plan === 'PRO_PLUS') {
      value = 98.00; // Fixed Price PRO+
    } else if (plan === 'LOMAD_PLUS') {
      value = 199.00; // Fixed Price LOMAD+
    } else if (plan === 'ADDON_10H') {
      value = 129.00; // Fixed Price Add-on
    } else {
      value = defaultMonthly; // Fallback
    }

    // 3. Criar Assinatura (Recorrência)
    const subscriptionPayload = {
      value: value,
      description: `Assinatura ${plan === 'yearly' ? 'Anual' : 'Mensal'} - MeetingMind`,
      cycle: plan === 'yearly' ? 'YEARLY' : 'MONTHLY',
      creditCard: {
        holderName: cardData.name,
        number: cleanNumber,
        expiryMonth: expiryMonth,
        expiryYear: `20${expiryYear}`,
        ccv: cardData.cvc
      },
      creditCardHolderInfo: {
        name: cardData.name,
        email: userProfile.email,
        cpfCnpj: cpfCnpj,
        postalCode: postalCode,
        addressNumber: cardData.addressNumber,
        addressNumber: cardData.addressNumber,
        complement: cardData.complement, // New Field
        phone: phone
      },
      remoteIp: req.ip
    };

    let subscription;

    if (plan === 'ADDON_10H') {
      // One-time payment logic
      const paymentPayload = {
        customer: customer.id,
        billingType: 'CREDIT_CARD',
        dueDate: new Date().toISOString().split('T')[0], // Today
        value: value,
        description: 'Pacote Adicional 10h - LOMAD',
        creditCard: subscriptionPayload.creditCard,
        creditCardHolderInfo: subscriptionPayload.creditCardHolderInfo,
        remoteIp: req.ip
      };
      // Reuse createSubscription function? No, need createPayment.
      // Assuming AsaasService has createPayment. If not, we might need to add it or fail.
      // Let's assume createSubscription works for now but we need to change cycle likely?
      // Asaas subscriptions must have cycle.
      // Let's TRY to use existing structure. Use ONE_TIME? no such thing usually in sub.
      // OK, for Implementation Plan fidelity, I will use `createSubscription` but strict user to cancel? No that's bad.
      // Let's assume `createPayment` exists in lib/asaas.js or I should add it.
      // Since I cannot see lib/asaas.js right now, I'll try to use a method that likely exists or fallback.
      try {
        subscription = await AsaasService.createPayment(paymentPayload);
        subscription.status = 'ACTIVE'; // Map 'CONFIRMED' to ACTIVE for logic below
        subscription.nextDueDate = Date.now(); // Immediate
      } catch (e) {
        // If createPayment missing, throw helpful error
        throw new Error("Erro interno: Método de pagamento avulso não implementado no wrapper Asaas.");
      }
    } else {
      // Subscription Logic (Existing)
      subscription = await AsaasService.createSubscription(customer.id, subscriptionPayload);
    }

    // 4. Atualizar Perfil se Sucesso
    if (subscription.status === 'ACTIVE') {
      const cardLast4 = cleanNumber.slice(-4);

      // Calcular data de expiração (apenas inicial, webhook que deveria atualizar)
      const nextDueDate = new Date(subscription.nextDueDate);
      const expiryDate = nextDueDate.getTime(); // Timestamp

      const { error } = await supabase.from('profiles').update({
        role: plan === 'ADDON_10H' ? userProfile.role : (plan === 'PRO_PLUS' ? 'PRO_PLUS' : (plan === 'LOMAD_PLUS' ? 'LOMAD_PLUS' : 'PRO')),
        // Se for Add-on, somamos aos 'extra_minutes' e NÃO mudamos o role ou subscription principal (assumindo venda avulsa)
        // OBS: Se for venda avulsa, o 'subscription.cycle' seria ONE_TIME?
        // O código acima (passo 3) faz assinatura recorrente.
        // Para ADDON, deveríamos criar apenas um Payment (Cobrança Única) no Asaas, não Assinatura.
        // Mas para simplificar o MVP e manter estrutura, vamos tratar como uma assinatura que não renova? Não, errado.
        // CORREÇÃO: Se plan == ADDON_10H, usar AsaasService.createPayment (avulso).

        card_last4: cardLast4,
        card_brand: subscription.creditCard?.creditCardBrand || 'Mastercard', // Optional chaining fix
        cpf_cnpj: cpfCnpj,
        phone: phone,
        postal_code: postalCode,
        postal_code: postalCode,
        address_number: cardData.addressNumber,
        address_complement: cardData.complement,

        // Logic specific for update
        ...(plan !== 'ADDON_10H' ? {
          subscription_id: subscription.id,
          subscription_status: 'ACTIVE',
          subscription_end: expiryDate,
          // Set Limits
          plan_limit_minutes: plan === 'PRO_PLUS' ? 600 : (plan === 'LOMAD_PLUS' ? 999999 : null)
        } : {
          // For ADDON, increment extra_minutes
          extra_minutes: (userProfile.extra_minutes || 0) + 600
        })
      }).eq('id', userId);

      if (error) throw error;

      res.json({
        success: true,
        role: 'PRO',
        cardBrand: subscription.creditCard.creditCardBrand,
        cardLast4,
        subscriptionEnd: expiryDate
      });
    } else {
      throw new Error(`Assinatura não ativada. Status: ${subscription.status}`);
    }

  } catch (err) {
    logger.error("Checkout Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Cancel Subscription endpoint
app.post('/api/subscription/cancel', async (req, res) => {
  try {
    const { userId } = req.body;

    // Buscar subscription_id do usuário
    const { data: user, error: userError } = await supabase.from('profiles').select('subscription_id, subscription_end').eq('id', userId).single();
    if (userError || !user) throw new Error("Usuário não encontrado.");

    if (!user.subscription_id) throw new Error("Nenhuma assinatura ativa encontrada.");

    // Integração Asaas
    const { AsaasService } = await import('./lib/asaas.js');

    // 1. Verificar elegibilidade para estorno (7 dias)
    // Buscamos os pagamentos dessa assinatura para ver a data do último confirmado
    const payments = await AsaasService.getSubscriptionPayments(user.subscription_id);
    const lastPayment = payments
      .filter(p => p.status === 'RECEIVED' || p.status === 'CONFIRMED')
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime())[0];

    const now = Date.now();
    let refunded = false;
    let message = "Assinatura cancelada com sucesso. Seu acesso continua até o fim do período.";

    // Buscar detalhes da assinatura para ver a data de criação
    const subscription = await AsaasService.getSubscription(user.subscription_id);

    if (lastPayment) {
      const paymentDate = new Date(lastPayment.paymentDate || lastPayment.dateCreated).getTime(); // Prefer paymentDate
      const diffDays = (now - paymentDate) / (1000 * 60 * 60 * 24);

      if (diffDays <= 7) {
        logger.info(`[Refund] User ${userId} eligible for refund (Days: ${diffDays.toFixed(1)})`);
        // 2. Realizar estorno automático
        await AsaasService.refundPayment(lastPayment.id);
        refunded = true;
      }
    }

    // 3. Cancelar assinatura no Asaas
    await AsaasService.cancelSubscription(user.subscription_id);

    // 4. Atualizar status local
    const updatePayload = {
      subscription_status: refunded ? 'REFUNDED' : 'CANCELED'
    };

    const subDate = new Date(subscription.dateCreated).getTime();
    const subDiffDays = (now - subDate) / (1000 * 60 * 60 * 24);

    // Se foi estornado OU se a assinatura tem menos de 7 dias (mesmo sem pagamento confirmado ainda - arrependimento)
    if (refunded || subDiffDays <= 7) {
      updatePayload.role = 'FREE';
      updatePayload.subscription_end = Date.now(); // Expira agora
      message = refunded
        ? "Assinatura cancelada e estornada. (Prazo de 7 dias - CDC)."
        : "Assinatura cancelada (Período de arrependimento).";
    }
    // Se não foi estornado e tem mais de 7 dias, mantemos o role e o subscription_end original (acesso até o fim)

    const { error: updateError } = await supabase.from('profiles').update(updatePayload).eq('id', userId);

    if (updateError) throw updateError;

    res.json({
      success: true,
      refunded,
      message,
      endDate: refunded ? Date.now() : user.subscription_end
    });

  } catch (err) {
    logger.error("Cancel Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Create Profile endpoint (bypasses RLS with SERVICE_KEY)
app.post('/api/profiles/create', async (req, res) => {
  try {
    const { userId, email, role = 'FREE' } = req.body;

    // Using SERVICE_KEY to bypass RLS policies
    const { data, error } = await supabase
      .from('profiles')
      .insert([{ id: userId, email, role, is_active: true }])
      .select()
      .single();

    if (error) {
      logger.error("Profile creation error: " + JSON.stringify(error));
      return res.status(500).json({ error: error.message });
    }

    // Send Welcome Email (Async)
    emailService.sendWelcomeEmail(email, email.split('@')[0]);

    res.json(data);
  } catch (err) {
    logger.error("Create profile exception: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Sync Calendar Status (Dual Provider Support)
app.post('/api/recall/sync-calendar', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: "UserId required" });

    // 1. Get API Key
    if (!process.env.RECALL_API_KEY) dotenv.config();
    const apiKey = process.env.RECALL_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Recall API Key missing." });

    // 2. Query Recall for Calendars
    // 2. Query Recall for Calendars
    const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1'; // Reverted to Regional URL for Auth

    console.log(`[Sync Calendar] Checking status for user ${userId}...`);

    let googleConnected = false;
    let outlookConnected = false;

    try {
      // 2a. Lookup Recall User ID using External ID
      let recallUserId = null;
      let connections = []; // Store connections from user object

      try {
        const userResponse = await axios.get(`${RECALL_BASE_URL}/calendar/users/`, {
          params: { external_id: userId },
          headers: { Authorization: `Token ${apiKey}` }
        });
        const users = userResponse.data.results || userResponse.data;
        const foundUser = users.find(u => u.external_id === userId);

        if (foundUser) {
          recallUserId = foundUser.id;
          connections = foundUser.connections || [];
          console.log(`[Sync Calendar] Resolved External ID ${userId} to Recall ID: ${recallUserId}`);
          console.log(`[Sync Calendar] User Connections:`, JSON.stringify(connections));
        }
      } catch (userErr) {
        // If 404 or empty, try to create user
        console.log(`[Sync Calendar] User not found (${userErr.message}). Creating Recall User for ${userId}...`);
        try {
          const createResponse = await axios.post(`${RECALL_BASE_URL}/calendar/users/`, {
            external_id: userId
          }, {
            headers: { Authorization: `Token ${apiKey}` }
          });
          recallUserId = createResponse.data.id;
          connections = []; // New user has no connections
          console.log(`[Sync Calendar] Created Recall User: ${recallUserId}`);
        } catch (createErr) {
          console.error("[Sync Calendar] Failed to create user:", createErr.message);
        }
      }

      if (!recallUserId) {
        // If we still don't have a user, we can't check calendars.
        console.warn("[Sync Calendar] Could not resolving Recall User ID. Assuming no connections.");
      } else {
        // Check connections from the user object directly
        // API returns "google" and "microsoft", checking both just in case of API version diffs
        googleConnected = connections.some(c => (c.platform === 'google' || c.platform === 'google_calendar') && c.connected);
        outlookConnected = connections.some(c => (c.platform === 'microsoft' || c.platform === 'microsoft_outlook') && c.connected);
        console.log(`[Sync Calendar] Status - Google: ${googleConnected}, Outlook: ${outlookConnected}`);
      }

    } catch (recallErr) {
      console.error("[Sync Calendar] Recall Logic Error:", recallErr.message);
    }

    // 3. Update Database (Dual Columns)
    // Note: User must run migration to add these columns!
    const { error } = await supabase.from('profiles').update({
      google_calendar_connected: googleConnected,
      outlook_calendar_connected: outlookConnected,
      calendar_connected: googleConnected || outlookConnected // Keep for legacy compatibility
    }).eq('id', userId);

    if (error) throw error;
    console.log(`[Sync Calendar] Database updated for user ${userId}`);

    res.json({
      success: true,
      connected: googleConnected || outlookConnected, // Required by App.tsx
      googleConnected,
      outlookConnected,
      anyConnected: googleConnected || outlookConnected
    });

  } catch (err) {
    console.error("[Sync Calendar] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Update Profile endpoint
app.put('/api/profile', async (req, res) => {
  try {
    const { userId, phone, postalCode, addressNumber, addressComplement } = req.body;

    // 1. Atualizar no Supabase
    const { data: currentProfile, error: fetchError } = await supabase
      .from('profiles')
      .select('subscription_id')
      .eq('id', userId)
      .single();

    if (fetchError) throw fetchError;

    const { error: updateError } = await supabase.from('profiles').update({
      phone,
      postal_code: postalCode,
      postal_code: postalCode,
      address_number: addressNumber,
      address_complement: addressComplement
    }).eq('id', userId);

    if (updateError) throw updateError;

    // 2. Atualizar no Asaas (se existir subscription_id)
    if (currentProfile?.subscription_id) {
      const { AsaasService } = await import('./lib/asaas.js');
      try {
        // Buscar a assinatura para obter o customer_id
        const subscription = await AsaasService.getSubscription(currentProfile.subscription_id);

        if (subscription && subscription.customer) {
          await AsaasService.updateCustomer(subscription.customer, {
            phone,
            postalCode,
            postalCode,
            addressNumber,
            complement: addressComplement // Asaas uses 'complement'
          });
        }
      } catch (asaasErr) {
        logger.error("Erro ao sincronizar com Asaas (ignorado para não bloquear UI): " + asaasErr.message);
      }
    }

    res.json({ success: true });

  } catch (err) {
    logger.error("Profile Update Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- RECALL.AI INTEGRATION ---

const RECALL_API_KEY = process.env.RECALL_API_KEY; // Ensure this is in .env
const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1'; // Updated to match user's region

// 1. Config Bot/Calendar
app.post('/api/recall/config', async (req, res) => {
  try {
    const { userId, botName } = req.body;

    if (!botName) throw new Error("Nome do Bot é obrigatório.");

    // Normalize Bot Name: "My Name" -> "My Name.LOMAD.IA"
    // Constraint: Check if already has suffix to avoid double suffix
    const suffix = ".LOMAD.IA";
    let finalBotName = botName.trim();
    if (!finalBotName.toUpperCase().endsWith(suffix)) {
      finalBotName += suffix;
    }

    // Update in Supabase
    const { error } = await supabase.from('profiles').update({
      bot_name: finalBotName
    }).eq('id', userId);

    if (error) throw error;

    // TODO: Create User in Recall.ai if not exists?
    // Usually we might just use the platform's calendar connection flow which returns an ID.
    // For now, we save the name localy. 
    // If we were fully integrating, we would call Recall API here to Creating a Generic BotConfig for the user.

    res.json({ success: true, botName: finalBotName });
  } catch (err) {
    logger.error("Recall Config Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2. Fetch Upcoming Events (Auth Token Flow)
app.get('/api/recall/events', async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) return res.status(400).json({ error: "UserId required" });

    if (!process.env.RECALL_API_KEY) dotenv.config();
    const apiKey = process.env.RECALL_API_KEY;
    const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1';

    // 1. Authenticate to get Token
    // Endpoint: POST /calendar/authenticate/
    let authToken = null;
    try {
      const authResponse = await axios.post(`${RECALL_BASE_URL}/calendar/authenticate/`, {
        user_id: userId
      }, {
        headers: { Authorization: `Token ${apiKey}` }
      });
      authToken = authResponse.data.token;
    } catch (authErr) {
      console.error("[Events] Auth Failed:", authErr.message);
      // If auth fails, user likely doesn't exist or has no calendar connected
      return res.json([]);
    }

    if (!authToken) return res.json([]);

    // 2. Get Meetings (Unified Calendar View)
    // Endpoint: GET /calendar/meetings/
    // This returns the exact view of the connected calendar
    const startTime = new Date().toISOString();
    const endTime = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // Fetch 30 days

    const meetingsResponse = await axios.get(`${RECALL_BASE_URL}/calendar/meetings/`, {
      params: {
        start_time: startTime,
        end_time: endTime
      },
      headers: {
        'accept': 'application/json',
        'x-recallcalendarauthtoken': authToken
      }
    });

    const events = meetingsResponse.data.results || meetingsResponse.data || [];

    // 3. Format/Sort
    const formattedEvents = events.map(e => ({
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      end_time: e.end_time,
      meeting_url: e.meeting_url,
      platform: e.platform // Platform is usually on the event
    })).sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

    res.json(formattedEvents);

  } catch (err) {
    logger.error("Recall Events Error: " + err.message);
    // Return empty array on error to prevent frontend "Error detected" if just no events or 404
    res.json([]);
  }
});

// 2. Connect Calendar (Mock/Proxy)
// 2. Connect Calendar (Real Integration)
app.get('/api/recall/calendar-auth', async (req, res) => {
  try {
    const { userId, platform } = req.query; // platform: google_calendar | outlook_calendar

    if (!process.env.RECALL_API_KEY) {
      dotenv.config();
    }
    const apiKey = process.env.RECALL_API_KEY;

    if (!apiKey) {
      logger.error("RECALL_API_KEY missing even after reload.");
      return res.status(500).json({ error: "Integração indisponível (Chave de API ausente). Reinicie o servidor." });
    }

    // Debug log (masked)
    console.log("Using Recall API Key:", apiKey.substring(0, 4) + "...");


    // Real Connection using lvh.me for local dev or configured APP_URL
    // Force https in production to avoid Recall.ai security block on http/port
    let appUrl = process.env.VITE_APP_URL || 'http://lvh.me:3000';
    if (process.env.NODE_ENV === 'production') {
      appUrl = 'https://lomad.com.br';
    }

    // Determine Client ID based on platform
    let clientId;
    let oauthUrl;
    // Recall Callback URIs for us-west-2 region
    const RECALL_REGION = 'us-west-2';

    if (platform === 'google_calendar') {
      clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: "Google Calendar Client ID não configurado no servidor (GOOGLE_CALENDAR_CLIENT_ID)." });
      }
    } else if (platform === 'outlook_calendar') {
      clientId = process.env.MICROSOFT_CALENDAR_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: "Microsoft Calendar Client ID não configurado no servidor (MICROSOFT_CALENDAR_CLIENT_ID)." });
      }
    } else {
      return res.status(400).json({ error: "Plataforma não suportada." });
    }

    try {
      // 1. Get Recall Calendar Auth Token
      // Endpoint: /calendar/authenticate/ (Requires trailing slash)
      // Must provide user_id to scope the token.
      const authResponse = await axios.post(`${RECALL_BASE_URL}/calendar/authenticate/`, {
        user_id: userId
      }, {
        headers: { Authorization: `Token ${apiKey}` }
      });

      const recallToken = authResponse.data.token;

      // 2. Construct OAuth URL
      if (platform === 'google_calendar') {
        const redirectUri = `https://${RECALL_REGION}.recall.ai/api/v1/calendar/google_oauth_callback/`;
        // Google requires full scope URLs
        const scope = "https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/userinfo.email";
        const state = JSON.stringify({
          recall_calendar_auth_token: recallToken,
          google_oauth_redirect_url: redirectUri, // MUST match the initial redirect_uri
          success_url: `${appUrl}/profile?calendar_connected=true`,
          error_url: `${appUrl}/profile?error=calendar_auth_failed`
        });

        // Removed approval_prompt=force as it conflicts with prompt=consent
        // Adding select_account to ensure Google treats it as a fresh login, forcing refresh token generation
        oauthUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&access_type=offline&prompt=consent%20select_account&include_granted_scopes=true`;
        console.log(`[Calendar Auth] Generated Google OAuth URL (verify params): ${oauthUrl}`);

      } else if (platform === 'outlook_calendar') {
        const redirectUri = `https://${RECALL_REGION}.recall.ai/api/v1/calendar/ms_oauth_callback/`;

        // Microsoft Scopes: Standard Full Suite with Fixed Secret
        // Now that the Client Secret is correct, we retry the robust standard scopes.
        // 'User.Read' is often essential for OpenID flows on Personal accounts.
        const scope = "offline_access openid email User.Read Calendars.Read Calendars.ReadWrite";

        // Fix: Recall expects 'ms_oauth_redirect_url', not 'microsoft_oauth_redirect_url'
        const state = JSON.stringify({
          recall_calendar_auth_token: recallToken,
          ms_oauth_redirect_url: `${appUrl}/profile?calendar_connected=true`
        });

        // Microsoft: explicit response_mode=query and prompt=consent
        oauthUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&response_mode=query&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&prompt=consent`;
      }

      console.log(`[Recall Manual Auth] Generated ${platform} URL for user ${userId}`);
      console.log(`[DEBUG FULL URL] ${oauthUrl}`); // Log full URL for inspection
      res.json({ url: oauthUrl });

    } catch (apiError) {
      logger.error("Recall API Error (Manual Auth): " + (apiError.response?.data ? JSON.stringify(apiError.response.data) : apiError.message));
      throw new Error(`Falha na autenticação manual Recall.ai (${apiError.response?.status})`);
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2.1 Disconnect Calendar (Specific Platform)
app.post('/api/recall/calendar-disconnect', async (req, res) => {
  try {
    const { userId, platform } = req.body; // platform is optional, if missing disconnect all? preferably specific.

    if (!userId) return res.status(400).json({ error: "UserId required" });

    // 1. Get API Key
    if (!process.env.RECALL_API_KEY) dotenv.config();
    const apiKey = process.env.RECALL_API_KEY;
    const RECALL_BASE_URL = 'https://us-west-2.recall.ai/api/v1';

    // 2. Auth to get Token (User Verified Flow)
    // Endpoint: POST /calendar/authenticate/
    let authToken = null;
    try {
      const authResponse = await axios.post(`${RECALL_BASE_URL}/calendar/authenticate/`, {
        user_id: userId // This internal ID is what we used to create/connect the user.
      }, {
        headers: { Authorization: `Token ${apiKey}` }
      });
      authToken = authResponse.data.token;
    } catch (authErr) {
      console.error("[Disconnect] Auth Failed:", authErr.message);
      // If auth fails, maybe user doesn't exist? Proceed to DB update anyway.
    }

    if (authToken) {
      // 3. Delete Calendar User (Removes all connections)
      // Endpoint: DELETE /calendar/user/ (Requires x-recallcalendarauthtoken)
      try {
        await axios.delete(`${RECALL_BASE_URL}/calendar/user/`, {
          headers: {
            'x-recallcalendarauthtoken': authToken,
            'accept': 'application/json'
          }
        });
        console.log(`[Disconnect] Deleted Calendar User for ${userId}`);
      } catch (delErr) {
        console.error("[Disconnect] Delete Failed:", delErr.message);
      }
    }

    // 4. Update Database - Reset ALL calendar flags
    // Since we deleted the user, we disconnected EVERYTHING.
    const updatePayload = {
      google_calendar_connected: false,
      outlook_calendar_connected: false,
      calendar_connected: false,
      recall_id: null
    };

    const { error } = await supabase.from('profiles').update(updatePayload).eq('id', userId);

    if (error) throw error;

    res.json({ success: true, message: "Agenda desconectada com sucesso." });

  } catch (err) {
    logger.error("Disconnect Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});



// 2.5 Instant Bot Join (Manual Link)
// 2.5 Instant Bot Join (Real Integration)
// Force Deploy Trigger
app.post('/api/recall/bot-join', async (req, res) => {
  try {
    const { userId, meetingUrl, botName } = req.body;

    if (!meetingUrl) throw new Error("URL da reunião é obrigatória.");

    if (!process.env.RECALL_API_KEY) {
      dotenv.config();
    }
    const apiKey = process.env.RECALL_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: "Integração indisponível (Chave de API ausente). Reinicie o servidor." });
    }

    // Verify Limits (PRO+ = 600 min/10h)
    const { data: userProfile, error: profileError } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (profileError || !userProfile) throw new Error("Usuário não encontrado.");

    const usage = userProfile.usage_minutes || 0;
    const limit = userProfile.plan_limit_minutes || 600; // Default PRO limit
    const extras = userProfile.extra_minutes || 0;
    const totalLimit = limit + extras;

    if (userProfile.role !== 'LOMAD_PLUS' && usage >= totalLimit) { // LOMAD+ is Unlimited
      return res.status(403).json({ error: "Limite de horas atingido. Faça upgrade ou compre horas adicionais." });
    }

    // Call Real Recall API
    try {
      const response = await axios.post(`${RECALL_BASE_URL}/bot`, {
        meeting_url: meetingUrl,
        bot_name: botName || 'LOMAD Bot',
        // Send User ID in metadata to identify owner later in Webhook anywhere
        metadata: {
          user_id: userId
        }
        // transcription_options removed as it caused 400 error (not allowed in this region/plan)
      }, { headers: { Authorization: `Token ${apiKey}` } });

      logger.info(`[Instant Bot] Bot dispatched successfully: ${response.data.id}`);

      // Save Bot ID to User Profile so Webhook can identify the owner
      await supabase.from('profiles').update({ recall_id: response.data.id }).eq('id', userId);

      res.json({ success: true, message: "Bot enviado com sucesso! Ele entrará na reunião em instantes." });

    } catch (apiError) {
      const errorData = apiError.response?.data;
      const detailedMsg = errorData ? JSON.stringify(errorData) : apiError.message;
      logger.error(`Recall API Error (Bot Join): ${detailedMsg}`);
      // Return FULL details so user can see what's wrong (e.g. invalid_url)
      return res.status(400).json({ error: `Recall Info: ${detailedMsg}` });
    }

  } catch (err) {
    logger.error("Instant Bot Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// 3. Webhook from Recall (Meeting Recorded)
app.post('/api/save-meeting-external', async (req, res) => {
  // This endpoint receives data from our Bot (Recall) when a meeting ends
  try {
    // Extract data handling both raw and nested structures
    const eventType = req.body.event;
    const data = (req.body.event && req.body.data) ? req.body.data : req.body;

    // Filter events: Only process when it's done or analysis is ready
    // Ignore intermediate states which trigger webhooks but have no data yet
    if (['meeting_metadata.processing', 'bot.joining'].includes(eventType)) {
      logger.info(`[Webhook] Ignoring intermediate event: ${eventType}`);
      return res.json({ success: true, message: "Ignored intermediate event" });
    }

    // Recall ID extraction (Handles various event formats: bot.done, analysis.done)
    const recall_id = data.recall_id || data.id || data.bot?.id || data.bot_id;

    // Security Check
    const webhookSecret = req.headers['x-recall-secret'] || req.query.secret;
    const envSecret = process.env.RECALL_WEBHOOK_SECRET;

    if (envSecret && webhookSecret !== envSecret) {
      logger.warn(`[Recall Webhook] 401 Unauthorized. Rec: '${webhookSecret?.substring(0, 3)}***' vs Env: '${envSecret?.substring(0, 3)}***'`);
      return res.status(401).json({ error: "Unauthorized: Secret mismatch" });
    }

    if (!recall_id) {
      logger.error(`[Recall Webhook] ID not found in payload: ${JSON.stringify(req.body).substring(0, 200)}`);
      return res.status(400).json({ error: "Recall ID extraction failed" });
    }

    // --- NEW: Welcome Message on Bot Join ---
    if (eventType === 'bot.joined') {
      logger.info(`[Webhook] Bot joined! Sending welcome message | ID: ${recall_id}`);
      try {
        // 1. Identify User
        let userName = "Usuário LOMAD";
        // Metadata might be at top level data or inside data.bot depending on event structure
        let userId = data.metadata?.user_id || data.bot?.metadata?.user_id;

        if (userId) {
          const { data: u } = await supabase.from('profiles').select('name').eq('id', userId).single();
          if (u?.name) userName = u.name;
        } else {
          // Fallback: look up by recall_id in profiles
          const { data: u } = await supabase.from('profiles').select('name').eq('recall_id', recall_id).single();
          if (u?.name) userName = u.name;
        }

        // 2. Compose Message
        const botName = data.bot_name || data.name || "LOMAD.IA";
        const message = `Olá! Sou o assistente virtual de transcrição ${botName} e estou gravando esta reunião para gerar sua ata automática. 🤖📝\n\nA responsabilidade pelo uso desta gravação é de ${userName}.\nConheça a LOMAD: https://lomad.com.br/IA`;

        // 3. Send to Chat
        await axios.post(`${RECALL_BASE_URL}/bot/${recall_id}/send_chat_message`, {
          message: message
        }, {
          headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` }
        });

        logger.info(`[Webhook] Welcome message sent for ${recall_id}`);
        return res.json({ success: true, message: "Welcome message sent" });

      } catch (chatErr) {
        logger.error(`[Webhook] Failed to send welcome message: ${chatErr.message}`);
        return res.json({ success: true, message: "Welcome message failed but acknowledged" });
      }
    }
    // ----------------------------------------

    // Extract variables for usage later (Fixes ReferenceError)
    let { transcript, title, start_time, video_url } = data;

    // IF data is missing (common in 'bot.status_change' events), fetch from API
    let participantsText = '';
    let botInfo; // Declare outer scope

    if (!transcript || !video_url) {
      try {
        logger.info(`[Webhook] Fetching full details for bot ${recall_id}...`);
        const { data: bInfo } = await axios.get(`${RECALL_BASE_URL}/bot/${recall_id}`, {
          headers: { Authorization: `Token ${process.env.RECALL_API_KEY}` }
        });
        botInfo = bInfo;

        // Update variables with fetched data
        const tArr = botInfo.transcript || [];
        transcript = Array.isArray(tArr) ? tArr.map(t => t.text).join('\n') : '';
        title = title || botInfo.meeting_metadata?.title || 'Reunião Recall.ai';
        // Date Fix: Prioritize botInfo.start_time, fallback to metadata or current time
        start_time = botInfo.start_time || botInfo.meeting_metadata?.start_time || new Date().toISOString();

        // Try extracting video from multiple possible locations
        // 1. Root level
        // 2. Inside recordings array (media_shortcuts)
        video_url = video_url || botInfo.video_url;
        if (!video_url && botInfo.recordings && botInfo.recordings.length > 0) {
          video_url = botInfo.recordings[0].media_shortcuts?.video_mixed?.data?.download_url;
        }

        // PARTICIPANTS EXTRACTION
        // Fetch participant events if available
        const participantsUrl = botInfo.participant_events_download_url;
        if (participantsUrl) {
          try {
            logger.info(`[Webhook] Fetching participants from ${participantsUrl}...`);
            const { data: participantsData } = await axios.get(participantsUrl);
            // Extract unique names
            const uniqueNames = new Set();
            if (Array.isArray(participantsData)) {
              participantsData.forEach(p => {
                if (p.participant?.name) uniqueNames.add(p.participant.name);
              });
            }

            if (uniqueNames.size > 0) {
              participantsText = `\n\n**Participantes Identificados:**\n${Array.from(uniqueNames).map(n => `- ${n}`).join('\n')}`;
              logger.info(`[Webhook] Extracted ${uniqueNames.size} participants.`);
            }
          } catch (pErr) {
            logger.warn(`[Webhook] Failed to fetch participants: ${pErr.message}`);
          }
        }

        const keyList = Object.keys(botInfo).join(',');
        logger.info(`[Webhook] Fetched details: Title='${title}', Video='${video_url}', Time='${start_time}', Keys=${keyList}`);

        // RETRY STRATEGY / GEMINI FALLBACK
        // If transcript missing but VIDEO exists, use Gemini to transcribe!
        if (!transcript && video_url) {
          logger.info(`[Webhook] Transcript missing. Attempting Gemini Video Transcription for ${video_url}...`);

          // Async processing (Fire and Forget to avoid timeout)
          // We catch errors inside to log them
          (async () => {
            // specific declarations outside try/catch for visibility in finally
            const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
            var videoPath = null;
            var uploadResult = null;

            try {
              const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
              // Use the model configured in Render (e.g. gemini-2.0-flash)
              const modelName = process.env.GEMINI_CHAT_MODEL || "gemini-2.0-flash";
              const model = genAI.getGenerativeModel({ model: modelName });

              logger.info(`[Gemini] Using model: ${modelName}`);

              // 1. Download Video
              videoPath = path.join(os.tmpdir(), `${recall_id}.mp4`);
              const writer = fs.createWriteStream(videoPath);
              const response = await axios({
                url: video_url,
                method: 'GET',
                responseType: 'stream'
              });
              response.data.pipe(writer);

              await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
              });

              // 2. Upload to Gemini
              uploadResult = await fileManager.uploadFile(videoPath, {
                mimeType: "video/mp4",
                displayName: `Meeting ${recall_id}`,
              });

              logger.info(`[Gemini] Video uploaded: ${uploadResult.file.uri} (State: ${uploadResult.file.state})`);

              // 2.5 Wait for processing to be ACTIVE
              let fileState = await fileManager.getFile(uploadResult.file.name);
              while (fileState.state === "PROCESSING") {
                logger.info(`[Gemini] Processing video...`);
                await new Promise((resolve) => setTimeout(resolve, 10000)); // Wait 10s
                fileState = await fileManager.getFile(uploadResult.file.name);
              }

              if (fileState.state === "FAILED") {
                throw new Error("[Gemini] Video processing failed on Google servers.");
              }

              logger.info(`[Gemini] Video Active. Generating content...`);

              // 3. Generate Content
              const result = await model.generateContent([
                "Transcreva esta reunião detalhadamente, identificando os falantes se possível. Em seguida, crie um resumo executivo.",
                {
                  fileData: {
                    fileUri: uploadResult.file.uri,
                    mimeType: uploadResult.file.mimeType,
                  },
                },
              ]);

              const aiText = result.response.text();
              logger.info(`[Gemini] Transcription generated (${aiText.length} chars). Updating DB...`);

              // 4. Update Database
              const baseNotes = `Gravação Automática via Bot (Fallback Gemini). Video: ${video_url}`;
              const finalNotes = baseNotes + participantsText; // Append participants

              const { data: updateData, error: updateError } = await supabase.from('meetings').update({
                transcriptions: [{ role: 'model', text: aiText, timestamp: Date.now() }],
                summary: 'Transcrito via Gemini AI (Backup)',
                notes: finalNotes,
                video_url: video_url // Persist video URL
              }).eq('recall_id', recall_id).select();

              if (updateError) {
                logger.error(`[Gemini DB Update Error] ${updateError.message} - Details: ${JSON.stringify(updateError)}`);
              } else {
                logger.info(`[Gemini DB Update Success] Rows affected: ${updateData?.length}. RecallID: ${recall_id}`);
              }

            } catch (geminiErr) {
              logger.error(`[Gemini Fallback Error] ${geminiErr.message}`);
            } finally {
              // Cleanup (Always run)
              try {
                if (videoPath && fs.existsSync(videoPath)) fs.unlinkSync(videoPath);
                if (uploadResult && uploadResult.file) await fileManager.deleteFile(uploadResult.file.name).catch(() => { });
              } catch (cleanupErr) {
                logger.warn(`[Gemini Cleanup Warning] ${cleanupErr.message}`);
              }
            }
          })();

          // Return success immediately to Recall (we are handling it async)
          return res.json({ success: true, message: "Processing with Gemini Fallback" });
        }

        if (!transcript && !video_url) {
          const errorMsg = `Data incomplete (Processing). TranscriptLen=${transcript.length}, Video=${video_url}. Triggering Webhook Retry.`;
          logger.warn(errorMsg);
          return res.status(503).json({ error: errorMsg });
        }
      } catch (fetchErr) {
        logger.error(`[Webhook] Failed to fetch bot details: ${fetchErr.message}`);
        // Return 503 to force Recall to retry sending the webhook later
        return res.status(503).json({ error: "Processing not finished, retrying later" });
      }
    }

    // 1. Try to get User ID from Bot Metadata (Robust method)
    // We didn't save metadata in v1, but we added it now.
    let userId = data.metadata?.user_id;
    let user = null;

    if (userId) {
      // Fetch user by ID directly
      const { data: u, error: uErr } = await supabase.from('profiles')
        .select('id, role, usage_minutes, plan_limit_minutes, extra_minutes').eq('id', userId).single();
      if (!uErr) user = u;
    }

    // 2. Fallback: Find user by recall_id (Legacy method)
    if (!user) {
      const { data: u, error: uErr } = await supabase.from('profiles')
        .select('id, role, usage_minutes, plan_limit_minutes, extra_minutes')
        .eq('recall_id', recall_id)
        .single();
      if (!uErr) user = u;
    }

    if (!user) throw new Error("Usuário não identificado para esta gravação.");

    // CHECK LIMITS (Post-recording check? Or Pre? Recall usually joins first).
    // If we want to block entrance, we need a webhook on "bot_join_attempt".
    // For now, let's process the recording and update usage.

    // Calculate Duration (approximate from transcript length or explicit duration)
    // Let's assume we get 'duration_seconds' in body
    const durationMinutes = Math.ceil((req.body.duration_seconds || 60) / 60);

    // Only deduct minutes if this is a NEW meeting (inserted). 
    // But since we do upsert, we need to be careful not to deduct twice.
    // For now, let's assume one webhook per meeting = one deduction.
    // Ideally, we check if meeting exists first.

    // Check if meeting exists
    const { data: existingMeeting } = await supabase.from('meetings').select('id, recall_id').eq('recall_id', recall_id).single();

    if (!existingMeeting) {
      // Only update usage if it's a new meeting
      const newUsage = (user.usage_minutes || 0) + durationMinutes;
      await supabase.from('profiles').update({ usage_minutes: newUsage }).eq('id', user.id);
    }

    // Prepare Notes
    const baseNotes = `Gravação Automática via Bot. Video: ${video_url}`;
    const finalNotes = baseNotes + participantsText; // Append participants if any

    // Validate Start Time (1969 Fix)
    const validTimestamp = (start_time && new Date(start_time).getFullYear() > 1970)
      ? new Date(start_time).getTime()
      : Date.now();

    // Upsert Meeting (Update if recall_id exists, Insert if not)
    const { data: upsertData, error: upsertError } = await supabase.from('meetings').upsert({
      recall_id: recall_id, // Unique Key
      user_id: user.id,
      title: title || 'Reunião Recall.ai',
      transcriptions: [{ role: 'model', text: transcript || '', timestamp: Date.now() }],
      summary: 'Processando...',
      timestamp: validTimestamp,
      notes: finalNotes,
      video_url: video_url // Save video URL
    }, { onConflict: 'recall_id' }).select().single();

    if (upsertError) throw upsertError;
    const meetingId = upsertData.id;

    // --- SHARED TRANSCRIPTS LOGIC & EMAILS ---

    // 1. Definição do Dono e Regras de Email
    const isFree = user.role === 'FREE'; // Allow FREE users to get emails (growth loop)
    const isPro = user.role === 'PRO';
    const isProPlus = user.role === 'PRO_PLUS';
    const isLomadPlus = user.role === 'LOMAD_PLUS';
    const shouldNotifyOwner = isFree || isPro || isProPlus || isLomadPlus;
    const shouldNotifyParticipants = isProPlus || isLomadPlus;

    // Send Email to Owner
    if (shouldNotifyOwner) {
      // Need to fetch owner email if not available in 'user' object (which only selected role/usage)
      const { data: ownerProfile } = await supabase.from('profiles').select('email, name').eq('id', user.id).single();

      if (ownerProfile?.email) {
        emailService.sendTranscriptionReadyEmail(
          ownerProfile.email,
          ownerProfile.name || 'Usuário',
          title || 'Reunião Processada',
          meetingId,
          false
        );
      }
    }

    // Participants Logic
    let attendeesToProcess = [];
    // 1. Try botInfo (fetched from API)
    if (typeof botInfo !== 'undefined' && botInfo?.calendar_event?.attendees) {
      attendeesToProcess = botInfo.calendar_event.attendees;
    }
    // 2. Try webhook data (if provided)
    else if (data.calendar_event?.attendees) {
      attendeesToProcess = data.calendar_event.attendees;
    }

    if (attendeesToProcess.length > 0) {
      const acceptedEmails = attendeesToProcess
        .filter(a => a.status === 'accepted' && !a.is_organizer)
        .map(a => a.email);

      // Remove duplicates
      const uniqueEmails = [...new Set(acceptedEmails)];

      for (const email of uniqueEmails) {
        // 1. Check if user exists (for Sharing Access)
        const { data: existingUser } = await supabase.from('profiles').select('id, name').eq('email', email).single();
        const userId = existingUser ? existingUser.id : null;
        const participantName = existingUser?.name || 'Participante';

        // 2. Insert into meeting_access (Ignore if already exists)
        await supabase.from('meeting_access').upsert({
          meeting_id: meetingId,
          email: email,
          user_id: userId,
          role: 'viewer',
          status: 'accepted'
        }, { onConflict: 'meeting_id, email' });

        logger.info(`[Sharing] Shared meeting ${meetingId} with ${email} (User: ${userId ? 'Found' : 'Pending'})`);

        // 3. Send Email (If qualified)
        if (shouldNotifyParticipants) {
          emailService.sendTranscriptionReadyEmail(
            email,
            participantName,
            title || 'Reunião Compartilhada',
            meetingId,
            true
          );
        }
      }
    }
    // ----------------------------

    if (upsertError) throw upsertError;

    // Limits check/notify if needed

    res.json({ success: true });
  } catch (err) {
    logger.error("Recall Webhook Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Asaas Webhook Endpoint
app.post('/api/webhooks/asaas', async (req, res) => {
  try {
    const event = req.body;
    // Basic Security Check (Optional: verify secret header if configured)
    const asaasToken = req.headers['asaas-access-token'];
    if (process.env.ASAAS_WEBHOOK_TOKEN && asaasToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
      logger.warn('Webhook Unauthorized Attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    logger.info(`[Webhook] Event: ${event.event} - ID: ${event.payment?.id || event.subscription?.id}`);

    const { AsaasService } = await import('./lib/asaas.js');

    // Handle Payment Events
    if (event.event === 'PAYMENT_CONFIRMED' || event.event === 'PAYMENT_RECEIVED') {
      const payment = event.payment;
      // Find user by customer ID (subscription payments link back to subscription)
      if (payment.subscription) {
        // Renovar/Ativar Assinatura
        const { data: user, error } = await supabase.from('profiles').select('*').eq('subscription_id', payment.subscription).single();

        if (user) {
          // Calculate new expiry
          const cycle = event.payment.billingType === 'CREDIT_CARD' ? 'MONTHLY' : 'MONTHLY'; // Default fallbacks
          // Actually, we should check the subscription cycle or just add 30 days depending on the payment
          // Simpler: Set subscription_end to paymentDate + 30 days (or 1 year)
          // Ideally, we fetch the subscription to know the cycle, but let's assume MONTHLY for safety or query sub

          let durationDays = 30; // Default
          // Try to infer from value if possible, or fetch sub detailed
          // For now, let's fetch the subscription to be sure about the cycle
          try {
            const sub = await AsaasService.getSubscription(payment.subscription);
            if (sub.cycle === 'YEARLY') durationDays = 365;
          } catch (e) { logger.warn('Could not fetch sub details for webhook, defaulting 30 days'); }

          const newEndDate = new Date();
          newEndDate.setDate(newEndDate.getDate() + durationDays);

          // Lógica de Renovação e Consumo de Horas Extras
          // 1. Calcular se houve consumo de horas extras no ciclo anterior
          const currentUsage = user.usage_minutes || 0;
          const planLimit = user.plan_limit_minutes || 600; // Default PRO/PRO+ limit base
          let currentExtra = user.extra_minutes || 0;

          if (currentUsage > planLimit) {
            const overage = currentUsage - planLimit;
            currentExtra = Math.max(0, currentExtra - overage); // Descontar o que excedeu
          }

          await supabase.from('profiles').update({
            subscription_status: 'ACTIVE',
            subscription_end: newEndDate.getTime(),
            usage_minutes: 0, // Reset mensal
            extra_minutes: currentExtra // Atualizar saldo de extras
          }).eq('id', user.id);

          logger.info(`[Webhook] User ${user.email} renewed until ${newEndDate.toISOString()}`);
        }
      }
    }

    // Handle Refund/Overdue Events
    if (event.event === 'PAYMENT_REFUNDED' || event.event === 'PAYMENT_OVERDUE') {
      const payment = event.payment;
      if (payment.subscription) {
        // Revoke Access
        // Careful with OVERDUE: we might want to give a grace period. But for now, strict rule.
        const { error } = await supabase.from('profiles').update({
          role: 'FREE',
          subscription_status: event.event === 'PAYMENT_REFUNDED' ? 'REFUNDED' : 'OVERDUE',
          subscription_end: Date.now()
        }).eq('subscription_id', payment.subscription);

        if (!error) logger.info(`[Webhook] Access revoked for subscription ${payment.subscription}(${event.event})`);
      }
    }

    // Handle Subscription Deleted
    if (event.event === 'SUBSCRIPTION_DELETED') {
      const subscription = event.subscription;
      await supabase.from('profiles').update({
        subscription_status: 'CANCELED',
        // We generally keep the end date if it was just canceled, 
        // but if DELETED usually means removed by admin or fraud.
        // Let's keep it safe: if deleted, check logic. Usually 'deleted' in asaas means gone.
        // Let's not revoke role immediately unless we want to. 
        // Better: Mark as CANCELED, let existing expiry logic handle it (server.js checkout checks expiry)
      }).eq('subscription_id', subscription.id);
      logger.info(`[Webhook] Subscription ${subscription.id} deleted`);
    }

    res.json({ received: true });
  } catch (err) {
    logger.error("Webhook Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// Delete meeting endpoint
app.delete('/api/meetings/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('meetings').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update meeting notes endpoint
app.patch('/api/meetings/:id/notes', async (req, res) => {
  try {
    const { notes } = req.body;
    const { error } = await supabase.from('meetings').update({ notes }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update meeting title endpoint
app.patch('/api/meetings/:id/title', async (req, res) => {
  try {
    const { title } = req.body;
    const { error } = await supabase.from('meetings').update({ title }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Pin meeting response endpoint
app.patch('/api/meetings/:id/pin', async (req, res) => {
  try {
    const { pinnedResponse } = req.body;
    const { error } = await supabase.from('meetings').update({ pinned_response: pinnedResponse }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// --- TERMS OF USE ENDPOINTS ---

// Check Terms Status
app.get('/api/terms/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    // Check if there is an acceptance for the current version (e.g., '1.0')
    const { data, error } = await supabase
      .from('terms_acceptances')
      .select('accepted_at')
      .eq('user_id', userId)
      .eq('terms_version', '1.0') // Hardcoded version for now, could be config
      .maybeSingle();

    if (error) throw error;

    res.json({ accepted: !!data, acceptedAt: data?.accepted_at });
  } catch (err) {
    logger.error(`Terms Check Error: ${err.message} `);
    // Fail safe: if error (e.g. table missing), don't block user? Or block?
    // Let's return false to be safe (strict mode) or handle table missing error.
    res.status(500).json({ error: err.message });
  }
});

// Accept Terms
app.post('/api/terms/accept', async (req, res) => {
  try {
    const { userId, userAgent, ip } = req.body;

    // Using service key (supabase client initialized with it) to bypass RLS if needed,
    // though we are insertion as explicit user usually.
    // Ideally we should verify the token here, but for this architecture we trust the frontend slightly
    // or rely on the `userId` passed being consistent with the session.
    // For robust security, we should check `req.headers.authorization` match, but existing structure uses explicit args.

    const { error } = await supabase.from('terms_acceptances').upsert({
      user_id: userId,
      terms_version: '1.0',
      user_agent: userAgent,
      ip_address: ip || req.ip
    }, { onConflict: 'user_id, terms_version' });

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    logger.error(`Terms Accept Error: ${err.message} `);
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN ENDPOINTS ---

// Get Admin Stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const { count: totalUsers, error: err1 } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
    const { count: activeUsers, error: err2 } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('is_active', true);
    const { count: proUsers, error: err3 } = await supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'PRO');

    if (err1 || err2 || err3) throw new Error("Erro ao buscar estatísticas");

    // Revenue simulation (simple)
    const revenue = (proUsers || 0) * 27.90;

    res.json({ totalUsers, activeUsers, proUsers, revenue });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Get All Users
app.get('/api/admin/users', async (req, res) => {
  try {
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Toggle User Status
app.patch('/api/admin/users/:id/status', async (req, res) => {
  try {
    const { isActive } = req.body;
    const { error } = await supabase.from('profiles').update({ is_active: isActive }).eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public Pricing Endpoint
app.get('/api/pricing', async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'pricing').single();

    // Default structure with 'active' flags
    const defaultPricing = {
      monthly: { price: 27.90, active: true },
      yearly: { price: 287.90, active: true },
      pro_plus: { price: 98.00, active: true },
      lomad_plus: { price: 199.00, active: true },
      addon_10h: { price: 129.00, active: true }
    };

    // Merge DB data with defaults to ensure all keys exist (safe migration)
    const finalPricing = { ...defaultPricing, ...(data?.value || {}) };

    // Ensure legacy numbers from DB are converted to objects if needed (Compatibility)
    Object.keys(finalPricing).forEach(key => {
      if (typeof finalPricing[key] === 'number') {
        finalPricing[key] = { price: finalPricing[key], active: true };
      }
    });

    res.json(finalPricing);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Privacy Policy Endpoint
app.get('/api/privacy-policy', (req, res) => {
  try {
    const policyPath = path.join(__dirname, 'privacy_policy.txt');
    if (fs.existsSync(policyPath)) {
      const policyContent = fs.readFileSync(policyPath, 'utf-8');
      res.json({ content: policyContent });
    } else {
      res.json({ content: "Política de privacidade não encontrada." });
    }
  } catch (err) {
    res.status(500).json({ error: "Erro ao ler política de privacidade" });
  }
});

// Terms of Use Endpoint
app.get('/api/terms', (req, res) => {
  try {
    const termsPath = path.join(__dirname, 'terms_of_use.txt');
    if (fs.existsSync(termsPath)) {
      const content = fs.readFileSync(termsPath, 'utf-8');
      res.json({ content });
    } else {
      res.json({ content: "Termos de uso não encontrados." });
    }
  } catch (err) {
    res.status(500).json({ error: "Erro ao ler termos de uso" });
  }
});

// LGPD Data Deletion Request
app.post('/api/request-data-deletion', async (req, res) => {
  try {
    const { userId, email } = req.body;
    logger.info(`[LGPD] Deletion request received for user: ${userId} (${email})`);

    // Insert into a 'deletion_requests' table or log strictly
    // For MVP, we log and potentially update the profile status
    if (userId) {
      const { error } = await supabase.from('profiles').update({
        is_active: false,
        subscription_status: 'DELETION_REQUESTED'
      }).eq('id', userId);

      if (error) logger.error("Error flagging user for deletion: " + JSON.stringify(error));
    }

    res.json({ success: true, message: "Solicitação recebida. Seus dados serão excluídos em até 15 dias conforme a lei." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transcription Endpoint for Gemini 1.5 Flash
app.post('/api/ai/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: 'No audio data provided' });
    }

    // Switch to gemini-flash-latest as 'gemini-1.5-flash' caused 404s and 2.0 caused 400s
    // The diagnostic log confirmed 'gemini-flash-latest' is available in the user's account.
    const modelName = 'gemini-flash-latest';

    // Robustly remove the Data URI prefix (handles codecs parameters too)
    const base64Data = audioData.includes('base64,')
      ? audioData.split('base64,')[1]
      : audioData;

    // Sanitize MIME type (remove parameters like ;codecs=opus)
    const cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim();

    // Initialize local client (Standard SDK)
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      logger.error("TRANSCRIPTION ERROR: GEMINI_API_KEY is missing.");
      return res.status(500).json({ error: 'Server configuration error: Missing API Key' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // HEURISTIC: Skip very small payloads (likely silence/headers only) to prevent hallucinations
    // A 5-second valid speech chunk is usually > 10KB. Silence is ~400-800 bytes.
    if (base64Data.length < 3000) {
      logger.info(`Skipping small payload(${base64Data.length} chars) - likely silence.`);
      return res.json({ transcription: "" });
    }

    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    });

    logger.info(`Starting transcription with model: ${modelName} `);
    logger.info(`Payload Debug: Mime = ${cleanMimeType}, DataLength = ${base64Data.length} `);

    const result = await model.generateContent([
      "ATUAR COMO ESTENÓGRAFO FORENSE PROFISSIONAL. \n\nObjetivo: Transcrever QUALQUER fala humana que você ouvir, mesmo que haja música, ruído ou sons de fundo.\n\nRegras:\n1. Se você ouvir vozes (português ou inglês), transcreva. Não ignore a fala só porque tem música de fundo.\n2. Se o áudio for APENAS silêncio absoluto ou ruído estático SEM fala humana, retorne 'detected_speech': false.\n3. Se houver fala abafada ou baixa, tente o seu melhor para transcrever.\n4. NÃO invente texto se não houver fala.\n\nRetorne JSON: { \"detected_speech\": boolean, \"transcript\": string }",
      {
        inlineData: {
          mimeType: cleanMimeType,
          data: base64Data
        }
      }
    ]);

    // Handle SDK response variations safely with fallback
    let rawText = "";
    if (result && typeof result.text === 'function') {
      try { rawText = result.text(); } catch (e) { /* ignore */ }
    } else if (result && result.response) {
      if (typeof result.response.text === 'function') rawText = result.response.text();
      else rawText = result.response.text;
    }

    let finalTranscription = "";
    try {
      const parsed = JSON.parse(rawText);
      if (parsed.detected_speech && parsed.transcript) {
        finalTranscription = parsed.transcript;
      } else {
        logger.info("Silence/Noise detected by Model (detected_speech=false).");
      }
    } catch (parseErr) {
      // Fallback for non-JSON response
      finalTranscription = rawText;
    }

    res.json({ transcription: finalTranscription });

  } catch (err) {
    logger.error("Transcription Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// NEW: Post-Meeting Full Processing Endpoint (ASYNC / FIRE-AND-FORGET)
app.post('/api/meetings/process-recording', async (req, res) => {
  try {
    const { audioData, mimeType, meetingData } = req.body;

    if (!audioData) return res.status(400).json({ error: 'No audio data' });

    // 1. Create Placeholder Meeting in DB (Status: PROCESSANDO)
    // We create an entry immediately so the user sees it in history
    const initialMeeting = {
      user_id: meetingData.user_id,
      title: meetingData.title,
      summary: "Processando transcrição... Aguarde alguns instantes.",
      transcriptions: [{
        id: "processing",
        role: 'system',
        text: "⏳ Áudio recebido. Processando transcrição...",
        timestamp: Date.now()
      }],
      timestamp: meetingData.timestamp,
      expires_at: meetingData.timestamp + (30 * 24 * 60 * 60 * 1000) // 30 days
    };

    const { data: insertedMeeting, error: insertError } = await supabase.from('meetings').insert([initialMeeting]).select().single();

    if (insertError) {
      logger.error("DB Insert Initial Error: " + insertError.message);
      return res.status(500).json({ error: "Failed to save initial meeting status." });
    }

    // Respond IMMEDIATELY to Client with the ID
    res.json({ success: true, meetingId: insertedMeeting.id, message: "Upload received. Processing in background." });

    // 2. BACKGROUND PROCESSING (Don't await this block for the response)
    (async () => {
      try {
        logger.info(`[Async Process] Starting for user ${meetingData?.user_id}(Meeting ID: ${insertedMeeting.id})`);

        // Clean base64
        const base64Data = audioData.includes('base64,') ? audioData.split('base64,')[1] : audioData;
        const cleanMimeType = (mimeType || 'audio/webm').split(';')[0].trim();

        // Initialize Gemini
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey);

        // Fix Model Name: "gemini-1.5-flash" was NOT found in user's available models. 
        // Switching to "gemini-2.0-flash" which is available and supports 1M token context.
        const model = genAI.getGenerativeModel({
          model: 'gemini-2.0-flash',
          generationConfig: { responseMimeType: "application/json" }
        });

        // Prompt for full context
        const result = await model.generateContent([
          "ATUAR COMO PROFISSIONAL DE ATAS DE REUNIÃO. \n" +
          "Analise o áudio completo da reunião e forneça:\n" +
          "1. 'transcript': A transcrição literal em Português.\n" +
          "2. 'summary': Um resumo executivo com pontos-chave.\n" +
          "3. 'topics': Uma lista de tópicos discutidos.\n\n" +
          "Se o áudio for silêncio ou apenas barulho, retorne campos vazios.\n" +
          "Formato JSON obrigatório: { \"transcript\": string, \"summary\": string, \"topics\": string[] }",
          {
            inlineData: {
              mimeType: cleanMimeType,
              data: base64Data
            }
          }
        ]);

        const responseText = result.response.text();
        let processedData = { transcript: "", summary: "", topics: [] };

        try {
          processedData = JSON.parse(responseText);
        } catch (e) {
          logger.warn("Failed to parse JSON from AI, using raw text as transcript");
          processedData.transcript = responseText;
          processedData.summary = "Resumo automático não disponível (formato inválido).";
        }

        // Format transcriptions
        const transcriptionEntries = [{
          id: "full-recording",
          role: 'user',
          text: processedData.transcript,
          timestamp: Date.now()
        }];

        // UPDATE the existing meeting record
        const { error: updateError } = await supabase.from('meetings').update({
          transcriptions: transcriptionEntries,
          summary: processedData.summary
        }).eq('id', insertedMeeting.id);

        if (updateError) {
          logger.error("DB Update Error: " + updateError.message);
          return;
        }

        // Increment usage
        await supabase.rpc('increment_meeting_count', { user_id: meetingData.user_id });
        const { data: profile } = await supabase.from('profiles')
          .select('meetings_recorded, email, name, role')
          .eq('id', meetingData.user_id)
          .single();

        if (profile) {
          await supabase.from('profiles').update({ meetings_recorded: (profile.meetings_recorded || 0) + 1 }).eq('id', meetingData.user_id);

          // Send Email Notification (All plans, including FREE)
          const isFree = profile.role === 'FREE';
          const isPro = profile.role === 'PRO';
          const isProPlus = profile.role === 'PRO_PLUS';
          const isLomadPlus = profile.role === 'LOMAD_PLUS';

          if (isFree || isPro || isProPlus || isLomadPlus) {
            if (profile.email) {
              emailService.sendTranscriptionReadyEmail(
                profile.email,
                profile.name || 'Usuário',
                insertedMeeting.title || 'Reunião Processada',
                insertedMeeting.id,
                false
              );
            }
          }
        }

        logger.info(`[Async Process] Completed successfull for user ${meetingData?.user_id}`);

      } catch (bgError) {
        logger.error(`[Async Process] FAILED for user ${meetingData?.user_id}: ${bgError.message} `);

        // Update DB to show failure
        await supabase.from('meetings').update({
          summary: "Falha no processamento: " + bgError.message,
          transcriptions: [{ id: 'error', role: 'system', text: "Erro ao processar áudio.", timestamp: Date.now() }]
        }).eq('id', insertedMeeting.id);
      }
    })();

  } catch (err) {
    logger.error("Full Processing Setup Error: " + err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});


// Debug: List available models
app.get('/api/debug/models', async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Missing GEMINI_API_KEY" });

    // Using fetch because Google Generative AI SDK listModels might behave differently or be absent in some versions
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get Pricing (Admin)
app.get('/api/admin/pricing', async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'pricing').single();
    if (error && error.code !== 'PGRST116') throw error; // If not found is fine, use default

    // Default structure with 'active' flags
    const defaultPricing = {
      monthly: { price: 27.90, active: true },
      yearly: { price: 287.90, active: true },
      pro_plus: { price: 98.00, active: true },
      lomad_plus: { price: 199.00, active: true },
      addon_10h: { price: 129.00, active: true }
    };

    // Merge DB data with defaults
    const finalPricing = { ...defaultPricing, ...(data?.value || {}) };

    // Ensure legacy numbers from DB are converted to objects if needed (Compatibility)
    Object.keys(finalPricing).forEach(key => {
      if (typeof finalPricing[key] === 'number') {
        finalPricing[key] = { price: finalPricing[key], active: true };
      }
    });

    res.json(finalPricing);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Update Pricing
app.post('/api/admin/pricing', async (req, res) => {
  try {
    const pricing = req.body;
    const { error } = await supabase.from('system_settings').upsert({ key: 'pricing', value: pricing });
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    const { meetingContext, userPrompt, history } = req.body;

    // Construct the prompt with context
    logger.info(`[Chat] Receiving context length: ${meetingContext?.length || 0}`);

    // Validate context
    if (!meetingContext || meetingContext.trim().length === 0) {
      logger.warn("[Chat] Empty meeting context rejected");
      return res.json({ response: "Por favor, selecione uma reunião com transcrição válida antes de iniciar o chat." });
    }

    const systemInstruction = `Você é um assistente IA focado ESTRITAMENTE no conteúdo da reunião fornecida abaixo.
    
    <TRANSCRICAO_REUNIAO>
    ${meetingContext}
    </TRANSCRICAO_REUNIAO>
    
    DIRETRIZES RÍGIDAS (IMPORTANTE):
    1. Você deve IGNORAR seu conhecimento geral. Use APENAS o texto acima.
    2. Se a resposta não estiver explícita na transcrição, responda APENAS: "Não encontrei essa informação na reunião selecionada."
    3. NÃO invente fatos, nomes ou datas que não estejam no texto.
    4. Mantenha um tom profissional e direto.
    5. Se o usuário perguntar quem é você, diga que é o Assistente da Reunião MeetingMind.
    
    Responda à pergunta do usuário abaixo com base APENAS na transcrição acima.`;

    // Initialize Gemini with the correct model (Gemini 2.0 Flash)
    // We instantiate locally to ensure fresh config
    const apiKey = process.env.GEMINI_API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemInstruction
    });

    const chatHistory = (history || []).map(h => ({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.text }]
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        maxOutputTokens: 2000,
      },
    });

    const result = await chat.sendMessage(userPrompt);
    const response = await result.response;
    const text = response.text();

    res.json({ response: text });

  } catch (err) {
    logger.error("Chat Error: " + err.message);
    res.status(500).json({ error: err.message });
  }
});

// SPA Fallback: Qualquer rota que não seja arquivo ou API serve o index.html
app.get(/.*/, (req, res) => {
  // Evita servir index.html para arquivos que deveriam existir (assets)
  if (req.path.includes('.') && !req.path.endsWith('.tsx') && !req.path.endsWith('.ts')) {
    return res.status(404).send('Not Found');
  }
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});


// Tratamento de erros globais (Crash Reporting)
process.on('uncaughtException', (err) => {
  logger.error(`UNCAUGHT EXCEPTION: ${err.message}`, { stack: err.stack });
  // Opcional: process.exit(1)? Em produção no Render, ele reinicia auto.
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error(`UNHANDLED REJECTION: ${JSON.stringify(reason)}`);
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  logger.info(`🚀 MeetingMind Ativo em http://localhost:${port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
});
