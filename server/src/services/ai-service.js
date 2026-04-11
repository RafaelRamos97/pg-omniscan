const { GoogleGenerativeAI } = require('@google/generative-ai');
const OpenAI = require('openai');

/**
 * Serviço de Integração com IA (Gemini / OpenAI).
 */
class AIService {
  /**
   * Analisa os dados do banco usando Gemini.
   */
  async analyzeWithGemini(apiKey, data) {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const prompt = this.buildPrompt(data);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  }

  /**
   * Analisa os dados do banco usando OpenAI.
   */
  async analyzeWithOpenAI(apiKey, data) {
    const openai = new OpenAI({ apiKey });
    const prompt = this.buildPrompt(data);

    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
    });

    return response.choices[0].message.content;
  }

  buildPrompt(data) {
    const dbName = data.database || 'N/A';
    const version = data.version || 'N/A';
    
    // Extraímos apenas o resumo focado do Analista Universal para economizar os Tokens de IO do LLM.
    const recommendations = (data.recommendations || []).map(r => `[${r.priority}] ${r.category}: ${r.message} -> ${r.action}`).join('\n');
    const categoriesStats = Object.keys(data.categories || {}).join(', ');

    return `
Vocês é um renomado Consultor DBA PostgreSQL Sênior especialista em Tuning e Alta Disponibilidade.
Acabamos de rodar a suíte PG-OmniScan no banco de dados "${dbName}" (PG Version: ${version}).

O motor de análise universal processou informações das seguintes áreas: ${categoriesStats}.

Aqui estão as recomendações mastigadas pelo nosso motor:
${recommendations}

Sua tarefa:
Gere um PLANO DE AÇÃO (Action Plan) executável focado EXCLUSIVAMENTE nos alertas recebidos acima.
1. Comece com um parágrafo resumindo o maior risco atual.
2. Agrupe os comandos SQL propostos num único bloco de código para que o DBA possa copiar e rodar (exemplo: agrupe todos os REINDEX e CREATE INDEX).
3. Seja breve, direto e foque no código SQL de otimização. Não invente problemas que não estão listados acima.

Retorne sua resposta em formato Markdown estruturado.
    `;
  }
}

module.exports = new AIService();
