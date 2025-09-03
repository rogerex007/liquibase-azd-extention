import * as tl from "azure-pipelines-task-lib/task";

export interface LogStep {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'started' | 'completed' | 'failed';
  details?: string;
  error?: string;
}

export interface LoggerConfig {
  logLevel: 'info' | 'warning' | 'error' | 'debug';
}

export class EnhancedLogger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig = { logLevel: 'info' }) {
    this.config = config;
    this.log(`🚀 [LIQUIBASE-TASK] Iniciando tarea de Liquibase - ${new Date().toISOString()}`);
  }

  private shouldLog(level: 'info' | 'warning' | 'error' | 'debug'): boolean {
    const levels = { error: 0, warning: 1, info: 2, debug: 3 };
    return levels[level] <= levels[this.config.logLevel];
  }

  startStep(name: string, details?: string): void {
    if (this.shouldLog('debug')) {
      const message = details ? `[${name.toUpperCase()}] Starting - ${details}` : `[${name.toUpperCase()}] Starting...`;
      this.log(message);
    }
  }

  completeStep(status: 'completed' | 'failed', error?: string, details?: string): void {
    if (status === 'failed' && error) {
      this.error(error);
    } else if (details && this.shouldLog('info')) {
      this.info(details);
    }
  }

  info(message: string, data?: any): void {
    if (!this.shouldLog('info')) return;
    
    let logMessage = `[INFO] ${message}`;
    if (data && this.shouldLog('debug')) {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }
    this.log(logMessage);
  }

  warning(message: string, data?: any): void {
    if (!this.shouldLog('warning')) return;
    
    let logMessage = `[WARNING] ${message}`;
    if (data && this.shouldLog('debug')) {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }
    this.log(logMessage);
  }

  error(message: string, error?: any): void {
    if (!this.shouldLog('error')) return;
    
    let logMessage = `[ERROR] ${message}`;
    if (error) {
      logMessage += `\nError: ${error}`;
    }
    this.log(logMessage);
  }

  logConfiguration(config: any, sensitiveFields: string[] = ['password', 'token', 'key']): void {
    if (!this.shouldLog('debug')) return;
    
    const sanitizedConfig = this.sanitizeConfig(config, sensitiveFields);
    this.info("Configuración de la tarea:", sanitizedConfig);
  }

  // Performance metrics removed for cleaner output

  logSummary(): void {
    if (this.shouldLog('info')) {
      this.log('[SUMMARY] Ejecución de la tarea completada');
    }
  }

  logDatabaseConnection(config: any): void {
    if (!this.shouldLog('debug')) return;
    
    this.log('[DATABASE] Configuración de conexión:');
    const connectionInfo = {
      url: config.url,
      username: config.username,
      driver: config.driver
    };
    this.log(JSON.stringify(connectionInfo, null, 2));
  }



  logLiquibaseCommand(command: string, params?: any): void {
    let message = `[LIQUIBASE] Ejecutando comando: ${command.toUpperCase()}`;
    
    if (params && this.shouldLog('debug')) {
      message += `\nParámetros: ${JSON.stringify(params)}`;
    }

    this.log(message);
  }

  logCommandResult(command: string, success: boolean, output?: string, error?: string): void {
    let message = `[LIQUIBASE] Comando ${command.toUpperCase()} ${success ? 'EJECUTADO EXITOSAMENTE' : 'FALLÓ'}`;
    
    if (output && this.shouldLog('debug')) {
      message += `\nSalida: ${output}`;
    }
    
    if (error) {
      message += `\nError: ${error}`;
    }

    this.log(message);
  }



  private sanitizeConfig(config: any, sensitiveFields: string[]): any {
    const sanitized = { ...config };
    
    sensitiveFields.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '******';
      }
    });
    
    return sanitized;
  }

  private log(message: string): void {
    // Usar console.log para que los mensajes se muestren en Azure DevOps
    console.log(message);
  }

  /**
   * Configura el logger
   */
  setConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtiene la configuración actual del logger
   */
  getConfig(): LoggerConfig {
    return { ...this.config };
  }
}

// Instancia global del logger
export const logger = new EnhancedLogger();

// Función para configurar el logger globalmente
export function configureLogger(config: Partial<LoggerConfig>): void {
  logger.setConfig(config);
}
