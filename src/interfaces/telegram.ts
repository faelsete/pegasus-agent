import { Bot, Context, session, GrammyError, HttpError, type SessionFlavor } from 'grammy';
import crypto from 'node:crypto';
import { reason } from '../brain/cortex.js';
import { searchRelevantContext } from '../memory/search.js';
import { addMemory, getMemoryCount } from '../memory/store.js';
import { getLogger } from '../utils/logger.js';
import { estimateTokens } from '../utils/tokens.js';
import { getHistoryBudget } from '../brain/context.js';
import { updateProviderModel, toggleThinking, reloadConfig, getConfig } from '../config/loader.js';
import { clearInstructionCache } from '../memory/instructions.js';
import { clearContextCache } from '../brain/context.js';
import type { PegasusConfig } from '../config/schema.js';
import type { CoreMessage } from 'ai';
import { getDb } from '../db/sqlite.js';

// ═══════════════════════════════════════════
// 🐴 Telegram Bot (grammY)
// Persistent session per chat — survives restarts
// ═══════════════════════════════════════════

const logger = getLogger('telegram');

interface SessionData {
  conversationId: string;
  messageCount: number;
  lastActivity: number;
}

type PegasusContext = Context & SessionFlavor<SessionData>;

// Rate limiter state
const rateLimiter = new Map<number, number[]>();
const processingLock = new Map<number, boolean>(); // 1 message at a time per chat
const lastMessageTime = new Map<number, number>(); // cooldown tracking
const MESSAGE_COOLDOWN_MS = 3_000; // 3s min between processing messages

function checkRateLimit(chatId: number, maxPerMinute: number): boolean {
  const now = Date.now();
  const timestamps = rateLimiter.get(chatId) ?? [];
  const recent = timestamps.filter(t => now - t < 60_000);
  if (recent.length >= maxPerMinute) return false;
  recent.push(now);
  rateLimiter.set(chatId, recent);
  return true;
}

/**
 * Get or create a PERSISTENT conversation ID for a chat.
 * This ensures the same chatId always maps to the same conversation,
 * even across bot restarts.
 */
function getOrCreateConversationId(chatId: number): string {
  const db = getDb();

  // Check if we have an active conversation for this chat
  const existing = db.prepare(
    'SELECT id FROM conversations WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1'
  ).get(String(chatId)) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  // Create new conversation
  const id = `tg-${chatId}-${Date.now()}`;
  db.prepare('INSERT INTO conversations (id, user_id) VALUES (?, ?)')
    .run(id, String(chatId));
  return id;
}

/**
 * Build conversation history with budget awareness.
 * Most recent messages get full content. Older messages get summarized.
 * Total token count is capped to stay within model limits.
 */
function getHistory(conversationId: string, tokenBudget: number): CoreMessage[] {
  const db = getDb();
  // Get last 20 messages (we'll trim by budget)
  const rows = db.prepare(
    'SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 20'
  ).all(conversationId) as Array<{ role: string; content: string }>;

  const reversed = rows.reverse();
  const result: CoreMessage[] = [];
  let usedTokens = 0;

  // Process from NEWEST to OLDEST, filling budget
  for (let i = reversed.length - 1; i >= 0; i--) {
    const row = reversed[i]!;
    let content = row.content;

    // Recent messages (last 4): full content (up to 1500 chars)
    const recency = reversed.length - 1 - i;
    if (recency < 4) {
      content = content.length > 1500 ? content.slice(0, 1500) + '...' : content;
    }
    // Older messages: aggressive compression (300 chars)
    else {
      content = content.length > 300 ? content.slice(0, 300) + '...' : content;
    }

    const msgTokens = estimateTokens(content);

    // Stop if we'd exceed budget
    if (usedTokens + msgTokens > tokenBudget) {
      logger.debug({ dropped: i + 1, budget: tokenBudget, used: usedTokens }, 'history trimmed by budget');
      break;
    }

    result.unshift({ role: row.role as 'user' | 'assistant', content });
    usedTokens += msgTokens;
  }

  logger.debug({ messages: result.length, tokens: usedTokens, budget: tokenBudget }, 'history built');
  return result;
}

