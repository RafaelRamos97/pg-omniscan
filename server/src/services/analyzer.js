const dbService = require('./db-service');
const sqlLoader = require('../utils/sql-loader');
const intelligenceService = require('./intelligence-service');

const GROUP_CONFIG = {
  overview: { label: 'Visão Geral', icon: '📊', prefix: ['database_', 'report_'] },
  indexes: { label: 'Saúde dos Índices', icon: '🔍', prefix: ['index_'] },
  tables: { label: 'Saúde das Tabelas', icon: '📋', prefix: ['tables_', 'trigger_', 'fillfactor'] },
  performance: { label: 'Performance', icon: '⚡', prefix: ['statements_', 'checkpoints', 'bgwriter', 'shared_buffers'] },
  maintenance: { label: 'Manutenção', icon: '🔧', prefix: ['vacuum_', 'progress_', 'autovacuum_'] },
  io: { label: 'I/O', icon: '💾', prefix: ['io_', 'ls_'] },
  security: { label: 'Segurança', icon: '🛡️', prefix: ['user_', 'security_', 'object_', 'pg_hba', 'conf_auth'] },
  replication: { label: 'Replicação & HA', icon: '🔗', prefix: ['replication_', 'publication_', 'subscription_', 'wal_receiver'] },
  config: { label: 'Configuração', icon: '⚙️', prefix: ['pg_config', 'conf_', 'pg_hba'] },
  emergency: { label: 'Emergência (Kill)', icon: '🚨', prefix: ['kill_'] },
  internals: { label: 'Internals (Avançado)', icon: '🧠', prefix: ['internal_', 'slru_', 'prepared_'] },
  others: { label: 'Utilitários', icon: '📁', prefix: [] }
};

const CORE_SCRIPTS = [
  'database_stats', 'database_size', 'report_database',
  'index_dup', 'index_invalid', 'index_poor', 'index_poor_drop', 'index_missing_in_fk', 'index_big', 'index_table_missing',
  'tables_with_seq_scan', 'tables_bloat_approx', 'tables_alignment_padding', 'tables_without_pk', 'tables_not_used', 'tables_changes',
  'statements_top5', 'statements_time', 'statements_calls', 'checkpoints', 'bgwriter',
  'vacuum_wraparound_table', 'progress_vacuum', 'progress_analyze', 'progress_index', 'autovacuum_vacuum_queue',
  'io_table_heap', 'io_table_index', 'io_cluster', 'io_sequence', 'ls_temp',
  'user_priv', 'security_policies', 'object_privileges_list',
  'pg_config', 'shared_buffers_stats'
];

/**
 * Analyzer: Principal DBA Analysis Engine
 */
class Analyzer {
  constructor() {
    this.history = [];
  }

  _parsePgArray(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    const clean = val.toString().replace(/^\{|\}$|^\[|\]$/g, '');
    if (!clean) return [];
    return clean.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  }

  _parseSize(sizeStr) {
    if (!sizeStr) return 0;
    const num = parseFloat(sizeStr);
    const unit = sizeStr.toLowerCase();
    if (unit.includes('gb')) return num * 1024 * 1024 * 1024;
    if (unit.includes('mb')) return num * 1024 * 1024;
    if (unit.includes('kb')) return num * 1024;
    return num;
  }

  _getData(catItems, baseName) {
    if (!catItems) return [];
    const item = catItems.find(i => i.baseName === baseName);
    return item?.data || [];
  }

  _getGroupForScript(baseName) {
    for (const [groupId, config] of Object.entries(GROUP_CONFIG)) {
      if (config.prefix.some(p => baseName.startsWith(p))) return groupId;
    }
    return 'others';
  }

