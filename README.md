# 🐴 Pegasus — Autonomous AI Agent

Agente AI autônomo com memória semântica infinita, multi-modelo, proatividade e sub-agentes.

## Features

- 🧠 **Neural Brain** — Pipeline SEARCH→THINK→ACT→REMEMBER→RESPOND em toda mensagem
- 💾 **Memória Infinita** — LanceDB (vetorial) + SQLite (knowledge graph)
- 🔍 **Busca Semântica Automática** — Toda mensagem busca contexto relevante antes de processar
- 🤔 **Chain-of-Thought Forçado** — Raciocínio interno obrigatório
- 🌙 **Sonhos** — Consolidação periódica de memória (merge, dedup, insights)
- 🔧 **13 Tools** — Bash, FileRead/Write, Glob, Grep, WebSearch, WebFetch, SystemInfo, Memory, Cron
- 💬 **Telegram + CLI** — Duas interfaces
- 🏥 **Doctor** — Diagnóstico completo com auto-repair
- ⏰ **Autonomia** — Heartbeat, cron persistente, backup automático
- 🔌 **Multi-modelo** — NVIDIA NIM, OpenRouter, Gemini, Codex, HuggingFace, Ollama
- 📖 **Compatível com Claude Code** — Consome CLAUDE.md, rules, e skills existentes

## Requisitos

- **Linux** (ou WSL no Windows)
- **Node.js 22+**
- Pelo menos 1 API key de provedor AI

## Instalação Rápida

```bash
git clone https://github.com/faelsete/pegasus-agent.git
cd pegasus-agent
bash scripts/install.sh
```

O script de instalação vai:
1. Verificar Node.js
2. Criar `~/.pegasus/` com templates
3. Instalar dependências
4. Rodar o **Setup Wizard** interativo

## Instalação Manual

```bash
git clone https://github.com/faelsete/pegasus-agent.git
cd pegasus-agent
npm install
npm run setup    # Setup wizard interativo
```

## Uso

```bash
# Telegram bot (modo principal)
npm start

# CLI interativa
npm run start:cli

# Diagnóstico
npm run doctor

# Reconfigurar
npm run setup
```

## Comandos (Telegram & CLI)

| Comando | Descrição |
|---|---|
| `/status` | Status do sistema |
| `/search <query>` | Busca na memória |
| `/remember <fato>` | Salva memória |
| `/forget` | Limpa contexto da conversa |
| `/model` | Modelo atual |
| `/doctor` | Diagnóstico |
| `/help` | Lista comandos |

## Provedores Suportados

| Provedor | Uso | Necessário? |
|---|---|---|
| NVIDIA NIM | Texto (principal) | Pelo menos 1 |
| OpenRouter | Texto + Embeddings | Recomendado |
| Google Gemini | Texto | Opcional |
| OpenAI/Codex | Texto (código) | Opcional |
| HuggingFace | Geração de imagens | Opcional |
| Ollama | Texto local (grátis) | Opcional |

## Arquitetura

```
                    ┌─────────────┐
                    │   Telegram   │
    Input ────────►│    / CLI     │
                    └──────┬──────┘
                           │
                    ┌──────▼──────┐
                    │   CORTEX    │
                    │  (Reasoning │
                    │    Loop)    │
                    └──────┬──────┘
                           │
         ┌─────────────────┼─────────────────┐
         │                 │                 │
    ┌────▼────┐     ┌─────▼─────┐    ┌─────▼─────┐
    │ SEARCH  │     │  THINK    │    │   ACT     │
    │ LanceDB │     │  Chain of │    │  13 Tools │
    │ + Graph │     │  Thought  │    │           │
    └────┬────┘     └───────────┘    └───────────┘
         │
    ┌────▼────┐
    │REMEMBER │
    │ Extract │
    │ Store   │
    └─────────┘
```

## Desinstalação

```bash
bash scripts/uninstall.sh
```

Remove tudo: dados, config, serviço systemd, node_modules.

## License

MIT
