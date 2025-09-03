import * as task from "azure-pipelines-task-lib/task";
import { request } from "../util/request";
import * as fs from "fs";
import * as path from "path";
import { ARTIFACT_CONFIGS, ArtifactConfig, DownloadResult, JfrogConnection } from "../interfaces/jfrog.interface"

export class JfrogClient {
    private connection: JfrogConnection;

    constructor(
        private connectionName: string,
        private engine: string
    ) {
        console.log(`Constructor de JfrogClient llamado con connectionName: ${connectionName}, engine: ${engine}`);
        this.validateEngine(engine);
        console.log("Validación del motor exitosa, obteniendo conexión");
        this.connection = this.getConnection();
        console.log("Conexión obtenida exitosamente");
        console.log(`URL de conexión: ${this.connection.url}`);
        console.log(`Usuario configurado: ${this.connection.username ? 'Sí' : 'No'}`);
        console.log(`Contraseña configurada: ${this.connection.password ? 'Sí' : 'No'}`);
        console.log(`Token de acceso configurado: ${this.connection.accessToken ? 'Sí' : 'No'}`);
    }

    /**
     * Downloads database connector artifacts from JFrog
     * @returns Promise<DownloadResult> - Information about the downloaded artifact
     */
    async downloadArtifacts(): Promise<DownloadResult> {
        try {
            task.debug(`Iniciando descarga de artefactos para el motor: ${this.engine}`);

            const artifactUrl = this.buildArtifactUrl();
            task.debug(`URL del artefacto construida: ${artifactUrl}`);
            
            const filePath = await this.downloadArtifact(artifactUrl);
            task.debug(`Descarga completada, archivo guardado en: ${filePath}`);

            task.debug(`Artefacto descargado exitosamente a: ${filePath}`);

            return {
                filePath,
                engine: this.engine,
                artifactName: this.getArtifactConfig().filename
            };
        } catch (error) {
            task.error(`Error al descargar artefactos para el motor ${this.engine}: ${error}`);
            throw error;
        }
    }

    /**
     * Validates that the specified engine is supported
     */
    private validateEngine(engine: string): void {
        if (!ARTIFACT_CONFIGS[engine]) {
            const supportedEngines = Object.keys(ARTIFACT_CONFIGS).join(", ");
            throw new Error(`Motor no soportado: ${engine}. Motores soportados: ${supportedEngines}`);
        }
    }

    /**
     * Retrieves and validates JFrog connection parameters
     */
    private getConnection(): JfrogConnection {
        try {
            task.debug(`Intentando obtener datos de conexión para: ${this.connectionName}`);
            
            const url = task.getEndpointUrl(this.connectionName, false);
            task.debug(`URL obtenida: ${url}`);
            
            const username = task.getEndpointAuthorizationParameter(this.connectionName, "username", false) || "";
            task.debug(`Usuario obtenido: ${username ? '***' : 'no proporcionado'}`);
            
            const password = task.getEndpointAuthorizationParameter(this.connectionName, "password", false) || "";
            task.debug(`Contraseña obtenida: ${password ? '***' : 'no proporcionado'}`);
            
            let accessToken = "";
            try {
                accessToken = task.getEndpointAuthorizationParameter(this.connectionName, "apiToken", false) || "";
                task.debug(`Token de acceso obtenido: ${accessToken ? '***' : 'no proporcionado'}`);
            } catch (error) {
                task.debug(`Token de acceso no disponible (usando autenticación básica): ${error}`);
                accessToken = "";
            }
            
            const maskedPassword = '*'.repeat(password.length);

            task.debug(`Datos de conexión obtenidos - URL: ${url}, Usuario: ${username}, Contraseña: ${maskedPassword}, Token de Acceso: ${accessToken ? '***' : 'no proporcionado'}`);
            
            task.debug(`Validando configuración de conexión...`);
            
            if (!url) {
                task.error(`URL no configurada para la conexión: ${this.connectionName}`);
                throw new Error(`La URL de la conexión JFrog '${this.connectionName}' no está configurada. Por favor verifique que la conexión de servicio existe y está configurada correctamente.`);
            }
            task.debug(`URL validada correctamente`);

            if (!accessToken && (!username || !password)) {
                task.error(`Autenticación no configurada para la conexión: ${this.connectionName}`);
                task.error(`Token de acceso: ${accessToken ? 'Disponible' : 'No disponible'}`);
                task.error(`Usuario: ${username ? 'Disponible' : 'No disponible'}`);
                task.error(`Contraseña: ${password ? 'Disponible' : 'No disponible'}`);
                throw new Error(`La autenticación de la conexión JFrog '${this.connectionName}' no está configurada correctamente. Se debe proporcionar un token de API o usuario/contraseña. Por favor verifique la configuración de la conexión de servicio.`);
            }
            task.debug(`Autenticación validada correctamente - Método: ${accessToken ? 'API Token' : 'Usuario/Contraseña'}`);

            task.debug(`Retornando objeto de conexión`);
            task.debug(`Configuración final - URL: ${url}, Usuario: ${username ? 'Configurado' : 'No configurado'}, Contraseña: ${password ? 'Configurada' : 'No configurada'}, Token: ${accessToken ? 'Configurado' : 'No configurado'}`);
            return { url, username, password, accessToken };
        } catch (error) {
            task.error(`Error al obtener la conexión JFrog '${this.connectionName}': ${error}`);
            throw new Error(`No se puede acceder a la conexión de servicio JFrog '${this.connectionName}'. Por favor verifique que la conexión de servicio existe, está configurada correctamente y el agente tiene permisos para acceder a ella. Error original: ${error}`);
        }
    }

