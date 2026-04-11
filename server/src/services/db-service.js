const { Pool } = require('pg');
const sqlGuard = require('../utils/sql-guard');

/**
 * Serviço de gerenciamento de conexão com o PostgreSQL.
 */
class DBService {
  constructor() {
    this.pool = null;
    this.config = null;
  }

  /**
   * Conecta ao banco de dados com as credenciais fornecidas.
   */
  async connect(config) {
    if (this.pool) {
      await this.pool.end();
    }

    this.config = config;
    this.pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10000,
    });

    const client = await this.pool.connect();
    try {
      const res = await client.query('SELECT version(), current_database() as dbname, current_setting(\'server_version_num\') as version_num');
      this.versionNum = parseInt(res.rows[0].version_num);
      return {
        connected: true,
        version: res.rows[0].version,
        versionNum: this.versionNum,
        dbname: res.rows[0].dbname
      };
    } finally {
      client.release();
    }
  }

  /**
   * Executa uma query SQL de forma segura, garantindo que seja SOMENTE LEITURA.
   * Timeout de 30s por query para evitar travamentos.
   */
  async query(sql, timeoutMs = 30000) {
    if (!this.pool) {
      throw new Error('Banco de dados não conectado.');
    }

    // TRAVA DE SEGURANÇA FINAL
    if (!sqlGuard.validateStrictReadOnly(sql)) {
      throw new Error('BLOQUEIO DE SEGURANÇA: Esta aplicação permite apenas comandos SELECT/WITH para garantir integridade read-only.');
    }

    const startTime = Date.now();
    let client;
    try {
      client = await this.pool.connect();
      
      // Adicionamos um timeout interno via Promise.race para garantir que o Node não trave
      // se o banco parar de responder mas não fechar a conexão.
      const queryPromise = client.query({
        text: sql,
        statement_timeout: timeoutMs
      });

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('TIMEOUT_APLICACAO: O banco de dados não respondeu no tempo limite.')), timeoutMs + 2000);
      });

      const res = await Promise.race([queryPromise, timeoutPromise]);
      return res.rows;
    } catch (err) {
      console.error(`[DB Service] ❌ Erro na query (${Date.now() - startTime}ms):`, err.message, err.code ? `(CODE: ${err.code})` : '');
      throw err;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Obtém o número da versão para detecção de scripts (ex: 140005).
   */
  async getVersionNum() {
    const res = await this.query("SHOW server_version_num");
    return parseInt(res[0].server_version_num);
  }

  /**
   * Retorna o status atual da conexão e configurações básicas.
   */
  getStatus() {
    if (!this.pool || !this.config) return { connected: false };
    return {
      connected: true,
      version: this.versionNum, // Armazenada durante o connect
      dbname: this.config.database,
      config: {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
      }
    };
  }

  async disconnect() {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }
  }
}

module.exports = new DBService();
