/**
 * IntelligenceService: O Cérebro DBA de Elite
 * Baseado em Heurísticas de Especialistas (Cybertec, EDB, 2ndQuadrant)
 */
class IntelligenceService {
  constructor() {
    this.rules = {
      // --- BLOAT & ESPAÇO ---
      'index_bloat_approx': {
        title: 'Fragmentação de Índice (Bloat)',
        severity: (row) => parseFloat(row.bloat_ratio || 0) > 40 ? 'warning' : 'info',
        condition: (row) => parseFloat(row.bloat_ratio || 0) > 20,
        advice: (row) => parseFloat(row.bloat_ratio || 0) > 40 
          ? 'Fragmentação Crítica (>40%). Recomenda-se REINDEX CONCURRENTLY para compactar o índice e reduzir I/O.'
          : 'Fragmentação moderada detectada. Monitore o crescimento. Se ultrapassar 40%, planeje um REINDEX.',
        impact: 'Aumento do tempo de busca e desperdício de memória cache.'
      },
      'tables_bloat_approx': {
        title: 'Fragmentação de Tabela (Table Bloat)',
        severity: (row) => parseFloat(row.bloat_ratio || 0) > 40 ? 'warning' : 'info',
        condition: (row) => parseFloat(row.bloat_ratio || 0) > 20,
        advice: (row) => `Tabela com ${row.bloat_ratio}% de bloat. Se o autovacuum não estiver reduzindo este valor, avalie ajustar o autovacuum_vacuum_scale_factor para esta tabela específica.`,
        impact: 'Leituras de disco (Seq Scans) ficam mais lentas pois o banco lê "buracos" no arquivo.'
      },

      // --- VACUUM & WRAPAROUND ---
      'vacuum_wraparound': {
        title: 'Transaction ID Wraparound (RISCO DE SHUTDOWN)',
        severity: 'critical',
        condition: (row) => parseInt(row.xid_age || row.age || 0) > 1000000000,
        advice: (row) => {
          const age = parseInt(row.xid_age || row.age || 0);
          if (age > 2000000000) return 'URGENTE: Shutdown iminente (>2B transações). Execute VACUUM FREEZE agora!';
          return 'ALERTA: Mais de 1 Bilhão de transações sem freeze. O autovacuum pode estar bloqueado por transações longas.';
        },
        impact: 'O PostgreSQL irá parar de aceitar conexões se atingir o limite de 2 Bilhões para evitar perda de dados.'
      },

      // --- INDEX HEALTH ---
      'index_invalid': {
        title: 'Índice Inválido (Corrompido)',
        severity: 'critical',
        advice: 'O índice falhou durante a criação ou foi corrompido. Ele consome I/O mas não é usado. Execute DROP INDEX e tente recriar com CONCURRENTLY.',
        impact: 'Consumo inútil de disco e I/O durante updates na tabela.'
      },
      'index_unused': {
        title: 'Índice Nunca Utilizado',
        severity: 'info',
        condition: (row) => parseInt(row.idx_scan || 0) === 0 && parseInt(row.idx_size_bytes || 0) > 1024 * 1024,
        advice: 'Este índice nunca foi usado para buscas. Considere removê-lo para acelerar os INSERTS e UPDATES nesta tabela.',
        impact: 'Lentidão em escritas e desperdício de memória no Buffer Cache.'
      },

      // --- PERFORMANCE & QUERIES ---
      'tables_with_seq_scan': {
        title: 'Excesso de Sequential Scans',
        severity: 'warning',
        condition: (row) => parseInt(row.seq_scan || 0) > 10000 && parseInt(row.n_live_tup || 0) > 5000,
        advice: 'Esta tabela está sendo lida inteira muitas vezes. Verifique se as queries principais estão usando filtros que poderiam ser indexados.',
        impact: 'Gargalo de CPU e I/O.'
      },
      'locks': {
        title: 'Bloqueios (Lock Contention)',
        severity: 'warning',
        condition: (row) => row.wait_event_type === 'Lock' || row.waiting === true,
        advice: 'Existem processos aguardando liberação de travas. Verifique transações longas ou comandos DDL (como ALTER TABLE) em execução.',
        impact: 'Aumento da latência das transações e risco de travamento da aplicação.'
      }
    };
  }

  analyze(scriptBaseName, data) {
    if (!data || !Array.isArray(data) || data.length === 0) return null;

    const ruleKey = Object.keys(this.rules).find(key => scriptBaseName.startsWith(key));
    const rule = this.rules[ruleKey];

    if (!rule) return null;

    // Se a regra tiver uma condição baseada em dados, verificamos se alguma linha dispara o alerta
    const problematicRow = data.find(row => {
      if (typeof rule.condition === 'function') return rule.condition(row);
      return true; // Se não houver condição, qualquer dado no script dispara
    });

    if (!problematicRow) return null;

    return {
      title: rule.title,
      severity: typeof rule.severity === 'function' ? rule.severity(problematicRow) : rule.severity,
      advice: typeof rule.advice === 'function' ? rule.advice(problematicRow) : rule.advice,
      impact: rule.impact,
      scriptName: scriptBaseName
    };
  }
}

module.exports = new IntelligenceService();
