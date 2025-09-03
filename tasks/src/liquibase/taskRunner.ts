import * as tl from "azure-pipelines-task-lib/task";
import { LiquibaseService, LiquibaseTaskConfig } from "./liquibase";
import { LiquibaseConfigBuilder, TaskInputs } from "./config";
import { SnapshotRollbackStrategy, RollbackStrategy } from "./snapshotRollbackStrategy";
import { logger } from "../util/logger";
import { LicenseChecker } from "../util/licenseChecker";

export class LiquibaseTaskRunner {
  private service: LiquibaseService;
  private inputs: TaskInputs;
  private snapshotStrategy?: SnapshotRollbackStrategy;
  private config: LiquibaseTaskConfig;

  constructor(service: LiquibaseService, inputs: TaskInputs, config: LiquibaseTaskConfig) {
    this.service = service;
    this.inputs = inputs;
    this.config = config;
  }

  async execute(): Promise<void> {
    const command = this.inputs.command.toLowerCase();
    
    logger.startStep("execution", `Ejecutando comando: ${command.toUpperCase()}`);
    
    try {
      // Execute with original service
      switch (command) {
        case "update":
          await this.service.update();
          break;
          
        case "updatewithcontext":
          if (!this.inputs.context) {
            throw new Error("El contexto es requerido para el comando updateWithContext");
          }
          await this.service.updateWithContext(this.inputs.context);
          break;
          
        case "updatewithlabels":
          if (!this.inputs.labels) {
            throw new Error("Las etiquetas son requeridas para el comando updateWithLabels");
          }
          await this.service.updateWithLabels(this.inputs.labels);
          break;
          
        case "status":
          await this.service.status();
          break;
          
        case "validate":
          await this.service.validate();
          break;
          
        case "checksrun":
          await this.service.checksRun();
          break;
          
        case "checksshow":
          await this.service.checksShow();
          break;
          
        case "diff":
          await this.service.diff();
          break;
          
        case "changelogsync":
          await this.service.changelogSync();
          break;
          
        case "changelogsyncsql":
          await this.service.changelogSyncSql();
          break;
          
        case "clearchecksums":
          await this.service.clearChecksums();
          break;
          
        case "dbdoc":
          if (!this.inputs.outputDirectory) {
            throw new Error("El directorio de salida es requerido para el comando dbDoc");
          }
          await this.service.dbDoc(this.inputs.outputDirectory);
          break;
          
        case "generatechangelog":
          if (!this.inputs.outputFile) {
            throw new Error("El archivo de salida es requerido para el comando generateChangelog");
          }
          await this.service.generateChangelog(this.inputs.outputFile);
          break;
          
        case "history":
          await this.service.history();
          break;
          
        case "listlocks":
          await this.service.listLocks();
          break;
          
        case "releaselocks":
          await this.service.releaseLocks();
          break;
          
        case "synchub":
          await this.service.syncHub();
          break;
          
        case "updatesql":
          await this.service.updateSql();
          break;
          
        // Comandos de Snapshot Rollback Strategy
        case "autosnapshot":
          await this.executeAutoSnapshot();
          break;
          
        case "rollbackwithsnapshot":
          await this.executeRollbackWithSnapshot();
          break;
          
        case "listsnapshots":
          await this.listSnapshots();
          break;
          
        case "validatesnapshot":
          await this.validateSnapshot();
          break;
          
        case "checklicense":
          await this.checkLicense();
          break;
          
        default:
          throw new Error(`Comando no soportado: ${command}`);
      }
      
      logger.completeStep("completed", undefined, `Comando ${command.toUpperCase()} ejecutado exitosamente`);
      
    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error desconocido');
      throw error;
    }
  }

  /**
   * Executes automatic snapshot before critical changes
   */
  private async executeAutoSnapshot(): Promise<void> {
    try {
      if (!this.inputs.snapshotDescription) {
        throw new Error("La descripción del snapshot es requerida para el comando autoSnapshot");
      }

      const snapshotStrategy = this.getSnapshotStrategy();
      const metadata = await snapshotStrategy.createAutoSnapshot(this.inputs.snapshotDescription);
      
      tl.setResult(tl.TaskResult.Succeeded, `Auto snapshot creado exitosamente: ${metadata.id}`);
      
    } catch (error) {
      tl.error(`La ejecución del auto snapshot falló: ${error}`);
      throw error;
    }
  }

