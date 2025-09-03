import * as fs from 'fs';
import * as path from 'path';
import { logger } from './logger';

export interface LicenseConfig {
  licenseKey: string;
  databaseUrl?: string;
  databaseUsername?: string;
  databasePassword?: string;
  databaseDriver?: string;
}

export class LicenseManager {
  private static instance: LicenseManager;
  private configured: boolean = false;

  private constructor() {}

  static getInstance(): LicenseManager {
    if (!LicenseManager.instance) {
      LicenseManager.instance = new LicenseManager();
    }
    return LicenseManager.instance;
  }

  /**
   * Configura la licencia Pro usando múltiples métodos
   */
  async configureLicense(config: LicenseConfig): Promise<boolean> {
    if (this.configured) {
      logger.info("License already configured");
      return true;
    }

    try {
      logger.startStep("license-config", "Configuring Liquibase Pro license");
      
      let successCount = 0;
      const totalMethods = 3;

      // Método 1: Variable de entorno
      if (this.setEnvironmentVariable(config.licenseKey)) {
        successCount++;
        logger.info("✅ Variable de entorno configurada: LIQUIBASE_LICENSE_KEY");
      }

      // Método 2: Archivo liquibase.properties
      if (await this.createPropertiesFile(config)) {
        successCount++;
        logger.info("✅ Archivo liquibase.properties creado");
      }

      // Método 3: Archivo .env (si existe)
      if (await this.updateEnvFile(config.licenseKey)) {
        successCount++;
        logger.info("✅ Archivo .env actualizado");
      }

      this.configured = true;

      if (successCount > 0) {
        logger.completeStep("completed", undefined, 
          `${successCount}/${totalMethods} métodos de configuración exitosos`);
        return true;
      } else {
        logger.completeStep("failed", "No se pudo configurar la licencia con ningún método");
        return false;
      }

    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error configurando licencia');
      return false;
    }
  }

  /**
   * Configura las variables de entorno de Liquibase
   */
  private setEnvironmentVariable(licenseKey: string): boolean {
    try {
      if (typeof process !== 'undefined' && process.env) {
        process.env.LIQUIBASE_LICENSE_KEY = licenseKey;
        
        // Habilitar checks scripts para funcionalidad completa de Pro
        process.env.LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED = 'TRUE';
        
        logger.info("✅ Variables de entorno configuradas: LIQUIBASE_LICENSE_KEY, LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED");
        return true;
      }
      return false;
    } catch (error) {
      logger.warning("⚠️ Error configurando variables de entorno", error);
      return false;
    }
  }

  /**
   * Crea un archivo liquibase.properties con la licencia y credenciales de base de datos
   */
  private async createPropertiesFile(config: LicenseConfig): Promise<boolean> {
    try {
      let propertiesContent = `# Liquibase Pro License Configuration
# Generated automatically by Azure DevOps Extension
liquibase.licenseKey=${config.licenseKey}

# Additional Pro configurations
liquibase.pro.enabled=true
liquibase.pro.features.enabled=true
liquibase.report.enabled=true

# Enable checks scripts functionality
liquibase.command.checks.run.checksScriptsEnabled=true

`;

      // Agregar credenciales de base de datos si están disponibles
      if (config.databaseUrl || config.databaseUsername || config.databasePassword || config.databaseDriver) {
        propertiesContent += `# Database Connection Configuration
`;
        
        if (config.databaseUrl) {
          propertiesContent += `url=${config.databaseUrl}
`;
        }
        
        if (config.databaseUsername) {
          propertiesContent += `username=${config.databaseUsername}
`;
        }
        
        if (config.databasePassword) {
          propertiesContent += `password=${config.databasePassword}
`;
        }
        
        if (config.databaseDriver) {
          propertiesContent += `driver=${config.databaseDriver}
`;
        }
        
        propertiesContent += `
`;
        logger.info("🔗 Credenciales de base de datos incluidas en liquibase.properties");
      }

      const propertiesPath = path.join(process.cwd(), 'liquibase.properties');
      
      fs.writeFileSync(propertiesPath, propertiesContent, 'utf8');
      
      logger.info("✅ Archivo liquibase.properties creado en", propertiesPath);
      return true;

    } catch (error: any) {
      logger.warning("⚠️ Error creando archivo liquibase.properties", error?.message);
      return false;
    }
  }

