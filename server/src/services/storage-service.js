const fs = require('fs');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, '../../history');

/**
 * Serviço de armazenamento de análises em JSON.
 */
class StorageService {
  constructor() {
    if (!fs.existsSync(HISTORY_DIR)) {
      fs.mkdirSync(HISTORY_DIR, { recursive: true });
    }
  }

  /**
   * Salva uma nova análise.
   */
  async saveAnalysis(analysis) {
    const filename = `analysis_${Date.now()}.json`;
    const filePath = path.join(HISTORY_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(analysis, null, 2));
    return filename;
  }

  /**
   * Lista todas as análises salvas.
   */
  async listAnalyses() {
    const files = fs.readdirSync(HISTORY_DIR);
    return files
      .filter(f => f.endsWith('.json'))
      .map(filename => {
        const filePath = path.join(HISTORY_DIR, filename);
        const stats = fs.statSync(filePath);
        return {
          id: filename,
          date: stats.mtime,
          size: stats.size
        };
      })
      .sort((a, b) => b.date - a.date);
  }

  /**
   * Obtém os detalhes de uma análise.
   */
  async getAnalysis(id) {
    const filePath = path.join(HISTORY_DIR, id);
    if (!fs.existsSync(filePath)) {
      throw new Error('Análise não encontrada.');
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  }
}

module.exports = new StorageService();
