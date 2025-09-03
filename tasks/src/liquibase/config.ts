import * as tl from "azure-pipelines-task-lib/task";
import { DatabaseConfig, LiquibaseTaskConfig } from "./liquibase";
import { LiquibaseLogLevels } from "liquibase";
import { logger } from "../util/logger";

export interface TaskInputs {
  platform: string;
  motor: string;
  awsConnection: string;
  region: string;
  secret: string;
  jfrogConnection: string;
  command: string;
  changeLogFile?: string;
  context?: string;
  labels?: string;
  tag?: string;
  logLevel?: string;
  outputDirectory?: string;
  outputFile?: string;
  // Nuevos parámetros para snapshot rollback strategy
  snapshotDescription?: string;
  snapshotId?: string;
  rollbackStrategy?: string;
  snapshotsDirectory?: string;
  updateCount?: number;
  autoSnapshotEnabled?: boolean;
  validationRequired?: boolean;

  // Parámetros para Liquibase Pro
  licenseKey?: string;
  // Parámetros adicionales para Pro
  snowflakeWarehouse?: string;
  snowflakeRole?: string;
  bigqueryProject?: string;
  bigqueryDataset?: string;
  // Parámetros para checks
  checksSettingsFile?: string;
  generateHtmlReport?: boolean;
}

export class LiquibaseConfigBuilder {
  private inputs: TaskInputs;
  private databaseCredentials: any;

  constructor(inputs: TaskInputs, databaseCredentials: any) {
    this.inputs = inputs;
    this.databaseCredentials = databaseCredentials;
  }

  private getDatabaseUrl(): string {
    const motor = this.inputs.motor.toLowerCase();
    const credentials = this.databaseCredentials;
    
    logger.startStep("database-url", `Construyendo URL de conexión para ${motor}`);
    
    let url: string;
    
    switch (motor) {
      case "sqlserver":
        url = `jdbc:sqlserver://${credentials.host}:${credentials.port || 1433};databaseName=${credentials.db_name};encrypt=true;trustServerCertificate=true`;
        break;
      case "mysql":
        url = `jdbc:mysql://${credentials.host}:${credentials.port || 3306}/${credentials.db_name}?useSSL=false&allowPublicKeyRetrieval=true`;
        break;
      case "mariadb":
        url = `jdbc:mariadb://${credentials.host}:${credentials.port || 3306}/${credentials.db_name}`;
        break;
      case "documentdb":
        url = `jdbc:documentdb://${credentials.host}:${credentials.port || 27017}/${credentials.db_name}`;
        break;
      case "dynamodb":
        url = `jdbc:dynamodb://${credentials.host}:${credentials.port || 8000}/${credentials.db_name}`;
        break;
      case "postgresql":
        url = `jdbc:postgresql://${credentials.host}:${credentials.port || 5432}/${credentials.db_name}`;
        break;
      case "oracle":
        url = `jdbc:oracle:thin:@${credentials.host}:${credentials.port || 1521}:${credentials.db_name}`;
        break;
      case "snowflake":
        url = `jdbc:snowflake://${credentials.host}.snowflakecomputing.com/?warehouse=${this.inputs.snowflakeWarehouse || 'COMPUTE_WH'}&role=${this.inputs.snowflakeRole || 'ACCOUNTADMIN'}&db=${credentials.db_name}`;
        break;
      case "bigquery":
        url = `jdbc:bigquery://https://www.googleapis.com/bigquery/v2:443;ProjectId=${this.inputs.bigqueryProject || credentials.project_id};OAuthType=0;OAuthServiceAcctEmail=${credentials.service_account_email};OAuthPvtKeyPath=${credentials.private_key_path};DatasetId=${this.inputs.bigqueryDataset || credentials.dataset_id}`;
        break;
      default:
        const error = `Motor de base de datos no soportado: ${motor}`;
        logger.completeStep("failed", error);
        throw new Error(error);
    }
    
         logger.completeStep("completed", undefined, `URL construida para ${motor}: ${credentials.host}:${credentials.port || LiquibaseConfigBuilder.getDefaultPort(motor)}`);
    return url;
  }

  private getDatabaseDriver(): string {
    const motor = this.inputs.motor.toLowerCase();
    
    logger.startStep("database-driver", `Obteniendo driver para ${motor}`);
    
    let driver: string;
    
    switch (motor) {
      case "sqlserver":
        driver = "com.microsoft.sqlserver.jdbc.SQLServerDriver";
        break;
      case "mysql":
        driver = "com.mysql.cj.jdbc.Driver";
        break;
      case "mariadb":
        driver = "org.mariadb.jdbc.Driver";
        break;
      case "documentdb":
        driver = "com.mongodb.jdbc.MongoDriver";
        break;
      case "dynamodb":
        driver = "com.amazonaws.dynamodb.jdbc.Driver";
        break;
      case "postgresql":
        driver = "org.postgresql.Driver";
        break;
      case "oracle":
        driver = "oracle.jdbc.OracleDriver";
        break;
      case "snowflake":
        driver = "net.snowflake.client.jdbc.SnowflakeDriver";
        break;
      case "bigquery":
        driver = "com.simba.googlebigquery.jdbc.Driver";
        break;
      default:
        const error = `Driver no soportado para motor: ${motor}`;
        logger.completeStep("failed", error);
        throw new Error(error);
    }
    
    logger.completeStep("completed", undefined, `Driver seleccionado: ${driver}`);
    return driver;
  }