  /**
   * Retorna metadados detalhados de TODOS os scripts do repositório agrupados.
   */
  async getDetailedMetadata(versionNum) {
    sqlLoader.loadAll();
    const allCompatible = sqlLoader.getCompatibleScripts(versionNum);

    // Agrupar scripts dinamicamente
    const groups = {};
    Object.keys(GROUP_CONFIG).forEach(id => {
      groups[id] = { ...GROUP_CONFIG[id], id, scripts: [] };
    });

    sqlLoader.scripts.forEach(s => {
      // Evitar duplicados (pegar apenas um baseName único)
      const groupId = this._getGroupForScript(s.baseName);
      if (!groups[groupId].scripts.some(existing => existing.baseName === s.baseName)) {
        const found = allCompatible.find(c => c.baseName === s.baseName);
        groups[groupId].scripts.push({
          baseName: s.baseName,
          name: s.baseName.replace(/_/g, ' ').toUpperCase(),
          compatible: !!found,
          exists: true,
          reason: !found ? 'Incompatível com sua versão de PG' : null,
          isCore: CORE_SCRIPTS.includes(s.baseName)
        });
      }
    });

    return Object.values(groups).filter(g => g.scripts.length > 0);
  }

  /**
   * Retorna metadados básicos das categorias
   */
  getAvailableCategories() {
    return Object.keys(GROUP_CONFIG).map(key => ({
      id: key,
      label: GROUP_CONFIG[key].label,
      icon: GROUP_CONFIG[key].icon
    }));
  }

