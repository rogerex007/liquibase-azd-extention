// Type definitions
export interface JfrogConnection {
    url: string;
    username: string;
    password: string;
    accessToken?: string;
}

export interface ArtifactConfig {
    path: string;
    filename: string;
}

export interface DownloadResult {
    filePath: string;
    engine: string;
    artifactName: string;
}

// Supported database engines and their artifact configurations
export const ARTIFACT_CONFIGS: Record<string, ArtifactConfig> = {
    sqlserver: {
        path: "devops/liquibase/connectors/sqlserver",
        filename: "mssql-jdbc-12.4.2.jar"
    },
    mysql: {
        path: "devops/liquibase/connectors/mysql",
        filename: "mysql-connector-j-8.0.33.jar"
    },
    documentDB: {
        path: "devops/liquibase/connectors/documentdb",
        filename: "documentdb-jdbc-1.4.5-all.jar"
    },
    postgresql: {
        path: "devops/liquibase/connectors",
        filename: "postgresql-42.7.7.jar"
    },
    oracle: {
        path: "devops/liquibase/connectors/oracle",
        filename: "ojdbc11-21.9.0.0.jar"
    }
};

// Configuración específica para el JAR de Liquibase Checks (187MB)
export const LIQUIBASE_CHECKS_CONFIG: ArtifactConfig = {
    path: "devops/liquibase/extensions",
    filename: "liquibase-checks.jar"
};