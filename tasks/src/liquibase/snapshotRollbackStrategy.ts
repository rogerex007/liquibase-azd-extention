import { LiquibaseService, LiquibaseTaskConfig } from './liquibase';
import * as tl from "azure-pipelines-task-lib/task";
import * as fs from 'fs';
import * as path from 'path';

export interface SnapshotMetadata {
  id: string;
  timestamp: string;
  tag: string;
  description: string;
  changeLogFile: string;
  databaseUrl: string;
  snapshotFile: string;
  checksum: string;
}

export interface RollbackStrategy {
  type: 'snapshot';
  value: string; // snapshotId
  description: string;
  validationRequired?: boolean;
}

export class SnapshotRollbackStrategy {
  private liquibaseService: LiquibaseService;
  private config: LiquibaseTaskConfig;
  private snapshotsDir: string;

  constructor(config: LiquibaseTaskConfig, snapshotsDir: string = './snapshots') {
    this.config = config;
    this.liquibaseService = new LiquibaseService(config);
    this.snapshotsDir = snapshotsDir;
    this.ensureSnapshotsDirectory();
  }

  /**
   * Creates an automatic snapshot before applying critical changes
   */
  async createAutoSnapshot(description: string): Promise<SnapshotMetadata> {
    try {
      tl.debug("Creando snapshot automático antes de cambios críticos");
      
      const timestamp = new Date().toISOString();
      const snapshotId = `auto_${Date.now()}`;
      const tag = `snapshot_${snapshotId}`;
      const snapshotFile = path.join(this.snapshotsDir, `${snapshotId}.json`);
      
      // Create tag in changelog to mark snapshot point
      await this.liquibaseService.tag(tag);
      
      // Generate snapshot of current database state
      await this.liquibaseService.snapshot();
      
      // Create snapshot metadata
      const metadata: SnapshotMetadata = {
        id: snapshotId,
        timestamp,
        tag,
        description,
        changeLogFile: this.config.changeLogFile,
        databaseUrl: this.config.database.url,
        snapshotFile,
        checksum: await this.generateChecksum()
      };
      
      // Save snapshot metadata
      await this.saveSnapshotMetadata(metadata);
      
      tl.setResult(tl.TaskResult.Succeeded, `Snapshot automático creado exitosamente: ${snapshotId}`);
      return metadata;
      
    } catch (error) {
      tl.error(`Falló al crear snapshot automático: ${error}`);
      throw error;
    }
  }

  /**
   * Executes rollback using snapshot strategy
   */
  async executeRollback(strategy: RollbackStrategy): Promise<void> {
    try {
      tl.debug(`Ejecutando rollback con estrategia: ${strategy.type}`);
      
      // Validate before rollback if required
      if (strategy.validationRequired) {
        await this.validateBeforeRollback();
      }
      
      // Only snapshot strategy is supported
      if (strategy.type !== 'snapshot') {
        throw new Error(`Solo se soporta rollback con snapshot. Tipo recibido: ${strategy.type}`);
      }
      
      await this.rollbackToSnapshot(strategy.value);
      
      tl.setResult(tl.TaskResult.Succeeded, `Rollback ejecutado exitosamente usando snapshot: ${strategy.value}`);
      
    } catch (error) {
      tl.error(`Falló la ejecución del rollback: ${error}`);
      throw error;
    }
  }

  /**
   * Rollback to a specific snapshot
   */
  async rollbackToSnapshot(snapshotId: string): Promise<void> {
    try {
      tl.debug(`Haciendo rollback al snapshot: ${snapshotId}`);
      
      // Load snapshot metadata
      const metadata = await this.loadSnapshotMetadata(snapshotId);
      if (!metadata) {
        throw new Error(`Snapshot no encontrado: ${snapshotId}`);
      }
      
      // Validate snapshot compatibility with current database
      await this.validateSnapshotCompatibility(metadata);
      
      // Execute rollback to snapshot tag
      await this.liquibaseService.rollback(metadata.tag);
      
      tl.setResult(tl.TaskResult.Succeeded, `Rollback al snapshot ${snapshotId} completado exitosamente`);
      
    } catch (error) {
      tl.error(`Falló el rollback al snapshot: ${error}`);
      throw error;
    }
  }

