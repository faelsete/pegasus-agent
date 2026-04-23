# 🤖 Guia Completo de Modelos e Provedores

Este guia explica como configurar, trocar e testar modelos de IA no Pegasus.

---

## Como o Pegasus Escolhe o Modelo

O Pegasus usa uma **cadeia de fallback** automática. Quando você envia uma mensagem:

1. Tenta o **primeiro provedor habilitado** da lista
2. Se falhar ou travar (timeout de 45 segundos), tenta o **segundo**
3. Continua até encontrar um que responda
4. Se **todos** falharem, retorna erro

**Ordem de prioridade padrão:**
```
OpenRouter → Gemini → Codex/OpenAI → NVIDIA NIM → Ollama
```

---

## Onde Fica a Configuração

Tudo fica em um único arquivo:
```bash
~/.pegasus/config.json
```

Para editar:
```bash
nano ~/.pegasus/config.json
```

> Para salvar no nano: `Ctrl+O` → `Enter` → `Ctrl+X`

---

## Estrutura do Config (seção providers)

```json
{
  "providers": [
    {
      "type": "openrouter",
      "apiKey": "sk-or-v1-sua-chave-aqui",
      "defaultModel": "openai/gpt-oss-120b:free",
      "enabled": true
    },
    {
      "type": "nvidia",
      "apiKey": "nvapi-sua-chave-aqui",
      "defaultModel": "meta/llama-3.1-70b-instruct",
      "enabled": true
    },
    {
      "type": "gemini",
      "apiKey": "AIza-sua-chave-aqui",
      "defaultModel": "gemini-2.0-flash",
      "enabled": true
    },
    {
      "type": "ollama",
      "baseUrl": "http://localhost:11434/v1",
      "defaultModel": "llama3.1",
      "enabled": false
    }
  ]
}
```

**Campos:**
| Campo | O que faz |
|---|---|
| `type` | Tipo do provedor (`openrouter`, `nvidia`, `gemini`, `codex`, `ollama`) |
| `apiKey` | Sua chave de API |
| `baseUrl` | (Opcional) URL customizada da API |
| `defaultModel` | O modelo que será usado neste provedor |
| `enabled` | `true` = ativo, `false` = ignorado |

---

## Catálogo de Modelos por Provedor

### 🟣 OpenRouter (Recomendado — Maior Variedade)

Obtenha sua chave em: https://openrouter.ai/keys

#### Modelos Gratuitos (:free)
```
openai/gpt-oss-120b:free              → GPT Open Source 120B
meta-llama/llama-4-maverick:free       → Llama 4 Maverick
google/gemini-2.0-flash-exp:free       → Gemini 2.0 Flash
mistralai/mistral-small-3.1-24b-instruct:free → Mistral Small 3.1
qwen/qwen3-235b-a22b:free             → Qwen 3 235B
deepseek/deepseek-chat-v3-0324:free    → DeepSeek V3
microsoft/phi-4:free                   → Phi-4 14B
```

#### Modelos Pagos (mais rápidos e confiáveis)
```
anthropic/claude-sonnet-4             → Claude Sonnet 4
openai/gpt-4o                         → GPT-4o
google/gemini-2.5-pro-preview         → Gemini 2.5 Pro
meta-llama/llama-3.1-405b-instruct    → Llama 3.1 405B
```

> **Dica:** Modelos com `:free` no final são gratuitos mas podem ter fila de espera. Modelos pagos respondem instantaneamente.

---

### 🟢 NVIDIA NIM

Obtenha sua chave em: https://build.nvidia.com

```
meta/llama-3.1-70b-instruct           → Llama 3.1 70B
meta/llama-3.1-8b-instruct            → Llama 3.1 8B (rápido)
nvidia/llama-3.1-nemotron-70b-instruct → Nemotron 70B (otimizado)
mistralai/mistral-large-2-instruct    → Mistral Large 2
microsoft/phi-3-medium-128k-instruct  → Phi-3 Medium
```

> **Atenção:** NVIDIA NIM pode congestionar em horários de pico. O Pegasus cairá automaticamente para o próximo provedor.

---

### 🔵 Google Gemini

Obtenha sua chave em: https://aistudio.google.com/apikey

```
gemini-2.0-flash                       → Flash 2.0 (rápido e barato)
gemini-1.5-pro                         → Pro 1.5 (mais capaz)
gemini-2.5-pro-preview                 → Pro 2.5 Preview (último)
```

---

### ⚪ OpenAI / Codex

Obtenha sua chave em: https://platform.openai.com/api-keys