  /**
   * Executes rollback using snapshot strategy
   */
  private async executeRollbackWithSnapshot(): Promise<void> {
    try {
      if (!this.inputs.rollbackStrategy) {
        throw new Error("La estrategia de rollback es requerida para el comando rollbackWithSnapshot");
      }

      const snapshotStrategy = this.getSnapshotStrategy();
      const strategy: RollbackStrategy = JSON.parse(this.inputs.rollbackStrategy);
      
      await snapshotStrategy.executeRollback(strategy);
      
      tl.setResult(tl.TaskResult.Succeeded, `Rollback con estrategia de snapshot ejecutado exitosamente`);
      
    } catch (error) {
      tl.error(`La ejecución del rollback con snapshot falló: ${error}`);
      throw error;
    }
  }

  /**
   * Lists all available snapshots
   */
  private async listSnapshots(): Promise<void> {
    try {
      const snapshotStrategy = this.getSnapshotStrategy();
      const snapshots = await snapshotStrategy.listSnapshots();
      
      tl.debug(`Encontrados ${snapshots.length} snapshots:`);
      snapshots.forEach(snapshot => {
        tl.debug(`- ${snapshot.id}: ${snapshot.description} (${snapshot.timestamp})`);
      });
      
      tl.setResult(tl.TaskResult.Succeeded, `${snapshots.length} snapshots listados exitosamente`);
      
    } catch (error) {
      tl.error(`La ejecución de listar snapshots falló: ${error}`);
      throw error;
    }
  }

  /**
   * Validates a specific snapshot
   */
  private async validateSnapshot(): Promise<void> {
    try {
      if (!this.inputs.snapshotId) {
        throw new Error("El ID del snapshot es requerido para el comando validateSnapshot");
      }

      const snapshotStrategy = this.getSnapshotStrategy();
      const snapshots = await snapshotStrategy.listSnapshots();
      const snapshot = snapshots.find(s => s.id === this.inputs.snapshotId);
      
      if (!snapshot) {
        throw new Error(`Snapshot no encontrado: ${this.inputs.snapshotId}`);
      }
      
      // Validate compatibility
      await snapshotStrategy.validateSnapshotCompatibility(snapshot);
      
      tl.setResult(tl.TaskResult.Succeeded, `Snapshot ${this.inputs.snapshotId} validado exitosamente`);
      
    } catch (error) {
      tl.error(`La validación del snapshot falló: ${error}`);
      throw error;
    }
  }

  /**
   * Gets the SnapshotRollbackStrategy instance
   */
  private getSnapshotStrategy(): SnapshotRollbackStrategy {
    if (!this.snapshotStrategy) {
      this.snapshotStrategy = new SnapshotRollbackStrategy(this.config, this.inputs.snapshotsDirectory);
    }
    return this.snapshotStrategy;
  }

  static async createFromInputs(inputs: TaskInputs, databaseCredentials: any): Promise<LiquibaseTaskRunner> {
    const configBuilder = new LiquibaseConfigBuilder(inputs, databaseCredentials);
    const config = configBuilder.buildConfig();
    const service = new LiquibaseService(config, inputs.jfrogConnection);
    return new LiquibaseTaskRunner(service, inputs, config);
  }

  /**
   * Verifica el estado de la licencia de Liquibase Pro
   */
  private async checkLicense(): Promise<void> {
    try {
      logger.startStep("license-check", "Verificando estado de licencia de Liquibase Pro");
      
      const licenseChecker = new LicenseChecker(this.inputs.licenseKey);
      const licenseInfo = await licenseChecker.checkLicense();
      
      // Generar reporte detallado
      LicenseChecker.generateLicenseReport(licenseInfo, this.inputs.motor, this.inputs.command);
      
      // Mostrar información específica del comando
      if (LicenseChecker.isProCommand(this.inputs.command)) {
        if (licenseInfo.isPro) {
          logger.info(`✅ Comando ${this.inputs.command} ejecutándose con Liquibase Pro`);
        } else {
          logger.warning(`⚠️ Comando ${this.inputs.command} requiere Liquibase Pro pero no está disponible`);
        }
      }
      
      logger.completeStep("completed", undefined, "Verificación de licencia completada");
      
    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error verificando licencia');
      throw error;
    }
  }
} 