  /**
   * Orquestrador Principal da Análise
   */
  async runAnalysis(selectedCategories, onProgress, checkCancelled, excludedScripts = []) {
    const notify = (data, percent, type = 'status') => {
      if (typeof data === 'object') {
        console.log(`[Analyzer] Evento: ${data.type} (${data.percent || 0}%)`);
        if (onProgress) onProgress(data);
      } else {
        console.log(`[Analyzer] ${data} (${percent}%)`);
        if (onProgress) onProgress({ type: 'progress', message: data, percent, statusType: type });
      }
    };

    notify('[DEBUG] Iniciando conexão e coleta de metadados...', 2);

    let versionNum = 140000; // Fallback para PG 14
    try {
      notify('[DEBUG] Verificando versão do PostgreSQL...', 5);
      versionNum = await dbService.getVersionNum();
    } catch (err) {
      console.warn('[Analyzer] Erro ao ler versão, usando fallback:', err.message);
      notify('Aviso: Lentidão ao ler versão do banco. Continuando...', 7);
    }

    let statsReset = 'N/A';
    try {
      notify('[DEBUG] Verificando tempo de uptime das estatísticas...', 8);
      const statsResetData = await dbService.query('SELECT to_char(stats_reset, \'YYYY-MM-DD HH24:MI:SS\') as stats_reset FROM pg_stat_database WHERE datname = current_database();', 5000);
      statsReset = statsResetData[0]?.stats_reset || 'N/A';
    } catch (err) {
      console.warn('[Analyzer] Erro ao ler stats_reset:', err.message);
    }

    notify('[DEBUG] Carregando arsenal de scripts do repositório...', 10);
    sqlLoader.loadAll((current, total, file) => {
      if (current % 50 === 0 || current === total) {
        const p = 10 + Math.floor((current / total) * 10);
        notify(`Processando repositório: ${current}/${total}...`, p);
      }
    });

    const allCompatible = sqlLoader.getCompatibleScripts(versionNum);
    notify(`[DEBUG] ${allCompatible.length} scripts compatíveis encontrados para a versão ${versionNum}.`, 20);

    const report = {
      timestamp: new Date().toISOString(),
      database: dbService.config?.database || 'N/A', // Garantia defensiva contra null reference
      version: versionNum,
      stats_reset: statsReset,
      categories: {},
      stats: { total: 0, executed: 0, errors: 0, empty: 0 },
    };

    const CORE_SCRIPTS = [
      'index_dup', 'index_invalid', 'index_poor', 'index_missing_in_fk', 'index_big',
      'tables_with_seq_scan', 'tables_bloat_approx', 'tables_without_pk', 'tables_not_used',
      'statements_top5', 'statements_time', 'vacuum_wraparound_table', 'checkpoints', 'bgwriter'
    ];

    const tasks = [];

    // Agora selecionamos scripts de QUALQUER categoria escolhida
    allCompatible.forEach(script => {
      const groupId = this._getGroupForScript(script.baseName);

      // Filtro de scripts psql wrapper (melhorado para ser mais permissivo com SQL puro)
      if (script.content.includes('\\if') || script.content.includes('\\gset')) {
        const cleaned = script.content.replace(/\\if.*|\\endif|\\gset.*/g, '').trim();
        if (cleaned.length < 20 || !cleaned.toLowerCase().includes('select')) return;
      }

      if (selectedCategories.includes(groupId)) {
        if (!excludedScripts.includes(script.baseName)) {
          // Prioridade V.I.P: Se for um script core, vai para o início da fila
          const isCore = CORE_SCRIPTS.includes(script.baseName);
          if (isCore) {
            tasks.unshift({ catName: groupId, script, priority: 1 });
          } else {
            tasks.push({ catName: groupId, script, priority: 0 });
          }
        }
      }
    });

    // Reordena garantindo que todos os priority:1 fiquem no topo
    tasks.sort((a, b) => b.priority - a.priority);

    report.stats.total = tasks.length;

    const totalTasks = tasks.length;
    let completedTasks = 0;

    for (const task of tasks) {
      if (checkCancelled()) break;

      const { catName, script } = task;
      completedTasks++;

      const prog = Math.min(20 + Math.floor((completedTasks / totalTasks) * 75), 95);
      notify({ 
        type: 'progress', 
        message: `[${completedTasks}/${totalTasks}] Analisando: ${script.baseName}`, 
        percent: prog 
      });

      try {
        const data = await dbService.query(script.content, 60000); // 60s via Protocolo
        
        // ANALISE DE INTELIGÊNCIA DBA
        const baseRecommendation = intelligenceService.analyze(script.baseName, data);

        const scriptResult = {
          script: script.fileName,
          baseName: script.baseName,
          content: script.content,
          data: data || [],
          rowCount: (data || []).length,
          baseRecommendation // Anexa a inteligência base aqui
        };

        if (!report.categories[catName]) report.categories[catName] = [];
        report.categories[catName].push(scriptResult);
        
        // ENVIO INCREMENTAL: Notifica o frontend com o dado real ASSIM QUE TERMINA
        notify({ 
          type: 'script_complete', 
          catName, 
          result: scriptResult,
          percent: prog
        });

        report.stats.executed++;
        if (data && data.length === 0) report.stats.empty++;
      } catch (err) {
        console.error(`Erro em ${script.baseName}:`, err.message);

        let friendlyError = err.message;
        if (err.code === '58P01') {
          friendlyError = `Aviso: Ambiente incompatível com este script. O PostgreSQL não encontrou o diretório de arquivos solicitado (provavelmente logging_collector desativado ou ambiente Cloud/Managed).`;
        } else if (err.code === '42501') {
          friendlyError = `Erro de Permissão: Seu usuário não tem privilégios para executar este script (Requer superuser ou permissões específicas de leitura de disco).`;
        } else if (err.code === '57014') {
          friendlyError = `Timeout de Diagnóstico: Este script foi cancelado porque demorou mais de 60s. É um script pesado para este volume de dados ou o sistema está sob alta carga.`;
        } else if (err.code === '42P01') {
          friendlyError = `Dependência Ausente: Este script tentou acessar um objeto que não existe. Geralmente ele depende de um script de "Preparação" que deve ser executado antes.`;
        }

        if (!report.categories[catName]) report.categories[catName] = [];
        report.categories[catName].push({
          script: script.fileName,
          baseName: script.baseName,
          error: friendlyError,
          errorCode: err.code
        });
        report.stats.errors++;
      }
    }

    notify('Análise concluída. Gerando inteligência...', 95);

    const recs = [];
    this._analyzeIndexes(report, recs);
    this._analyzeTables(report, recs);
    this._analyzeIO(report, recs);
    this._analyzeMaintenance(report, recs);
    this._analyzeGenericFindings(report, recs); // Captura o que sobrou

    // Ordenar por prioridade
    const priorityOrder = { 'CRITICAL': 0, 'HIGH': 1, 'MEDIUM': 2, 'LOW': 3 };
    report.recommendations = recs;
    notify('Auditoria concluída com sucesso.', 100);
    return report;
  }

  // ─── LÓGICA DE ESPECIALISTA (DBA RULES) ──────────────────

