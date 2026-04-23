#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# 🐴 PEGASUS — Instalador Inteligente
#
# NÃO instala nada automaticamente.
# Verifica tudo que precisa e diz EXATAMENTE o que digitar.
#
# Uso:
#   bash scripts/install.sh
# ═══════════════════════════════════════════════════════════

# ─── Cores ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

REPO_URL="https://github.com/faelsete/pegasus-agent.git"
INSTALL_DIR="$HOME/pegasus-agent"
NODE_MIN=20
ERRORS=0

echo -e "
${CYAN}${BOLD}
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║     🐴  P E G A S U S                ║
  ║     Autonomous AI Agent               ║
  ║                                       ║
  ║     Verificação de Requisitos         ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
${NC}"

# ═══════════════════════════════════════
# ETAPA 1: Verificar Requisitos
# ═══════════════════════════════════════

echo -e "${BOLD}═══ ETAPA 1: Verificando Requisitos ═══${NC}\n"

# 1.1 — Root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}  ✗ Não está rodando como root${NC}"
    echo -e "${YELLOW}    → Execute: ${BOLD}sudo bash scripts/install.sh${NC}"
    ERRORS=$((ERRORS + 1))
else
    echo -e "${GREEN}  ✓ Rodando como root${NC}"
fi

# 1.2 — OS
if command -v apt-get &>/dev/null; then
    echo -e "${GREEN}  ✓ Ubuntu/Debian detectado${NC}"
elif command -v yum &>/dev/null || command -v dnf &>/dev/null; then
    echo -e "${GREEN}  ✓ RHEL/CentOS/Fedora detectado${NC}"
else
    echo -e "${YELLOW}  ⚠ OS não reconhecido (pode funcionar, sem garantia)${NC}"
fi

# 1.3 — Git
if command -v git &>/dev/null; then
    echo -e "${GREEN}  ✓ git $(git --version | grep -oP '\d+\.\d+\.\d+')${NC}"
else
    echo -e "${RED}  ✗ git não encontrado${NC}"
    echo -e "${YELLOW}    → Execute: ${BOLD}sudo apt update && sudo apt install -y git${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 1.4 — Node.js
if command -v node &>/dev/null; then
    NODE_VER=$(node --version 2>/dev/null || echo "v0")
    NODE_MAJOR=$(echo "$NODE_VER" | grep -oP '(?<=v)\d+' || echo "0")
    if [ "$NODE_MAJOR" -ge "$NODE_MIN" ]; then
        echo -e "${GREEN}  ✓ Node.js ${NODE_VER}${NC}"
    else
        echo -e "${RED}  ✗ Node.js ${NODE_VER} muito antigo (precisa v${NODE_MIN}+)${NC}"
        echo -e "${YELLOW}    → Execute:${NC}"
        echo -e "${BOLD}      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -${NC}"
        echo -e "${BOLD}      sudo apt install -y nodejs${NC}"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo -e "${RED}  ✗ Node.js não encontrado${NC}"
    echo -e "${YELLOW}    → Execute:${NC}"
    echo -e "${BOLD}      curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -${NC}"
    echo -e "${BOLD}      sudo apt install -y nodejs${NC}"
    echo -e "${YELLOW}    → Alternativa (fnm):${NC}"
    echo -e "${BOLD}      curl -fsSL https://fnm.vercel.app/install | bash${NC}"
    echo -e "${BOLD}      source ~/.bashrc && fnm install 22 && fnm use 22${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 1.5 — npm
if command -v npm &>/dev/null; then
    echo -e "${GREEN}  ✓ npm $(npm --version 2>/dev/null)${NC}"
else
    echo -e "${RED}  ✗ npm não encontrado (vem com Node.js)${NC}"
    echo -e "${YELLOW}    → Instale o Node.js primeiro (veja acima)${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 1.6 — Build tools (para better-sqlite3)
if command -v gcc &>/dev/null && command -v make &>/dev/null; then
    echo -e "${GREEN}  ✓ build-essential (gcc, make)${NC}"
else
    echo -e "${RED}  ✗ build-essential não encontrado (necessário para compilar SQLite)${NC}"
    echo -e "${YELLOW}    → Execute: ${BOLD}sudo apt install -y build-essential python3${NC}"
    ERRORS=$((ERRORS + 1))
fi

# 1.7 — python3
if command -v python3 &>/dev/null; then
    echo -e "${GREEN}  ✓ python3 $(python3 --version 2>/dev/null | grep -oP '\d+\.\d+')${NC}"
else
    echo -e "${RED}  ✗ python3 não encontrado (necessário para compilar módulos nativos)${NC}"
    echo -e "${YELLOW}    → Execute: ${BOLD}sudo apt install -y python3${NC}"
    ERRORS=$((ERRORS + 1))
fi

# ─── Parar se tiver erros ───
if [ "$ERRORS" -gt 0 ]; then
    echo -e "\n${RED}${BOLD}  ✗ ${ERRORS} requisito(s) faltando!${NC}"
    echo -e "${YELLOW}  Instale o que falta acima e rode novamente:${NC}"
    echo -e "${BOLD}    bash scripts/install.sh${NC}\n"
    exit 1
fi

echo -e "\n${GREEN}${BOLD}  ✓ Todos os requisitos OK!${NC}\n"

# ═══════════════════════════════════════
# ETAPA 2: Baixar/Atualizar código
# ═══════════════════════════════════════

echo -e "${BOLD}═══ ETAPA 2: Código ═══${NC}\n"

