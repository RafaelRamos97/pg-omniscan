const API_URL = 'http://localhost:3001/api';

export async function checkConnectionStatus() {
  const res = await fetch(`${API_URL}/status`);
  return res.json();
}

export async function connectDB(config) {
  const res = await fetch(`${API_URL}/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function disconnectDB() {
  const res = await fetch(`${API_URL}/disconnect`, { method: 'POST' });
  return res.json();
}

export async function getCategories() {
  const res = await fetch(`${API_URL}/categories`);
  return res.json();
}

export async function runAnalysis(categories) {
  const res = await fetch(`${API_URL}/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function getScriptsMetadata() {
  const res = await fetch(`${API_URL}/scripts/metadata`);
  return res.json();
}

export async function runStreamingAnalysis(categories, onMessage, signal = null, excludedScripts = []) {
  const response = await fetch(`${API_URL}/analyze-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories, excludedScripts }),
    signal,
  });

  if (!response.ok) {
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const err = await response.json();
      throw new Error(err.error || 'Erro ao iniciar análise');
    } else {
      const text = await response.text();
      console.error('Servidor respondeu com erro (não-JSON):', text.substring(0, 500));
      throw new Error('Servidor retornou um erro interno (HTML). Verifique o console do backend.');
    }
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    
    let parts = buffer.split('\n\n');
    // Mantém a última parte (possivelmente incompleta) no buffer
    buffer = parts.pop();

    for (const part of parts) {
      const line = part.trim();
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.replace('data: ', ''));
          onMessage(data);
        } catch (e) {
          console.error('Erro ao processar chunk SSE:', e, line);
        }
      }
    }
  }
}

export async function runAIAnalysis(provider, apiKey, analysisId) {
  const res = await fetch(`${API_URL}/analyze/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, analysisId }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  return res.json();
}

export async function getHistory() {
  const res = await fetch(`${API_URL}/history`);
  return res.json();
}

export async function getAnalysisDetail(id) {
  const res = await fetch(`${API_URL}/history/${id}`);
  return res.json();
}
