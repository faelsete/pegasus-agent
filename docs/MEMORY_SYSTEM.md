# 💾 Sistema de Memória do Pegasus

O Pegasus utiliza uma arquitetura de memória em três níveis para garantir que "ele nunca esqueça o que é importante".

## 1. Memória de Curto Prazo (Conversational Context)
Armazenada no histórico da sessão (RAM + SQLite). Contém as últimas 20-40 mensagens da conversa atual para manter o fluxo imediato.

## 2. Memória Semântica (LanceDB)
O coração da busca por "sentido". 
*   **Tecnologia**: LanceDB (Serverless Vector DB).
*   **Embeddings**: Utiliza modelos de alta dimensionalidade (1536d) via OpenAI ou NVIDIA.
*   **Funcionalidade**: Quando você diz " Lembra daquele projeto que falamos mês passado?", o sistema converte sua frase em um vetor e encontra o projeto por similaridade matemática, mesmo que você não use as palavras exatas.

## 3. Grafo de Conhecimento (SQLite Knowledge Graph)
Enquanto os vetores lidam com "sentido", o Grafo lida com "fatos estruturados".
*   **Entidades**: Pessoas, Lugares, Projetos, Tecnologias.
*   **Relações**: "Pessoa A trabalha no Projeto B", "Tecnologia C é dependência de D".
*   **Vantagem**: Permite ao Pegasus entender hierarquias e conexões complexas que a busca vetorial pode perder.

---

## O Ciclo do Sonho (Memory Consolidation)

Periodicamente, o Pegasus entra em um estado de **Dreaming**. Durante este ciclo:

1.  **Deduplicação**: Memórias idênticas ou muito similares são fundidas para economizar espaço e reduzir ruído.
2.  **Geração de Insights**: O LLM analisa memórias isoladas e tenta criar conexões (ex: "Percebi que você sempre pergunta sobre Docker nas sextas-feiras, quer que eu prepare o ambiente antes?").
3.  **Decaimento de Relevância**: Informações triviais perdem importância ao longo do tempo, enquanto fatos reforçados ganham prioridade na busca.

---

## Como configurar os Embeddings

No arquivo `config.json` (via Wizard):
```json
"memory": {
  "embeddingProvider": "nvidia",
  "embeddingModel": "nvidia/nv-embedqa-e5-v5",
  "consolidationThreshold": 0.92
}
```
*Um threshold de 0.92 garante que apenas memórias extremamente similares sejam fundidas.*

---
> [!IMPORTANT]
> A memória do Pegasus é local. Seus dados nunca saem do seu servidor para treinamento de modelos de terceiros, garantindo privacidade total.