    /**
     * Gets the artifact configuration for the current engine
     */
    private getArtifactConfig(): ArtifactConfig {
        return ARTIFACT_CONFIGS[this.engine];
    }

    /**
     * Builds the complete artifact URL
     */
    private buildArtifactUrl(): string {
        const config = this.getArtifactConfig();
        const artifactUrl = `${this.connection.url}/${config.path}/${config.filename}`;
        task.debug(`Construyendo URL del artefacto - URL base: ${this.connection.url}, Path: ${config.path}, Filename: ${config.filename}`);
        return artifactUrl;
    }

    /**
     * Downloads the artifact using the appropriate authentication method
     */
    private async downloadArtifact(artifactUrl: string): Promise<string> {
        task.debug(`Iniciando descarga de artefacto: ${artifactUrl}`);
        task.debug(`Método de autenticación - Token de acceso: ${this.connection.accessToken ? 'Disponible' : 'No disponible'}, Usuario/Contraseña: ${this.connection.username && this.connection.password ? 'Disponible' : 'No disponible'}`);
        
        if (this.connection.accessToken) {
            task.debug(`Usando autenticación Bearer con token`);
            return this.downloadWithBearerAuthentication(artifactUrl);
        } else {
            task.debug(`Usando autenticación Basic con usuario/contraseña`);
            return this.downloadWithBasicAuthentication(artifactUrl);
        }
    }

    /**
     * Downloads artifact using Bearer token authentication
     */
    private async downloadWithBearerAuthentication(artifactUrl: string): Promise<string> {
        task.debug(`Descargando artefacto con autenticación Bearer: ${artifactUrl}`);

        const response = await request<any>(artifactUrl, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${this.connection.accessToken}`,
                "Accept": "application/octet-stream"
            }
        });

        return this.saveArtifactToFile(response);
    }

    /**
     * Downloads artifact using Basic authentication
     */
    private async downloadWithBasicAuthentication(artifactUrl: string): Promise<string> {
        task.debug(`Descargando artefacto con autenticación Basic: ${artifactUrl}`);

        const authHeader = Buffer.from(`${this.connection.username}:${this.connection.password}`).toString("base64");

        const response = await request<any>(artifactUrl, {
            method: "GET",
            headers: {
                "Authorization": `Basic ${authHeader}`,
                "Accept": "application/octet-stream"
            }
        });

        return this.saveArtifactToFile(response);
    }

    /**
     * Saves the downloaded artifact to the file system
     */
    private async saveArtifactToFile(response: any): Promise<string> {
        const config = this.getArtifactConfig();
        const folderPath = path.join(process.cwd(), "connectors", this.engine);
        const filePath = path.join(folderPath, config.filename);

        // Ensure the directory exists
        this.ensureDirectoryExists(folderPath);

        // The request function returns the data directly, not wrapped in a 'data' property
        // For binary files, it returns an ArrayBuffer
        task.debug(`Tipo de respuesta recibida: ${typeof response}, instanceof ArrayBuffer: ${response instanceof ArrayBuffer}`);
        
        let fileData: Buffer;
        
        if (response instanceof ArrayBuffer) {
            fileData = Buffer.from(response);
            task.debug(`Convirtiendo ArrayBuffer a Buffer, tamaño: ${fileData.length} bytes`);
        } else if (typeof response === 'string') {
            fileData = Buffer.from(response, 'utf8');
            task.debug(`Convirtiendo string a Buffer, tamaño: ${fileData.length} bytes`);
        } else {
            task.error(`Tipo de respuesta no soportado: ${typeof response}`);
            throw new Error(`Tipo de respuesta no soportado: ${typeof response}`);
        }

        // Write the file
        fs.writeFileSync(filePath, fileData);

        task.debug(`Artefacto guardado en: ${filePath}`);
        return filePath;
    }

    /**
     * Ensures the target directory exists, creating it if necessary
     */
    private ensureDirectoryExists(dirPath: string): void {
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
            task.debug(`Directorio creado: ${dirPath}`);
        }
    }

    /**
     * Gets the list of supported engines
     */
    static getSupportedEngines(): string[] {
        return Object.keys(ARTIFACT_CONFIGS);
    }

    /**
     * Validates if an engine is supported
     */
    static isEngineSupported(engine: string): boolean {
        return engine in ARTIFACT_CONFIGS;
    }
}

// Export the class and types for external use
export { JfrogConnection, ArtifactConfig, DownloadResult };

