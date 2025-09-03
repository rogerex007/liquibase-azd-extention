import { Liquibase, LiquibaseConfig, LiquibaseLogLevels, ChecksRunCommandAttributes } from "liquibase";
import * as tl from "azure-pipelines-task-lib/task";
import { PermissionManager } from "../util/permissions";
import { logger } from "../util/logger";
import { LicenseManager } from "../util/licenseManager";
import { ChecksResultAnalyzer, ChecksResult } from "./checksResult";
import { ChecksJarDownloader } from "../util/checksJarDownloader";
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface DatabaseConfig {
  url: string;
  username: string;
  password: string;
  driver?: string;
  classpath?: string;
}

export interface LiquibaseTaskConfig {
  changeLogFile: string;
  database: DatabaseConfig;
  logLevel?: LiquibaseLogLevels;
  context?: string;
  labels?: string;
  tag?: string;
  licenseKey?: string;
  checksSettingsFile?: string;
  generateHtmlReport?: boolean;
}

export class LiquibaseService {
  private liquibase: Liquibase;
  private config: LiquibaseTaskConfig;
  private initialized: boolean = false;
  private jfrogConnection?: string;

  /**
   * Helper para manejar errores de manera consistente
   */
  private handleError(error: unknown, command: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.logCommandResult(command, false, undefined, errorMessage);
    throw error instanceof Error ? error : new Error(String(error));
  }

  constructor(config: LiquibaseTaskConfig, jfrogConnection?: string) {
    this.config = config;
    this.jfrogConnection = jfrogConnection;
    
    const liquibaseConfig: LiquibaseConfig = {
      changeLogFile: config.changeLogFile,
      url: config.database.url,
      username: config.database.username,
      password: config.database.password,
      driver: config.database.driver,
      classpath: config.database.classpath,
      logLevel: config.logLevel || LiquibaseLogLevels.Info
    };

    this.liquibase = new Liquibase(liquibaseConfig);
    
    // Log de configuración de conexión
    logger.logDatabaseConnection(liquibaseConfig);
  }

  /**
   * Obtiene la versión de Liquibase
   */
  private async getLiquibaseVersion(): Promise<string> {
    try {
      const nodeModulesPath = path.resolve(__dirname, "../../../node_modules");
      const liquibaseBinary = path.join(nodeModulesPath, "liquibase", "dist", "liquibase", "liquibase");
      
      if (fs.existsSync(liquibaseBinary)) {
        const versionResult = execSync(`"${liquibaseBinary}" --version`, { 
          encoding: 'utf8',
          env: {
            ...process.env,
            LIQUIBASE_LICENSE_KEY: this.config.licenseKey || process.env.LIQUIBASE_LICENSE_KEY
          }
        });
        return versionResult.trim();
      } else {
        return "Binario de Liquibase no encontrado";
      }
    } catch (error) {
      return `Error obteniendo versión: ${error}`;
    }
  }

