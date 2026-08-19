# Guia de Setup — WhatsApp com Evolution API

Este guia explica como conectar o número de WhatsApp da barbearia ao sistema de lembretes automáticos. Custo: **R$0** (só o VPS/Railway, se não tiver ainda).

---

## Como funciona

```
Cliente agenda → página de sucesso → clica "Ativar Lembretes no WhatsApp"
  → abre WA com mensagem pré-preenchida (ID_xxxxxxxx)
  → webhook recebe a mensagem → marca wa_opt_in=true no banco
  → cron às :00 e :30 → envia lembrete enquanto janela de 72h estiver aberta
```

A **janela de 72h** é contada a partir do envio da mensagem de opt-in. Enquanto a janela estiver aberta, o envio é gratuito (conversa iniciada pelo usuário). Se passar de 72h, o sistema **não envia** (kill-switch automático).

---

## Passo 1 — Subir a Evolution API

### Opção A: Railway (recomendado — grátis até $5/mês)

1. Acesse [railway.app](https://railway.app) e crie uma conta.
2. Clique em **New Project → Deploy from Docker Image**.
3. Imagem: `atendai/evolution-api:latest`
4. Adicione as variáveis de ambiente:

   | Variável | Valor |
   |---|---|
   | `SERVER_URL` | URL do próprio Railway (gerada automaticamente depois) |
   | `AUTHENTICATION_TYPE` | `apikey` |
   | `AUTHENTICATION_API_KEY` | Uma senha forte (ex: `minha-chave-secreta-123`) |
   | `AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES` | `true` |
   | `DATABASE_PROVIDER` | `postgresql` ← **se quiser persistência** |

5. Clique em **Deploy**. Aguarde ~2 min.
6. Em **Settings → Networking**, gere um domínio público (ex: `minha-evo.up.railway.app`).
7. Volte e atualize `SERVER_URL` com a URL gerada.

### Opção B: VPS próprio (Hostinger, Contabo, etc.)

```bash
# Instalar Docker
curl -fsSL https://get.docker.com | sh

# Subir Evolution API
docker run -d \
  --name evolution-api \
  -p 8080:8080 \
  -e SERVER_URL=https://seu-dominio.com \
  -e AUTHENTICATION_TYPE=apikey \
  -e AUTHENTICATION_API_KEY=minha-chave-secreta-123 \
  atendai/evolution-api:latest

# Opcional: proxy reverso com Nginx + SSL (Certbot)
```

---

## Passo 2 — Criar uma instância e conectar o WhatsApp

1. Abra o Swagger da Evolution API: `https://SUA_URL/docs`
2. Autentique: clique em **Authorize** e cole sua `AUTHENTICATION_API_KEY`.
3. Crie uma instância em **POST /instance/create**:
   ```json
   {
     "instanceName": "barbearia-leste",
     "integration": "WHATSAPP-BAILEYS"
   }
   ```
4. Gere o QR Code em **GET /instance/connect/{instanceName}** (substitua pelo nome que deu).
5. Escaneie o QR Code com o WhatsApp **do número da barbearia** (telefone → WhatsApp → Dispositivos Vinculados → Vincular um dispositivo).
6. Aguarde o status ficar `open`.

> **Importante**: use um chip dedicado para a barbearia. Não use seu número pessoal — o WhatsApp pode banir por uso automatizado se detectar padrão incomum.

---

## Passo 3 — Configurar no painel admin

No painel da barbearia, vá em **Configurações → WhatsApp** (seção que usa a função `saveEvolutionConfig`) e preencha:

| Campo | Valor |
|---|---|
| **URL da Evolution API** | Ex: `https://minha-evo.up.railway.app` |
| **API Key** | A senha que você definiu (`minha-chave-secreta-123`) |
| **Nome da Instância** | `barbearia-leste` (o que você criou no passo 2) |

---

## Passo 4 — Registrar o webhook na Evolution API

Isso faz a Evolution API avisar o sistema quando um cliente responder.

**POST /webhook/set/{instanceName}** no Swagger:
```json
{
  "webhook": {
    "enabled": true,
    "url": "https://SEU-DOMINIO-VERCEL.vercel.app/api/webhooks/whatsapp",
    "byEvents": true,
    "base64": false,
    "events": ["MESSAGES_UPSERT"]
  }
}
```

Substitua `SEU-DOMINIO-VERCEL` pelo domínio da sua aplicação no Vercel.

---

## Passo 5 — Variáveis de ambiente no Vercel

No painel do Vercel, vá em **Settings → Environment Variables** e adicione:

| Variável | Valor |
|---|---|
| `WHATSAPP_WEBHOOK_SECRET` | A mesma API Key da Evolution (`minha-chave-secreta-123`) |

Isso garante que só a Evolution API consiga acionar o webhook.

---

## Passo 6 — Testar

1. Faça um agendamento no app.
2. Na página de sucesso, clique em **"🔔 Ativar Lembretes no WhatsApp"**.
3. O WhatsApp abrirá com a mensagem pré-preenchida. Envie a mensagem.
4. Verifique no banco (tabela `appointments`, coluna `wa_opt_in`) se ficou `true`.
5. Espere o próximo disparo do cron (a cada 5 min) e confira se o lembrete chegou.

---

## Perguntas frequentes

**Posso usar o mesmo número que já uso para atendimento manual?**
Tecnicamente sim, mas não é recomendado. A Evolution API usa o protocolo não-oficial do WhatsApp (Baileys). Há risco de banimento se o volume for muito alto ou o comportamento parecer bot. Para uso leve (1 lembrete por cliente por dia), o risco é baixo.

**Qual o risco de banimento?**
Baixo para uso moderado. A janela de 72h garante que você só responde a conversas que o cliente iniciou — isso é o mesmo que responder manualmente. O WhatsApp permite isso.

**E se o cliente não enviar a mensagem de opt-in?**
O lembrete simplesmente não é enviado. Sem opt-in, `wa_opt_in = false` e o cron pula o agendamento. O cliente continua recebendo lembretes push normalmente (se tiver habilitado).

**E se a janela de 72h expirar?**
O cron verifica `last_wa_interaction >= now - 72h`. Se passou, o registro não entra na query e o lembrete não é enviado. Sem custo, sem risco.
