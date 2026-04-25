/**
 * SQL Guard - Previne a execução de qualquer comando que não seja SELECT de visualização.
 * 
 * Escaneados TODOS os 469 scripts do repositório pg_scripts:
 * - 345 são SELECT puros (seguros)
 * - 124 contêm ações perigosas (kill, reset, DDL, DML, etc.)
 */

// Scripts explicitamente bloqueados por serem AÇÕES ATIVAS (kill, reset, reindex, vacuum direto)
const BLOCKED_BASENAMES = [
  'kill_active_bufferpin',
  'kill_active_io_query_time_greater_10_seconds',
  'kill_active_io_query_time_greater_60_seconds',
  'kill_active_ipc',
  'kill_active_lwlock',
  'kill_active_query_time_greater_10_seconds',
  'kill_active_query_time_greater_60_seconds',
  'kill_active_wait_events',
  'kill_idle_greater_10_minutes',
  'kill_idle_greater_60_minutes',
  'kill_idle_in_transaction_60_seconds',
  'kill_oldest_blocker',
  'reset_all_stats',
  'index_stat_btree_reindex',     // Executa comandos ativos (REINDEX)
  'index_check_btree_integrity',  // Usa \gexec para ativação dinâmica
  'index_check_gin_integrity',    // Usa \gexec para ativação dinâmica
  'vacuum_wraparound_table_clean',// Usa vacuum direto
  'vacuum_wraparound_table_multixact', // Usa vacuum direto
  'reindex_on_new_glibc',         
  'report_cluster',               // Meta-script não executável via driver
  'report_database',              // Meta-script não executável via driver
  'clean_query',                  // Meta-comandos psql interativos
];

// Funções que mutam estado do banco
const BLOCKED_FUNCTIONS = [
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_stat_reset',
  'pg_stat_reset_shared',
  'pg_stat_reset_slru',
  'pg_stat_reset_replication_slot',
  'pg_stat_reset_subscription_stats',
  'pg_stat_statements_reset',
  'nextval',
  'setval',
  'bt_index_check',
  'gin_index_check',
];

// Keywords que indicam mutação direta
const BLOCKED_KEYWORDS_IN_CONTENT = [
  'ANALYZE;',           // ANALYZE bare (não como coluna)
  'VACUUM',             // VACUUM bare
  'REINDEX',
  '\\gexec',            // Execução dinâmica perigosa
];

/**
 * Verifica se um script base é bloqueado por nome.
 */
function isBlockedByName(baseName) {
  return BLOCKED_BASENAMES.some(blocked => baseName === blocked || baseName.startsWith(blocked + '_'));
}

/**
 * Valida o conteúdo SQL após limpeza dos meta-comandos psql.
 * @param {string} sql - SQL limpo (sem meta-comandos psql)
 * @returns {{safe: boolean, reason?: string}}
 */
function validateSQL(sql) {
  if (!sql || sql.trim().length === 0) {
    return { safe: false, reason: 'SQL vazio após limpeza.' };
  }

  // Verifica funções perigosas
  for (const func of BLOCKED_FUNCTIONS) {
    const regex = new RegExp(`\\b${func}\\s*\\(`, 'i');
    if (regex.test(sql)) {
      return { safe: false, reason: `Função proibida encontrada: ${func}` };
    }
  }

  // Verifica keywords de mutação no conteúdo
  for (const keyword of BLOCKED_KEYWORDS_IN_CONTENT) {
    if (sql.includes(keyword)) {
      return { safe: false, reason: `Keyword de mutação encontrada: ${keyword}` };
    }
  }

  return { safe: true };
}

/**
 * Validação FINAL e RIGOROSA do conteúdo do SQL.
 * Garante que nada além de SELECT ou comandos de sessão sejam executados.
 */
function validateStrictReadOnly(sql) {
  if (!sql || typeof sql !== 'string') return false;

  // 1. Limpeza inicial de comentários para análise
  const cleanSql = sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--.*$/gm, ' ')
    .trim();

  if (cleanSql === '') return false;

  // 2. Quebra por ponto e vírgula para validar comandos múltiplos
  const statements = cleanSql.split(';').map(s => s.trim()).filter(s => s.length > 0);

  const safeStartKeywords = /^(SELECT|WITH|SHOW|SET|RESET)\b/i;
  const forbiddenKeywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'TRUNCATE', 'ALTER', 'GRANT', 'REVOKE', 'CREATE', 'REINDEX', 'VACUUM', 'ANALYZE', 'LISTEN', 'NOTIFY', 'COPY'];

  for (const stmt of statements) {
    // 2.1 Verifica se o comando começa com palavra permitida
    if (!safeStartKeywords.test(stmt)) {
      console.error(`[SQL Guard] BLOQUEIO: Comando não inicia com keyword permitida: "${stmt.substring(0, 20)}..."`);
      return false;
    }

    // 2.2 Se for SET ou RESET, verifica se é uma variável de sessão segura
    if (/^(SET|RESET)\b/i.test(stmt)) {
      // Bloqueia tentativas de mudar usuário ou privilégios
      if (/\b(ROLE|SESSION AUTHORIZATION|PASSWORD|ENCRYPTION)\b/i.test(stmt)) {
        console.error(`[SQL Guard] BLOQUEIO: Tentativa de alteração de privilégios via SET/RESET.`);
        return false;
      }
    }

    // 2.3 Busca por keywords proibidas (DML/DDL) fora de aspas
    const wordsToInspect = stmt
      .replace(/'[^']*'/g, ' ')  
      .replace(/"[^"]*"/g, ' '); 
    
    for (const kw of forbiddenKeywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      if (regex.test(wordsToInspect)) {
        console.error(`[SQL Guard] BLOQUEIO CRÍTICO: Keyword "${kw}" detectada.`);
        return false;
      }
    }
  }

  return true;
}

module.exports = { validateSQL, isBlockedByName, BLOCKED_BASENAMES, validateStrictReadOnly };
