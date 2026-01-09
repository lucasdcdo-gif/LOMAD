
import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Servir arquivos estáticos do diretório dist
app.use(express.static(path.join(__dirname, 'dist')));

// Configurações Supabase e Gemini
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);
console.log("--- DEBUG STARTUP ---");
console.log(`[Server] URL: ${process.env.SUPABASE_URL}`);
console.log(`[Server] Key Length: ${(process.env.SUPABASE_SERVICE_KEY || '').length}`);
console.log(`[Server] Key Prefix: ${(process.env.SUPABASE_SERVICE_KEY || '').substring(0, 15)}...`);
console.log("--- DEBUG END ---");

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.GEMINI_API_KEY });

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
      console.error("Erro ao buscar perfil para verificação de limite:", profileError);
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
      console.error("CRITICAL: Falha ao incrementar meetings_recorded para usuario " + meetingData.user_id, updateError);
    }

    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/meetings/:uid', async (req, res) => {
  try {
    const { data, error } = await supabase.from('meetings').select('*').eq('user_id', req.params.uid).order('timestamp', { ascending: false });
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    // 1. Buscar ou Criar Cliente no Asaas
    let customer = await AsaasService.getCustomer(userProfile.email);
    if (!customer) {
      customer = await AsaasService.createCustomer({
        name: cardData.name, // Use card name as fallback if profile name is generic
        email: userProfile.email,
        id: userId
      });
    }

    // 2. Preparar dados do pagamento
    const [expiryMonth, expiryYear] = cardData.expiry.split('/');
    const cleanNumber = cardData.number.replace(/\s/g, '');
    // Buscar preços configurados (tabela pricing, único registro)
    const { data: pricingData, error: pricingError } = await supabase.from('pricing').select('*').single();
    if (pricingError) console.warn("Pricing lookup error:", pricingError);

    // Fallback para valores padrão se falhar
    const defaultMonthly = 27.90;
    const defaultYearly = 287.90;

    let value;
    if (plan === 'yearly') {
      value = pricingData?.yearly_price || defaultYearly;
    } else {
      value = pricingData?.monthly_price || defaultMonthly;
    }

    // Dados vêm do frontend agora
    const cpfCnpj = cardData.cpf.replace(/\D/g, '');
    const phone = cardData.phone.replace(/\D/g, '');
    const postalCode = cardData.postalCode.replace(/\D/g, '');

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
        phone: phone
      },
      remoteIp: req.ip
    };

    const subscription = await AsaasService.createSubscription(customer.id, subscriptionPayload);

    // 4. Atualizar Perfil se Sucesso
    if (subscription.status === 'ACTIVE') {
      const cardLast4 = cleanNumber.slice(-4);

      // Calcular data de expiração (apenas inicial, webhook que deveria atualizar)
      const nextDueDate = new Date(subscription.nextDueDate);
      const expiryDate = nextDueDate.getTime(); // Timestamp

      const { error } = await supabase.from('profiles').update({
        role: 'PRO',
        card_last4: cardLast4,
        card_brand: subscription.creditCard.creditCardBrand || 'Mastercard',
        cpf_cnpj: cpfCnpj,
        phone: phone,
        postal_code: postalCode,
        address_number: cardData.addressNumber,
        subscription_id: subscription.id,
        subscription_status: 'ACTIVE',
        subscription_end: expiryDate
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
    console.error("Checkout Error:", err);
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

    // Cancelar no Asaas
    await AsaasService.cancelSubscription(user.subscription_id);

    // Atualizar status local
    // Mantemos o role PRO até a data de expiração (subscription_end)
    const { error: updateError } = await supabase.from('profiles').update({
      subscription_status: 'CANCELED'
      // Não mudamos subscription_end, pois o acesso continua até lá
    }).eq('id', userId);

    if (updateError) throw updateError;

    res.json({ success: true, endDate: user.subscription_end });

  } catch (err) {
    console.error("Cancel Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Create Profile endpoint (bypasses RLS with SERVICE_KEY)
app.post('/api/profiles/create', async (req, res) => {
  try {
    const { userId, email, role = 'FREE' } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ error: 'userId and email are required' });
    }

    // Using SERVICE_KEY to bypass RLS policies
    const { data, error } = await supabase
      .from('profiles')
      .insert([{ id: userId, email, role, is_active: true }])
      .select()
      .single();

    if (error) {
      console.error("Profile creation error:", error);
      return res.status(500).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Create profile exception:", err);
    res.status(500).json({ error: err.message });
  }
});

// Update Profile endpoint
app.put('/api/profile', async (req, res) => {
  try {
    const { userId, phone, postalCode, addressNumber } = req.body;

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
      address_number: addressNumber
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
            addressNumber
          });
        }
      } catch (asaasErr) {
        console.error("Erro ao sincronizar com Asaas (ignorado para não bloquear UI):", asaasErr.message);
      }
    }

    res.json({ success: true });

  } catch (err) {
    console.error("Profile Update Error:", err);
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
    res.json(data?.value || { monthly: 27.90, yearly: 287.90 });
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

// Get Pricing (Admin)
app.get('/api/admin/pricing', async (req, res) => {
  try {
    const { data, error } = await supabase.from('system_settings').select('value').eq('key', 'pricing').single();
    if (error && error.code !== 'PGRST116') throw error; // If not found is fine, use default
    res.json(data?.value || { monthly: 27.90, yearly: 287.90 });
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
    console.log(`[Chat] Receiving context length: ${meetingContext?.length || 0}`);

    // Validar se há contexto
    if (!meetingContext || meetingContext.trim().length === 0) {
      console.warn("[Chat] Empty meeting context rejected");
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

    const contents = [
      ...(history || []).map(h => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      })),
      { role: 'user', parts: [{ text: userPrompt }] }
    ];

    // Utilizando systemInstruction se suportado ou injetando como primeira mensagem de usuário com reforço
    // A SDK @google/genai suporta config systemInstruction no generateContent ou no modelo, mas para garantir compatibilidade com o formato de mensagem:

    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp',
      config: {
        systemInstruction: { parts: [{ text: systemInstruction }] }
      },
      contents: contents
    });

    res.json({ response: result.text });
  } catch (err) {
    console.error("Chat Error:", err);
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`\\n🚀 MeetingMind Ativo em http://localhost:${PORT}\\n`);
});