  /**
   * Inicializa el servicio aplicando permisos necesarios y configurando licencia Pro
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return; // Ya inicializado
    }
    
    try {
      // Configurar licencia Pro PRIMERO si está disponible
      if (this.config.licenseKey) {
        logger.startStep("license-setup", "Configurando licencia de Liquibase Pro");
        
        const licenseManager = LicenseManager.getInstance();
        const licenseConfigured = await licenseManager.configureLicense({
          licenseKey: this.config.licenseKey,
          databaseUrl: this.config.database.url,
          databaseUsername: this.config.database.username,
          databasePassword: this.config.database.password,
          databaseDriver: this.config.database.driver
        });
        
        if (licenseConfigured) {
          logger.completeStep("completed", undefined, "Licencia Pro configurada exitosamente");
        } else {
          logger.completeStep("failed", "No se pudo configurar la licencia Pro");
        }
      }
      
      // Descargar liquibase-checks.jar si hay conexión JFrog configurada
      if (this.jfrogConnection) {
        logger.startStep("checks-jar-download", "Descargando liquibase-checks.jar desde JFrog");
        try {
          const checksDownloader = new ChecksJarDownloader(this.jfrogConnection);
          const jarPath = await checksDownloader.ensureChecksJarAvailable();
          
          // Verificación adicional después de la descarga
          if (fs.existsSync(jarPath)) {
            const sizeMB = (fs.statSync(jarPath).size / (1024 * 1024)).toFixed(2);
            logger.info(`🔍 Post-descarga: JAR verificado en ${jarPath} (${sizeMB}MB)`);
          }
          
          logger.completeStep("completed", undefined, "JAR liquibase-checks descargado exitosamente");
        } catch (error) {
          logger.completeStep("failed", `Error descargando JAR: ${error}`);
          logger.warning("⚠️ Continuando sin JAR liquibase-checks - comandos Pro pueden fallar");
        }
      } else {
        logger.info("ℹ️ No se especificó conexión JFrog - usando JAR local si existe");
      }

      logger.startStep("permissions", "Aplicando permisos de ejecución");
      
      // Aplicar permisos de ejecución ANTES de verificar versión
      await PermissionManager.fixLiquibasePermissions();
      
      // Verificar que los permisos se aplicaron correctamente
      const permissionsOk = await PermissionManager.verifyPermissions();
      if (!permissionsOk) {
        logger.warning("Los permisos de ejecución no se pudieron aplicar correctamente");
      }
      
      logger.startStep("version-check", "Verificando versión de Liquibase");
      
      // Mostrar versión de Liquibase (ahora CON permisos aplicados)
      const version = await this.getLiquibaseVersion();
      logger.info(`📋 Versión de Liquibase: ${version}`);
      logger.completeStep("completed", undefined, "Versión de Liquibase verificada");
      
      this.initialized = true;
      logger.completeStep("completed", undefined, "Permisos aplicados y servicio inicializado");
      
    } catch (error) {
      logger.warning(`Error durante la inicialización: ${error}`);
      // No lanzar error para permitir que continúe la ejecución
    }
  }

  /**
   * Ejecuta un comando de Liquibase con inicialización automática
   */
  private async executeWithInitialization<T>(command: () => Promise<T>): Promise<T> {
    await this.initialize();
    return await command();
  }

  async update(): Promise<void> {
    try {
      logger.logLiquibaseCommand("update");
      await this.executeWithInitialization(() => this.liquibase.update({}));
      logger.logCommandResult("update", true, "Actualización completada exitosamente");
    } catch (error: any) {
      logger.logCommandResult("update", false, undefined, error?.toString() || 'Error desconocido');
      throw error;
    }
  }

  async updateWithContext(context: string): Promise<void> {
    try {
      logger.logLiquibaseCommand("updateWithContext", { context });
      await this.executeWithInitialization(() => this.liquibase.update({ contexts: context }));
      logger.logCommandResult("updateWithContext", true, `Actualización con contexto '${context}' completada`);
    } catch (error: any) {
      logger.logCommandResult("updateWithContext", false, undefined, error?.toString() || 'Error desconocido');
      throw error;
    }
  }

  async updateWithLabels(labels: string): Promise<void> {
    try {
      logger.logLiquibaseCommand("updateWithLabels", { labels });
      await this.executeWithInitialization(() => this.liquibase.update({ labels }));
      logger.logCommandResult("updateWithLabels", true, `Actualización con etiquetas '${labels}' completada`);
    } catch (error: any) {
      logger.logCommandResult("updateWithLabels", false, undefined, error?.toString() || 'Error desconocido');
      throw error;
    }
  }

  // Métodos necesarios para la estrategia de snapshot
  async tag(tagName: string): Promise<void> {
    try {
      logger.logLiquibaseCommand("tag", { tagName });
      await this.executeWithInitialization(() => this.liquibase.tag({ tag: tagName }));
      logger.logCommandResult("tag", true, `Tag '${tagName}' creado exitosamente`);
    } catch (error: any) {
      logger.logCommandResult("tag", false, undefined, error?.toString() || 'Error desconocido');
      throw error;
    }
  }

