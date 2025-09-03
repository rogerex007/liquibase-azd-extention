export interface CheckIssue {
  severity: number;
  checkName: string;
  checkShortName: string;
  checkMessage: string;
  changesetId?: string;
  changesetAuthor?: string;
  changesetFilePath?: string;
}

export interface ChecksResult {
  totalIssues: number;
  issuesBySeverity: Map<number, CheckIssue[]>;
  maxSeverity: number;
  shouldFail: boolean;
  failureReason?: string;
}

export class ChecksResultAnalyzer {
  private static readonly SEVERITY_NAMES = {
    0: 'INFO',
    1: 'MINOR',
    2: 'MAJOR',
    3: 'CRITICAL',
    4: 'BLOCKER'
  };

  /**
   * Analiza el resultado de Liquibase checks y determina si el pipeline debe fallar
   * El pipeline fallará automáticamente solo si encuentra issues de severidad 3 (CRITICAL) o 4 (BLOCKER)
   * Soporta tanto formato JSON como texto plano
   */
  static analyzeChecksResult(result: string): ChecksResult {
    // Intentar primero como JSON
    try {
      return this.analyzeJsonResult(result);
    } catch (error) {
      // Si falla JSON, intentar como texto plano
      try {
        return this.analyzePlainTextResult(result);
      } catch (textError) {
        // Si ambos fallan, retornar error genérico
        return {
          totalIssues: 1,
          issuesBySeverity: new Map(),
          maxSeverity: 4,
          shouldFail: true,
          failureReason: `Error parsing checks result: ${textError}`
        };
      }
    }
  }

  /**
   * Analiza el resultado JSON de Liquibase checks
   */
  private static analyzeJsonResult(jsonResult: string): ChecksResult {
    const result = JSON.parse(jsonResult);
    const issues: CheckIssue[] = [];
    
    // Extraer issues del resultado JSON
    if (result.qualityChecksReport && result.qualityChecksReport.checksReport) {
      for (const report of result.qualityChecksReport.checksReport) {
        if (report.changelogChecks && report.changelogChecks.issues) {
          for (const issue of report.changelogChecks.issues) {
            issues.push({
              severity: this.getSeverityFromCheck(issue.checkSeverity),
              checkName: issue.checkName,
              checkShortName: issue.checkShortName,
              checkMessage: issue.checkMessage,
              changesetId: issue.changesetId,
              changesetAuthor: issue.changesetAuthor,
              changesetFilePath: issue.changesetFilePath
            });
          }
        }
      }
    }

    return this.buildChecksResult(issues);
  }