  private getClasspath(): string {
    const motor = this.inputs.motor.toLowerCase();
    
    logger.startStep("classpath", `Construyendo classpath para ${motor}`);
    
    let classpath: string;
    
    switch (motor) {
      case "sqlserver":
        classpath = "./connectors/sqlserver/mssql-jdbc-12.4.2.jre11.jar";
        break;
      case "mysql":
        classpath = "./connectors/mysql/mysql-connector-j-8.0.33.jar";
        break;
      case "mariadb":
        classpath = "./connectors/mariadb/mariadb-java-client-3.1.4.jar";
        break;
      case "documentdb":
        classpath = "./connectors/documentdb/mongodb-jdbc-1.0.0.jar";
        break;
      case "dynamodb":
        classpath = "./connectors/dynamodb/dynamodb-jdbc-1.0.0.jar";
        break;
      case "postgresql":
        classpath = "./connectors/postgresql/postgresql-42.7.1.jar";
        break;
      case "oracle":
        classpath = "./connectors/oracle/ojdbc11.jar";
        break;
      case "snowflake":
        classpath = "./connectors/snowflake/snowflake-jdbc-3.14.3.jar";
        break;
      case "bigquery":
        classpath = "./connectors/bigquery/GoogleBigQueryJDBC42.jar";
        break;
      default:
        const error = `Classpath no soportado para motor: ${motor}`;
        logger.completeStep("failed", error);
        throw new Error(error);
    }
    
    logger.completeStep("completed", undefined, `Classpath configurado: ${classpath}`);
    return classpath;
  }

  buildConfig(): LiquibaseTaskConfig {
    logger.startStep("build-config", "Construyendo configuración de Liquibase");
    
    try {
      const config: LiquibaseTaskConfig = {
        changeLogFile: this.inputs.changeLogFile || "changelog.xml",
        database: {
          url: this.getDatabaseUrl(),
          username: this.databaseCredentials.username,
          password: this.databaseCredentials.password,
          driver: this.getDatabaseDriver(),
          classpath: this.getClasspath()
        },
        logLevel: this.getLogLevel(),
        context: this.inputs.context,
        labels: this.inputs.labels,
        tag: this.inputs.tag,
        licenseKey: this.inputs.licenseKey,
        checksSettingsFile: this.inputs.checksSettingsFile
      };
      
      logger.completeStep("completed", undefined, "Configuración de Liquibase construida exitosamente");
      return config;
      
    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error al construir configuración');
      throw error;
    }
  }

  private getLogLevel(): LiquibaseLogLevels {
    const logLevel = this.inputs.logLevel?.toLowerCase();
    
    switch (logLevel) {
      case "debug":
        return LiquibaseLogLevels.Debug;
      case "info":
        return LiquibaseLogLevels.Info;
      case "warning":
        return LiquibaseLogLevels.Warning;
             case "error":
         return LiquibaseLogLevels.Severe;
      default:
        return LiquibaseLogLevels.Info;
    }
  }

  static parseCredentials(secretValue: string): any {
    logger.startStep("parse-credentials", "Parseando credenciales desde AWS Secrets Manager");
    
    try {
      const credentials = JSON.parse(secretValue);
      
      // Validar campos requeridos
      const requiredFields = ['host', 'username', 'password'];
      const missingFields = requiredFields.filter(field => !credentials[field]);
      
      if (missingFields.length > 0) {
        const error = `Campos requeridos faltantes en las credenciales: ${missingFields.join(', ')}`;
        logger.completeStep("failed", error);
        throw new Error(error);
      }
      
      // Normalizar nombres de campos
      const normalizedCredentials = {
        host: credentials.host,
        port: credentials.port || credentials.port_number,
        db_name: credentials.database || credentials.db_name || credentials.db,
        username: credentials.username,
        password: credentials.password,
        // Campos adicionales para motores específicos
        project_id: credentials.project_id,
        service_account_email: credentials.service_account_email,
        private_key_path: credentials.private_key_path,
        dataset_id: credentials.dataset_id
      };
      
      logger.completeStep("completed", undefined, `Credenciales parseadas para host: ${normalizedCredentials.host}`);
      return normalizedCredentials;
      
    } catch (error: any) {
      const errorMessage = error instanceof SyntaxError 
        ? "Error al parsear JSON de las credenciales" 
        : error?.message || 'Error desconocido al parsear credenciales';
      
      logger.completeStep("failed", errorMessage);
      throw new Error(errorMessage);
    }
  }

  private static getDefaultPort(motor: string): number {
    switch (motor.toLowerCase()) {
      case "sqlserver":
        return 1433;
      case "mysql":
      case "mariadb":
        return 3306;
      case "documentdb":
        return 27017;
      case "dynamodb":
        return 8000;
      case "postgresql":
        return 5432;
      case "oracle":
        return 1521;
      default:
        return 1433;
    }
  }

  static buildFromInputs(inputs: TaskInputs): LiquibaseTaskConfig {
    logger.startStep("build-from-inputs", "Construyendo configuración desde inputs");
    
    try {
      const builder = new LiquibaseConfigBuilder(inputs, {});
      const config = builder.buildConfig();
      
      logger.completeStep("completed", undefined, "Configuración construida desde inputs");
      return config;
      
    } catch (error: any) {
      logger.completeStep("failed", error?.message || 'Error al construir desde inputs');
      throw error;
    }
  }
} 