  _analyzeIndexes(report, recs) {
    const cats = report.categories;
    if (!cats.indexes) return;

    this._getData(cats.indexes, 'index_dup').forEach(idx => {
      this._parsePgArray(idx.Index || idx.index).forEach(name => {
        recs.push({
          priority: 'HIGH', category: 'Índices',
          message: `Índice Redundante: "${name}"`,
          detail: `Tabela: "${idx.Table || idx.table}". Gêmeo de outro índice.`,
          rationale: "Manutenção de índices duplicados consome IOPS desnecessariamente.",
          action: `DROP INDEX CONCURRENTLY "${name}";`
        });
      });
    });

    this._getData(cats.indexes, 'index_invalid').forEach(idx => {
      recs.push({
        priority: 'CRITICAL', category: 'Índices',
        message: `Índice INVÁLIDO: "${idx.indexname}"`,
        detail: `Tabela: "${idx.tablename}". Criado com falha.`,
        rationale: "Bloqueia planos de execução e consome espaço.",
        action: `DROP INDEX CONCURRENTLY "${idx.indexname}";`
      });
    });

    this._getData(cats.indexes, 'index_poor').forEach(idx => {
      if (idx.Reason === 'Never Used Indexes' && this._parseSize(idx.index_size) > 50 * 1024 * 1024) {
        recs.push({
          priority: 'MEDIUM', category: 'Índices',
          message: `Índice sem uso real: "${idx.Index || idx.index}"`,
          detail: `Tamanho: ${idx.index_size}. Uptime desde: ${report.stats_reset}.`,
          rationale: "Índices sem uso roubam espaço precioso do Buffer Cache.",
          action: `DROP INDEX CONCURRENTLY "${idx.Index || idx.index}";`
        });
      }
    });

    this._getData(cats.indexes, 'index_missing_in_fk').forEach(fk => {
      const dbTable = fk.table || fk.Table;
      const cols = fk.columns || fk.Columns;
      const safeName = `idx_${dbTable.split('.').pop()}_${cols.split(',').join('_').substring(0, 30)}`;
      recs.push({
        priority: 'HIGH', category: 'Performance',
        message: `FK sem índice: "${dbTable}" (${cols})`,
        detail: `Tamanho: ${fk.size || 'N/A'}. Causa Seq Scans em deletas no pai.`,
        rationale: "Gargalo severo de performance em operações de limpeza (DELETE) no sistema.",
        action: `CREATE INDEX CONCURRENTLY "${safeName}" ON ${dbTable} (${cols});`
      });
    });

    // 4. Index Bloat (Inchaço)
    this._getData(cats.indexes, 'index_bloat').forEach(idx => {
      const ratio = parseFloat(idx.bloat_ratio || idx.bloat_pct || 0);
      if (ratio > 40) {
        recs.push({
          priority: 'MEDIUM', category: 'Manutenção',
          message: `Inchaço no índice ${idx.index_name || idx.indexname}`,
          detail: `Bloat: ${ratio}% (${idx.bloat_size || 'N/A'}). Tabela: ${idx.table_name || idx.relname}`,
          rationale: "Índices 'inchados' degradam o tempo de busca e ocupam memória RAM desnecessária.",
          action: `REINDEX INDEX CONCURRENTLY "${idx.index_name || idx.indexname}";`
        });
      }
    });

    // 5. Unused Indexes (Não usados)
    this._getData(cats.indexes, 'index_unused').forEach(idx => {
      const size = this._parseSize(idx.index_size || idx.size);
      if (size > 50 * 1024 * 1024) { // > 50MB
        recs.push({
          priority: 'LOW', category: 'Custo',
          message: `Índice sem uso detectado: ${idx.index_name || idx.indexname}`,
          detail: `Tamanho: ${idx.index_size || idx.size}. Scans: ${idx.idx_scan || 0}.`,
          rationale: "Índices não utilizados penalizam a performance de INSERT/UPDATE sem trazer benefício na leitura.",
          action: `Considere remover após monitoramento: DROP INDEX CONCURRENTLY "${idx.index_name || idx.indexname}";`
        });
      }
    });
  }

