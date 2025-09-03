#!/bin/bash

set -e  # Exit on any error

LIQUIBASE_VERSION="4.33.0"
LIQUIBASE_URL="https://github.com/liquibase/liquibase/releases/download/v${LIQUIBASE_VERSION}/liquibase-${LIQUIBASE_VERSION}.tar.gz"
TEMP_DIR="/tmp/liquibase-update"
CURRENT_DIR="$(pwd)"
LIQUIBASE_INSTALL_DIR="${CURRENT_DIR}/node_modules/liquibase/dist/liquibase"

echo "🚀 Iniciando actualización de Liquibase a la versión ${LIQUIBASE_VERSION}"
echo "📁 Directorio actual: ${CURRENT_DIR}"
echo "📦 Directorio de instalación: ${LIQUIBASE_INSTALL_DIR}"


if [[ ! -f "package.json" ]]; then
    echo "❌ Error: No se encontró package.json. Asegúrate de estar en el directorio raíz del proyecto"
    exit 1
fi

echo "📁 Creando directorio temporal..."
mkdir -p "${TEMP_DIR}"
cd "${TEMP_DIR}"


echo "⬇️  Descargando Liquibase ${LIQUIBASE_VERSION}..."
if command -v curl &> /dev/null; then
    curl -L -o "liquibase-${LIQUIBASE_VERSION}.tar.gz" "${LIQUIBASE_URL}"
elif command -v wget &> /dev/null; then
    wget -O "liquibase-${LIQUIBASE_VERSION}.tar.gz" "${LIQUIBASE_URL}"
else
    echo "❌ Error: No se encontró curl ni wget. Instala uno de ellos para continuar."
    exit 1
fi


if [[ ! -f "liquibase-${LIQUIBASE_VERSION}.tar.gz" ]]; then
    echo "❌ Error: No se pudo descargar Liquibase ${LIQUIBASE_VERSION}"
    exit 1
fi

echo "✅ Descarga completada"


echo "📦 Extrayendo archivo..."
tar -xzf "liquibase-${LIQUIBASE_VERSION}.tar.gz"


if [[ ! -f "liquibase" ]]; then
    echo "❌ Error: No se pudo extraer el archivo de Liquibase"
    exit 1
fi

echo "✅ Extracción completada"


echo "🗑️  Eliminando versión anterior..."
if [[ -d "${LIQUIBASE_INSTALL_DIR}" ]]; then
    rm -rf "${LIQUIBASE_INSTALL_DIR}"
    echo "✅ Versión anterior eliminada"
else
    echo "⚠️  No se encontró directorio de Liquibase anterior"
fi


echo "🔧 Instalando nueva versión..."
cp -r . "${LIQUIBASE_INSTALL_DIR}"


if [[ -f "${LIQUIBASE_INSTALL_DIR}/liquibase" ]]; then
    echo "✅ Instalación completada exitosamente"
    

    chmod +x "${LIQUIBASE_INSTALL_DIR}/liquibase"
    echo "✅ Permisos de ejecución configurados"
    

    echo "🔍 Verificando versión instalada..."
    if [[ -f "${LIQUIBASE_INSTALL_DIR}/README.txt" ]]; then
        echo "📋 Información de la versión:"
        head -5 "${LIQUIBASE_INSTALL_DIR}/README.txt"
    fi
else
    echo "❌ Error: La instalación no se completó correctamente"
    exit 1
fi


echo "🧹 Limpiando archivos temporales..."
cd "${CURRENT_DIR}"
rm "${LIQUIBASE_INSTALL_DIR}/liquibase-${LIQUIBASE_VERSION}.tar.gz"

if [[ -f "${TEMP_DIR}/liquibase-${LIQUIBASE_VERSION}.tar.gz" ]]; then
    rm -f "${TEMP_DIR}/liquibase-${LIQUIBASE_VERSION}.tar.gz"
    echo "🗑️  Archivo .tar.gz eliminado"
fi


rm -rf "${TEMP_DIR}"
echo "🗑️  Directorio temporal eliminado"

echo ""
echo "🎉 ¡Actualización de Liquibase completada exitosamente!"
echo "📁 Nueva versión instalada en: ${LIQUIBASE_INSTALL_DIR}"
echo ""
echo "⚠️  Nota: El package.json NO se actualizó (mantiene la versión del wrapper npm)"
