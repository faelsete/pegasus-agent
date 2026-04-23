#!/bin/bash

# ═══════════════════════════════════════════
# 🐴 PEGASUS — Linux Direct Installer
# ═══════════════════════════════════════════

set -e

# Cores
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

echo -e "${YELLOW}═══ Verificando Ambiente Linux ═══${NC}"

# Check for Ubuntu/Debian
if [ ! -f /etc/debian_version ]; then
    echo -e "${RED}✗ Erro: Pegasus foi projetado para Ubuntu/Debian.${NC}"
    exit 1
fi

# Essential dependencies check
MISSING=()
command -v git >/dev/null 2>&1 || MISSING+=("git")
command -v node >/dev/null 2>&1 || MISSING+=("nodejs")
command -v npm >/dev/null 2>&1 || MISSING+=("npm")
command -v gcc >/dev/null 2>&1 || MISSING+=("build-essential")

if [ ${#MISSING[@]} -ne 0 ] && [ ! -f /usr/bin/gcc ]; then
    echo -e "${RED}✗ Faltam dependências básicas.${NC}"
    echo -e "${YELLOW}Execute: sudo apt update && sudo apt install -y git nodejs npm build-essential python3${NC}"
    exit 1
fi

# Node version check
NODE_VER=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VER" -lt 20 ]; then
    echo -e "${RED}✗ Node.js v20+ é necessário (você tem v$NODE_VER)${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Ambiente pronto!${NC}"

# 1. Install Dependencies
echo -e "\n${BLUE}📦 Instalando dependências do Pegasus...${NC}"
npm install --quiet

# 2. Build
echo -e "${BLUE}🏗️ Compilando código (TypeScript)...${NC}"
npm run build

# 3. Setup Wizard
echo -e "\n${YELLOW}⚙️ Iniciando Wizard de Configuração...${NC}"
npm run setup

# 4. Service Option
echo -e "\n${YELLOW}Deseja instalar como serviço (24/7)? (s/n)${NC}"
read -r INSTALL_SERVICE
if [[ "$INSTALL_SERVICE" =~ ^[Ss]$ ]]; then
    if [ "$EUID" -ne 0 ]; then
        echo -e "${YELLOW}Solicitando permissão para instalar serviço systemd...${NC}"
        sudo bash scripts/service.sh install
    else
        bash scripts/service.sh install
    fi
fi

echo -e "\n${GREEN}🚀 Pegasus finalizado!${NC}"
echo -e "Use ${BLUE}npm start${NC} para rodar manualmente ou ${BLUE}sudo systemctl start pegasus${NC} para o serviço."
