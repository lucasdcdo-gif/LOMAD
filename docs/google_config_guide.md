# Guia de Configuração: Google Calendar + Recall.ai

Para que a integração de calendário funcione de verdade (saindo do modo simulado), você precisa criar um **Aplicativo no Google Cloud**. A Recall.ai usa esse aplicativo para pedir permissão de acesso à agenda dos seus usuários.

Aqui está o passo a passo completo:

---

## Passo 1: Criar um Projeto no Google Cloud

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/).
2. Clique no seletor de projetos no topo esquerdo (ao lado do logo "Google Cloud").
3. Clique em **"Novo Projeto"** (New Project).
4. Dê um nome (ex: `MeetingMind Integração`) e clique em **Criar**.
5. Selecione o projeto recém-criado.

## Passo 2: Ativar a API do Google Calendar

1. No menu lateral, vá em **"APIs e serviços"** > **"Biblioteca"** (Library).
2. Na barra de busca, digite: `Google Calendar API`.
3. Clique no resultado e depois no botão **"Ativar"** (Enable).

## Passo 3: Configurar a Tela de Consentimento OAuth

1. No menu lateral, vá em **"APIs e serviços"** > **"Tela de permissão OAuth"** (OAuth consent screen).
2. Escolha o tipo de usuário: **Externo** (External) e clique em **Criar**.
3. Preencha as informações obrigatórias:
   - **Nome do App:** `MeetingMind` (ou o nome do seu produto).
   - **Email de suporte:** Seu email.
   - **Email de contato do desenvolvedor:** Seu email.
4. Clique em **Salvar e Continuar**.
5. Em **Escopos** (Scopes), clique em **Adicionar ou Remover Escopos**.
6. Procure e selecione: `.../auth/calendar.events.readonly` (para ler eventos do calendário).
   - *Nota: Se não aparecer, você pode adicionar manualmente.*
7. Clique em **Atualizar** e depois **Salvar e Continuar**.
8. Em **Usuários de Teste** (Test Users):
   - Adicione **SEU PRÓPRIO EMAIL GMAIL/GOOGLE** que você usará para testar.
   - *Importante: Enquanto o app não for verificado pelo Google (processo longo), só emails cadastrados aqui conseguem conectar.*
9. Clique em **Salvar e Continuar** até finalizar.

## Passo 4: Criar as Credenciais (Client ID e Secret)

1. No menu lateral, vá em **"APIs e serviços"** > **"Credenciais"** (Credentials).
2. Clique em **"+ CRIAR CREDENCIAIS"** no topo e escolha **ID do cliente OAuth** (OAuth client ID).
3. Em **Tipo de aplicativo**, selecione **Aplicação Web** (Web application).
4. Dê um nome (ex: `Recall Integration`).
5. Em **URIs de redirecionamento autorizados** (Authorized redirect URIs), adicione a URL fornecida pela Recall.ai.
   - **Onde achar essa URL?**
     - Geralmente é: `https://api.recall.ai/api/v1/oauth/callback/google_calendar`
     - *Dica:* Verifique no painel da Recall.ai se eles especificam uma URL diferente para a sua região.
6. Clique em **Criar**.
7. Uma janela vai abrir com **"Seu ID de cliente"** e **"Sua Chave secreta de cliente"**.
   - **COPIE ESSES DOIS VALORES!** Você vai precisar deles.

---

## Passo 5: Configurar no Painel da Recall.ai

Agora que você tem as chaves do Google, precisa entregar para a Recall.ai gerenciar.

1. Acesse o [Dashboard da Recall.ai](https://app.recall.ai/).
2. Vá para a seção de **Integrações** ou **Calendar**.
3. Procure por **Google Calendar** e clique em Configurar/Ativar.
4. Cole o **Client ID** e o **Client Secret** que você gerou no passo anterior.
5. Salve.

---

## Passo 6: Voltar ao Código

Depois de configurar tudo isso:
1. Me avise para eu desfazer a "Simulação" no código `server.js`.
2. Quando você clicar em "Conectar" no seu app, ele vai usar essas credenciais reais para abrir a janelinha do Google pedindo permissão.