  /**
   * Analiza el resultado de texto plano de Liquibase checks
   */
  private static analyzePlainTextResult(textResult: string): ChecksResult {
    const issues: CheckIssue[] = [];
    
    // Parsear el texto plano para extraer información
    const lines = textResult.split('\n');
    
    // Buscar issues específicos de checks en el formato de Liquibase
    let currentCheck: Partial<CheckIssue> = {};
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Detectar inicio de un check issue
      if (trimmedLine.startsWith('Check Name:')) {
        currentCheck = {};
        currentCheck.checkName = trimmedLine.replace('Check Name:', '').trim();
      }
      
      // Detectar severity del check
      if (trimmedLine.startsWith('Check Severity:')) {
        const severityMatch = trimmedLine.match(/Check Severity:\s*(\w+)\s*\(Return code: (\d+)\)/);
        if (severityMatch) {
          const severityName = severityMatch[1].toUpperCase();
          const returnCode = parseInt(severityMatch[2]);
          
          // Mapear severidad por nombre y código de retorno
          let severity: number;
          switch (severityName) {
            case 'BLOCKER': severity = 4; break;
            case 'CRITICAL': severity = 3; break;
            case 'MAJOR': severity = 2; break;
            case 'MINOR': severity = 1; break;
            case 'INFO': severity = 0; break;
            default: severity = returnCode; // Usar el código de retorno como fallback
          }
          
          currentCheck.severity = severity;
        }
      }
      
      // Detectar mensaje del check
      if (trimmedLine.startsWith('Message:')) {
        currentCheck.checkMessage = trimmedLine.replace('Message:', '').trim();
      }
      
      // Detectar changeset ID
      if (trimmedLine.startsWith('Changeset ID:')) {
        currentCheck.changesetId = trimmedLine.replace('Changeset ID:', '').trim();
      }
      
      // Detectar filepath del changeset
      if (trimmedLine.startsWith('Changeset Filepath:')) {
        currentCheck.changesetFilePath = trimmedLine.replace('Changeset Filepath:', '').trim();
      }
      
      // Si tenemos un check completo, agregarlo a la lista
      if (currentCheck.checkName && currentCheck.severity !== undefined && currentCheck.checkMessage) {
        issues.push({
          severity: currentCheck.severity!,
          checkName: currentCheck.checkName,
          checkShortName: currentCheck.checkName.split(' ').slice(0, 3).join(' '), // Primeras 3 palabras como short name
          checkMessage: currentCheck.checkMessage,
          changesetId: currentCheck.changesetId,
          changesetFilePath: currentCheck.changesetFilePath,
        });
        currentCheck = {}; // Reset para el siguiente check
      }
      
      // Detectar warnings generales
      if (trimmedLine.startsWith('Warning:') || trimmedLine.startsWith('WARNING:')) {
        issues.push({
          severity: 1, // MINOR
          checkName: 'Text Warning',
          checkShortName: 'WARNING',
          checkMessage: trimmedLine,
        });
      }
      
      // Detectar errores generales
      if (trimmedLine.startsWith('Error:') || trimmedLine.startsWith('ERROR:')) {
        issues.push({
          severity: 3, // CRITICAL
          checkName: 'Text Error',
          checkShortName: 'ERROR',
          checkMessage: trimmedLine,
        });
      }
      
      // Detectar si no se ejecutaron checks
      if (trimmedLine.includes('No checks were executed')) {
        issues.push({
          severity: 2, // MAJOR
          checkName: 'No Checks Executed',
          checkShortName: 'NO_CHECKS',
          checkMessage: 'No quality checks were executed. This may indicate a configuration issue.',
        });
      }
      
      // Detectar si no se validaron changesets
      if (trimmedLine.includes('Changesets Validated: None')) {
        issues.push({
          severity: 1, // MINOR
          checkName: 'No Changesets Validated',
          checkShortName: 'NO_CHANGESETS',
          checkMessage: 'No changesets were validated during the checks run.',
        });
      }
      
      // Detectar si no se ejecutaron checks contra changesets
      if (trimmedLine.includes('Checks run against each changeset: None')) {
        issues.push({
          severity: 1, // MINOR
          checkName: 'No Changeset Checks',
          checkShortName: 'NO_CHANGESET_CHECKS',
          checkMessage: 'No checks were run against individual changesets.',
        });
      }
      
      // Detectar checks desconocidos omitidos
      if (trimmedLine.includes('Unknown Checks Skipped')) {
        issues.push({
          severity: 1, // MINOR
          checkName: 'Unknown Checks Skipped',
          checkShortName: 'UNKNOWN_CHECKS_SKIPPED',
          checkMessage: 'Some checks were skipped due to being unknown or requiring Liquibase upgrade.',
        });
      }
      
      // Detectar si no se ejecutaron checks de base de datos
      if (trimmedLine.includes('No database checks were run')) {
        issues.push({
          severity: 2, // MAJOR
          checkName: 'No Database Checks',
          checkShortName: 'NO_DB_CHECKS',
          checkMessage: 'No database checks were run. Consider setting checks-scope to include "database".',
        });
      }
      
      // Detectar si no se especificó base de datos
      if (trimmedLine.includes('No database specified')) {
        issues.push({
          severity: 1, // MINOR
          checkName: 'No Database Specified',
          checkShortName: 'NO_DB_SPECIFIED',
          checkMessage: 'No database was specified. Checks executed against H2 generated SQL, which may not contain certain objects.',
        });
      }
    }

