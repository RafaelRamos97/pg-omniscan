const fs = require('fs');
const path = require('path');
const { validateSQL, isBlockedByName } = require('./sql-guard');

const SCRIPTS_DIR = path.join(__dirname, '../../../pg_scripts/sql');

/**
 * Carrega e filtra os scripts do repositório pg_scripts.
 * 
 * Lidou com 469 scripts:
 * - Remove meta-comandos psql (\set, \pset, \timing, \i, \qecho, \o, \r, \if, \endif, \t, \gset, etc.)
 * - Remove scripts compostos (report_cluster / report_database) que usam \i para chamar sub-scripts
 * - Filtra scripts por versão do PG
 * - Valida segurança via SQL Guard (bloqueia kill, reset, DDL generators)
 */
class SQLLoader {
  constructor() {
    this.scripts = [];
    this.blocked = [];
    this.isLoaded = false;
  }

  /**
   * Inicializa o carregamento de todos os scripts.
   * Suporta callback de progresso para a interface.
   */
  loadAll(onProgress = null) {
    if (this.isLoaded) {
      console.log(`[SQL Loader] ⚡ Usando cache de ${this.scripts.length} scripts`);
      return this.scripts;
    }

    const files = fs.readdirSync(SCRIPTS_DIR).filter(f => f.endsWith('.sql'));
    const total = files.length;
    const loaded = [];
    const blocked = [];

    for (let i = 0; i < total; i++) {
      const file = files[i];
      const info = this.parseFileName(file);

      if (onProgress && i % 20 === 0) {
        onProgress(i, total, file);
      }

      // Verifica bloqueio por nome base primeiro
      if (isBlockedByName(info.baseName)) {
        blocked.push({ file, reason: 'Script bloqueado por nome (kill/reset/DDL generator)' });
        continue;
      }

      const fullPath = path.join(SCRIPTS_DIR, file);
      const rawContent = fs.readFileSync(fullPath, 'utf8');

      // Limpa meta-comandos do psql
      const cleanedContent = this.cleanPSQLCommands(rawContent);

      // Pula scripts vazios após limpeza (geralmente são scripts wrapper com apenas \i)
      if (!cleanedContent || cleanedContent.trim().length < 10) {
        blocked.push({ file, reason: 'Script vazio após limpeza de meta-comandos (wrapper script)' });
        continue;
      }

      // Valida segurança do conteúdo
      const { safe, reason } = validateSQL(cleanedContent);
      if (!safe) {
        blocked.push({ file, reason });
        continue;
      }

      // Verifica se o SQL resultante começa com SELECT/WITH/SHOW (ignora SET puro)
      const normalized = cleanedContent.replace(/^SET\s+[^;]+;\s*/gi, '').trim();
      if (normalized.length === 0) {
        blocked.push({ file, reason: 'Apenas comandos SET, sem SELECT' });
        continue;
      }

      loaded.push({
        id: file,
        ...info,
        path: fullPath,
        content: cleanedContent,
      });
    }

    this.scripts = loaded;
    this.blocked = blocked;
    this.isLoaded = true;

    console.log(`[SQL Loader] ✅ ${loaded.length} scripts seguros carregados e cacheados`);
    return this.scripts;
  }

  /**
   * Remove todos os meta-comandos psql e comandos SET de sessão.
   * Mantém apenas SQL puro relevante para análise.
   */
  cleanPSQLCommands(content) {
    if (!content) return '';
    
    // Processamento linha-a-linha para ser imune a ReDoS (travamento de Regex em arquivos grandes)
    const lines = content.split('\n');
    let inBlockComment = false;
    const cleanedLines = [];

    for (let line of lines) {
      let trimmed = line.trim();

      // Lógica básica de comentário em bloco
      if (trimmed.includes('/*')) inBlockComment = true;
      
      const shouldSkip = inBlockComment || 
                         trimmed.startsWith('\\') || 
                         trimmed.startsWith('--') || 
                         /^(SET|RESET)\s+/i.test(trimmed);

      if (!shouldSkip) {
        cleanedLines.push(line);
      }

      if (trimmed.includes('*/')) inBlockComment = false;
    }

    return cleanedLines.join('\n').trim();
  }

  /**
   * Extrai nome base e versão mínima do PG a partir do nome do arquivo.
   * 
   * Padrões tratados:
   *  - index_poor.sql          -> baseName: index_poor, minVersion: 0
   *  - index_poor_84+.sql      -> baseName: index_poor, minVersion: 80400
   *  - autovacuum_vacuum_+.sql -> baseName: autovacuum_vacuum_+, minVersion: 0
   *  - tables_with_oid_11-.sql -> baseName: tables_with_oid, maxVersion: 110000
   */
  parseFileName(filename) {
    const name = filename.replace('.sql', '');

    // Match version suffix like _84+, _96+, _10+, _12+, _13+, _14+, _15+, _17+, _18+
    // Two-digit versions: _82+ means 8.2, _84+ means 8.4, _90+ means 9.0, _91+ means 9.1, etc.
    // Two+ digit versions: _10+ means 10.0, _12+ means 12.0, etc.
    const versionMatch = name.match(/_(\d{2,3})\+$/);

    if (versionMatch) {
      const vStr = versionMatch[1];
      const baseName = name.replace(versionMatch[0], '');
      let minVersion;

      if (vStr.startsWith('8') || vStr.startsWith('9')) {
        // PG 8.x or 9.x: first is major, second is minor (e.g., 84 = 8.4 = 80400, 96 = 9.6 = 90600)
        const major = parseInt(vStr[0]);
        const minor = parseInt(vStr[1]);
        minVersion = major * 10000 + minor * 100;
      } else {
        // PG 10+: two or three digits mean major versions (e.g., 10 = 10.0 = 100000, 12 = 120000, 140 = 140000)
        const major = parseInt(vStr);
        minVersion = major >= 100 ? major * 100 : major * 10000;
      }

      return { baseName, minVersion, isVersioned: true };
    }

    // Match max version like _11-.sql
    const maxMatch = name.match(/_(\d{2,3})-$/);
    if (maxMatch) {
      const vStr = maxMatch[1];
      const baseName = name.replace(maxMatch[0], '');
      let maxVersion;
      if (vStr.startsWith('8') || vStr.startsWith('9')) {
        maxVersion = parseInt(vStr[0]) * 10000 + parseInt(vStr[1]) * 100;
      } else {
        const major = parseInt(vStr);
        maxVersion = major >= 100 ? major * 100 : major * 10000;
      }
      return { baseName, minVersion: 0, maxVersion, isVersioned: true };
    }

    return { baseName: name, minVersion: 0, isVersioned: false };
  }

  /**
   * Retorna os scripts mais específicos compatíveis com a versão do PG.
   * Para cada baseName, seleciona a versão com minVersion mais alta que ainda é <= pgVersionNum.
   */
  getCompatibleScripts(pgVersionNum) {
    const scriptsByBase = {};

    for (const script of this.scripts) {
      // Pula scripts com maxVersion se o PG é mais recente
      if (script.maxVersion && pgVersionNum > script.maxVersion) continue;
      
      // Pula se a versão mínima é maior que a do PG
      if (script.minVersion > pgVersionNum) continue;

      const current = scriptsByBase[script.baseName];
      if (!current || script.minVersion > current.minVersion) {
        scriptsByBase[script.baseName] = script;
      }
    }

    return Object.values(scriptsByBase);
  }

  /**
   * Retorna o relatório de scripts bloqueados (para debug/auditoria).
   */
  getBlockedReport() {
    return this.blocked;
  }
}

module.exports = new SQLLoader();