```
gpt-4o                                → GPT-4o (melhor geral)
gpt-4o-mini                           → GPT-4o Mini (mais barato)
o3-mini                               → O3 Mini (raciocínio)
```

---

### 🟠 Ollama (Local — Gratuito — Sem Internet)

Instale: https://ollama.com

```bash
# Instalar e baixar modelo:
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.1
ollama pull mistral
ollama pull codellama
```

Modelos disponíveis:
```
llama3.1                               → Llama 3.1 8B
mistral                                → Mistral 7B
codellama                              → Code Llama 7B
deepseek-coder-v2                      → DeepSeek Coder V2
```

> **Vantagem:** Roda 100% offline, sem custos. Ideal como fallback final.

---

## Operações Comuns

### ✏️ Trocar o Modelo de um Provedor

```bash
# 1. Abrir o config
nano ~/.pegasus/config.json

# 2. Encontrar o provedor e mudar "defaultModel"
#    Exemplo: trocar OpenRouter para DeepSeek
#    "defaultModel": "deepseek/deepseek-chat-v3-0324:free"

# 3. Salvar (Ctrl+O, Enter, Ctrl+X)

# 4. Reiniciar o bot
npm start
```

### ⚡ Trocar Modelo Rápido (sem abrir editor)

```bash
# Trocar modelo do OpenRouter:
sed -i 's|"openai/gpt-oss-120b:free"|"deepseek/deepseek-chat-v3-0324:free"|' ~/.pegasus/config.json

# Trocar modelo da NVIDIA:
sed -i 's|"minimaxai/minimax-m2.7"|"meta/llama-3.1-70b-instruct"|' ~/.pegasus/config.json

# Reiniciar
npm start
```

### 🔄 Mudar a Ordem de Prioridade

A ordem dos provedores no array `"providers"` define a prioridade do fallback. O primeiro da lista é tentado primeiro:

```json
"providers": [
  { ... "type": "openrouter" ... },   ← Tentado PRIMEIRO
  { ... "type": "nvidia" ... },        ← Tentado se OpenRouter falhar
  { ... "type": "gemini" ... }         ← Último recurso
]
```

Para mudar: reorganize os objetos no array.

### ❌ Desabilitar um Provedor (sem apagar)

```bash
# Desabilitar NVIDIA temporariamente:
sed -i '/"type": "nvidia"/,/}/ s/"enabled": true/"enabled": false/' ~/.pegasus/config.json

# Reabilitar:
sed -i '/"type": "nvidia"/,/}/ s/"enabled": false/"enabled": true/' ~/.pegasus/config.json
```

### ➕ Adicionar um Novo Provedor

Basta adicionar um novo objeto no array `"providers"`:

```bash
nano ~/.pegasus/config.json
```

Adicionar antes do `]` que fecha o array:
```json
    ,
    {
      "type": "gemini",
      "apiKey": "AIza-sua-chave-do-google",
      "defaultModel": "gemini-2.0-flash",
      "enabled": true
    }
```

### ✅ Verificar se Está Tudo OK

```bash
npm run doctor
```

---

## Entendendo os Logs

Quando o Pegasus recebe uma mensagem, os logs mostram exatamente o que acontece:

```
[INFO] reasoning started                          ← Mensagem recebida
[INFO] trying provider: openrouter / gpt-oss-120b:free  ← Tentando 1º
[WARN] provider timed out, trying fallback        ← Falhou, próximo!
[INFO] trying provider: nvidia / llama-3.1-70b    ← Tentando 2º
[INFO] provider responded: nvidia                 ← Sucesso!
[INFO] reasoning complete (elapsed: 3200ms)       ← Respondeu
```

Se todos falharem:
```
[ERROR] All providers failed. Check your API keys and network connection.
```

---

## Dúvidas Frequentes

**P: Posso usar vários modelos do mesmo provedor?**
R: Cada provedor tem um `defaultModel`. Para testar outro modelo, basta trocar o `defaultModel` e reiniciar.

**P: O que acontece se minha chave de API expirar?**
R: O Pegasus vai falhar nesse provedor e cair automaticamente para o próximo habilitado.

**P: Quanto custa usar os modelos?**
R: Modelos `:free` do OpenRouter são gratuitos. NVIDIA NIM tem tier gratuito generoso. Ollama é 100% local e grátis. Modelos pagos cobram por token (geralmente centavos por conversa).

**P: Qual o melhor modelo para começar?**
R: `deepseek/deepseek-chat-v3-0324:free` no OpenRouter — gratuito, rápido e muito capaz.