  async snapshot(): Promise<void> {
    try {
      logger.logLiquibaseCommand("snapshot");
      await this.executeWithInitialization(() => this.liquibase.snapshot({}));
      logger.logCommandResult("snapshot", true, "Snapshot de la base de datos creado");
    } catch (error: unknown) {
      this.handleError(error, "snapshot");
    }
  }

  async rollback(tag: string): Promise<void> {
    try {
      logger.logLiquibaseCommand("rollback", { tag });
      await this.executeWithInitialization(() => this.liquibase.rollback({ tag }));
      logger.logCommandResult("rollback", true, `Rollback al tag '${tag}' completado`);
    } catch (error: any) {
      logger.logCommandResult("rollback", false, undefined, error?.toString() || 'Error desconocido');
      throw error;
    }
  }

  async status(): Promise<void> {
    try {
      logger.logLiquibaseCommand("status");
      await this.executeWithInitialization(() => this.liquibase.status());
      logger.logCommandResult("status", true, "Estado de la base de datos obtenido");
    } catch (error: any) {
      logger.logCommandResult("status", false, undefined, error?.toString() || 'Error desconocido');
      throw error;
    }
  }

  async validate(): Promise<void> {
    try {
      logger.logLiquibaseCommand("validate");
      await this.executeWithInitialization(() => this.liquibase.validate());
      logger.logCommandResult("validate", true, "Validación del changelog completada exitosamente");
    } catch (error: unknown) {
      this.handleError(error, "validate");
    }
  }

  async checksRun(): Promise<void> {
    try {
      logger.logLiquibaseCommand("checks-run");
      
      await this.executeWithInitialization(async () => {
        logger.info("🚀 Ejecutando comando Pro: checks run");
        
        const nodeModulesPath = path.resolve(__dirname, "../../../node_modules");
        const liquibaseBinary = path.join(nodeModulesPath, "liquibase", "dist", "liquibase", "liquibase");
        
        if (!fs.existsSync(liquibaseBinary)) {
          throw new Error(`Binario de Liquibase no encontrado en: ${liquibaseBinary}`);
        }

        // Construir comando base solo con las flags requeridas
        let command = `"${liquibaseBinary}" checks run --changelog-file="${this.config.changeLogFile}"`;
        
        // Agregar checks-settings-file solo si está especificado
        if (this.config.checksSettingsFile) {
          command += ` --checks-settings-file="${this.config.checksSettingsFile}"`;
        }
        
        let result: string;
        try {
          result = execSync(command, {
            encoding: 'utf8',
            env: {
              ...process.env,
              LIQUIBASE_LICENSE_KEY: this.config.licenseKey || process.env.LIQUIBASE_LICENSE_KEY
            }
          });
        } catch (execError: any) {
          // El comando execSync puede fallar pero aún producir output útil
          if (execError.stdout) {
            result = execError.stdout.toString();
            logger.warning(`⚠️ Comando checks run terminó con código de salida ${execError.status}, pero produjo output`);
          } else {
            throw new Error(`Error ejecutando comando checks run: ${execError.message || execError.toString()}`);
          }
        }
        
        logger.info("✅ Comando checks run ejecutado:");
        logger.info(result.trim());
        
        // Analizar el resultado para determinar si el pipeline debe fallar
        const checksResult = ChecksResultAnalyzer.analyzeChecksResult(result.trim());
        
        // Mostrar resumen detallado de los issues
        const issuesSummary = ChecksResultAnalyzer.generateIssuesSummary(checksResult);
        logger.info(issuesSummary);
        
        // Buscar reportes HTML generados por Liquibase
        const htmlFiles = fs.readdirSync(process.cwd()).filter(file => file.endsWith('.html'));
        
        if (htmlFiles.length > 0) {
          const latestReport = htmlFiles.sort().pop()!;
          const reportPath = path.join(process.cwd(), latestReport);
          const reportSize = fs.statSync(reportPath).size;
          
          logger.info(`📊 Reporte HTML generado por Liquibase: ${latestReport} (${(reportSize / 1024).toFixed(2)} KB)`);
          logger.info(`📁 Ruta del reporte: ${reportPath}`);
          
          // Guardar el archivo del reporte como variable de entorno de Azure DevOps
          tl.setVariable('LIQUIBASE_CHECKS_REPORT', latestReport);
          logger.info(`🔧 Variable de Azure DevOps LIQUIBASE_CHECKS_REPORT=${latestReport}`);
          
          // Publicar el reporte HTML como artefacto de Azure DevOps
          try {
            this.publishHtmlReport(reportPath, latestReport.replace('.html', ''));
            logger.info(`📤 Reporte HTML publicado como artefacto: ${latestReport}`);
          } catch (publishError) {
                          logger.warning(`⚠️ Error publicando reporte HTML: ${publishError}`);
          }
        }
        
        // Si debe fallar, lanzar excepción DESPUÉS de procesar reportes
        if (checksResult.shouldFail) {
          throw new Error(`Pipeline failed due to checks issues: ${checksResult.failureReason}`);
        }
        
        // Log de éxito basado en si hay reporte o no
        if (htmlFiles.length > 0) {
          const latestReport = htmlFiles.sort().pop()!;
          logger.logCommandResult("checks-run", true, ` Verificaciones de Liquibase Pro ejecutadas exitosamente. Reporte HTML disponible: ${latestReport}`);
        } else {
          logger.logCommandResult("checks-run", true, " Verificaciones de Liquibase Pro ejecutadas exitosamente");
        }
      });
      
    } catch (error: unknown) {
      // Usar handleError que ya maneja el logging y re-lanza la excepción
      this.handleError(error, "checks-run");
    }
  }

