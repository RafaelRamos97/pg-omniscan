const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const HISTORY_DIR = path.join(__dirname, '../../history');

/**
 * Serviço de armazenamento usando SQLite embutido
 */
class StorageService {
  constructor() {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
    
    this.dbPath = path.join(HISTORY_DIR, 'pg_omniscan.db');
    this.db = new sqlite3.Database(this.dbPath);
    this.initDb();
  }

  initDb() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS analyses (
        id TEXT PRIMARY KEY,
        timestamp TEXT,
        database TEXT,
        version TEXT,
        issues_count INTEGER,
        recommendations_count INTEGER,
        raw_json TEXT
      )
    `);
  }

  /**
   * Promise wrapper para queries SQLite genéricas
   */
  _runAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve(this);
      });
    });
  }

  _allAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  _getAsync(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  /**
   * Salva uma nova análise no SQLite.
   */
  async saveAnalysis(analysis) {
    const id = `analysis_${Date.now()}`;
    
    const issuesCount = Object.values(analysis.categories || {}).reduce((sum, cat) => {
      return sum + (Array.isArray(cat) ? cat.reduce((s, item) => s + (item.data ? item.data.length : 0), 0) : 0);
    }, 0);

    const recCount = (analysis.recommendations || []).length;

    await this._runAsync(
      `INSERT INTO analyses (id, timestamp, database, version, issues_count, recommendations_count, raw_json) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id, 
        analysis.timestamp, 
        analysis.database || 'N/A', 
        analysis.version || '0', 
        issuesCount, 
        recCount, 
        JSON.stringify(analysis)
      ]
    );

    return id; // Usado também para salvar as antigas dependências da UI "savedAs"
  }

  /**
   * Lista todas as análises salvas, puxando os metadados diretamente do SQLite sem ler o payload JSON.
   */
  async listAnalyses() {
    const rows = await this._allAsync(`
      SELECT id, timestamp, database, version, issues_count, recommendations_count 
      FROM analyses 
      ORDER BY timestamp DESC
    `);
    
    return rows.map(r => ({
      id: r.id,
      date: new Date(r.timestamp).getTime(),
      database: r.database,
      issuesCount: r.issues_count,
      recommendationsCount: r.recommendations_count
    }));
  }

  /**
   * Obtém os detalhes massivos de UMA análise apenas pre-filtrando no DB.
   */
  async getAnalysis(id) {
    const row = await this._getAsync(`SELECT raw_json FROM analyses WHERE id = ?`, [id]);
    if (!row) throw new Error('Análise não encontrada no banco SQLite.');
    
    return JSON.parse(row.raw_json);
  }

  /**
   * Remove uma análise específica.
   */
  async deleteAnalysis(id) {
    await this._runAsync(`DELETE FROM analyses WHERE id = ?`, [id]);
    return true;
  }

  /**
   * Limpa todo o histórico de análises.
   */
  async clearHistory() {
    await this._runAsync(`DELETE FROM analyses`);
    return true;
  }
}

module.exports = new StorageService();
