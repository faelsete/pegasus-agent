#!/bin/bash
set -euo pipefail

echo ""
echo "🐴 PEGASUS — Instalação"
echo "═══════════════════════════════════════"
echo ""

# 1. Check Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js não encontrado. Instale v22+: https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "❌ Node.js $NODE_MAJOR detectado. Requer v22+."
  exit 1
fi
echo "✅ Node.js $(node -v)"

# 2. Create directories
mkdir -p ~/.pegasus/{data/{vectors,backups,skills,media},rules}
echo "✅ Diretório ~/.pegasus/ criado"

# 3. Install dependencies
echo "📦 Instalando dependências..."
npm install
echo "✅ Dependências instaladas"

# 4. Copy templates if not exist
for file in instructions.md persona.md user.md; do
  if [ ! -f ~/.pegasus/$file ]; then
    cp templates/$file ~/.pegasus/$file
    echo "  📄 Copiado: $file"
  fi
done
echo "✅ Templates configurados"

# 5. Run setup wizard
echo ""
echo "🔧 Iniciando setup wizard..."
npx tsx scripts/setup-wizard.ts

echo ""
echo "═══════════════════════════════════════"
echo "✅ Pegasus instalado!"
echo ""
echo "  Iniciar:   npm start        (Telegram)"
echo "  CLI:       npm run start:cli"
echo "  Doctor:    npm run doctor"
echo "  Setup:     npm run setup"
echo ""