  _analyzeGenericFindings(report, recs) {
    const cats = report.categories;
    const processedBases = [
      'index_dup', 'index_invalid', 'index_poor', 'index_missing_in_fk', 'index_bloat', 'index_unused',
      'tables_with_seq_scan', 'tables_bloat_approx', 'tables_without_pk', 'tables_not_used',
      'database_stats', 'io_table_heap', 'io_table_index', 'vacuum_wraparound_table'
    ];

    Object.entries(cats).forEach(([catName, scripts]) => {
      scripts.forEach(script => {
        // Se o script tem dados e NÃO foi processado por um analista específico
        if (script.data && script.data.length > 0 && !processedBases.includes(script.baseName)) {
          // Evita duplicar se o script já gerou recomendação por outro caminho
          const alreadyRec = recs.some(r => r.message.includes(script.baseName) || (script.baseName && r.message.includes(script.baseName.toUpperCase())));
          if (alreadyRec) return;

          recs.push({
            priority: 'LOW',
            category: 'Descoberta',
            message: `Achado em: ${script.baseName.replace(/_/g, ' ').toUpperCase()}`,
            detail: `O diagnóstico identificou ${script.data.length} linha(s) de metadados relevantes.`,
            rationale: "Este script faz parte do arsenal profundo e retornou dados que podem indicar comportamentos atípicos.",
            action: `Expanda a seção "${script.baseName}" nos detalhes abaixo para analisar os dados brutos.`
          });
        }
      });
    });
  }

  _analyzeTables(report, recs) {
    const cats = report.categories;
    if (!cats.tables) return;

    this._getData(cats.tables, 'tables_with_seq_scan').forEach(t => {
      const size = this._parseSize(t['Size']);
      const ratio = parseFloat(t['% Seq scan']);
      if (size > 100 * 1024 * 1024 && ratio > 50) {
        recs.push({
          priority: 'HIGH', category: 'Performance',
          message: `Dreno de Performance (Seq Scans): "${t['Table Name']}"`,
          detail: `Ratio: ${ratio}%. Volume: ${t['Seq scans/Day'] || 'N/A'} scans/dia.`,
          rationale: "O custo de leitura física no Cloud SQL deve ser evitado para tabelas > 100MB.",
          action: "Analise o EXPLAIN das queries lentas ou adicione índices sugeridos."
        });
      }
    });

    this._getData(cats.tables, 'tables_bloat_approx').forEach(t => {
      const ratio = parseFloat(t.bloat_ratio || '0');
      if (ratio > 30 && this._parseSize(t.table_size) > 500 * 1024 * 1024) {
        recs.push({
          priority: 'MEDIUM', category: 'Manutenção',
          message: `Bloat Excessivo em "${t.table_name || t.relname}"`,
          detail: `Inchaço físico: ${ratio}% (${t.bloat_size}).`,
          rationale: "Bloat causa IO Amplification e degrada a performance de Scan.",
          action: `Sugestão de limpeza: VACUUM FULL ou pg_repack em "${t.table_name || t.relname}".`
        });
      }
    });

    this._getData(cats.tables, 'tables_without_pk').forEach(t => {
      recs.push({
        priority: 'CRITICAL', category: 'Arquitetura',
        message: `Tabela sem Primary Key: "${t.table_name || t.relname}"`,
        detail: "Tabelas sem PK dificultam a replicação lógica e degradam a integridade.",
        rationale: "Standard DBA Rule: Toda tabela deve ter uma PK para performance e segurança.",
        action: `Defina uma Primary Key para a tabela "${t.table_name || t.relname}".`
      });
    });

    this._getData(cats.tables, 'tables_not_used').forEach(t => {
      if (this._parseSize(t.table_size) > 100 * 1024 * 1024) {
        recs.push({
          priority: 'LOW', category: 'Manutenção',
          message: `Tabela possivelmente obsoleta: "${t.table_name || t.relname}"`,
          detail: `Tamanho: ${t.table_size}. Zero leituras detectadas.`,
          rationale: "Tabelas grandes sem uso ocupam espaço e aumentam o tempo de manutenção.",
          action: `Verifique se a tabela "${t.table_name || t.relname}" ainda é necessária.`
        });
      }
    });
  }

