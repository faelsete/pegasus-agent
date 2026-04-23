#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# 🐴 PEGASUS — Instalador Automático Completo
#
# UM COMANDO e pronto:
# curl -fsSL https://raw.githubusercontent.com/faelsete/pegasus-agent/main/scripts/install.sh | bash
#
# O que ele faz:
# 1. Instala Node.js 22 (se não tiver)
# 2. Clona o repositório
# 3. Instala dependências
# 4. Roda o wizard interativo (pede suas chaves)
# 5. Instala como serviço systemd (roda 24/7)
# 6. Inicia o bot
#
# Requisitos: Ubuntu/Debian com acesso root
# ═══════════════════════════════════════════════════════════

set -e

# ─── Cores ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Config ───
REPO_URL="https://github.com/faelsete/pegasus-agent.git"
INSTALL_DIR="$HOME/pegasus-agent"
NODE_MAJOR=22

echo -e "
${CYAN}${BOLD}
  ╔═══════════════════════════════════════╗
  ║                                       ║
  ║     🐴  P E G A S U S                ║
  ║     Autonomous AI Agent               ║
  ║                                       ║
  ║     Instalador Automático             ║
  ║                                       ║
  ╚═══════════════════════════════════════╝
${NC}"

# ─── Verificações ───

echo -e "${YELLOW}[1/6]${NC} Verificando sistema..."

# Check root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}✗ Execute como root:${NC}"
    echo -e "  ${BOLD}sudo bash install.sh${NC}"
    echo -e "  ou"
    echo -e "  ${BOLD}curl -fsSL https://raw.githubusercontent.com/faelsete/pegasus-agent/main/scripts/install.sh | sudo bash${NC}"
    exit 1
fi

# Check OS
if ! command -v apt-get &>/dev/null; then
    echo -e "${RED}✗ Este instalador suporta apenas Ubuntu/Debian${NC}"
    exit 1
fi

echo -e "${GREEN}  ✓ Ubuntu/Debian detectado${NC}"
echo -e "${GREEN}  ✓ Rodando como root${NC}"

# ─── Node.js ───

echo -e "\n${YELLOW}[2/6]${NC} Instalando Node.js ${NODE_MAJOR}..."

if command -v node &>/dev/null; then
    CURRENT_NODE=$(node --version 2>/dev/null || echo "none")
    CURRENT_MAJOR=$(echo "$CURRENT_NODE" | grep -oP '(?<=v)\d+' || echo "0")
    if [ "$CURRENT_MAJOR" -ge "$NODE_MAJOR" ]; then
        echo -e "${GREEN}  ✓ Node.js já instalado: ${CURRENT_NODE}${NC}"
    else
        echo -e "${YELLOW}  ⚠ Node.js ${CURRENT_NODE} é antigo, atualizando...${NC}"
        apt-get update -qq
        apt-get install -y -qq ca-certificates curl gnupg >/dev/null 2>&1
        mkdir -p /etc/apt/keyrings
        curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
        echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
        apt-get update -qq
        apt-get install -y -qq nodejs >/dev/null 2>&1
        echo -e "${GREEN}  ✓ Node.js $(node --version) instalado${NC}"
    fi
else
    echo -e "${YELLOW}  Instalando Node.js ${NODE_MAJOR}...${NC}"
    apt-get update -qq
    apt-get install -y -qq ca-certificates curl gnupg build-essential python3 >/dev/null 2>&1
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg 2>/dev/null
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y -qq nodejs >/dev/null 2>&1
    echo -e "${GREEN}  ✓ Node.js $(node --version) instalado${NC}"
fi

# Ensure build tools for native modules
apt-get install -y -qq build-essential python3 >/dev/null 2>&1 || true

# ─── Clone/Update repo ───

echo -e "\n${YELLOW}[3/6]${NC} Baixando Pegasus..."

if [ -d "$INSTALL_DIR/.git" ]; then
    echo -e "${YELLOW}  Atualizando instalação existente...${NC}"
    cd "$INSTALL_DIR"
    git stash 2>/dev/null || true
    git pull origin main
    echo -e "${GREEN}  ✓ Atualizado${NC}"
else
    if [ -d "$INSTALL_DIR" ]; then
        rm -rf "$INSTALL_DIR"
    fi
    git clone "$REPO_URL" "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    echo -e "${GREEN}  ✓ Clonado em ${INSTALL_DIR}${NC}"
fi

# ─── Dependências ───

echo -e "\n${YELLOW}[4/6]${NC} Instalando dependências..."

cd "$INSTALL_DIR"
npm install --no-audit --no-fund 2>&1 | tail -1
npm rebuild better-sqlite3 2>/dev/null || true

echo -e "${GREEN}  ✓ Dependências instaladas${NC}"

# ─── Copiar templates ───

mkdir -p ~/.pegasus/data
cp -n templates/instructions.md ~/.pegasus/instructions.md 2>/dev/null || true
cp -n templates/persona.md ~/.pegasus/persona.md 2>/dev/null || true

# ─── Setup Wizard ───

echo -e "\n${YELLOW}[5/6]${NC} Configuração interativa..."
echo -e "${CYAN}  Agora você vai configurar suas chaves de API e o bot do Telegram.${NC}"
echo -e "${CYAN}  Siga as instruções na tela.${NC}\n"

# Check if config already exists
if [ -f "$HOME/.pegasus/config.json" ]; then
    echo -e "${YELLOW}  Configuração existente encontrada.${NC}"
    echo -e "${YELLOW}  Quer reconfigurar? [s/N]${NC}"
    read -r reconfig
    if [[ "$reconfig" == "s" || "$reconfig" == "S" ]]; then
        npx tsx scripts/setup-wizard.ts
    else
        echo -e "${GREEN}  ✓ Usando configuração existente${NC}"
    fi
else
    npx tsx scripts/setup-wizard.ts
fi

# ─── Systemd Service ───

echo -e "\n${YELLOW}[6/6]${NC} Instalando serviço systemd..."

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

# ─── Resultado ───

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
echo -e "  ┌─────────────────────────────────────────────┐"
echo -e "  │ ${GREEN}systemctl status pegasus${NC}    → Ver status     │"
echo -e "  │ ${GREEN}systemctl restart pegasus${NC}   → Reiniciar      │"
echo -e "  │ ${GREEN}systemctl stop pegasus${NC}      → Parar          │"
echo -e "  │ ${GREEN}journalctl -u pegasus -f${NC}    → Ver logs       │"
echo -e "  │ ${GREEN}cd ~/pegasus-agent && npm run doctor${NC} → Diag  │"
echo -e "  │ ${GREEN}cd ~/pegasus-agent && npm run setup${NC}  → Reconf│"
echo -e "  └─────────────────────────────────────────────┘"
echo -e ""

# Show status
systemctl status pegasus --no-pager 2>/dev/null || true

echo -e "\n${GREEN}🐴 Pegasus está rodando! Manda uma mensagem no Telegram.${NC}\n"
