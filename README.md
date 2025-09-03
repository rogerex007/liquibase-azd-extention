# Liquibase Azure DevOps Extension

Esta extensión de Azure DevOps permite ejecutar comandos de Liquibase de manera integrada en pipelines de CI/CD, con soporte para múltiples motores de base de datos estándar y operaciones avanzadas.

## Características

- ✅ Soporte para múltiples motores de base de datos (SQL Server, MySQL, MariaDB, DocumentDB, DynamoDB)
- ✅ Integración con AWS Secrets Manager para credenciales seguras
- ✅ Soporte para JFrog Artifactory para descarga de conectores
- ✅ Comandos completos de Liquibase (update, rollback, status, validate, etc.)
- ✅ **Estrategia de Rollback con Snapshot** - Snapshots automáticos y rollbacks inteligentes
- ✅ Configuración flexible con contextos, etiquetas y tags
- ✅ **Logging Mejorado** - Sistema de logging detallado con timing, métricas de rendimiento y seguimiento paso a paso

- ✅ **Verificación de Licencia Pro** - Sistema completo de verificación y validación de licencias de Liquibase Pro
- ✅ Logging detallado y manejo de errores

## Comandos Soportados

### Comandos Básicos
- **update**: Aplica cambios pendientes a la base de datos
- **status**: Muestra el estado de la base de datos
- **validate**: Valida el changelog sin aplicar cambios
- **checksrun**: Ejecuta verificaciones de Liquibase Pro con configuración simplificada
- **checklicense**: Verifica el estado de la licencia de Liquibase Pro

### Comandos de Rollback
- **rollbackWithSnapshot**: Ejecuta rollback usando estrategia de snapshot (única estrategia soportada)

### Comandos de Snapshot
- **autoSnapshot**: Crea snapshot automático antes de cambios críticos
- **listSnapshots**: Lista todos los snapshots disponibles
- **validateSnapshot**: Valida compatibilidad de un snapshot específico

### Comandos de Actualización Avanzados
- **updateWithContext**: Actualiza con contexto específico
- **updateWithLabels**: Actualiza con etiquetas específicas

### Comandos de Documentación y Análisis
- **dbDoc**: Genera documentación de la base de datos
- **generateChangelog**: Genera changelog desde la base de datos
- **history**: Muestra historial de cambios
- **diff**: Compara base de datos con changelog

### Comandos de Sincronización
- **changelogSync**: Sincroniza changelog con base de datos
- **changelogSyncSql**: Genera SQL de sincronización
- **syncHub**: Sincroniza con Liquibase Hub

### Comandos de Gestión
- **tag**: Crea un tag en el changelog
- **clearChecksums**: Limpia checksums
- **listLocks**: Lista locks activos
- **releaseLocks**: Libera locks


## Configuración

### Parámetros Requeridos

1. **Plataforma**: Seleccione "nube" o "on-premise"
2. **Motor de Base de Datos**: SQL Server, MySQL, PostgreSQL, Oracle, DocumentDB, DynamoDB, o Aurora MariaDB
3. **AWS Connection**: Conexión a AWS (requerida para nube)
4. **AWS Region**: Región de AWS
5. **Nombre del Secreto**: Nombre del secreto en AWS Secrets Manager
6. **JFrog Connection**: Conexión a JFrog Artifactory
7. **Comando de Liquibase**: Comando a ejecutar

### Parámetros Opcionales

- **Archivo de Changelog**: Ruta al archivo changelog (default: changelog.xml)
- **Contexto**: Contexto para ejecutar comandos
- **Etiquetas**: Etiquetas para filtrar cambios
- **Tag**: Tag para operaciones de update
- **Nivel de Log**: Debug, Info, Warning, Error
- **Directorio de Salida**: Para comandos que generan archivos
- **Archivo de Salida**: Para comandos que generan archivos

## Configuración de Credenciales

Las credenciales de la base de datos deben almacenarse en AWS Secrets Manager con la siguiente estructura JSON:

```json
{
  "host": "your-database-host",
  "port": 1433,
  "database": "your-database-name",
  "username": "your-username",
  "password": "your-password"
}
```

## Ejemplos de Uso

### Actualización Básica
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'sqlserver'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'update'
    changeLogFile: 'db/changelog.xml'
```

### Rollback con Snapshot
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'mysql'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'rollbackwithsnapshot'
    rollbackStrategy: '{"type":"snapshot","value":"auto_1703123456789","description":"Rollback to pre-deployment state","validationRequired":true}'
    snapshotsDirectory: './db-snapshots'
```

### Snapshot Automático
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'sqlserver'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'autosnapshot'
    snapshotDescription: 'Pre-deployment snapshot for v2.1.0'
    snapshotsDirectory: './db-snapshots'
```

### Rollback con Snapshot
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'sqlserver'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'rollbackwithsnapshot'
    rollbackStrategy: '{"type":"snapshot","value":"auto_1703123456789","description":"Rollback to pre-deployment state","validationRequired":true}'
    snapshotsDirectory: './db-snapshots'
```

### Actualización con Contexto
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'sqlserver'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'updatewithcontext'
    context: 'production'
    changeLogFile: 'db/changelog.xml'
```

### Generar Documentación
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'sqlserver'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'dbdoc'
    outputDirectory: '$(Build.ArtifactStagingDirectory)/db-docs'
```

### Verificar Licencia Pro
```yaml
- task: Liquibase@0
  inputs:
    platform: 'nube'
    motor: 'mysql'
    awsConnection: 'AWS-Connection'
    region: 'us-east-1'
    secret: 'database-credentials'
    jfrogConnection: 'JFrog-Connection'
    command: 'checklicense'
    
    licenseKey: 'your-license-key-here'
```