  /**
   * Ejecuta el comando Pro: checks show
   * Muestra información sobre los checks disponibles y su configuración
   */
  async checksShow(): Promise<void> {
    try {
      logger.logLiquibaseCommand("checks-show");
      
      await this.executeWithInitialization(async () => {
        logger.info("🔍 Ejecutando comando Pro: checks show");
        
        const nodeModulesPath = path.resolve(__dirname, "../../../node_modules");
        const liquibaseBinary = path.join(nodeModulesPath, "liquibase", "dist", "liquibase", "liquibase");
        
        if (!fs.existsSync(liquibaseBinary)) {
          throw new Error(`Binario de Liquibase no encontrado en: ${liquibaseBinary}`);
        }

        // Construir comando base
        let command = `"${liquibaseBinary}" checks show`;
        
        // Agregar checks-settings-file solo si está especificado
        if (this.config.checksSettingsFile) {
          command += ` --checks-settings-file="${this.config.checksSettingsFile}"`;
        }
        
        
        let result: string;
        try {
          result = execSync(command, {
            encoding: 'utf8',
            env: {
              ...process.env,
              LIQUIBASE_LICENSE_KEY: this.config.licenseKey || process.env.LIQUIBASE_LICENSE_KEY
            }
          });
        } catch (execError: any) {
          // El comando execSync puede fallar pero aún producir output útil
          if (execError.stdout) {
            result = execError.stdout.toString();
            logger.warning(`⚠️ Comando checks show terminó con código de salida ${execError.status}, pero produjo output`);
          } else {
            throw new Error(`Error ejecutando comando checks show: ${execError.message || execError.toString()}`);
          }
        }
        
        logger.info("✅ Comando checks show ejecutado:");
        logger.info(result.trim());
        
        // Analizar y mostrar información sobre los checks disponibles
        this.displayChecksInfo(result.trim());
        
        logger.logCommandResult("checks-show", true, " Información de checks de Liquibase Pro mostrada exitosamente");
      });
      
    } catch (error: unknown) {
      // Usar handleError que ya maneja el logging y re-lanza la excepción
      this.handleError(error, "checks-show");
    }
  }

  async diff(): Promise<void> {
    try {
      logger.logLiquibaseCommand("diff");
      await this.executeWithInitialization(() => this.liquibase.diff({}));
      logger.logCommandResult("diff", true, "Comparación de diferencias completada");
    } catch (error: unknown) {
      this.handleError(error, "diff");
    }
  }

