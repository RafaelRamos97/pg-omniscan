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

  /**
   * Constrói o prompt de análise.
   */
  buildPrompt(data) {
    return `
Vocês é um DBA PostgreSQL Sênior especialista em Tuning.
Analise os seguintes dados de diagnóstico do banco de dados e forneça recomendações práticas e priorizadas.
Foque em:
1. Índices ausentes ou duplicados.
2. Performance de queries (Sequencial scans elevados).
3. Saúde das tabelas (Bloat, Falta de PK).
4. Manutenção (Autovacuum, Wraparound).

Retorne sua resposta em formato Markdown estruturado.

DADOS DO BANCO:
${JSON.stringify(data, null, 2)}
    `;
  }
}

module.exports = new AIService();
