import * as tl from "azure-pipelines-task-lib/task";
import { logger } from "./logger";
import { LicenseManager } from "./licenseManager";

export interface LicenseInfo {
  isPro: boolean;
  licenseKey?: string;
  licenseValid: boolean;
  errorMessage?: string;
}

export class LicenseChecker {
  private licenseKey?: string;

  constructor(licenseKey?: string) {
    this.licenseKey = licenseKey;
  }

  /**
   * Verifica si la licencia Pro está configurada y disponible
   */
  async checkLicense(): Promise<LicenseInfo> {
    logger.startStep("license-check", "Verificando licencia de Liquibase Pro");
    
    try {
      const licenseInfo: LicenseInfo = {
        isPro: false,
        licenseValid: false
      };

      // Debug: mostrar si se recibió licenseKey
      if (this.licenseKey) {
        logger.info(`🔑 LicenseKey recibida en constructor: ${this.licenseKey.substring(0, 8)}...`);
      } else {
        logger.info("🔑 No se recibió licenseKey en constructor");
      }

      // Primero verificar si Liquibase ya tiene la licencia configurada
      const licenseManager = LicenseManager.getInstance();
      logger.info("🔍 Verificando configuración de licencia en el sistema...");
      const licenseConfigured = await licenseManager.verifyLicenseConfiguration();
      
      if (licenseConfigured) {
        licenseInfo.isPro = true;
        licenseInfo.licenseValid = true;
        
        logger.info("✅ Licencia Pro detectada y configurada en el sistema");
        logger.completeStep("completed", undefined, "Liquibase Pro detectado y validado");
        return licenseInfo;
      }

      // Si no hay licencia configurada en el sistema, verificar si se pasa como parámetro
      if (!this.licenseKey) {
        logger.info("No se encontró licencia Pro configurada en el sistema");
        logger.completeStep("completed", undefined, "Sin licencia Pro configurada");
        return licenseInfo;
      }
      
      logger.info("🔑 LicenseKey disponible, verificando formato...");

      // Verificar formato de licencia
      logger.info("🔍 Verificando formato de licencia...");
      if (!this.isValidLicenseFormat(this.licenseKey)) {
        logger.warning("❌ Formato de licencia inválido");
        logger.info("Para configurar la licencia Pro, use una de estas opciones:");
        logger.info("1. Variable de entorno: LIQUIBASE_LICENSE_KEY=your-license-key");
        logger.info("2. Archivo liquibase.properties: liquibase.licenseKey=your-license-key");
        licenseInfo.errorMessage = "Invalid license key format";
        logger.completeStep("completed", undefined, "Formato de licencia inválido");
        return licenseInfo;
      }
      
      logger.info("✅ Formato de licencia válido");

      // Si se pasa una licencia como parámetro, intentar configurarla
      if (this.licenseKey && this.isValidLicenseFormat(this.licenseKey)) {
        logger.info("🔧 Configurando licencia Pro desde parámetro...");
        const configured = await licenseManager.configureLicense({ licenseKey: this.licenseKey });
        
        if (configured) {
          logger.info("✅ Licencia configurada exitosamente, verificando...");
          // Verificar nuevamente después de la configuración
          const reVerified = await licenseManager.verifyLicenseConfiguration();
          
          if (reVerified) {
            licenseInfo.isPro = true;
            licenseInfo.licenseKey = this.maskLicenseKey(this.licenseKey);
            licenseInfo.licenseValid = true;
            
            logger.info("🎉 Licencia Pro configurada y validada correctamente desde parámetro");
            logger.completeStep("completed", undefined, "Liquibase Pro configurado y validado desde parámetro");
            return licenseInfo;
          } else {
            logger.warning("⚠️ Licencia configurada pero no verificada en el sistema");
          }
        } else {
          logger.warning("❌ No se pudo configurar la licencia Pro desde parámetro");
        }
      }

      // Log final del estado de la licencia
      logger.info(`📊 Estado final de licencia: isPro=${licenseInfo.isPro}, licenseValid=${licenseInfo.licenseValid}`);
      return licenseInfo;

    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error al verificar licencia');
      return {
        isPro: false,
        licenseValid: false,
        errorMessage: error?.message || 'Unknown error during license check'
      };
    }
  }