  async changelogSync(): Promise<void> {
    try {
      logger.logLiquibaseCommand("changelogSync", { changelogFile: this.config.changeLogFile });
      await this.executeWithInitialization(() => this.liquibase.changelogSync({ changelogFile: this.config.changeLogFile }));
      logger.logCommandResult("changelogSync", true, "Sincronización del changelog completada");
    } catch (error: unknown) {
      this.handleError(error, "changelogSync");
    }
  }

  async changelogSyncSql(): Promise<void> {
    try {
      logger.logLiquibaseCommand("changelogSyncSql");
      await this.executeWithInitialization(() => this.liquibase.changelogSyncSQL());
      logger.logCommandResult("changelogSyncSql", true, "SQL de sincronización generado");
    } catch (error: unknown) {
      this.handleError(error, "changelogSyncSql");
    }
  }

  async clearChecksums(): Promise<void> {
    try {
      logger.logLiquibaseCommand("clearChecksums");
      await this.executeWithInitialization(() => this.liquibase.clearCheckSums());
      logger.logCommandResult("clearChecksums", true, "Checksums limpiados exitosamente");
    } catch (error: unknown) {
      this.handleError(error, "clearChecksums");
    }
  }

  async dbDoc(outputDirectory: string): Promise<void> {
    try {
      logger.logLiquibaseCommand("dbDoc", { outputDirectory });
      await this.executeWithInitialization(() => this.liquibase.dbDoc({ outputDirectory }));
      logger.logCommandResult("dbDoc", true, `Documentación generada en ${outputDirectory}`);
    } catch (error: unknown) {
      this.handleError(error, "dbDoc");
    }
  }



  async generateChangelog(outputFile: string): Promise<void> {
    try {
      logger.logLiquibaseCommand("generateChangelog", { outputFile });
      await this.executeWithInitialization(() => this.liquibase.generateChangeLog({ changelogFile: outputFile }));
      logger.logCommandResult("generateChangelog", true, `Changelog generado en ${outputFile}`);
    } catch (error: unknown) {
      this.handleError(error, "generateChangelog");
    }
  }

  async history(): Promise<void> {
    try {
      logger.logLiquibaseCommand("history");
      await this.executeWithInitialization(() => this.liquibase.history());
      logger.logCommandResult("history", true, "Historial de cambios obtenido");
    } catch (error: unknown) {
      this.handleError(error, "history");
    }
  }

  async listLocks(): Promise<void> {
    try {
      logger.logLiquibaseCommand("listLocks");
      await this.executeWithInitialization(() => this.liquibase.listLocks());
      logger.logCommandResult("listLocks", true, "Locks activos listados");
    } catch (error: unknown) {
      this.handleError(error, "listLocks");
    }
  }

  async releaseLocks(): Promise<void> {
    try {
      logger.logLiquibaseCommand("releaseLocks");
      await this.executeWithInitialization(() => this.liquibase.releaseLocks());
      logger.logCommandResult("releaseLocks", true, "Locks liberados exitosamente");
    } catch (error: unknown) {
      this.handleError(error, "releaseLocks");
    }
  }

  async syncHub(): Promise<void> {
    try {
      logger.logLiquibaseCommand("syncHub");
      await this.executeWithInitialization(() => this.liquibase.syncHub({}));
      logger.logCommandResult("syncHub", true, "Sincronización con Liquibase Hub completada");
    } catch (error: unknown) {
      this.handleError(error, "syncHub");
    }
  }

  async updateSql(): Promise<void> {
    try {
      logger.logLiquibaseCommand("updateSql");
      await this.executeWithInitialization(() => this.liquibase.updateSQL({}));
      logger.logCommandResult("updateSql", true, "SQL de actualización generado");
    } catch (error: unknown) {
      this.handleError(error, "updateSql");
    }
  }