/** Save message to SQLite */
function saveMessage(conversationId: string, role: string, content: string, thinking?: string, toolsUsed?: string[]): void {
  const db = getDb();
  const id = crypto.randomUUID();

  // Ensure conversation exists
  db.prepare('INSERT OR IGNORE INTO conversations (id, user_id) VALUES (?, ?)')
    .run(conversationId, 'telegram');

  db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, thinking, tools_used) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, conversationId, role, content, thinking ?? null, toolsUsed?.join(',') ?? null);

  db.prepare('UPDATE conversations SET message_count = message_count + 1, updated_at = ? WHERE id = ?')
    .run(Date.now(), conversationId);
}

export function createBot(config: PegasusConfig): Bot<PegasusContext> {
  const bot = new Bot<PegasusContext>(config.telegram.token);

  // ═══ Middleware ═══

  // Session (persistent via SQLite-backed conversationId)
  bot.use(session({
    initial: (): SessionData => ({
      conversationId: '', // Will be set in auth middleware
      messageCount: 0,
      lastActivity: Date.now(),
    }),
  }));

  // Auth: whitelist + persistent session init
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id ?? 0;
    if (!config.telegram.allowedChatIds.includes(chatId)) {
      logger.warn({ chatId }, 'unauthorized access attempt');
      return;
    }

    // Initialize persistent conversation if not set
    if (!ctx.session.conversationId) {
      ctx.session.conversationId = getOrCreateConversationId(chatId);
      logger.info({ chatId, conversationId: ctx.session.conversationId }, 'session restored');
    }

    await next();
  });

  // Rate limiting
  bot.use(async (ctx, next) => {
    const chatId = ctx.chat?.id ?? 0;
    if (!checkRateLimit(chatId, config.telegram.rateLimitPerMinute)) {
      await ctx.reply('⚠️ Rate limit atingido. Aguarde um momento.');
      return;
    }
    await next();
  });

  // ═══ Commands ═══

  bot.command('start', (ctx) => ctx.reply('🐴 Pegasus ativo e pronto!'));

  bot.command('help', (ctx) => ctx.reply(
    `🐴 *Pegasus — Comandos*\n\n` +
    `/status — Status do sistema\n` +
    `/search <query> — Busca na memória\n` +
    `/remember <fato> — Salva memória\n` +
    `/new — Nova conversa (mantém memórias)\n` +
    `/model — Modelo atual\n` +
    `/setmodel <modelo> — Troca o modelo\n` +
    `/think on|off — Liga/desliga thinking\n` +
    `/restart — Reinicia o Pegasus\n` +
    `/doctor — Diagnóstico\n` +
    `/help — Este menu`,
    { parse_mode: 'Markdown' }
  ));

  bot.command('status', async (ctx) => {
    const currentConfig = getConfig();
    const memCount = await getMemoryCount();
    const uptime = process.uptime();
    const h = Math.floor(uptime / 3600);
    const m = Math.floor((uptime % 3600) / 60);
    const provider = currentConfig.providers.find(p => p.enabled);
    await ctx.reply(
      `🐴 *Pegasus Status*\n\n` +
      `💾 Memórias: ${memCount}\n` +
      `⏱️ Uptime: ${h}h ${m}m\n` +
      `🧠 Modelo: ${provider?.type}/${provider?.defaultModel ?? 'default'}\n` +
      `🧠 Providers: ${currentConfig.providers.filter(p => p.enabled).length}\n` +
      `💭 Thinking: ${currentConfig.thinkingEnabled ? 'ON' : 'OFF'}\n` +
      `💬 Conversa: ${ctx.session.conversationId.slice(0, 12)}...\n` +
      `💬 Msgs nesta sessão: ${ctx.session.messageCount}`,
      { parse_mode: 'Markdown' }
    );
  });

  bot.command('search', async (ctx) => {
    const query = ctx.message?.text?.replace(/^\/search\s*/, '').trim();
    if (!query) {
      await ctx.reply('Uso: /search <query>');
      return;
    }
    const results = await searchRelevantContext(query);
    if (results.length === 0) {
      await ctx.reply('🔍 Nenhuma memória encontrada.');
      return;
    }
    const text = results.slice(0, 5).map((r, i) =>
      `${i + 1}. [${r.type}] ${r.text.slice(0, 150)}${r.text.length > 150 ? '...' : ''}`
    ).join('\n\n');
    await ctx.reply(`🔍 *Memórias encontradas:*\n\n${text}`, { parse_mode: 'Markdown' });
  });

  bot.command('remember', async (ctx) => {
    const fact = ctx.message?.text?.replace(/^\/remember\s*/, '').trim();
    if (!fact) {
      await ctx.reply('Uso: /remember <fato para salvar>');
      return;
    }
    await addMemory(fact, 'fact', { source: 'manual', importance: 0.9 });
    await ctx.reply(`✅ Memória salva: "${fact.slice(0, 100)}"`);
  });

  bot.command('new', async (ctx) => {
    const chatId = ctx.chat?.id ?? 0;
    const newId = `tg-${chatId}-${Date.now()}`;
    const db = getDb();
    db.prepare('INSERT INTO conversations (id, user_id) VALUES (?, ?)')
      .run(newId, String(chatId));
    ctx.session.conversationId = newId;
    ctx.session.messageCount = 0;
    await ctx.reply('🔄 Nova conversa iniciada. Memórias permanentes preservadas.');
  });

  bot.command('model', (ctx) => {
    const currentConfig = getConfig();
    const provider = currentConfig.providers.find(p => p.enabled);
    ctx.reply(`🤖 Modelo atual: ${provider?.type}/${provider?.defaultModel ?? 'default'}`);
  });

  // ═══ NEW: /setmodel — Change model at runtime ═══
  bot.command('setmodel', async (ctx) => {
    const newModel = ctx.message?.text?.replace(/^\/setmodel\s*/, '').trim();
    if (!newModel) {
      const currentConfig = getConfig();
      const provider = currentConfig.providers.find(p => p.enabled);
      await ctx.reply(
        `🤖 *Trocar Modelo*\n\n` +
        `Atual: \`${provider?.type}/${provider?.defaultModel}\`\n\n` +
        `Uso: /setmodel <nome-do-modelo>\n\n` +
        `Exemplos:\n` +
        `\`/setmodel qwen/qwen3.5-122b-a10b\`\n` +
        `\`/setmodel qwen/qwen3.5-397b-a17b\`\n` +
        `\`/setmodel openai/gpt-oss-120b\`\n` +
        `\`/setmodel moonshotai/kimi-k2-thinking\``,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    try {
      const currentConfig = getConfig();
      const provider = currentConfig.providers.find(p => p.enabled);
      if (!provider) {
        await ctx.reply('⚠️ Nenhum provider ativo encontrado.');
        return;
      }
      const oldModel = provider.defaultModel;
      updateProviderModel(provider.type, newModel);
      clearContextCache(); // Reload context on next message
      await ctx.reply(
        `✅ Modelo trocado!\n\n` +
        `De: \`${oldModel}\`\n` +
        `Para: \`${newModel}\`\n\n` +
        `Próxima mensagem usará o novo modelo.`,
        { parse_mode: 'Markdown' }
      );
      logger.info({ from: oldModel, to: newModel }, 'model changed via Telegram');
    } catch (err) {
      await ctx.reply(`⚠️ Erro ao trocar modelo: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  // ═══ NEW: /think — Toggle thinking on/off ═══
  bot.command('think', async (ctx) => {
    const arg = ctx.message?.text?.replace(/^\/think\s*/, '').trim().toLowerCase();

    if (arg !== 'on' && arg !== 'off') {
      const currentConfig = getConfig();
      await ctx.reply(
        `💭 *Thinking Mode*\n\n` +
        `Status atual: ${currentConfig.thinkingEnabled ? '✅ ON' : '❌ OFF'}\n\n` +
        `Uso:\n` +
        `/think on — Ativa raciocínio interno\n` +
        `/think off — Desativa (economiza tokens)`,
        { parse_mode: 'Markdown' }
      );
      return;
    }

    const enabled = arg === 'on';
    toggleThinking(enabled);
    clearContextCache();
    await ctx.reply(`💭 Thinking ${enabled ? 'ATIVADO ✅' : 'DESATIVADO ❌'}`);
    logger.info({ thinking: enabled }, 'thinking toggled via Telegram');
  });

  // ═══ NEW: /restart — Restart Pegasus (systemd re-spawns) ═══
  bot.command('restart', async (ctx) => {
    await ctx.reply('🔄 Reiniciando Pegasus em 3 segundos...');
    logger.info('restart requested via Telegram');

    // Clear caches before exit
    clearInstructionCache();
    clearContextCache();

    // Give Telegram time to deliver the message
    setTimeout(() => {
      process.exit(0); // systemd Restart=always will re-spawn
    }, 3000);
  });

  // ═══ Message Handlers ═══

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return; // skip unknown commands
    const chatId = ctx.chat?.id ?? 0;

    // ─── Anti-strike: reject if already processing another message ───
    if (processingLock.get(chatId)) {
      logger.debug({ chatId }, 'message dropped — still processing previous');
      await ctx.reply('⏳ Ainda processando a mensagem anterior, aguarde...');
      return;
    }

    // ─── Anti-strike: enforce cooldown between messages ───
    const lastTime = lastMessageTime.get(chatId) ?? 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < MESSAGE_COOLDOWN_MS) {
      const waitSec = Math.ceil((MESSAGE_COOLDOWN_MS - elapsed) / 1000);
      await ctx.reply(`⏳ Aguarde ${waitSec}s entre mensagens.`);
      return;
    }

    // Lock this chat
    processingLock.set(chatId, true);
    lastMessageTime.set(chatId, Date.now());

    await ctx.replyWithChatAction('typing');
    ctx.session.messageCount++;
    ctx.session.lastActivity = Date.now();

    // Save user message
    saveMessage(ctx.session.conversationId, 'user', ctx.message.text);

    // Keep typing indicator alive during processing
    const typingInterval = setInterval(() => {
      ctx.replyWithChatAction('typing').catch(() => {});
    }, 4000);

    try {
      // Budget-aware history: uses getHistoryBudget to determine how many tokens for history
      const historyBudget = getHistoryBudget(800); // estimate ~800 for system prompt
      const history = getHistory(ctx.session.conversationId, historyBudget);
      const result = await reason({
        userMessage: ctx.message.text,
        conversationHistory: history,
        userId: String(ctx.from.id),
        conversationId: ctx.session.conversationId,
      });

      // Guard against empty responses
      const responseText = result.response?.trim();
      if (!responseText) {
        logger.warn('AI returned empty response, sending fallback');
        await ctx.reply('🤔 Não consegui gerar uma resposta. Tente reformular.');
        return;
      }

      // Save assistant response
      saveMessage(ctx.session.conversationId, 'assistant', responseText, result.thinking, result.toolsUsed);

      // Split long messages (Telegram limit: 4096)
      const chunks = splitMessage(responseText, 4000);
      for (const chunk of chunks) {
        await ctx.reply(chunk, { parse_mode: 'Markdown' }).catch(() =>
          ctx.reply(chunk) // retry without markdown if it fails
        );
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error({ error: errMsg }, 'reasoning failed');
      if (errMsg.includes('All providers failed')) {
        await ctx.reply('⚠️ Todos os provedores de IA falharam. Tentando de novo em breve...');
      } else {
        await ctx.reply('⚠️ Erro ao processar mensagem. Tente novamente.');
      }
    } finally {
      clearInterval(typingInterval);
      processingLock.set(chatId, false); // Release lock
    }
  });

  // ═══ Error Handler ═══

  bot.catch((err) => {
    const e = err.error;
    if (e instanceof GrammyError) {
      // Handle 409 Conflict (another instance using same token)
      if (e.error_code === 409) {
        logger.error('CONFLICT: Another bot instance is running with the same token! This instance will keep retrying.');
      } else {
        logger.error({ desc: e.description, code: e.error_code }, 'Telegram API error');
      }
    } else if (e instanceof HttpError) {
      logger.error({ err: String(e) }, 'Network error');
    } else {
      logger.error({ err: e instanceof Error ? e.message : String(e) }, 'Unknown error');
    }
  });

  return bot;
}

function splitMessage(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.5) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  return chunks;
}