  /**
   * Verifica si los comandos Pro están disponibles
   */
  private async checkProCommandsAvailability(): Promise<boolean> {
    try {
      logger.startStep("pro-commands-check", "Verificando disponibilidad de comandos Pro");
      
      // Lista de comandos Pro que podemos verificar
      const proCommands = [
        'checksRun',
        'syncHub',
        'diff-changelog'
      ];

      let availableCommands = 0;
      const totalCommands = proCommands.length;

      for (const command of proCommands) {
        try {
          // Intentar verificar si el comando existe
          const exists = await this.checkCommandExists(command);
          if (exists) {
            availableCommands++;
            logger.info(`Comando Pro disponible: ${command}`);
          } else {
            logger.info(`Comando Pro no disponible: ${command}`);
          }
        } catch (error) {
          logger.info(`Error verificando comando ${command}: ${error}`);
        }
      }

      const proAvailable = availableCommands > 0;
      
      logger.completeStep("completed", undefined, 
        `${availableCommands}/${totalCommands} comandos Pro disponibles`);
      
      return proAvailable;

    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error verificando comandos Pro');
      return false;
    }
  }

  /**
   * Verifica si un comando específico existe
   */
  private async checkCommandExists(command: string): Promise<boolean> {
    try {
      // Esta es una verificación básica - en una implementación real
      // podrías verificar contra la API de Liquibase
      const { Liquibase } = require('liquibase');
      
      // Verificar si el método existe en la instancia de Liquibase
      const liquibaseInstance = new Liquibase({});
      return typeof (liquibaseInstance as any)[command] === 'function';
      
    } catch (error) {
      return false;
    }
  }

  /**
   * Valida el formato de la licencia
   */
  private isValidLicenseFormat(licenseKey: string): boolean {
    // Verificación básica de formato de licencia
    // Las licencias de Liquibase Pro suelen tener un formato específico
    if (!licenseKey || licenseKey.length < 10) {
      return false;
    }

    // Verificar que no contenga caracteres inválidos
    // Las licencias de Liquibase Pro pueden contener caracteres base64: A-Z, a-z, 0-9, +, /, =
    const validChars = /^[A-Za-z0-9\-_+/=]+$/;
    return validChars.test(licenseKey);
  }

  /**
   * Enmascara la licencia para logging seguro
   */
  private maskLicenseKey(licenseKey: string): string {
    if (!licenseKey || licenseKey.length < 8) {
      return '******';
    }
    
    const visibleChars = 4;
    const maskedChars = licenseKey.length - visibleChars;
    const visible = licenseKey.substring(0, visibleChars);
    const masked = '*'.repeat(maskedChars);
    
    return `${visible}${masked}`;
  }

  /**
   * Verifica si un motor específico requiere licencia Pro
   */
  static isProMotor(motor: string): boolean {
    const proMotors = ['snowflake', 'bigquery'];
    return proMotors.includes(motor.toLowerCase());
  }

  /**
   * Verifica si un comando específico requiere licencia Pro
   */
  static isProCommand(command: string): boolean {
    const proCommands = [
      'checksrun',
      'synchub',
      'diff-changelog',
      'update-testing-rollback'
    ];
    return proCommands.includes(command.toLowerCase());
  }

  /**
   * Genera un reporte detallado de la licencia
   */
  static generateLicenseReport(licenseInfo: LicenseInfo, motor: string, command: string): void {
    logger.startStep("license-report", "Generando reporte de licencia");
    
    const isProMotor = LicenseChecker.isProMotor(motor);
    const isProCommand = LicenseChecker.isProCommand(command);
    
    logger.info("Reporte de Licencia Liquibase", {
      isPro: licenseInfo.isPro,
      licenseValid: licenseInfo.licenseValid,

      motor: motor,
      command: command,
      motorRequiresPro: isProMotor,
      commandRequiresPro: isProCommand,
      licenseKey: licenseInfo.licenseKey || 'No configurada'
    });

    // Advertencias específicas
    if (isProMotor && !licenseInfo.isPro) {
      logger.warning(`El motor ${motor} requiere Liquibase Pro`);
    }

    if (isProCommand && !licenseInfo.isPro) {
      logger.warning(`El comando ${command} requiere Liquibase Pro`);
    }

    if (licenseInfo.errorMessage) {
      logger.warning(`Error de licencia: ${licenseInfo.errorMessage}`);
    }

    logger.completeStep("completed", undefined, "Reporte de licencia generado");
  }
}
