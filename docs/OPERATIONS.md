# 🛠️ Guia de Operações e Manutenção

Este guia é destinado ao administrador do sistema Pegasus para garantir a saúde do agente a longo prazo.

## 1. O Sistema Doctor

O Pegasus inclui um módulo de diagnóstico avançado que pode ser chamado a qualquer momento:

```bash
npm run doctor
```

### O que o Doctor verifica:
*   **Integridade do Config**: Valida o `config.json` contra o Schema Zod.
*   **Conectividade de Provedores**: Testa se as chaves de API estão ativas.
*   **Saúde do Banco de Dados**: Verifica corrupção no SQLite e LanceDB.
*   **Templates Faltantes**: Checa se `persona.md` ou `instructions.md` foram apagados.
*   **Recursos do Sistema**: Espaço em disco e versão do Node.js.

**Auto-Reparo**: Se o Doctor encontrar um arquivo de template faltando ou uma tabela de banco de dados não inicializada, ele irá recriá-los automaticamente a partir dos backups e templates originais.

---

## 2. Gerenciamento de Processos (24/7)

Para rodar o Pegasus em produção no Linux, recomendamos o uso do **PM2**:

```bash
# Instalar PM2
npm install -g pm2

# Iniciar o Pegasus
pm2 start dist/index.js --name "pegasus" -- telegram

# Monitorar
pm2 logs pegasus
pm2 monit
```

---

## 3. Backups e Recuperação

O Pegasus realiza backups automáticos diários às **03:00 AM**.
*   Os backups são armazenados em `~/.pegasus/data/backups/`.
*   Cada backup contém um snapshot completo do banco de dados relacional.

**Para restaurar:**
1. Pare o agente.
2. Copie o arquivo `.db` do backup para `~/.pegasus/data/pegasus.db`.
3. Inicie o agente.

---

## 4. Atualização do Agente

Como o Pegasus é modular, a atualização é simples:
1. Faça o pull do novo código: `git pull origin main`.
2. Recompile: `npm run build`.
3. Rode o Doctor para garantir que as novas configurações (se houver) foram aplicadas.

---
> [!WARNING]
> Nunca edite o arquivo `pegasus.db` manualmente enquanto o agente estiver rodando. Isso pode causar corrupção de dados devido ao modo WAL (Write-Ahead Logging).