if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}  Instalação existente encontrada. Atualizando...${NC}"
    cd "$INSTALL_DIR"
    git stash 2>/dev/null || true
    git pull origin main
    echo -e "${GREEN}  ✓ Atualizado${NC}"
else
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}  Pasta existente sem git. Removendo...${NC}"
        rm -rf "$INSTALL_DIR"
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    echo -e "${GREEN}  ✓ Clonado em ${INSTALL_DIR}${NC}"
fi

# ═══════════════════════════════════════
# ETAPA 3: Dependências npm
# ═══════════════════════════════════════

echo -e "\n${BOLD}═══ ETAPA 3: Dependências ═══${NC}\n"

cd "$INSTALL_DIR"
echo -e "${YELLOW}  Instalando pacotes npm...${NC}"
npm install --no-audit --no-fund 2>&1 | tail -3

# Rebuild native modules
echo -e "${YELLOW}  Compilando módulos nativos (SQLite)...${NC}"
npm rebuild better-sqlite3 2>/dev/null || {
    echo -e "${RED}  ✗ Falha ao compilar better-sqlite3${NC}"
    echo -e "${YELLOW}    → Execute: ${BOLD}sudo apt install -y build-essential python3${NC}"
    echo -e "${YELLOW}    → Depois: ${BOLD}cd ~/pegasus-agent && npm rebuild better-sqlite3${NC}"
    exit 1
}

echo -e "${GREEN}  ✓ Dependências OK${NC}"

# ═══════════════════════════════════════
# ETAPA 4: Copiar templates
# ═══════════════════════════════════════

mkdir -p ~/.pegasus/data/vectors
mkdir -p ~/.pegasus/data/backups
mkdir -p ~/.pegasus/rules
cp -n templates/instructions.md ~/.pegasus/instructions.md 2>/dev/null || true
cp -n templates/persona.md ~/.pegasus/persona.md 2>/dev/null || true
cp -n templates/user.md ~/.pegasus/user.md 2>/dev/null || true

# ═══════════════════════════════════════
# ETAPA 5: Setup Wizard
# ═══════════════════════════════════════

echo -e "\n${BOLD}═══ ETAPA 5: Configuração ═══${NC}\n"

if [ -f "$HOME/.pegasus/config.json" ]; then
    echo -e "${YELLOW}  Configuração existente encontrada.${NC}"
    read -rp "  Quer reconfigurar? [s/N] " reconfig
    if [[ "$reconfig" == "s" || "$reconfig" == "S" ]]; then
        npx tsx scripts/setup-wizard.ts
    else
        echo -e "${GREEN}  ✓ Usando configuração existente${NC}"
    fi
else
    npx tsx scripts/setup-wizard.ts
fi

# ═══════════════════════════════════════
# ETAPA 6: Serviço systemd
# ═══════════════════════════════════════

echo -e "\n${BOLD}═══ ETAPA 6: Serviço 24/7 ═══${NC}\n"

NODE_PATH=$(which node)
NODE_VERSION=$(node --version)

cat > /etc/systemd/system/pegasus.service << EOF
[Unit]
Description=Pegasus Autonomous AI Agent
Documentation=https://github.com/faelsete/pegasus-agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=${INSTALL_DIR}
ExecStart=${NODE_PATH} --import tsx/esm src/index.ts
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5

Environment=NODE_ENV=production
Environment=HOME=${HOME}
Environment=PATH=$(dirname ${NODE_PATH}):/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

StandardOutput=journal
StandardError=journal
SyslogIdentifier=pegasus

PrivateTmp=true
TasksMax=256

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pegasus >/dev/null 2>&1
systemctl restart pegasus

sleep 3

# ═══════════════════════════════════════
# RESULTADO
# ═══════════════════════════════════════

echo -e "
${GREEN}${BOLD}
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║  ✅  PEGASUS INSTALADO COM SUCESSO!  ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
${NC}"

echo -e "  ${CYAN}Node:${NC}    ${NODE_PATH} (${NODE_VERSION})"
echo -e "  ${CYAN}Pasta:${NC}   ${INSTALL_DIR}"
echo -e "  ${CYAN}Config:${NC}  ~/.pegasus/config.json"
echo -e "  ${CYAN}Dados:${NC}   ~/.pegasus/data/"
echo -e "  ${CYAN}Serviço:${NC} systemd (pegasus.service)"
echo -e ""
echo -e "  ${BOLD}Comandos úteis:${NC}"
echo -e "  ┌──────────────────────────────────────────────────┐"
echo -e "  │ ${GREEN}systemctl status pegasus${NC}       → Ver status       │"
echo -e "  │ ${GREEN}systemctl restart pegasus${NC}      → Reiniciar        │"
echo -e "  │ ${GREEN}systemctl stop pegasus${NC}         → Parar            │"
echo -e "  │ ${GREEN}journalctl -u pegasus -f${NC}       → Ver logs ao vivo │"
echo -e "  │ ${GREEN}cd ~/pegasus-agent && npm run setup${NC}  → Reconfig  │"
echo -e "  │ ${GREEN}cd ~/pegasus-agent && npm run model${NC} → Trocar IA  │"
echo -e "  └──────────────────────────────────────────────────┘"
echo -e ""

systemctl status pegasus --no-pager 2>/dev/null || true

echo -e "\n${GREEN}🐴 Pegasus está rodando! Manda uma mensagem no Telegram.${NC}\n"
