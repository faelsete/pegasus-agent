#!/bin/bash

echo ""
echo "🐴 PEGASUS — Desinstalação"
echo "═══════════════════════════════════════"
echo ""

read -p "⚠️  Remover TODOS os dados (memórias, configs, backups)? [y/N] " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Cancelado."
  exit 0
fi

# Stop processes
echo "🛑 Parando processos..."
pkill -f "pegasus" 2>/dev/null || true
pm2 delete pegasus 2>/dev/null || true

# Remove systemd service
if [ -f /etc/systemd/system/pegasus.service ]; then
  sudo systemctl stop pegasus 2>/dev/null || true
  sudo systemctl disable pegasus 2>/dev/null || true
  sudo rm -f /etc/systemd/system/pegasus.service
  sudo systemctl daemon-reload
  echo "✅ Serviço systemd removido"
fi

# Remove data
if [ -d ~/.pegasus ]; then
  rm -rf ~/.pegasus
  echo "✅ ~/.pegasus/ removido"
fi

# Remove local build artifacts
rm -rf node_modules dist package-lock.json
echo "✅ Build artifacts removidos"

echo ""
echo "✅ Pegasus removido completamente."
echo ""
