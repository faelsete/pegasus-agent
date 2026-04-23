# 🐴 Pegasus — Autonomous AI Agent System

[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-22+-green?style=for-the-badge&logo=node.js)](https://nodejs.org/)
[![Database](https://img.shields.io/badge/LanceDB-Vector-orange?style=for-the-badge)](https://lancedb.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

> **Pegasus** não é apenas um chatbot; é um organismo digital persistente projetado para o ecossistema Linux. Ele possui um cérebro neural com raciocínio forçado, memória semântica infinita e a capacidade de auto-diagnóstico e evolução através de "ciclos de sonho".

---

## 🚀 Visão Geral

O Pegasus foi arquitetado para ser um **Universal Consumer** do ecossistema Claude Code, permitindo que ele utilize regras (`CLAUDE.md`), habilidades e contextos de forma transparente, enquanto expande essas capacidades com uma estrutura de multi-modelos e proatividade real.

### 💎 Diferenciais de Engenharia
*   **Neural Cortex**: Implementa o loop `SEARCH → THINK → ACT → REMEMBER → RESPOND`.
*   **Memória Híbrida**: Busca vetorial via LanceDB combinada com Grafo de Conhecimento em SQLite.
*   **Proatividade Autonômica**: Heartbeat constante e CronJobs que permitem ao agente executar tarefas enquanto você dorme.
*   **Sistema de "Sonhos"**: Processamento em background para consolidar memórias, remover duplicatas e gerar novos insights.
*   **Resiliência (Doctor System)**: Módulo de auto-cura que verifica 22 pontos críticos do sistema e repara falhas automaticamente.

---

## 🏗️ Arquitetura do Sistema

A estrutura é dividida em camadas modulares para garantir escalabilidade e fácil manutenção:

| Camada | Função |
| :--- | :--- |
| **Cortex** | O motor de raciocínio que decide quando usar ferramentas ou buscar memórias. |
| **Memory Store** | Gerenciamento de vetores de alta dimensão e busca por similaridade. |
| **Knowledge Graph** | Banco de dados relacional que mapeia entidades e fatos complexos. |
| **Brainstem** | Controle de funções vitais: Heartbeats, Backups e Agendamentos. |
| **Interfaces** | Abstração para comunicação via Telegram Bot ou CLI Terminal. |

> [!TIP]
> Para um detalhamento técnico profundo, veja o [Guia de Arquitetura](./docs/ARCHITECTURE.md).

---

## 🛠️ Instalação e Requisitos

O Pegasus agora utiliza um **script de diagnóstico** para garantir que seu servidor está pronto antes de instalar qualquer coisa. Isso evita travamentos em servidores lentos ou instáveis.

```bash
curl -fsSL https://raw.githubusercontent.com/faelsete/pegasus-agent/main/scripts/install.sh | bash
```

O script irá:
1. 🔍 Verificar requisitos (Node.js 22+, Git, Python3, Build-essential).
2. 💡 Fornecer o comando exato de `apt install` caso falte algo.
3. 🚀 Clonar e configurar o ambiente de forma segura.

### 🧠 Alta Disponibilidade (Multi-Key Fallback)
Agora você pode cadastrar **múltiplas API Keys** por provedor (ex: 5 contas Gemini ou 3 NVIDIA). Se uma chave atingir o limite de uso (Rate Limit), o Pegasus pula automaticamente para a próxima chave, garantindo operação 24/7 sem interrupções.

> [!TIP]
> No `npm run setup`, basta colar suas chaves separadas por vírgula.


### Já instalou e quer reconfigurar?
```bash
cd ~/pegasus-agent && npm run setup
sudo systemctl restart pegasus
```

### Trocar modelo de IA?
Veja o [Guia de Modelos](./docs/MODELS_GUIDE.md) completo com catálogo e comandos.


## 🎮 Modos de Operação

### 🤖 Telegram Bot (Modo Principal)
Projetado para 24/7. Suporta sessões persistentes e notificações proativas.
```bash
npm start
```

### 💻 CLI Interativa
Ideal para desenvolvimento local e testes rápidos de ferramentas.
```bash
npm run start:cli
```

### 🏥 Doctor (Diagnóstico)
Sempre que algo parecer errado, chame o médico:
```bash
npm run doctor
```

---

## 🧰 Ferramentas Nativas (Standard Tools)

O Pegasus vem equipado com 13 ferramentas profissionais prontas para uso:
*   **Sistema**: `bash`, `system_info`.
*   **Arquivos**: `file_read`, `file_write`, `glob`, `grep`.
*   **Web**: `web_search` (DuckDuckGo), `web_fetch` (Markdown converter).
*   **Memória**: `memory_search`, `memory_save`.
*   **Autonomia**: `cron_create`, `cron_list`, `cron_delete`.

---

## 📘 Documentação

| Documento | O que cobre |
|---|---|
| [**Guia do Usuário**](./docs/USER_GUIDE.md) | 📋 TUDO: modelos, providers, memória, jailbreak, skills, MCP |
| [**Guia de Modelos**](./docs/MODELS_GUIDE.md) | 🤖 Catálogo completo com comandos |
| [**Arquitetura**](./docs/ARCHITECTURE.md) | 🧠 Como o cérebro funciona |
| [**Memória**](./docs/MEMORY_SYSTEM.md) | 💾 LanceDB, SQLite, embeddings |

---

## 🤝 Contribuição

Este é um projeto de alta performance. Siga os padrões de TypeScript strict e Conventional Commits.

---
*Construído com o máximo de engenharia para ser o agente definitivo.*
