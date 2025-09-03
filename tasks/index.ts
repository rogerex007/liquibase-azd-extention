import * as tl from "azure-pipelines-task-lib/task";
import { getInput, setResult, TaskResult } from "azure-pipelines-task-lib/task";
import { getClient } from "./src/connections/aws";
import { validateAndDownload } from "./src/util/connectors";
import { getSecretValue } from "./src/util/secret";
import { LiquibaseTaskRunner } from "./src/liquibase/taskRunner";
import { LiquibaseConfigBuilder, TaskInputs } from "./src/liquibase/config";
import { logger } from "./src/util/logger";
import { LicenseChecker } from "./src/util/licenseChecker";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Función auxiliar para publicar reporte HTML después de un fallo
 */
async function publishHtmlReportAfterFailure(): Promise<void> {
  try {
    logger.info("🔍 Buscando reportes HTML generados por Liquibase...");
    
    // Verificar si hay variable de Azure DevOps con el nombre del reporte
    const reportName = tl.getVariable('LIQUIBASE_CHECKS_REPORT');
    if (reportName) {
      const reportPath = path.join(process.cwd(), reportName);
      
      if (fs.existsSync(reportPath)) {
        const reportSize = fs.statSync(reportPath).size;
        logger.info(`📊 Reporte HTML encontrado via variable de Azure DevOps: ${reportName} (${(reportSize / 1024).toFixed(2)} KB)`);
        logger.info(`📁 Ruta del reporte: ${reportPath}`);
        logger.info("📤 Reporte HTML listo para ser publicado con publish-report-html@0");
        return;
      }
    }
    
    // Buscar cualquier archivo HTML como fallback
    const htmlFiles = fs.readdirSync(process.cwd()).filter(file => file.endsWith('.html'));
    
    if (htmlFiles.length > 0) {
      const latestReport = htmlFiles.sort().pop()!;
      const reportPath = path.join(process.cwd(), latestReport);
      const reportSize = fs.statSync(reportPath).size;
      
      logger.info(`📊 Reporte HTML encontrado: ${latestReport} (${(reportSize / 1024).toFixed(2)} KB)`);
      logger.info(`📁 Ruta del reporte: ${reportPath}`);
      logger.info("📤 Reporte HTML listo para ser publicado con publish-report-html@0");
    } else {
      logger.info("📝 No se encontraron reportes HTML para publicar");
    }
  } catch (error) {
    logger.warning(`⚠️ Error buscando reportes HTML: ${error}`);
  }
}

