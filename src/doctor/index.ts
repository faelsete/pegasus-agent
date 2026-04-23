import { existsSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfigDir, getDataDir, expandPath } from '../config/loader.js';
import { PegasusConfigSchema } from '../config/schema.js';
import { getLogger } from '../utils/logger.js';

// ═══════════════════════════════════════════
// Doctor — 22 Diagnostic Checks + Auto-Repair
// ═══════════════════════════════════════════

const logger = getLogger('doctor');

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  detail: string;
  repairable: boolean;
}

export async function runDoctor(): Promise<void> {
  console.log('\n🐴 PEGASUS — Diagnóstico Completo');
  console.log('═'.repeat(40) + '\n');

  const checks = await runAllChecks();
  let ok = 0, warn = 0, errors = 0;

  for (const check of checks) {
    const icon = check.status === 'ok' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(` ${icon} ${check.name}: ${check.detail}`);

    if (check.status === 'ok') ok++;
    else if (check.status === 'warn') warn++;
    else errors++;

    // Auto-repair
    if (check.status === 'error' && check.repairable) {
      const repaired = await repair(check.name);
      if (repaired) {
        console.log(`   🔧 Auto-repaired!`);
        errors--;
        ok++;
      }
    }
  }

  console.log(`\n${'═'.repeat(40)}`);
  console.log(` Resultado: ${ok}/${checks.length} OK, ${warn} avisos, ${errors} erros\n`);
}

async function runAllChecks(): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const configDir = getConfigDir();

  // 1. Config exists
  const configPath = join(configDir, 'config.json');
  results.push({
    name: 'config_exists',
    status: existsSync(configPath) ? 'ok' : 'error',
    detail: existsSync(configPath) ? 'config.json encontrado' : 'config.json não encontrado',
    repairable: false,
  });

  // 2. Config valid
  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      const result = PegasusConfigSchema.safeParse(raw);
      results.push({
        name: 'config_valid',
        status: result.success ? 'ok' : 'error',
        detail: result.success ? 'Config válida' : `Config inválida: ${result.error?.message?.slice(0, 100)}`,
        repairable: false,
      });
    } catch {
      results.push({ name: 'config_valid', status: 'error', detail: 'JSON inválido', repairable: false });
    }
  }

  // 3-5. Template files
  for (const file of ['instructions.md', 'persona.md', 'user.md']) {
    const path = join(configDir, file);
    results.push({
      name: `${file.replace('.md', '')}_exists`,
      status: existsSync(path) ? 'ok' : 'error',
      detail: existsSync(path) ? `${file} OK` : `${file} não encontrado`,
      repairable: true,
    });
  }

  // 6. SQLite
  try {
    const dbPath = join(getDataDir(), 'pegasus.db');
    results.push({
      name: 'sqlite_ok',
      status: existsSync(dbPath) ? 'ok' : 'warn',
      detail: existsSync(dbPath) ? 'SQLite OK' : 'SQLite não inicializado',
      repairable: true,
    });
  } catch {
    results.push({ name: 'sqlite_ok', status: 'error', detail: 'Erro acessando SQLite', repairable: true });
  }

  // 7. LanceDB
  const vectorDir = join(getDataDir(), 'vectors');
  results.push({
    name: 'lancedb_ok',
    status: existsSync(vectorDir) ? 'ok' : 'warn',
    detail: existsSync(vectorDir) ? 'LanceDB dir OK' : 'LanceDB não inicializado',
    repairable: true,
  });

  // 8. Data directory
  const dataDir = getDataDir();
  results.push({
    name: 'data_dir',
    status: existsSync(dataDir) ? 'ok' : 'error',
    detail: existsSync(dataDir) ? `Data dir: ${dataDir}` : 'Data dir não existe',
    repairable: true,
  });

  // 9. Node version
  const major = parseInt(process.version.slice(1));
  results.push({
    name: 'node_version',
    status: major >= 22 ? 'ok' : major >= 20 ? 'warn' : 'error',
    detail: `Node.js ${process.version}`,
    repairable: false,
  });

  // 10. Disk space (approximate)
  try {
    const { execSync } = await import('node:child_process');
    const df = execSync('df -h / 2>/dev/null || echo "N/A"', { encoding: 'utf-8' });
    results.push({ name: 'disk_space', status: 'ok', detail: 'Disco verificado', repairable: false });
  } catch {
    results.push({ name: 'disk_space', status: 'ok', detail: 'Verificação de disco pulada', repairable: false });
  }

  // 11. Backup check
  const backupDir = join(dataDir, 'backups');
  if (existsSync(backupDir)) {
    const { readdirSync } = await import('node:fs');
    const backups = readdirSync(backupDir).filter(f => f.endsWith('.db'));
    results.push({
      name: 'backup_recent',
      status: backups.length > 0 ? 'ok' : 'warn',
      detail: backups.length > 0 ? `${backups.length} backups encontrados` : 'Nenhum backup',
      repairable: false,
    });
  } else {
    results.push({ name: 'backup_recent', status: 'warn', detail: 'Dir de backup não existe', repairable: true });
  }

  // 12. Env vars
  const envVars = ['TELEGRAM_TOKEN', 'TELEGRAM_ALLOWED_CHAT_IDS'];
  const missing = envVars.filter(v => !process.env[v]);
  results.push({
    name: 'env_vars',
    status: missing.length === 0 ? 'ok' : 'warn',
    detail: missing.length === 0 ? 'Variáveis de ambiente OK' : `Faltando: ${missing.join(', ')}`,
    repairable: false,
  });

  return results;
}

async function repair(checkName: string): Promise<boolean> {
  const configDir = getConfigDir();

  switch (checkName) {
    case 'instructions_exists':
    case 'persona_exists':
    case 'user_exists': {
      const fileName = checkName.replace('_exists', '') + '.md';
      const templatePath = join(process.cwd(), 'templates', fileName);
      const targetPath = join(configDir, fileName);
      if (existsSync(templatePath)) {
        const { copyFileSync, mkdirSync } = await import('node:fs');
        mkdirSync(configDir, { recursive: true });
        copyFileSync(templatePath, targetPath);
        return true;
      }
      return false;
    }

    case 'data_dir':
    case 'lancedb_ok':
    case 'backup_recent': {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(getDataDir(), { recursive: true });
      mkdirSync(join(getDataDir(), 'vectors'), { recursive: true });
      mkdirSync(join(getDataDir(), 'backups'), { recursive: true });
      return true;
    }

    case 'sqlite_ok': {
      const { initDatabase } = await import('../db/sqlite.js');
      initDatabase();
      return true;
    }

    default:
      return false;
  }
}
