const axios = require('axios');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const sqlLoader = require('../utils/sql-loader');

const SCRIPTS_DEST = path.join(__dirname, '../../../pg_scripts/sql');
const GITHUB_ZIP_URL = 'https://github.com/fabiotr/pg_scripts/archive/refs/heads/main.zip';

class SyncService {
  async syncArsenal() {
    console.log('[Sync] Iniciando sincronização com fabiotr/pg_scripts...');
    
    // 1. Download do ZIP
    const response = await axios({
      method: 'get',
      url: GITHUB_ZIP_URL,
      responseType: 'arraybuffer'
    });

    const zip = new AdmZip(Buffer.from(response.data));
    const zipEntries = zip.getEntries();
    
    const addedFiles = [];
    const updatedFiles = [];

    // Garante que a pasta de destino existe
    if (!fs.existsSync(SCRIPTS_DEST)) {
      fs.mkdirSync(SCRIPTS_DEST, { recursive: true });
    }

    // 2. Extração Seletiva
    zipEntries.forEach(entry => {
      const fileName = path.basename(entry.entryName);
      
      // Scripts SQL (dentro de /sql/)
      if (entry.entryName.includes('/sql/') && entry.entryName.endsWith('.sql')) {
        const destPath = path.join(SCRIPTS_DEST, fileName);
        const exists = fs.existsSync(destPath);
        const newContent = entry.getData().toString('utf8');
        
        if (exists) {
          const oldContent = fs.readFileSync(destPath, 'utf8');
          if (oldContent !== newContent) {
            fs.writeFileSync(destPath, newContent);
            updatedFiles.push(fileName);
          }
        } else {
          fs.writeFileSync(destPath, newContent);
          addedFiles.push(fileName);
        }
      } 
      // Documentação (Arquivos MD na raiz do repositório)
      else if (entry.entryName.split('/').length === 2 && entry.entryName.endsWith('.md')) {
        const docDest = path.join(__dirname, '../../../pg_scripts', fileName);
        const newContent = entry.getData().toString('utf8');
        fs.writeFileSync(docDest, newContent);
        // Contamos documentação como atualização silenciosa para não poluir o banner principal
      }
    });

    // 3. Reset do Cache do Loader
    sqlLoader.isLoaded = false;
    
    return {
      success: true,
      added: addedFiles.length,
      updated: updatedFiles.length,
      addedFiles,
      updatedFiles,
      total: addedFiles.length + updatedFiles.length
    };
  }
}

module.exports = new SyncService();