  _analyzeIO(report, recs) {
    const cats = report.categories;
    if (!cats.io) return;

    // 1. Database Level - Global Cache Hit
    this._getData(cats.io, 'database_stats').forEach(db => {
      const hit = parseFloat(db['Cache hit'] || '100');
      if (hit < 93) {
        recs.push({
          priority: 'HIGH', category: 'I/O',
          message: "Eficiência de Cache do Banco Crítica",
          detail: `Cache Hit Global: ${hit}%. Muitas leituras físicas em disco.`,
          rationale: "IOPS saturados degradam toda a aplicação. O cache ideal deveria ser > 95%.",
          action: "Aumente a RAM da instância (Instance Type Upgrade) para ampliar o Buffer Cache."
        });
      }

      // 2. Temp Files - work_mem Pressure
      const tempBytesPerDay = this._parseSize(db['Temp bytes / Day']);
      if (tempBytesPerDay > 500 * 1024 * 1024) { // > 500MB/dia
        recs.push({
          priority: 'MEDIUM', category: 'Performance',
          message: "Pressão de Arquivos Temporários",
          detail: `Uso médio: ${db['Temp bytes / Day']} em arquivos temporários (disco).`,
          rationale: "Operações de Sort/Hash que não cabem em RAM são enviadas para o disco, o que é 100x mais lento.",
          action: "Aumente o parâmetro 'work_mem' ou otimize queries com muitos SORT/ORDER BY."
        });
      }
    });

    // 3. Object Level - Heap Cache Hit (Tabelas Intensivas)
    this._getData(cats.io, 'io_table_heap').forEach(t => {
      const hit = parseFloat(t['Hit %'] || '100');
      const sizeBytes = this._parseSize(t['Table Size']);

      if (hit < 85 && sizeBytes > 200 * 1024 * 1024) {
        recs.push({
          priority: 'HIGH', category: 'I/O',
          message: `Cache Miss Crítico na Tabela "${t['Table']}"`,
          detail: `Buffer Hit: ${hit}%. Tamanho: ${t['Table Size']}.`,
          rationale: "Esta tabela está forçando leituras constantes em disco. Provavelmente seu working set não cabe na memória.",
          action: "Revise a indexação ou considere o uso de Partidionamento para reduzir o set de dados ativos."
        });
      }
    });

    // 4. Object Level - Index Cache Hit
    this._getData(cats.io, 'io_table_index').forEach(t => {
      const hit = parseFloat(t['Hit %'] || '100');
      const idxSize = this._parseSize(t['Indexes Size']);

      if (hit < 95 && idxSize > 100 * 1024 * 1024) {
        recs.push({
          priority: 'MEDIUM', category: 'I/O',
          message: `Baixa Eficiência de Cache em Índices: "${t['Table']}"`,
          detail: `Index Hit: ${hit}%. Tamanho Índices: ${t['Indexes Size']}.`,
          rationale: "Índices devem residir quase integralmente na RAM. Leituras físicas em índices são extremamente custosas.",
          action: "Verifique se há índices duplicados ou desnecessários que estão 'expulsando' os índices ativos da memória."
        });
      }
    });
  }

  _analyzeMaintenance(report, recs) {
    const cats = report.categories;
    if (!cats.maintenance) return;

    this._getData(cats.maintenance, 'vacuum_wraparound_table').forEach(t => {
      const age = parseInt(t['Age'] || t['age'] || 0);
      if (age > 150000000) {
        recs.push({
          priority: 'CRITICAL', category: 'Manutenção',
          message: `Risco iminente de WRAPAROUND: "${t['Table'] || t.relname}"`,
          detail: `Age: ${age}. Limite perigoso de interrupção do cluster.`,
          rationale: "Ao atingir 200M, o banco para de gravar dados para prevenir corrupção catastrófica.",
          action: `Execute URGENTEMENTE: VACUUM FREEZE "${t['Table'] || t.relname}";`
        });
      }
    });
  }

  _analyzeSecurity(report, recs) {
    const cats = report.categories;
    if (!cats.security) return;

    const superusers = this._getData(cats.security, 'user_priv').filter(u => u.rolsuper || u.super_user === 'true' || u.super_user === true);
    if (superusers.length > 3) {
      recs.push({
        priority: 'MEDIUM', category: 'Segurança',
        message: "Excesso de Superusuários",
        detail: `Detectados ${superusers.length} usuários com poder total.`,
        rationale: "Muitas contas com SUPERUSER aumentam o risco de incidentes catastróficos por erro humano ou invasão.",
        action: "Audite as contas e remova o privilégio SUPERUSER de quem não for estritamente necessário."
      });
    }
  }
}

module.exports = new Analyzer();