  /**
   * Publica el reporte HTML como artefacto de Azure DevOps
   */
  private publishHtmlReport(reportPath: string, reportName: string): void {
    try {
      // Importar la librería de Azure DevOps
      const tl = require('azure-pipelines-task-lib/task');
      
      // Crear directorio de artefactos en el directorio de staging
      const stagingDirectory = tl.getVariable('Agent.TempDirectory') || tl.getVariable('Build.ArtifactStagingDirectory') || process.cwd();
      const artifactsDir = path.join(stagingDirectory, 'LiquibaseChecksReports');
      
      if (!fs.existsSync(artifactsDir)) {
        fs.mkdirSync(artifactsDir, { recursive: true });
        logger.info(`📁 Directorio de artefactos creado: ${artifactsDir}`);
      }

      // Copiar el reporte al directorio de artefactos
      const artifactPath = path.join(artifactsDir, `${reportName}.html`);
      fs.copyFileSync(reportPath, artifactPath);
      logger.info(`📋 Reporte copiado a: ${artifactPath}`);

      // Verificar que el archivo se copió correctamente
      if (!fs.existsSync(artifactPath)) {
        throw new Error(`Failed to copy report to artifact directory: ${artifactPath}`);
      }

      // Publicar como artefacto de Azure DevOps usando la API correcta
      logger.info(`📤 Publicando artefacto desde: ${artifactsDir}`);
      
      // Usar el comando de Azure DevOps para publicar artefactos
      tl.command('artifact.upload', {
        'artifactname': 'LiquibaseChecksReports',
        'containerfolder': 'LiquibaseChecksReports'
      }, artifactsDir);

              logger.info(`✅ Reporte HTML publicado como artefacto: LiquibaseChecksReports/${reportName}.html`);
      
      // Mostrar información adicional en los logs
      const buildId = process.env.BUILD_BUILDID;
      const projectUrl = process.env.SYSTEM_TEAMFOUNDATIONCOLLECTIONURI;
      const projectName = process.env.SYSTEM_TEAMPROJECT;
      
      if (buildId && projectUrl && projectName) {
        const cleanProjectUrl = projectUrl.endsWith('/') ? projectUrl.slice(0, -1) : projectUrl;
        const reportUrl = `${cleanProjectUrl}/${projectName}/_build/results?buildId=${buildId}&view=artifacts`;
        logger.info(`🔗 Ver artefactos en: ${reportUrl}`);
      }

      // Publicar el HTML como artefacto para acceso directo
      console.log(`##vso[artifact.upload containerfolder=LiquibaseChecksReports;artifactname=LiquibaseChecksReports;]${artifactsDir}`);
      
      // Establecer variables de Azure DevOps para usar con publish-report-html
      console.log(`##vso[task.setvariable variable=LIQUIBASE_REPORT_FILE]${reportPath}`);
      console.log(`##vso[task.setvariable variable=LIQUIBASE_REPORT_NAME]${reportName}`);
      
      logger.info(`✅ Reporte HTML generado: ${reportName}.html`);
      logger.info(`💡 Para mostrar en Azure DevOps, agregue después del checks run:`);
      logger.info(`   - task: publish-report-html@0`);
      logger.info(`     inputs: { reportName: 'liquibase-checks', htmlPath: '$(LIQUIBASE_REPORT_FILE)' }`);
      
    } catch (error) {
      logger.warning(`⚠️ Error publicando reporte HTML: ${error}`);
      
      // Fallback: intentar publicar usando el método alternativo
      try {
        const tl = require('azure-pipelines-task-lib/task');
        tl.uploadArtifact('LiquibaseChecksReports', reportPath, reportName);
        logger.info(`✅ Reporte publicado usando método alternativo: ${reportName}`);
      } catch (fallbackError) {
                  logger.warning(`⚠️ Error en método alternativo: ${fallbackError}`);
      }
    }
  }