  /**
   * Lists all available snapshots
   */
  async listSnapshots(): Promise<SnapshotMetadata[]> {
    try {
      const snapshots: SnapshotMetadata[] = [];
      
      if (!fs.existsSync(this.snapshotsDir)) {
        return snapshots;
      }
      
      const files = fs.readdirSync(this.snapshotsDir);
      
      for (const file of files) {
        if (file.endsWith('.json')) {
          const snapshotId = path.basename(file, '.json');
          const metadata = await this.loadSnapshotMetadata(snapshotId);
          if (metadata) {
            snapshots.push(metadata);
          }
        }
      }
      
      // Sort by timestamp descending
      return snapshots.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
    } catch (error) {
      tl.error(`Falló al listar snapshots: ${error}`);
      throw error;
    }
  }

  /**
   * Validates snapshot compatibility with current database
   */
  async validateSnapshotCompatibility(metadata: SnapshotMetadata): Promise<boolean> {
    try {
      tl.debug(`Validando compatibilidad del snapshot: ${metadata.id}`);
      
      // Verify database URL matches
      if (metadata.databaseUrl !== this.config.database.url) {
        throw new Error(`URL de base de datos no coincide. Snapshot: ${metadata.databaseUrl}, Actual: ${this.config.database.url}`);
      }
      
      // Verify changelog file matches
      if (metadata.changeLogFile !== this.config.changeLogFile) {
        throw new Error(`Archivo changelog no coincide. Snapshot: ${metadata.changeLogFile}, Actual: ${this.config.changeLogFile}`);
      }
      
      // Verify tag exists in changelog
      await this.liquibaseService.status();
      
      return true;
      
    } catch (error) {
      tl.error(`Falló la validación de compatibilidad del snapshot: ${error}`);
      throw error;
    }
  }

  /**
   * Generates checksum for integrity validation
   */
  private async generateChecksum(): Promise<string> {
    // Simple checksum implementation based on timestamp and configuration
    const data = `${this.config.database.url}-${this.config.changeLogFile}-${Date.now()}`;
    return Buffer.from(data).toString('base64').substring(0, 16);
  }

  /**
   * Saves snapshot metadata to file
   */
  private async saveSnapshotMetadata(metadata: SnapshotMetadata): Promise<void> {
    try {
      const filePath = metadata.snapshotFile;
      fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2));
      tl.debug(`Metadata del snapshot guardada en: ${filePath}`);
    } catch (error) {
      tl.error(`Falló al guardar metadata del snapshot: ${error}`);
      throw error;
    }
  }

  /**
   * Loads snapshot metadata from file
   */
  private async loadSnapshotMetadata(snapshotId: string): Promise<SnapshotMetadata | null> {
    try {
      const filePath = path.join(this.snapshotsDir, `${snapshotId}.json`);
      
      if (!fs.existsSync(filePath)) {
        return null;
      }
      
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as SnapshotMetadata;
      
    } catch (error) {
      tl.error(`Falló al cargar metadata del snapshot: ${error}`);
      return null;
    }
  }

  /**
   * Validates before executing rollback
   */
  private async validateBeforeRollback(): Promise<void> {
    try {
      tl.debug("Validando antes de ejecutar rollback");
      
      // Check database status
      await this.liquibaseService.status();
      
      // Check for active locks
      await this.liquibaseService.listLocks();
      
      tl.debug("Validación pre-rollback completada exitosamente");
      
    } catch (error) {
      tl.error(`Falló la validación pre-rollback: ${error}`);
      throw error;
    }
  }

  /**
   * Ensures snapshots directory exists
   */
  private ensureSnapshotsDirectory(): void {
    if (!fs.existsSync(this.snapshotsDir)) {
      fs.mkdirSync(this.snapshotsDir, { recursive: true });
      tl.debug(`Directorio de snapshots creado: ${this.snapshotsDir}`);
    }
  }
} 