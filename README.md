# 🐘 PG-OmniScan

**PG-OmniScan** é uma ferramenta de Diagnóstico e Auditoria Contínua para bancos de dados PostgreSQL. Construído com foco absoluto na experiência do Database Administrator (DBA), o sistema orquestra de forma inteligente a execução de dezenas de scripts e fornece recomendações orientadas a métricas reais do banco.

## 🚀 Principais Features

- **Analista DBA Universal**: Motor capaz de processar mais de 450 scripts distintos, fornecendo recomendações acionáveis na interface para otimização de índices (Bloat, Unused, Missing).
- **Zero-Hang Initialization**: Otimização profunda em processamento de grandes arquivos SQL, impedindo travamentos de Event Loop via stream processing iterativo.
- **Protocol-Level Timeouts**: Segurança máxima – 100% read-only. Timeouts tratados nativamente ao nível do driver Node, sem uso de comandos `SET` restritivos.
- **Accordion UI Dinâmico**: Resultados expandem ou ocultam automaticamente baseados na criticidade e dados encontrados (achados reais vs vazios).
- **Cache de Arsenal SQL**: Leitura e parsing super rápidos e cacheados em memória para que o diagnóstico repetido seja instantâneo.
- **Config persistence**: Usa `localStorage` para lembrar quais análises você foca e os scripts específicos que você prefere ignorar.

## 🛠️ Tecnologias

- **Backend:** Node.js, Express, `pg` driver
- **Frontend:** React, Vite, Server-Sent Events (SSE) para acompanhamento em tempo real

## 🙏 Créditos e Atribuições (Special Thanks)

O arsenal e coração analítico de Consultas SQL que alimenta o **PG-OmniScan** é retirado do notável trabalho de contribuição da comunidade mantido pelo Fabio Telles.

- **Autor dos Scripts SQL:** Fábio Telles
- **Repositório Original:** [fabiotr/pg_scripts](https://github.com/fabiotr/pg_scripts)

Mantemos a pasta dos scripts originais estruturada como um **Git Submodule** neste projeto. Assim, asseguramos total transparência de direitos autorais e facilitamos o fluxo para manter os scripts analíticos sempre atualizados, colaborando indiretamente com as diretrizes e licenças de código aberto do repositório original.

## 📥 Como Instalar e Rodar

1. Clone o repositório incluindo os submodulos (onde residem os scripts):
   ```bash
   git clone --recurse-submodules https://github.com/SEU_USUARIO/PG-OmniScan.git
   cd PG-OmniScan
   ```

2. Instale as dependências na raiz, que instalará via concorrência do frontend e backend:
   ```bash
   npm i
   cd server && npm i
   cd ../client && npm i
   ```

3. Configure as varíaveis de ambiente criando o arquivo `.env`:
   ```bash
   PORT=3001
   ```

4. Execute o projeto (Frontend e Backend iniciando simultâneamente):
   ```bash
   npm run dev
   ```

5. Acesse `http://localhost:5173` e inicie suas análises.

## 🪪 Licença
PG-OmniScan é de código aberto. Ao distribuir, os créditos do backend à `fabiotr/pg_scripts` não devem ser ignorados.