    return this.buildChecksResult(issues);
  }

  /**
   * Construye el resultado final de los checks
   */
  private static buildChecksResult(issues: CheckIssue[]): ChecksResult {
    // Agrupar issues por severidad
    const issuesBySeverity = new Map<number, CheckIssue[]>();
    for (let i = 0; i <= 4; i++) {
      issuesBySeverity.set(i, []);
    }

    issues.forEach(issue => {
      const severityIssues = issuesBySeverity.get(issue.severity) || [];
      severityIssues.push(issue);
      issuesBySeverity.set(issue.severity, severityIssues);
    });

    // Calcular severidad máxima
    const maxSeverity = issues.length > 0 ? Math.max(...issues.map(i => i.severity)) : 0;

    // Determinar si debe fallar (fallará solo si hay issues de severidad 3 (CRITICAL) o 4 (BLOCKER))
    const shouldFail = maxSeverity >= 3;
    const failureReason = shouldFail ? this.getFailureReason(issuesBySeverity, maxSeverity) : undefined;

    return {
      totalIssues: issues.length,
      issuesBySeverity,
      maxSeverity,
      shouldFail,
      failureReason
    };
  }

  /**
   * Convierte el string de severidad de Liquibase a número
   */
  private static getSeverityFromCheck(severity: string): number {
    switch (severity?.toUpperCase()) {
      case 'INFO': return 0;
      case 'MINOR': return 1;
      case 'MAJOR': return 2;
      case 'CRITICAL': return 3;
      case 'BLOCKER': return 4;
      default: return 0; // INFO por defecto
    }
  }

  /**
   * Genera el mensaje de razón del fallo
   * El pipeline fallará automáticamente solo si encuentra issues de severidad 3 (CRITICAL) o 4 (BLOCKER)
   */
  private static getFailureReason(
    issuesBySeverity: Map<number, CheckIssue[]>,
    maxSeverity: number
  ): string {
    const severityName = this.SEVERITY_NAMES[maxSeverity as keyof typeof this.SEVERITY_NAMES] || 'UNKNOWN';
    const issuesAtMaxSeverity = issuesBySeverity.get(maxSeverity)?.length || 0;
    
    return `Pipeline failed because ${issuesAtMaxSeverity} issue(s) with severity ${severityName} (${maxSeverity}) were found. The pipeline automatically fails only for issues with severity 3 (CRITICAL) or 4 (BLOCKER).`;
  }

  /**
   * Genera un resumen detallado de los issues encontrados
   */
  static generateIssuesSummary(checksResult: ChecksResult): string {
    const summary: string[] = [];
    
    summary.push(`📊 Resumen de Issues de Checks:`);
    summary.push(`   Total de issues: ${checksResult.totalIssues}`);
    summary.push(`   Severidad máxima: ${this.SEVERITY_NAMES[checksResult.maxSeverity as keyof typeof this.SEVERITY_NAMES]} (${checksResult.maxSeverity})`);
    
    if (checksResult.shouldFail) {
      summary.push(`   ❌ Pipeline fallará automáticamente: ${checksResult.failureReason}`);
    } else {
      summary.push(`   ✅ Pipeline continuará (issues de severidad 0-2 (INFO, MINOR, MAJOR) no causan fallo)`);
    }

    // Mostrar breakdown por severidad
    summary.push(`   Breakdown por severidad:`);
    for (let severity = 4; severity >= 0; severity--) {
      const issues = checksResult.issuesBySeverity.get(severity) || [];
      if (issues.length > 0) {
        const severityName = this.SEVERITY_NAMES[severity as keyof typeof this.SEVERITY_NAMES];
        summary.push(`     ${severityName} (${severity}): ${issues.length} issue(s)`);
        
        // Mostrar detalles de los issues más críticos (solo los primeros 3)
        issues.slice(0, 3).forEach(issue => {
          summary.push(`       - ${issue.checkShortName}: ${issue.checkMessage}`);
          if (issue.changesetId) {
            summary.push(`         Changeset: ${issue.changesetId} (${issue.changesetAuthor})`);
          }
        });
        
        if (issues.length > 3) {
          summary.push(`       ... y ${issues.length - 3} issue(s) más`);
        }
      }
    }

    return summary.join('\n');
  }
}
