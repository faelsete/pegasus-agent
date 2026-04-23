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

## 🛠️ Instalação e Setup

O Pegasus foi otimizado para ambientes **Linux/WSL**.

### 1. Clonagem e Dependências
```bash
git clone https://github.com/faelsete/pegasus-agent.git
cd pegasus-agent
npm install
```

### 2. Instalação Automatizada
Recomendamos usar o script oficial que configura permissões e diretórios:
```bash
chmod +x scripts/install.sh
./scripts/install.sh
```

### 3. Configuração (Wizard)
O Pegasus possui um Onboarding interativo completo:
```bash
npm run setup
```
*O Wizard irá configurar seus provedores (NVIDIA, OpenRouter, Gemini, etc.), token do Telegram e preferências de personalidade.*

---

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

## 📘 Documentação Detalhada

Explore os manuais completos para dominar o Pegasus:

1.  [**Arquitetura do Cérebro**](./docs/ARCHITECTURE.md) - Como o raciocínio funciona.
2.  [**Sistema de Memória**](./docs/MEMORY_SYSTEM.md) - LanceDB, SQLite e Embeddings.
3.  **Ferramentas e Sub-Agentes** (Em breve)
4.  **Guia de Operações e Doctor** (Em breve)

---

## 🤝 Contribuição

Este é um projeto de alta performance. Siga os padrões de TypeScript strict e Conventional Commits.

---
*Construído com o máximo de engenharia para ser o agente definitivo.*
