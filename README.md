# 🐘 PG-OmniScan

**PG-OmniScan** é um Sistema Especialista de Diagnóstico e Auditoria para bancos de dados PostgreSQL. Construído com foco absoluto na experiência do Database Administrator (DBA), o sistema orquestra de forma inteligente a execução de centenas de scripts diagnósticos, aplica heurísticas de elite baseadas em práticas de SRE e entrega relatórios profissionais de nível enterprise com recomendações acionáveis.

> ⚡ **100% Read-Only** — Nenhum comando de escrita é executado. Garantia de segurança total via SQL Guard.

---

## 🚀 Principais Features

### 🧠 Motor de Inteligência DBA (Expert System)
- **Heurísticas Automatizadas**: Motor baseado em regras que analisa cada resultado de script em tempo real, identificando vulnerabilidades de segurança, gargalos de performance, riscos de wraparound e problemas de I/O
- **Cobertura de 6 Domínios**: Segurança & Acessos, Bloat & Espaço, Vacuum & Wraparound, Performance & Queries, Memória & Cache, I/O & WAL
- **Banners de Recomendação**: Alertas visuais (Crítico/Alerta/Info) acima de cada resultado com explicação de impacto e ação corretiva

### 📊 Relatórios Enterprise (PDF & Markdown)
- **Capa Institucional** com classificação "Confidencial"
- **Nota de Saúde Calculada** (0-10) com semáforo visual
- **Sumário Executivo** para gestores/C-Level com Matriz de Risco
- **Framework 5 Cs** (Critério, Condição, Causa, Consequência, Ação Corretiva) em cada achado
- **Escopo e Metodologia** documentados automaticamente
- **Dados Brutos** tabulados como evidência de auditoria

### 🔍 Arsenal Diagnóstico
- **469+ Scripts SQL** do repositório [fabiotr/pg_scripts](https://github.com/fabiotr/pg_scripts)
- **Compatibilidade**: PostgreSQL 8.2 até PostgreSQL 18
- **Sincronização Automática**: Atualização do arsenal via GitHub com detecção de novos/atualizados
- **Seleção Inteligente**: Apenas scripts compatíveis com a versão conectada são executados
- **11 Categorias**: Visão Geral, Índices, Tabelas, Performance, Manutenção, I/O, Segurança, Replicação, Configuração, Emergência, Internals

### 🛡️ Segurança (SQL Guard)
- **Blocklist por nome**: Scripts de kill, reset, reindex, vacuum direto
- **Blocklist por função**: `pg_terminate_backend`, `pg_cancel_backend`, `pg_stat_reset`, etc.
- **Validação Strict Read-Only**: Toda query deve começar com `SELECT`/`WITH`/`SHOW`

### 📜 Histórico e Comparação
- **Persistência SQLite**: Todas as análises são salvas automaticamente em banco embutido
- **Time-Travel Delta**: Comparação automática entre execuções mostrando evolução de problemas (+/-) 
- **Exportação**: Restaure qualquer análise passada e exporte como PDF ou Markdown

### 🤖 Integração com IA
- Suporte a **Google Gemini** e **OpenAI** para análise assistida dos resultados
- O DBA fornece a API Key e o motor de IA recebe o contexto completo da auditoria

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia | Detalhes |
|:---|:---|:---|
| Backend | Node.js + Express | API REST + SSE (Server-Sent Events) para streaming em tempo real |
| Frontend | React + Vite | Dashboard interativo com accordion dinâmico |
| Banco Embutido | SQLite 3 | Persistência de histórico de análises |
| Driver PostgreSQL | `pg` (node-postgres) | Pool com protocol-level timeouts |
| Relatórios | jsPDF + jspdf-autotable | Geração de PDF profissional no browser |
| Scripts SQL | fabiotr/pg_scripts | Sincronização automática via GitHub API |

---

## 🙏 Créditos e Atribuições

O arsenal e coração analítico de Consultas SQL que alimenta o **PG-OmniScan** é retirado do notável trabalho de contribuição da comunidade mantido por Fabio Telles.

- **Autor dos Scripts SQL:** Fábio Telles
- **Repositório Original:** [fabiotr/pg_scripts](https://github.com/fabiotr/pg_scripts)

Mantemos a pasta dos scripts originais estruturada como um **Git Submodule** neste projeto, assegurando total transparência de direitos autorais e facilitando o fluxo para manter os scripts analíticos sempre atualizados.

---

## 📥 Como Instalar e Rodar

1. Clone o repositório incluindo os submódulos:
   ```bash
   git clone --recurse-submodules https://github.com/RafaelRamos97/pg-omniscan.git
   cd pg-omniscan
   ```

2. Instale as dependências do backend e frontend:
   ```bash
   cd server && npm install
   cd ../client && npm install
   cd ..
   ```

3. **(Opcional)** Se desejar alterar a porta padrão do backend (3001), crie um `.env` na pasta `server/`:
   ```bash
   PORT=3001
   ```

4. Execute o projeto (Frontend e Backend simultaneamente):
   ```bash
   npm run dev
   ```

5. Acesse `http://localhost:5173` e conecte-se ao seu banco PostgreSQL.

---

## 📁 Estrutura do Projeto

```
pg-omniscan/
├── client/                     # Frontend React + Vite
│   └── src/
│       ├── components/         # Dashboard, CategorySection, HistoryPanel, etc.
│       └── utils/
│           └── exporter.js     # Motor de Relatórios Enterprise (PDF/Markdown)
├── server/                     # Backend Node.js + Express
│   └── src/
│       ├── services/
│       │   ├── analyzer.js             # Motor DBA Principal (11 categorias)
│       │   ├── intelligence-service.js # Heurísticas de Elite (Expert System)
│       │   ├── storage-service.js      # Persistência SQLite
│       │   └── sync-service.js         # Sincronização GitHub do Arsenal
│       └── utils/
│           ├── sql-loader.js           # Parser e Cache de Scripts SQL
│           └── sql-guard.js            # Trava de Segurança Read-Only
├── pg_scripts/                 # Arsenal SQL (submodule fabiotr/pg_scripts)
└── README.md
```

---

## 🪪 Licença

PG-OmniScan é de código aberto. Ao distribuir, os créditos do arsenal SQL ao repositório [fabiotr/pg_scripts](https://github.com/fabiotr/pg_scripts) não devem ser removidos.