  /**
   * Actualiza o crea un archivo .env con la licencia y configuraciones de checks
   */
  private async updateEnvFile(licenseKey: string): Promise<boolean> {
    try {
      const envPath = path.join(process.cwd(), '.env');
      const licenseEnvContent = `LIQUIBASE_LICENSE_KEY=${licenseKey}\n`;
      const checksEnvContent = `LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED=TRUE\n`;
      
      // Verificar si el archivo .env existe
      if (fs.existsSync(envPath)) {
        // Leer contenido existente
        let existingContent = fs.readFileSync(envPath, 'utf8');
        
        // Actualizar o agregar LIQUIBASE_LICENSE_KEY
        if (existingContent.includes('LIQUIBASE_LICENSE_KEY=')) {
          existingContent = existingContent.replace(
            /LIQUIBASE_LICENSE_KEY=.*/g,
            `LIQUIBASE_LICENSE_KEY=${licenseKey}`
          );
        } else {
          existingContent += licenseEnvContent;
        }
        
        // Actualizar o agregar LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED
        if (existingContent.includes('LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED=')) {
          existingContent = existingContent.replace(
            /LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED=.*/g,
            'LIQUIBASE_COMMAND_CHECKS_RUN_CHECKS_SCRIPTS_ENABLED=TRUE'
          );
        } else {
          existingContent += checksEnvContent;
        }
        
        fs.writeFileSync(envPath, existingContent, 'utf8');
      } else {
        // Crear nuevo archivo .env con ambas variables
        const newEnvContent = `# Liquibase Pro Configuration
# Generated automatically by Azure DevOps Extension
${licenseEnvContent}${checksEnvContent}`;
        fs.writeFileSync(envPath, newEnvContent, 'utf8');
      }
      
      logger.info("✅ Archivo .env actualizado/creado con configuraciones de Liquibase Pro");
      return true;

    } catch (error: any) {
      logger.warning("⚠️ Error actualizando archivo .env", error?.message);
      return false;
    }
  }

  /**
   * Verifica si la licencia está configurada correctamente
   */
  async verifyLicenseConfiguration(): Promise<boolean> {
    try {
      logger.startStep("license-verify", "Verificando configuración de licencia");

      const checks = [
        this.checkEnvironmentVariable(),
        this.checkPropertiesFile(),
        this.checkEnvFile()
      ];

      const results = await Promise.all(checks);
      const successCount = results.filter(result => result).length;

      if (successCount > 0) {
        // Si encontramos configuración en al menos un método, consideramos la licencia válida
        logger.completeStep("completed", undefined, 
          `Licencia configurada en ${successCount} método(s)`);
        return true;
      } else {
        logger.completeStep("completed", undefined, "No se encontró configuración de licencia");
        return false;
      }

    } catch (error: any) {
      logger.completeStep("completed", undefined, "Error verificando licencia: " + (error?.message || 'Error desconocido'));
      return false;
    }
  }

  /**
   * Prueba si Liquibase reconoce la licencia configurada
   */
  private async testLiquibaseLicenseRecognition(): Promise<boolean> {
    try {
      // Verificar si la variable de entorno está configurada
      if (process.env.LIQUIBASE_LICENSE_KEY) {
        logger.info("✅ Variable de entorno LIQUIBASE_LICENSE_KEY configurada y disponible");
        return true;
      }

      // Verificar si el archivo liquibase.properties existe y tiene la licencia
      const propertiesPath = path.join(process.cwd(), 'liquibase.properties');
      if (fs.existsSync(propertiesPath)) {
        const content = fs.readFileSync(propertiesPath, 'utf8');
        if (content.includes('liquibase.licenseKey=')) {
          logger.info("✅ Archivo liquibase.properties encontrado con licencia");
          return true;
        }
      }

      // Verificar si el archivo .env existe y tiene la licencia
      const envPath = path.join(process.cwd(), '.env');
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        if (content.includes('LIQUIBASE_LICENSE_KEY=')) {
          logger.info("✅ Archivo .env encontrado con licencia");
          return true;
        }
      }

      logger.warning("⚠️ No se encontró configuración de licencia en ningún método");
      return false;

    } catch (error: any) {
      logger.warning(`⚠️ Error probando reconocimiento de licencia: ${error.message}`);
      return false;
    }
  }

  /**
   * Verifica si la variable de entorno está configurada
   */
  private checkEnvironmentVariable(): boolean {
    try {
      if (typeof process !== 'undefined' && process.env && process.env.LIQUIBASE_LICENSE_KEY) {
        logger.info("✅ Variable de entorno LIQUIBASE_LICENSE_KEY configurada");
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifica si el archivo liquibase.properties existe y tiene la licencia
   */
  private async checkPropertiesFile(): Promise<boolean> {
    try {
      const propertiesPath = path.join(process.cwd(), 'liquibase.properties');
      
      if (fs.existsSync(propertiesPath)) {
        const content = fs.readFileSync(propertiesPath, 'utf8');
        if (content.includes('liquibase.licenseKey=')) {
          logger.info("✅ Archivo liquibase.properties encontrado con licencia");
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Verifica si el archivo .env existe y tiene la licencia
   */
  private async checkEnvFile(): Promise<boolean> {
    try {
      const envPath = path.join(process.cwd(), '.env');
      
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        if (content.includes('LIQUIBASE_LICENSE_KEY=')) {
          logger.info("✅ Archivo .env encontrado con licencia");
          return true;
        }
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  /**
   * Limpia la configuración de licencia (para testing)
   */
  async cleanup(): Promise<void> {
    try {
      // Limpiar variable de entorno
      if (typeof process !== 'undefined' && process.env) {
        delete process.env.LIQUIBASE_LICENSE_KEY;
      }

      // Eliminar archivos creados
      const filesToRemove = [
        path.join(process.cwd(), 'liquibase.properties'),
        path.join(process.cwd(), '.env')
      ];

      for (const filePath of filesToRemove) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          logger.info(`✅ Archivo eliminado: ${filePath}`);
        }
      }

      this.configured = false;
      logger.info("✅ Configuración de licencia limpiada");

    } catch (error: any) {
      logger.warning("Error limpiando configuración de licencia", error?.message);
    }
  }
}
