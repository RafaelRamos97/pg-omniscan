const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const dbService = require('./services/db-service');
const analyzer = require('./services/analyzer');
const aiService = require('./services/ai-service');
const storageService = require('./services/storage-service');

const app = express();

// SECURITY & PERFORMANCE HARDENING
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 3001;

// ─── Rotas de Conexão ──────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json(dbService.getStatus());
});

app.post('/api/connect', async (req, res) => {
  try {
    const { host, port, database, user, password } = req.body;
    if (!host || !database || !user) {
      return res.status(400).json({ error: 'Campos obrigatórios: host, database, user' });
    }
    const result = await dbService.connect({ host, port: port || 5432, database, user, password });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Falha na conexão: ${err.message}` });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    await dbService.disconnect();
    res.json({ disconnected: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Rotas de Análise ──────────────────────────────────────

// Lista de categorias disponíveis
app.get('/api/categories', (req, res) => {
  res.json(analyzer.getAvailableCategories());
});

// Lista todos os bancos da instância
app.get('/api/databases', async (req, res) => {
  try {
    const dbs = await dbService.getDatabases();
    res.json(dbs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Troca de banco rápida (reaproveita credenciais)
app.post('/api/switch-database', async (req, res) => {
  try {
    const { database } = req.body;
    if (!database) return res.status(400).json({ error: 'Banco de dados não especificado.' });

    const currentConfig = dbService.config;
    if (!currentConfig) return res.status(400).json({ error: 'Nenhuma conexão ativa encontrada.' });

    const newConfig = { ...currentConfig, database };
    const result = await dbService.connect(newConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Lista de scripts detalhados por categoria (para seleção granular)
app.get('/api/scripts/metadata', async (req, res) => {
  try {
    const versionNum = await dbService.getVersionNum();
    const metadata = await analyzer.getDetailedMetadata(versionNum);
    res.json(metadata);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/analyze-stream', async (req, res) => {
  const { categories, excludedScripts } = req.body || {};

  if (!categories || !Array.isArray(categories) || categories.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos uma categoria para analisar.' });
  }

  // Configura cabeçalhos SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Desativa buffering do proxy

  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  let isCancelled = false;
  res.on('close', () => {
    isCancelled = true;
    console.log('[Analyzer] Conexão encerrada pelo cliente. Abortando scripts pendentes...');
  });

  try {
    const analysis = await analyzer.runAnalysis(categories, (event) => {
      if (!isCancelled) sendEvent(event);
    }, () => isCancelled, excludedScripts || []);

    if (isCancelled) {
      res.end();
      return;
    }

    // Salva no histórico
    const savedFile = await storageService.saveAnalysis(analysis);
    analysis.savedAs = savedFile;

    // Envia resultado final
    sendEvent({ type: 'complete', data: analysis });
    res.end();
  } catch (err) {
    console.error('Erro na análise streaming:', err);
    sendEvent({ type: 'error', message: err.message });
    res.end();
  }
});


// ─── Rotas de IA ────────────────────────────────────────────

app.post('/api/analyze/ai', async (req, res) => {
  try {
    const { provider, apiKey, analysisId } = req.body;
    if (!provider || !apiKey || !analysisId) {
      return res.status(400).json({ error: 'Campos obrigatórios: provider, apiKey, analysisId' });
    }

    const analysisData = await storageService.getAnalysis(analysisId);
    let aiResult;

    if (provider === 'gemini') {
      aiResult = await aiService.analyzeWithGemini(apiKey, analysisData);
    } else if (provider === 'openai') {
      aiResult = await aiService.analyzeWithOpenAI(apiKey, analysisData);
    } else {
      return res.status(400).json({ error: 'Provider inválido. Use "gemini" ou "openai".' });
    }

    res.json({ provider, result: aiResult });
  } catch (err) {
    console.error('Erro na análise com IA:', err);
    res.status(500).json({ error: `Erro na análise com IA: ${err.message}` });
  }
});

// ─── Rotas de Histórico ─────────────────────────────────────

app.get('/api/history', async (req, res) => {
  try {
    const list = await storageService.listAnalyses();
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:id', async (req, res) => {
  try {
    const data = await storageService.getAnalysis(req.params.id);
    res.json(data);
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

app.delete('/api/history/:id', async (req, res) => {
  try {
    await storageService.deleteAnalysis(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/history', async (req, res) => {
  try {
    await storageService.clearHistory();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Servir Frontend em Produção ────────────────────────────

const clientBuildPath = path.join(__dirname, '../../client/dist');
if (require('fs').existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
}

// ─── Start ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🐘 PG Health Analyzer — Backend rodando em http://localhost:${PORT}\n`);
});
