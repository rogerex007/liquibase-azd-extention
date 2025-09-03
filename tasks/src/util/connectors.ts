import { DownloadResult, JfrogClient } from "../connections/jfrog";
import * as task from "azure-pipelines-task-lib/task";

export async function validateAndDownload(connectionName: string, motor: string): Promise<DownloadResult> {
    try {
        if (!connectionName || connectionName.trim() === "") {
            throw new Error("jfrogConnection es requerido.")
        }

        if (!motor || motor.trim() === "") {
            throw new Error("El motor de la BD es requerido.")
        }

        if (!JfrogClient.isEngineSupported(motor)) {
            const supportedEngines = JfrogClient.getSupportedEngines().join(", ");
            throw new Error(`No soporta el motor: ${motor}. Motores soportados: ${supportedEngines}`);
        }

        task.debug(`Parámetros válidos - Conexión: ${connectionName}, Motor: ${motor}`);
        console.log(`Creando JfrogClient con conexión: ${connectionName}, motor: ${motor}`);
        
        const jfrogClient = new JfrogClient(connectionName, motor);
        console.log("JfrogClient creado exitosamente, iniciando descarga de artefactos");
        
        return await jfrogClient.downloadArtifacts();
    } catch (error) {
        console.error(`Error en validateAndDownload: ${error}`);
        throw error;
    }
}