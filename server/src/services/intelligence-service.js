/**
 * IntelligenceService: O Cérebro DBA de Elite
 * Baseado em Heurísticas de Especialistas (Cybertec, EDB, 2ndQuadrant)
 */
class IntelligenceService {
  constructor() {
    this.rules = {
      // --- SEGURANÇA & ACESSOS (FASE 1) ---
      'pg_hba': {
        title: 'Vulnerabilidade de Autenticação (pg_hba.conf)',
        severity: 'critical',
        condition: (row) => row.auth_method === 'trust' && row.address && !row.address.startsWith('127.0.0.1') && !row.address.startsWith('::1'),
        advice: 'O método "trust" está configurado para conexões remotas. Isso permite que qualquer pessoa na rede conecte-se sem senha. Altere para "scram-sha-256" ou "md5" imediatamente.',
        impact: 'Acesso total e irrestrito ao banco de dados por qualquer cliente na faixa de IP permitida.'
      },
      'user_priv': {
        title: 'Usuários com Superpoderes',
        severity: 'warning',
        condition: (row) => row.super === 'X' && row.role !== 'postgres',
        advice: (row) => `O usuário '${row.role}' possui privilégios de SUPERUSER. Avalie se isso é estritamente necessário ou aplique o princípio do menor privilégio.`,
        impact: 'Um superusuário comprometido pode apagar todo o cluster, ler arquivos do SO e contornar todas as regras de segurança.'
      },

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
      },

      // --- MEMÓRIA & CACHE ---
      'database_stats': {
        title: 'Cache Hit Ratio Baixo',
        severity: 'warning',
        condition: (row) => {
          const hitRatioStr = row['Cache hit'];
          if (!hitRatioStr) return false;
          // Converte "  99.00 %" para 99.00
          const ratio = parseFloat(hitRatioStr.replace('%', '').trim());
          return !isNaN(ratio) && ratio < 90;
        },
        advice: 'O banco está buscando muitos dados no disco em vez da memória (< 90% de hit ratio). Avalie aumentar o shared_buffers (ideal 25% a 40% da RAM) ou otimizar queries pesadas.',
        impact: 'Alta latência nas leituras (I/O Bound), deixando o banco lento para os usuários finais.'
      },

      // --- I/O & WAL ---
      'checkpoints': {
        title: 'Frequência de Checkpoints Anormal',
        severity: (row) => {
          const reqStr = row['Checkpoints req'];
          const reqRatio = parseFloat((reqStr || '').replace('%', '').trim());
          return reqRatio > 50 ? 'critical' : 'warning';
        },
        condition: (row) => {
          const reqStr = row['Checkpoints req'];
          if (!reqStr) return false;
          const ratio = parseFloat(reqStr.replace('%', '').trim());
          return !isNaN(ratio) && ratio > 20; // Mais de 20% forçados já é alerta
        },
        advice: (row) => {
          const reqStr = row['Checkpoints req'];
          const reqRatio = parseFloat((reqStr || '').replace('%', '').trim());
          if (reqRatio > 50) return `CRÍTICO: ${reqRatio}% dos checkpoints são forçados por volume de WAL. Aumente max_wal_size URGENTEMENTE para evitar picos catastróficos de I/O de disco.`;
          return 'Muitos checkpoints forçados (requested). O ideal é que a maioria seja "timed". Avalie aumentar o max_wal_size.';
        },
        impact: 'Picos massivos de escrita no disco que travam outras operações (I/O Spikes).'
      },

      // --- TRÁFEGO & SESSÕES (FASE 2) ---
      'connections_running': {
        title: 'Queries Longas (Long Running Queries)',
        severity: 'warning',
        condition: (row) => {
          // Q Start e Q Xact vêm no formato HH24:MI:SS. Vamos pegar tudo que tiver horas ou dezenas de minutos (ex: 01:..., ou 00:3...)
          const qTime = row['Q Start'] || row['Q Xact'] || '';
          return qTime && !qTime.startsWith('00:00:') && !qTime.startsWith('00:01:') && !qTime.startsWith('00:02:') && !qTime.startsWith('00:03:') && !qTime.startsWith('00:04:') && !qTime.startsWith('00:05:'); // > 5 minutos
        },
        advice: 'Há conexões executando ou presas em transação por mais de 5 minutos. Isso pode segurar travas (locks) e impedir que o Vacuum limpe a base (bloat).',
        impact: 'Causa bloat generalizado e pode levar a enfileiramento de requisições na aplicação.'
      },

      // --- REPLICAÇÃO & HA (FASE 3) ---
      'replication_stats': {
        title: 'Atraso na Replicação (Replication Lag)',
        severity: 'critical',
        condition: (row) => {
          const lag = row['Replay lag'] || row['Write lag'] || '';
          return lag && lag !== '00:00:00.00' && lag !== '' && !lag.startsWith('00:00:00'); 
        },
        advice: 'Detectado atraso significativo entre o servidor primário e a réplica. Verifique a rede ou a carga de CPU/IO da réplica.',
        impact: 'Em caso de queda do primário, haverá perda de dados não sincronizados e o failover será demorado.'
      },

      // --- MANUTENÇÃO E ESTRUTURA (FASE 4) ---
      'tables_without_pk': {
        title: 'Tabelas sem Chave Primária (PK)',
        severity: 'warning',
        condition: () => true, // Qualquer linha retornada é um erro
        advice: 'Tabelas sem Primary Key ou Unique Index quebram a Replicação Lógica (Publisher/Subscriber) e deixam UPDATES e DELETES muito lentos.',
        impact: 'Impossibilidade de replicar dados em tempo real e degradação em queries DML.'
      },

      // --- CONFIGURAÇÃO DE HARDWARE (FASE 5) ---
      'conf_resource': {
        title: 'Ajuste de Recursos Inadequado',
        severity: 'warning',
        condition: (row) => {
          if (row.conf === 'checkpoint_completion_target' && parseFloat(row.Value) < 0.9) return true;
          if (row.conf === 'shared_buffers' && row.source === 'default') return true;
          return false;
        },
        advice: (row) => {
          if (row.conf === 'checkpoint_completion_target') return 'O checkpoint_completion_target deve estar configurado em 0.9 para diluir as escritas em disco e evitar spikes de I/O.';
          if (row.conf === 'shared_buffers') return 'O shared_buffers está usando o valor padrão de fábrica. Ele deve ser configurado para usar ~25% da RAM do servidor.';
          return 'Revise as configurações base do postgresql.conf.';
        },
        impact: 'O servidor não está tirando proveito do hardware pago, gerando gargalos artificiais de disco e memória.'
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