export async function run(): Promise<void> {
  try {
    // Iniciar logging detallado
    logger.startStep("configuration", "Obteniendo parámetros de la tarea");
    
    // Get all task inputs
    const platform = getInput("platform", true)!;
    const motor = getInput("motor", true)!;
    const awsConnection = getInput("awsConnection", true)!;
    const region = getInput("region", true)!;
    const secret = getInput("secret", true)!;
    const jfrogConnection = getInput("jfrogConnection", true)!;
    const command = getInput("command", true)!;
    const licenseConnection = getInput("licenseConnection", false);
    
    // Get optional inputs
    const changeLogFile = getInput("changeLogFile", false);
    const context = getInput("context", false);
    const labels = getInput("labels", false);
    const tag = getInput("tag", false);

    const logLevel = getInput("logLevel", false);
    const outputDirectory = getInput("outputDirectory", false);
    const outputFile = getInput("outputFile", false);
    
    // Get snapshot-related inputs
    const snapshotDescription = getInput("snapshotDescription", false);
    const snapshotId = getInput("snapshotId", false);
    const rollbackStrategy = getInput("rollbackStrategy", false);
    const snapshotsDirectory = getInput("snapshotsDirectory", false);
    const updateCount = getInput("updateCount", false);
    const autoSnapshotEnabled = getInput("autoSnapshotEnabled", false);
    const validationRequired = getInput("validationRequired", false);
    
    // Log de configuración básica
    logger.info(`Plataforma: ${platform}, Motor: ${motor}, Región: ${region}, Comando: ${command}`);
    logger.completeStep("completed", undefined, `Parámetros obtenidos - ${command.toUpperCase()} en ${motor}`);
    
    // Log de parámetros opcionales
    if (context || labels || tag) {
      logger.startStep("parameters", "Procesando parámetros opcionales");
      const optionalParams = { context, labels, tag, logLevel, outputDirectory, outputFile };
      logger.logConfiguration(optionalParams);
      logger.completeStep("completed");
    }
    
    // Initialize AWS client
    logger.startStep("aws", "Inicializando cliente AWS");
    const awsClient = await getClient(region, awsConnection);
    logger.completeStep("completed", undefined, `Cliente AWS inicializado para región ${region}`);

    // Get database credentials from AWS Secrets Manager
    logger.startStep("credentials", `Obteniendo credenciales desde AWS Secrets Manager`);
    const baseCredentials = await awsClient.config.credentials();
    const secretValue = await getSecretValue(region, baseCredentials, secret);
    logger.completeStep("completed", undefined, `Credenciales obtenidas del secreto: ${secret}`);
    
    // Parse database credentials
    logger.startStep("parse", "Parseando credenciales de base de datos");
    const databaseCredentials = LiquibaseConfigBuilder.parseCredentials(secretValue);
    logger.completeStep("completed", undefined, `Credenciales parseadas para ${motor}`);

    // Validate and download required connectors
    logger.startStep("connectors", `Validando y descargando conectores para ${motor}`);
    await validateAndDownload(jfrogConnection, motor);
    logger.completeStep("completed", undefined, `Conectores validados y descargados para ${motor}`);

    // Get Pro-related inputs
    let licenseKey = getInput("licenseKey", false);
    // If a Liquibase License service connection is provided, prefer its token as license key
    if (!licenseKey && licenseConnection) {
      try {
        const connLicense = tl.getEndpointAuthorizationParameter(licenseConnection, "apitoken", true)
          || tl.getEndpointAuthorizationParameter(licenseConnection, "apitoken", false);
        if (connLicense) {
          licenseKey = connLicense;
          logger.info("🔑 Licencia Pro obtenida desde la conexión de servicio");
        }
      } catch (e) {
        logger.warning(`⚠️ No se pudo leer la licencia desde la conexión '${licenseConnection}': ${e}`);
      }
    }
    const snowflakeWarehouse = getInput("snowflakeWarehouse", false);
    const snowflakeRole = getInput("snowflakeRole", false);
    const bigqueryProject = getInput("bigqueryProject", false);
    const bigqueryDataset = getInput("bigqueryDataset", false);
    const checksSettingsFile = getInput("checksSettingsFile", false);
    const generateHtmlReport = getInput("generateHtmlReport", false);
    
    // Debug: mostrar si se obtuvo la licencia
    if (licenseKey) {
      logger.info(`🔑 Licencia Pro obtenida: ${licenseKey.substring(0, 8)}...`);
    } else {
      logger.info("🔑 No se obtuvo licencia Pro como parámetro");
    }
    

    
    // Verificación de licencia Pro
    logger.startStep("license-verification", "Verificando licencia de Liquibase Pro");
    const licenseChecker = new LicenseChecker(licenseKey);
    const licenseInfo = await licenseChecker.checkLicense();
    
    // Generar reporte de licencia
    LicenseChecker.generateLicenseReport(licenseInfo, motor, command);
    
            // Para los comandos Pro (checksrun, checksshow), permitir continuar con advertencia si no hay licencia Pro válida
        if ((command === "checksrun" || command === "checksshow") && !licenseInfo.licenseValid) {
          logger.warning("⚠️ Comando Pro ejecutándose sin licencia Pro válida");
          logger.warning("⚠️ Algunas funcionalidades avanzadas pueden no estar disponibles");
          logger.warning("⚠️ Se recomienda configurar una licencia Pro para uso en producción");
        }
    
    // Prepare task inputs
    logger.startStep("build", "Construyendo configuración de la tarea");
    const taskInputs: TaskInputs = {
      platform,
      motor,
      awsConnection,
      region,
      secret,
      jfrogConnection,
      command,
      changeLogFile,
      context,
      labels,
      tag,

      logLevel,
      outputDirectory,
      outputFile,
      snapshotDescription,
      snapshotId,
      rollbackStrategy,
      snapshotsDirectory,
      updateCount: updateCount ? parseInt(updateCount) : undefined,
      autoSnapshotEnabled: autoSnapshotEnabled === 'true',
      validationRequired: validationRequired === 'true',
      licenseKey,
      snowflakeWarehouse,
      snowflakeRole,
      bigqueryProject,
      bigqueryDataset,
      checksSettingsFile,
      generateHtmlReport: generateHtmlReport === 'true'
    };
    logger.completeStep("completed");

    // Create and execute Liquibase task
    logger.startStep("create", "Creando ejecutor de tarea Liquibase");
    const taskRunner = await LiquibaseTaskRunner.createFromInputs(taskInputs, databaseCredentials);
    logger.completeStep("completed");
    
    logger.startStep("execute", `Ejecutando comando Liquibase: ${command.toUpperCase()}`);
    
    try {
      await taskRunner.execute();
      logger.completeStep("completed", undefined, `Comando ${command.toUpperCase()} ejecutado exitosamente`);
    } catch (error) {
      logger.completeStep("failed", `Comando ${command.toUpperCase()} falló: ${error}`);
      
      // Para los comandos Pro (checksrun, checksshow), siempre intentar publicar el reporte HTML
      if (command === "checksrun" || command === "checksshow") {
        logger.info("🔄 Intentando publicar reporte HTML después del fallo...");
        try {
          await publishHtmlReportAfterFailure();
        } catch (publishError) {
          logger.warning(`⚠️ Error publicando reporte HTML después del fallo: ${publishError}`);
        }
      }
      
      throw error; // Re-lanzar el error para que la tarea falle
    }
    
    // Log de resumen final
    logger.logSummary();
    
    setResult(TaskResult.Succeeded);
  } catch (err: any) {
    logger.error(`La tarea falló con error: ${err.message}`, err);
    logger.logSummary();
    setResult(TaskResult.Failed, err.message);
  }
}

run();
