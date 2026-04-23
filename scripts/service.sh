#!/usr/bin/env bash
# ═══════════════════════════════════════════
# 🐴 Pegasus — Service Manager
# Instala, remove e gerencia o systemd service
# ═══════════════════════════════════════════

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SERVICE_NAME="pegasus"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SOURCE_SERVICE="${SCRIPT_DIR}/pegasus.service"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    echo -e "\n${CYAN}  🐴 P E G A S U S — Service Manager${NC}"
    echo -e "${CYAN}  ─────────────────────────────────────${NC}\n"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}✗ Execute como root: sudo bash $0 $@${NC}"
        exit 1
    fi
}

install_service() {
    echo -e "${YELLOW}► Instalando serviço systemd...${NC}"

    # Detect node path
    NODE_PATH=$(which node 2>/dev/null || echo "/usr/bin/node")
    TSX_PATH=$(which tsx 2>/dev/null || echo "")

    # Detect user
    INSTALL_USER=$(logname 2>/dev/null || echo "root")
    INSTALL_HOME=$(eval echo "~${INSTALL_USER}")
    WORK_DIR="${PROJECT_DIR}"

    # Generate service file from template
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Pegasus Autonomous AI Agent
Documentation=https://github.com/faelsete/pegasus-agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${INSTALL_USER}
WorkingDirectory=${WORK_DIR}
ExecStart=${NODE_PATH} --import tsx/esm src/index.ts
Restart=always
RestartSec=10
StartLimitIntervalSec=60
StartLimitBurst=5

# Environment
Environment=NODE_ENV=production
Environment=HOME=${INSTALL_HOME}
Environment=PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${INSTALL_HOME}/.local/bin

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=pegasus

# Security
PrivateTmp=true

# Resources
MemoryMax=1G
TasksMax=100

[Install]
WantedBy=multi-user.target
EOF

    # Reload and enable
    systemctl daemon-reload
    systemctl enable "$SERVICE_NAME"

    echo -e "${GREEN}✓ Serviço instalado e habilitado no boot${NC}"
    echo -e "${CYAN}  Arquivo: ${SERVICE_FILE}${NC}"
    echo -e "${CYAN}  User: ${INSTALL_USER}${NC}"
    echo -e "${CYAN}  WorkDir: ${WORK_DIR}${NC}\n"

    echo -e "${YELLOW}Comandos disponíveis:${NC}"
    echo -e "  sudo systemctl start pegasus    → Iniciar"
    echo -e "  sudo systemctl stop pegasus     → Parar"
    echo -e "  sudo systemctl restart pegasus  → Reiniciar"
    echo -e "  sudo systemctl status pegasus   → Status"
    echo -e "  journalctl -u pegasus -f        → Logs em tempo real"
    echo -e ""
    echo -e "${YELLOW}Quer iniciar agora? [S/n]${NC}"
    read -r answer
    if [[ "$answer" != "n" && "$answer" != "N" ]]; then
        systemctl start "$SERVICE_NAME"
        sleep 2
        systemctl status "$SERVICE_NAME" --no-pager
    fi
}

uninstall_service() {
    echo -e "${YELLOW}► Removendo serviço systemd...${NC}"

    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        systemctl stop "$SERVICE_NAME"
        echo -e "${GREEN}✓ Serviço parado${NC}"
    fi

    if [ -f "$SERVICE_FILE" ]; then
        systemctl disable "$SERVICE_NAME" 2>/dev/null || true
        rm -f "$SERVICE_FILE"
        systemctl daemon-reload
        echo -e "${GREEN}✓ Serviço removido${NC}"
    else
        echo -e "${YELLOW}⚠ Serviço não estava instalado${NC}"
    fi
}

show_status() {
    if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
        echo -e "${GREEN}● Pegasus está RODANDO${NC}\n"
        systemctl status "$SERVICE_NAME" --no-pager
    elif [ -f "$SERVICE_FILE" ]; then
        echo -e "${RED}● Pegasus está PARADO (serviço instalado)${NC}\n"
        systemctl status "$SERVICE_NAME" --no-pager
    else
        echo -e "${YELLOW}● Pegasus NÃO está instalado como serviço${NC}"
        echo -e "  Execute: sudo bash $0 install"
    fi
}

show_logs() {
    local lines="${1:-50}"
    echo -e "${CYAN}► Últimas ${lines} linhas de log:${NC}\n"
    journalctl -u "$SERVICE_NAME" -n "$lines" --no-pager
}

follow_logs() {
    echo -e "${CYAN}► Logs em tempo real (Ctrl+C para sair):${NC}\n"
    journalctl -u "$SERVICE_NAME" -f
}

show_help() {
    print_header
    echo "Uso: sudo bash service.sh <comando>"
    echo ""
    echo "Comandos:"
    echo "  install     Instala o Pegasus como serviço systemd (inicia no boot)"
    echo "  uninstall   Remove o serviço systemd"
    echo "  start       Inicia o serviço"
    echo "  stop        Para o serviço"
    echo "  restart     Reinicia o serviço"
    echo "  status      Mostra status do serviço"
    echo "  logs        Mostra últimas 50 linhas de log"
    echo "  logs N      Mostra últimas N linhas de log"
    echo "  follow      Segue logs em tempo real"
    echo "  help        Este menu"
    echo ""
}

# ═══ Main ═══
print_header

case "${1:-help}" in
    install)
        check_root
        install_service
        ;;
    uninstall)
        check_root
        uninstall_service
        ;;
    start)
        check_root
        systemctl start "$SERVICE_NAME"
        echo -e "${GREEN}✓ Pegasus iniciado${NC}"
        ;;
    stop)
        check_root
        systemctl stop "$SERVICE_NAME"
        echo -e "${GREEN}✓ Pegasus parado${NC}"
        ;;
    restart)
        check_root
        systemctl restart "$SERVICE_NAME"
        echo -e "${GREEN}✓ Pegasus reiniciado${NC}"
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs "${2:-50}"
        ;;
    follow)
        follow_logs
        ;;
    *)
        show_help
        ;;
esac