## Instalación

1. Clone este repositorio
2. Instale las dependencias: `npm install` (automáticamente configura permisos de ejecución)
3. Compile el proyecto: `npm run build`
4. Empaquete la extensión: `tfx extension create`
5. Publique la extensión en Azure DevOps

**Nota**: Los permisos de ejecución para los binarios de Liquibase se configuran automáticamente durante la instalación, compilación y también en tiempo de ejecución para garantizar compatibilidad con Azure DevOps.

## Características Técnicas

- **Ejecución nativa**: Usa la librería npm de Liquibase directamente
- **Sin dependencias externas**: No requiere Docker ni imágenes adicionales
- **Gestión automática de drivers**: Descarga drivers JDBC desde JFrog Artifactory
- **Integración completa**: Compatible con Azure DevOps y AWS
- **Verificación de licencia Pro**: Sistema completo para validar y verificar licencias de Liquibase Pro

## Desarrollo

### Estructura del Proyecto

```
tasks/
├── src/
│   ├── liquibase/
│   │   ├── liquibase.ts      # Servicio principal de Liquibase
│   │   ├── config.ts         # Configuración y builder
│   │   └── taskRunner.ts     # Ejecutor de tareas
│   ├── connections/
│   │   └── aws.ts           # Cliente AWS
│   ├── interfaces/
│   └── util/
│       ├── connectors.ts     # Validación de conectores
│       └── secret.ts        # Manejo de secretos
├── index.ts                 # Punto de entrada principal
├── task.json               # Configuración de la tarea
└── package.json            # Dependencias
```

### Comandos de Desarrollo

```bash
# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Ejecutar en modo desarrollo
npm run dev

# Crear paquete de extensión
tfx extension create
```

## Troubleshooting

### Errores Comunes

1. **Error de credenciales**: Verifique que el secreto en AWS Secrets Manager tenga el formato JSON correcto
2. **Error de conectores**: Asegúrese de que JFrog Artifactory esté configurado correctamente
3. **Error de conexión**: Verifique que la base de datos sea accesible desde el agente de Azure DevOps
4. **Error de permisos de ejecución**: Si recibe "Permission denied" al ejecutar Liquibase, la extensión ahora aplica automáticamente los permisos en tiempo de ejecución para todos los comandos de Liquibase. Si persiste el problema, ejecute `npm run fix-permissions` en el directorio `tasks/`
5. **Error de JAR files**: Si recibe "Unable to access jarfile" o "NoClassDefFoundError", la extensión preserva automáticamente los archivos JAR críticos de Liquibase Core durante el build y configura correctamente el classpath. Los archivos críticos incluyen: liquibase-core.jar, snakeyaml.jar, picocli.jar, commons-lang3.jar, commons-io.jar, commons-collections4.jar y opencsv.jar

### Logging Mejorado

La extensión incluye un sistema de logging mejorado con las siguientes características:

#### Características del Logging
- **Timing Information**: Cada paso muestra su duración exacta
- **Step-by-Step Progress**: Seguimiento detallado con emojis y estados claros
- **Performance Metrics**: Métricas de rendimiento al final de la ejecución
- **Enhanced Error Handling**: Mensajes de error detallados con contexto
- **Configuration Logging**: Información de configuración sin exponer datos sensibles
- **Security**: Credenciales enmascaradas y logging seguro

#### Ejemplo de Salida
```
🚀 [LIQUIBASE-TASK] Iniciando tarea de Liquibase - 2025-08-06T22:24:18.9801565Z

🔧 [CONFIGURATION] Iniciando... - Obteniendo parámetros de la tarea
✅ [CONFIGURATION] Completado en 45ms - Parámetros obtenidos - VALIDATE en mysql

☁️  [AWS] Iniciando... - Inicializando cliente AWS
✅ [AWS] Completado en 320ms - Cliente AWS inicializado para región us-east-1

📊 [METRICS] Métricas de rendimiento:
   ⏱️  Duración total: 3.53s
   📈 Pasos ejecutados: 9
   ✅ Pasos exitosos: 9
   ❌ Pasos fallidos: 0
   ⏳ Duración promedio por paso: 392ms
   🐌 Paso más lento: execute (2.34s)
```

Para más detalles sobre el sistema de logging, consulte [examples/enhanced-logging-example.md](examples/enhanced-logging-example.md).



### Logs Tradicionales

La extensión también genera logs detallados que pueden ayudar a diagnosticar problemas:
- Nivel Debug: Información detallada de cada operación
- Nivel Info: Información general del progreso
- Nivel Warning: Advertencias que no impiden la ejecución
- Nivel Error: Errores que causan fallo de la tarea

## Estrategia de Rollback con Snapshot

Para información detallada sobre la estrategia de rollback con snapshot, consulte el archivo [SNAPSHOT_ROLLBACK_STRATEGY.md](SNAPSHOT_ROLLBACK_STRATEGY.md).

### Características de la Estrategia:
- **Snapshots Automáticos**: Crea snapshots antes de cambios críticos
- **Rollback Inteligente**: Múltiples estrategias de rollback con validaciones
- **Gestión de Snapshots**: Listado, validación y limpieza automática
- **Integración Completa**: Compatible con Azure DevOps y AWS

## Contribución

1. Fork el repositorio
2. Cree una rama para su feature (`git checkout -b feature/AmazingFeature`)
3. Commit sus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abra un Pull Request

## Licencia

Este proyecto está bajo la licencia MIT. Vea el archivo `LICENSE` para más detalles.