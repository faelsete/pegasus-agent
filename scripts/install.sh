#!/bin/bash

# ═══════════════════════════════════════════
# 🐴 PEGASUS — Linux Installer
# Funciona via: curl ... | bash  E  bash scripts/install.sh
# ═══════════════════════════════════════════

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "  ╔═══════════════════════════════════════╗"
echo "  ║                                       ║"
echo "  ║     🐴  P E G A S U S                ║"
echo "  ║     Autonomous AI Agent               ║"
echo "  ║                                       ║"
echo "  ╚═══════════════════════════════════════╝"
echo -e "${NC}"

# ═══ 1. Verificar Ubuntu/Debian ═══
if [ ! -f /etc/debian_version ]; then
    echo -e "${RED}✗ Pegasus é exclusivo para Ubuntu/Debian Linux.${NC}"
    exit 1
fi
echo -e "${GREEN}✓${NC} Ubuntu/Debian detectado"

# ═══ 2. Verificar dependências ═══
MISSING=()
command -v git  >/dev/null 2>&1 || MISSING+=("git")
command -v node >/dev/null 2>&1 || MISSING+=("nodejs")
command -v npm  >/dev/null 2>&1 || MISSING+=("npm")
command -v gcc  >/dev/null 2>&1 || MISSING+=("build-essential")

if [ ${#MISSING[@]} -ne 0 ]; then
    echo -e "${RED}✗ Dependências faltando: ${MISSING[*]}${NC}"
    echo -e "${YELLOW}→ Execute: sudo apt update && sudo apt install -y ${MISSING[*]} python3${NC}"
    exit 1
fi

# Node version >= 20
NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 20 ]; then
    echo -e "${RED}✗ Node.js v20+ necessário (você tem v${NODE_MAJOR})${NC}"
    echo -e "${YELLOW}→ https://nodejs.org/en/download${NC}"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js v$(node -v | cut -dv -f2)"
echo -e "${GREEN}✓${NC} npm v$(npm -v)"
echo -e "${GREEN}✓${NC} Todas dependências OK"

# ═══ 3. Clonar ou detectar repo ═══
INSTALL_DIR="$HOME/pegasus-agent"

if [ -f "package.json" ] && grep -q "pegasus" package.json 2>/dev/null; then
    INSTALL_DIR="$(pwd)"
    echo -e "\n${BLUE}📂 Usando diretório atual: ${INSTALL_DIR}${NC}"
elif [ -d "$INSTALL_DIR" ]; then
    echo -e "\n${BLUE}📂 Atualizando ${INSTALL_DIR}...${NC}"
    cd "$INSTALL_DIR"
    git pull origin main
else
    echo -e "\n${BLUE}📥 Clonando Pegasus em ${INSTALL_DIR}...${NC}"
    git clone https://github.com/faelsete/pegasus-agent.git "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ═══ 4. Instalar dependências ═══
echo -e "\n${BLUE}📦 Instalando dependências...${NC}"
npm install --quiet 2>&1 | tail -1

# ═══ 5. Build ═══
echo -e "${BLUE}🏗️  Compilando TypeScript...${NC}"
npm run build

# ═══ 6. Setup Wizard (stdin vem do terminal, não do pipe) ═══
echo -e "\n${YELLOW}⚙️  Configuração interativa:${NC}"
npm run setup </dev/tty

# ═══ 7. Serviço systemd (opcional) ═══
echo ""
read -rp "Instalar como serviço 24/7? (s/N): " INSTALL_SVC </dev/tty
if [[ "$INSTALL_SVC" =~ ^[Ss]$ ]]; then
    sudo bash scripts/service.sh install
fi

echo -e "\n${GREEN}✅ Pegasus instalado com sucesso!${NC}"
echo -e "  → Rodar manual:  ${BLUE}cd ${INSTALL_DIR} && npm start${NC}"
echo -e "  → Serviço:       ${BLUE}sudo systemctl start pegasus${NC}"
echo -e "  → Logs:          ${BLUE}journalctl -u pegasus -f${NC}"
