export default function OverviewMetrics({ analysis, connectionInfo }) {
  const getTotalIssues = () => {
    if (!analysis) return 0;
    return Object.values(analysis.categories).reduce((sum, cat) => {
      return sum + (Array.isArray(cat) ? cat.reduce((s, item) => s + (item.data ? item.data.length : 0), 0) : 0);
    }, 0);
  };

  const issuesConfig = getTotalIssues() > 10 ? 'critical' : getTotalIssues() > 0 ? 'warning' : 'good';
  const recsConfig = (analysis.recommendations || []).length > 3 ? 'warning' : 'good';

  return (
    <div className="score-grid">
      <div className="score-card info">
        <div className="card-icon">🗄️</div>
        <div className="card-title">Database</div>
        <div className="card-value" style={{ fontSize: 18 }}>{connectionInfo.config.database}</div>
        <div className="card-detail">PG v{Math.floor(analysis.version / 10000)}</div>
      </div>
      <div className={`score-card ${issuesConfig}`}>
        <div className="card-icon">📋</div>
        <div className="card-title">Achados Totais</div>
        <div className="card-value">{getTotalIssues()}</div>
        <div className="card-detail">alinhados por saúde</div>
      </div>
      <div className={`score-card ${recsConfig}`}>
        <div className="card-icon">💡</div>
        <div className="card-title">Recomendações</div>
        <div className="card-value">{(analysis.recommendations || []).length}</div>
        <div className="card-detail">passivas encontradas</div>
      </div>
      <div className="score-card info">
        <div className="card-icon">🕐</div>
        <div className="card-title">Execução</div>
        <div className="card-value" style={{ fontSize: 14 }}>{new Date(analysis.timestamp).toLocaleString()}</div>
        <div className="card-detail">{analysis.stats.executed}/{analysis.stats.total} scripts</div>
      </div>
    </div>
  );
}
