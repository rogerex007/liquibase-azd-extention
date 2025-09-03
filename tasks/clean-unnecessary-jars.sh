#!/bin/bash

echo "🧹 Limpiando JARs innecesarios de Liquibase..."

# Directorio de JARs
LIQUIBASE_LIB_DIR="node_modules/liquibase/dist/liquibase/internal/lib"
LIQUIBASE_EXTENSIONS_DIR="node_modules/liquibase/dist/liquibase/internal/extensions"
LIQUIBASE_DRIVERS_DIR="node_modules/liquibase/dist/drivers"

# JARs a ELIMINAR (no necesarios para MySQL)
JARS_TO_REMOVE=(
    # Snowflake
    "$LIQUIBASE_LIB_DIR/snowflake-jdbc.jar"
    "$LIQUIBASE_DRIVERS_DIR/snowflake-jdbc-3.9.2-javadoc.jar"
    
    # SQLite
    "$LIQUIBASE_LIB_DIR/sqlite-jdbc.jar"
    
    # DB2
    "$LIQUIBASE_LIB_DIR/jcc.jar"
    "$LIQUIBASE_DRIVERS_DIR/db2jcc4.jar"
    
    # Oracle
    "$LIQUIBASE_LIB_DIR/ojdbc8.jar"
    
    # H2
    "$LIQUIBASE_LIB_DIR/h2.jar"
    "$LIQUIBASE_DRIVERS_DIR/h2-1.4.200.jar"
    
    # HSQLDB
    "$LIQUIBASE_LIB_DIR/hsqldb.jar"
    
    # Firebird
    "$LIQUIBASE_LIB_DIR/jaybird.jar"
    
    # SQL Server
    "$LIQUIBASE_LIB_DIR/mssql-jdbc.jar"
    "$LIQUIBASE_DRIVERS_DIR/mssql-jdbc-7.4.1.jre8.jar"
    
    # PostgreSQL
    "$LIQUIBASE_LIB_DIR/postgresql.jar"
    "$LIQUIBASE_DRIVERS_DIR/postgresql-42.4.2.jar"  

    # Liquibase Checks
    "$LIQUIBASE_EXTENSIONS_DIR/liquibase-checks.jar"

    # BigQuery
    "$LIQUIBASE_EXTENSIONS_DIR/liquibase-commercial-bigquery.jar"
)

# Contador de archivos eliminados
REMOVED_COUNT=0
SAVED_SPACE=0

echo "📋 Eliminando JARs innecesarios..."

for jar in "${JARS_TO_REMOVE[@]}"; do
    if [ -f "$jar" ]; then
        # Obtener tamaño antes de eliminar
        SIZE=$(du -k "$jar" | cut -f1)
        SAVED_SPACE=$((SAVED_SPACE + SIZE))
        
        echo "🗑️  Eliminando: $(basename "$jar") ($(du -sh "$jar" | cut -f1))"
        rm -f "$jar"
        REMOVED_COUNT=$((REMOVED_COUNT + 1))
    fi
done

echo ""
echo "✅ Limpieza completada:"
echo "   📊 JARs eliminados: $REMOVED_COUNT"
echo "   💾 Espacio ahorrado: $(numfmt --to=iec $((SAVED_SPACE * 1024)))"
echo ""

# Mostrar JARs restantes
echo "📋 JARs restantes (necesarios):"
find "$LIQUIBASE_LIB_DIR" "$LIQUIBASE_DRIVERS_DIR" -name "*.jar" 2>/dev/null | while read jar; do
    echo "   ✅ $(basename "$jar") ($(du -sh "$jar" | cut -f1))"
done

echo ""
echo "📊 Tamaño total después de la limpieza:"
du -sh node_modules/liquibase