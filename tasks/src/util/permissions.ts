import * as tl from "azure-pipelines-task-lib/task";
import * as path from "path";
import * as fs from "fs";

export class PermissionManager {
  
  /**
   * Aplica permisos de ejecución a los binarios de Liquibase
   */
  static async fixLiquibasePermissions(): Promise<void> {
    try {
      tl.debug("Verificando y aplicando permisos de ejecución para Liquibase...");
      
      // Obtener la ruta del directorio de node_modules
      const nodeModulesPath = path.resolve(__dirname, "../../../node_modules");
      const liquibasePath = path.join(nodeModulesPath, "liquibase", "dist", "liquibase");
      
      // Verificar si el directorio existe
      if (!fs.existsSync(liquibasePath)) {
        tl.warning(`Directorio de Liquibase no encontrado: ${liquibasePath}`);
        return;
      }
      
      // Aplicar permisos a los archivos ejecutables
      await this.applyPermissionsToExecutables(liquibasePath);
      
      tl.debug("Permisos de ejecución aplicados correctamente");
      
    } catch (error) {
      tl.warning(`Error al aplicar permisos: ${error}`);
      // No lanzar error para no interrumpir la ejecución
    }
  }
  
  /**
   * Aplica permisos de ejecución a archivos específicos
   */
  private static async applyPermissionsToExecutables(liquibasePath: string): Promise<void> {
    const { exec } = require("child_process");
    const { promisify } = require("util");
    const execAsync = promisify(exec);
    
    try {
      // Aplicar permisos al binario principal de Liquibase
      const liquibaseBinary = path.join(liquibasePath, "liquibase");
      if (fs.existsSync(liquibaseBinary)) {
        await execAsync(`chmod +x "${liquibaseBinary}"`);
        tl.debug(`Permisos aplicados a: ${liquibaseBinary}`);
      }
      
      // Aplicar permisos a scripts shell
      const libPath = path.join(liquibasePath, "lib");
      if (fs.existsSync(libPath)) {
        await execAsync(`find "${libPath}" -name "*.sh" -exec chmod +x {} \\;`);
        tl.debug("Permisos aplicados a scripts shell");
      }
      
      // Aplicar permisos a todos los archivos ejecutables
      await execAsync(`find "${liquibasePath}" -name "liquibase" -o -name "*.sh" | xargs chmod +x`);
      tl.debug("Permisos aplicados a todos los ejecutables");
      
    } catch (error) {
      tl.warning(`Error al aplicar permisos específicos: ${error}`);
    }
  }
  
  /**
   * Verifica si los permisos están correctamente configurados
   */
  static async verifyPermissions(): Promise<boolean> {
    try {
      const nodeModulesPath = path.resolve(__dirname, "../../../node_modules");
      const liquibaseBinary = path.join(nodeModulesPath, "liquibase", "dist", "liquibase", "liquibase");
      
      if (!fs.existsSync(liquibaseBinary)) {
        tl.warning("Binario de Liquibase no encontrado");
        return false;
      }
      
      const stats = fs.statSync(liquibaseBinary);
      const isExecutable = (stats.mode & fs.constants.S_IXUSR) !== 0;
      
      if (!isExecutable) {
        tl.warning("Binario de Liquibase no tiene permisos de ejecución");
        return false;
      }
      
      tl.debug("Permisos de ejecución verificados correctamente");
      return true;
      
    } catch (error) {
      tl.warning(`Error al verificar permisos: ${error}`);
      return false;
    }
  }
}
