# 🧰 Ferramentas e Sub-Agentes

O Pegasus estende sua capacidade através de um sistema de ferramentas (Tools) robusto e a capacidade de delegar tarefas.

## 1. Catálogo de Ferramentas Nativas

### 💻 Execução e Sistema
*   **`bash`**: Executa comandos shell. Possui timeout de segurança e captura stdout/stderr.
*   **`system_info`**: Retorna telemetria do host (CPU, RAM, Disco, Uptime).

### 📂 Manipulação de Arquivos
*   **`file_read` / `file_write`**: Leitura e escrita de arquivos com suporte a criação automática de diretórios.
*   **`glob` / `grep`**: Busca poderosa de arquivos por padrão ou conteúdo de texto.

### 🌐 Conectividade Web
*   **`web_search`**: Utiliza DuckDuckGo para encontrar informações atualizadas em tempo real.
*   **`web_fetch`**: Extrai o conteúdo de texto limpo de qualquer URL, removendo scripts e propagandas.

### 💾 Gestão de Memória
*   **`memory_search`**: Permite ao agente forçar uma busca profunda por um tópico específico.
*   **`memory_save`**: Permite salvar fatos manualmente durante a conversa.

---

## 2. Autonomia: O Sistema Cron

O Pegasus pode agendar seu próprio trabalho através das ferramentas de Cron:
*   **`cron_create`**: Define uma expressão cron (ex: `0 9 * * *`) e uma tarefa.
*   **`cron_list`**: Mostra todos os compromissos agendados.

**Exemplo de uso**: "Pegasus, crie uma tarefa para checar se o meu site está online todo dia às 8 da manhã e me avise no Telegram".

---

## 3. Sub-Agentes (Workers)

Embora o Pegasus seja um "Cérebro Único", ele pode instanciar sub-processos para tarefas pesadas:
1. O Cortex decide que uma tarefa (ex: "Analise estes 50 arquivos de log") é muito grande para a janela de contexto principal.
2. Ele utiliza a ferramenta `bash` para disparar um script auxiliar ou uma nova instância do Pegasus em modo CLI.
3. O resultado é consolidado e trazido de volta para a conversa principal.

---
> [!TIP]
> Você pode adicionar novas ferramentas criando um arquivo em `src/tools/` e registrando-o em `registry.ts`. O Pegasus as reconhecerá automaticamente no próximo boot.