  /**
   * Muestra un resumen del reporte HTML en los logs
   */
  private displayReportSummary(reportContent: string): void {
    try {
      // Extraer información básica del reporte HTML
      const titleMatch = reportContent.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1] : 'Checks Run Report';

      // Buscar información sobre issues encontrados
      const issuesMatch = reportContent.match(/issueCount["\s]*:["\s]*(\d+)/i);
      const issueCount = issuesMatch ? parseInt(issuesMatch[1]) : 0;

      // Buscar información sobre checks ejecutados
      const checksMatch = reportContent.match(/executedChecksCount["\s]*:["\s]*(\d+)/i);
      const checksCount = checksMatch ? parseInt(checksMatch[1]) : 0;

      // Buscar información sobre changesets validados
      const changesetsMatch = reportContent.match(/changesetsValidatedCount["\s]*:["\s]*(\d+)/i);
      const changesetsCount = changesetsMatch ? parseInt(changesetsMatch[1]) : 0;

      logger.info(`📋 Resumen del Reporte HTML:`);
      logger.info(`   📄 Título: ${title}`);
      logger.info(`   🔍 Checks ejecutados: ${checksCount}`);
      logger.info(`   📝 Changesets validados: ${changesetsCount}`);
      logger.info(`   ⚠️ Issues encontrados: ${issueCount}`);

      if (issueCount > 0) {
        logger.warning(`⚠️ Se encontraron ${issueCount} issues que requieren atención`);
        
        // Mostrar información sobre la configuración de fallo
        logger.info(`   ⚙️ Configuración de fallo:`);
        logger.info(`      - El pipeline fallará automáticamente solo con issues de severidad 3 (CRITICAL) o 4 (BLOCKER)`);
      } else {
        logger.info(`✅ No se encontraron issues críticos`);
      }

    } catch (error) {
      logger.warning(`⚠️ Error mostrando resumen del reporte: ${error}`);
    }
  }

  /**
   * Obtiene el nombre de la severidad
   */
  private getSeverityName(severity: number): string {
    const severityNames = {
      0: 'INFO',
      1: 'MINOR',
      2: 'MAJOR',
      3: 'CRITICAL',
      4: 'BLOCKER'
    };
    return severityNames[severity as keyof typeof severityNames] || 'UNKNOWN';
  }

  /**
   * Analiza y muestra información sobre los checks disponibles
   */
  private displayChecksInfo(checksOutput: string): void {
    try {
      logger.info(`📋 Información de Checks Disponibles:`);
      
      // Buscar información sobre checks habilitados/deshabilitados
      const enabledChecksMatch = checksOutput.match(/Enabled Checks:\s*(\d+)/i);
      const disabledChecksMatch = checksOutput.match(/Disabled Checks:\s*(\d+)/i);
      const totalChecksMatch = checksOutput.match(/Total Checks:\s*(\d+)/i);
      
      if (enabledChecksMatch) {
        logger.info(`   ✅ Checks habilitados: ${enabledChecksMatch[1]}`);
      }
      
      if (disabledChecksMatch) {
        logger.info(`   ❌ Checks deshabilitados: ${disabledChecksMatch[1]}`);
      }
      
      if (totalChecksMatch) {
        logger.info(`   📊 Total de checks: ${totalChecksMatch[1]}`);
      }
      
      // Buscar información sobre categorías de checks
      const categoriesMatch = checksOutput.match(/Categories:\s*(.+)/i);
      if (categoriesMatch) {
        logger.info(`   🏷️ Categorías disponibles: ${categoriesMatch[1].trim()}`);
      }
      
      // Buscar información sobre checks específicos
      const checkLines = checksOutput.split('\n').filter(line => 
        line.includes('Check:') || line.includes('Name:') || line.includes('Severity:')
      );
      
      if (checkLines.length > 0) {
        logger.info(`   🔍 Checks específicos encontrados:`);
        checkLines.slice(0, 10).forEach(line => { // Mostrar solo los primeros 10
          const cleanLine = line.trim().replace(/^\s*[-*]\s*/, '');
          if (cleanLine) {
            logger.info(`      • ${cleanLine}`);
          }
        });
        
        if (checkLines.length > 10) {
          logger.info(`      ... y ${checkLines.length - 10} más`);
        }
      }
      
      // Buscar información sobre configuración
      const configMatch = checksOutput.match(/Configuration File:\s*(.+)/i);
      if (configMatch) {
        logger.info(`   ⚙️ Archivo de configuración: ${configMatch[1].trim()}`);
      }
      
      // Mostrar información sobre licencia Pro
      if (checksOutput.includes('Pro Checks')) {
        logger.info(`   🔑 Funcionalidades Pro detectadas`);
      }
      
    } catch (error) {
      logger.warning(`⚠️ Error analizando información de checks: ${error}`);
    }
  }

}