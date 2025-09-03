import * as task from "azure-pipelines-task-lib/task";
import * as fs from "fs";
import * as path from "path";
import { request } from "./request";
import { LIQUIBASE_CHECKS_CONFIG, JfrogConnection } from "../interfaces/jfrog.interface";

/**
 * Servicio encargado de descargar el JAR de liquibase-checks desde JFrog
 * solo cuando se necesite para comandos Pro como checksrun
 */
export class ChecksJarDownloader {
    private connection: JfrogConnection;

    constructor(private connectionName: string) {
        this.connection = this.getConnection();
    }

    /**
     * Descarga el JAR liquibase-checks.jar si no existe o es necesario
     * @returns string - Ruta al archivo descargado
     */
    async ensureChecksJarAvailable(): Promise<string> {
        try {
            const targetPath = this.getTargetPath();
            
            // Verificar si ya existe el archivo
            if (fs.existsSync(targetPath)) {
                const stats = fs.statSync(targetPath);
                const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
                task.debug(`JAR liquibase-checks ya existe (${fileSizeMB}MB): ${targetPath}`);
                return targetPath;
            }

            task.debug("Descargando liquibase-checks.jar desde JFrog...");
            console.log("📦 Descargando extensión Liquibase Checks desde JFrog (187MB)...");
            
            const startTime = Date.now();
            await this.downloadChecksJar(targetPath);
            const duration = Date.now() - startTime;
            
            const stats = fs.statSync(targetPath);
            const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            
            console.log(`✅ JAR liquibase-checks descargado exitosamente (${fileSizeMB}MB) en ${duration}ms`);
            task.debug(`Archivo guardado en: ${targetPath}`);
            
            // Verificar que el archivo es accesible y tiene el tamaño correcto
            if (fs.existsSync(targetPath)) {
                const finalStats = fs.statSync(targetPath);
                const finalSizeMB = (finalStats.size / (1024 * 1024)).toFixed(2);
                console.log(`🔍 Verificación: JAR accesible en ${targetPath} (${finalSizeMB}MB)`);
                
                // Verificar permisos de lectura
                try {
                    fs.accessSync(targetPath, fs.constants.R_OK);
                    console.log(`✅ Permisos de lectura verificados para liquibase-checks.jar`);
                } catch (permError) {
                    console.log(`⚠️ Problema de permisos en liquibase-checks.jar: ${permError}`);
                }
            } else {
                throw new Error(`JAR descargado pero no encontrado en la ruta esperada: ${targetPath}`);
            }
            
            return targetPath;
        } catch (error) {
            task.error(`Error al descargar liquibase-checks.jar: ${error}`);
            throw error;
        }
    }

    /**
     * Obtiene la ruta donde debe guardarse el JAR
     */
    private getTargetPath(): string {
        // Usar la ruta absoluta del módulo npm liquibase
        // Esto asegura que el JAR se coloque exactamente donde Liquibase lo espera
        const liquibaseDir = path.resolve(__dirname, "../../../node_modules/liquibase/dist/liquibase");
        const extensionsDir = path.join(liquibaseDir, "internal", "extensions");
        const targetPath = path.join(extensionsDir, LIQUIBASE_CHECKS_CONFIG.filename);
        
        task.debug(`Ruta de destino para liquibase-checks.jar: ${targetPath}`);
        task.debug(`Directorio Liquibase: ${liquibaseDir}`);
        task.debug(`Directorio extensions: ${extensionsDir}`);
        
        return targetPath;
    }

    /**
     * Descarga el JAR desde JFrog
     */
    private async downloadChecksJar(targetPath: string): Promise<void> {
        const artifactUrl = this.buildArtifactUrl();
        task.debug(`Descargando desde: ${artifactUrl}`);

        // Asegurar que el directorio existe
        const targetDir = path.dirname(targetPath);
        this.ensureDirectoryExists(targetDir);

        // Descargar el archivo
        const response = await this.downloadArtifact(artifactUrl);
        
        // Guardar el archivo
        let fileData: Buffer;
        if (response instanceof ArrayBuffer) {
            fileData = Buffer.from(response);
        } else if (typeof response === 'string') {
            fileData = Buffer.from(response, 'utf8');
        } else {
            throw new Error(`Tipo de respuesta no soportado: ${typeof response}`);
        }
        
        fs.writeFileSync(targetPath, fileData);
        task.debug(`JAR guardado en: ${targetPath}`);
    }

    /**
     * Construye la URL completa del artefacto
     */
    private buildArtifactUrl(): string {
        return `${this.connection.url}/${LIQUIBASE_CHECKS_CONFIG.path}/${LIQUIBASE_CHECKS_CONFIG.filename}`;
    }

    /**
     * Descarga el artefacto usando autenticación apropiada
     */
    private async downloadArtifact(artifactUrl: string): Promise<any> {
        if (this.connection.accessToken) {
            task.debug("Usando autenticación Bearer para descarga de checks JAR");
            return await request<any>(artifactUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${this.connection.accessToken}`,
                    "Accept": "application/octet-stream"
                }
            });
        } else {
            task.debug("Usando autenticación Basic para descarga de checks JAR");
            const authHeader = Buffer.from(`${this.connection.username}:${this.connection.password}`).toString("base64");
            return await request<any>(artifactUrl, {
                method: "GET",
                headers: {
                    "Authorization": `Basic ${authHeader}`,
                    "Accept": "application/octet-stream"
                }
            });
        }
    }

    /**
     * Obtiene la configuración de conexión de JFrog
     */
    private getConnection(): JfrogConnection {
        try {
            const url = task.getEndpointUrl(this.connectionName, false);
            const username = task.getEndpointAuthorizationParameter(this.connectionName, "username", false) || "";
            const password = task.getEndpointAuthorizationParameter(this.connectionName, "password", false) || "";
            
            let accessToken = "";
            try {
                accessToken = task.getEndpointAuthorizationParameter(this.connectionName, "apiToken", false) || "";
            } catch (error) {
                task.debug(`Token de acceso no disponible para descarga de checks JAR: ${error}`);
            }
            
            if (!url) {
                throw new Error(`URL de conexión JFrog no configurada: ${this.connectionName}`);
            }
            
            if (!accessToken && (!username || !password)) {
                throw new Error(`Autenticación JFrog no configurada para: ${this.connectionName}`);
            }
            
            return { url, username, password, accessToken };
        } catch (error) {
            task.error(`Error al obtener conexión JFrog para checks JAR: ${error}`);
            throw error;
        }
    }

    /**
     * Asegura que un directorio existe
     */
    private ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            task.debug(`Directorio creado: ${dirPath}`);
        }
    }
}
