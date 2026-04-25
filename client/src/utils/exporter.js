import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * PG-OmniScan Enterprise Report Engine
 * Framework: 5 Cs (Criteria, Condition, Cause, Consequence, Corrective Action)
 * Padrão: ISACA/IIA Professional Audit Reporting
 */

// ─── PALETA OFICIAL ────────────────────────────────────
const C = {
  bg:       [15, 23, 42],
  header:   [23, 24, 37],
  blue:     [51, 103, 145],
  cyan:     [0, 139, 185],
  green:    [16, 185, 129],
  yellow:   [245, 158, 11],
  red:      [239, 68, 68],
  indigo:   [99, 102, 241],
  gray:     [100, 116, 139],
  white:    [248, 250, 252],
  black:    [0, 0, 0],
  lightGray:[230, 230, 230],
  rowAlt:   [245, 247, 250],
};

const PRIORITY_COLORS = {
  CRITICAL: C.red,
  HIGH:     C.yellow,
  MEDIUM:   C.indigo,
  LOW:      C.gray
};

// Converte valores complexos do PG (interval, arrays, objetos) em texto
function formatExportValue(val) {
  if (val === null || val === undefined) return '-';
  if (typeof val === 'boolean') return val ? 'SIM' : 'NÃO';
  if (typeof val === 'string' || typeof val === 'number') return String(val);
  if (Array.isArray(val)) return val.map(v => formatExportValue(v)).join(', ');
  if (typeof val === 'object') {
    if ('hours' in val || 'minutes' in val || 'seconds' in val || 'days' in val || 'milliseconds' in val) {
      const parts = [];
      if (val.years) parts.push(`${val.years}a`);
      if (val.months) parts.push(`${val.months}m`);
      if (val.days) parts.push(`${val.days}d`);
      const h = val.hours || 0, m = val.minutes || 0, s = val.seconds || 0, ms = val.milliseconds || 0;
      if (h || m || s || ms) {
        let time = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(Math.floor(s)).padStart(2,'0')}`;
        if (ms) time += `.${String(ms).padStart(3,'0')}`;
        parts.push(time);
      }
      return parts.length > 0 ? parts.join(' ') : '00:00:00';
    }
    try { return JSON.stringify(val); } catch { return '-'; }
  }
  return String(val);
}

// ─── HEALTH SCORE CALCULATOR ───────────────────────────
function calculateHealthScore(recommendations) {
  if (!recommendations || recommendations.length === 0) return { score: 10.0, label: 'Excelente', color: C.green };
  let score = 10.0;
  recommendations.forEach(r => {
    if (r.priority === 'CRITICAL') score -= 1.5;
    else if (r.priority === 'HIGH') score -= 0.8;
    else if (r.priority === 'MEDIUM') score -= 0.3;
    else score -= 0.1;
  });
  score = Math.max(0, Math.round(score * 10) / 10);
  let label, color;
  if (score >= 8) { label = 'Saudável'; color = C.green; }
  else if (score >= 6) { label = 'Atenção Requerida'; color = C.yellow; }
  else if (score >= 4) { label = 'Risco Elevado'; color = C.red; }
  else { label = 'Estado Crítico'; color = C.red; }
  return { score, label, color };
}

function getPgVersionString(versionNum) {
  if (!versionNum) return 'N/A';
  const major = Math.floor(versionNum / 10000);
  const minor = Math.floor((versionNum % 10000) / 100);
  return `${major}.${minor}`;
}

function countByPriority(recs, priority) {
  return (recs || []).filter(r => r.priority === priority).length;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PDF EXPORT — ENTERPRISE EDITION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const exportToPDF = (analysis, connectionConfig) => {
  try {
    const doc = new jsPDF('landscape');
    const ts = new Date(analysis.timestamp).toLocaleString('pt-BR');
    const pgVer = getPgVersionString(analysis.version);
    const recs = analysis.recommendations || [];
    const health = calculateHealthScore(recs);
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const center = pageW / 2;

    // ═══ PÁGINA 1: CAPA INSTITUCIONAL ═══════════════════
    doc.setFillColor(...C.bg);
    doc.rect(0, 0, pageW, pageH, 'F');

    // Linha decorativa superior
    doc.setFillColor(...C.blue);
    doc.rect(0, 0, pageW, 4, 'F');

    doc.setTextColor(...C.white);
    doc.setFontSize(42);
    doc.setFont('helvetica', 'bold');
    doc.text('PG-OmniScan', center, 65, { align: 'center' });

    doc.setFontSize(16);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.cyan);
    doc.text('Relatório de Auditoria e Diagnóstico PostgreSQL', center, 80, { align: 'center' });

    // Linha divisória
    doc.setDrawColor(...C.indigo);
    doc.setLineWidth(0.8);
    doc.line(80, 90, pageW - 80, 90);

    doc.setFontSize(14);
    doc.setTextColor(...C.white);
    doc.text(`Banco de Dados: ${connectionConfig.database}`, center, 108, { align: 'center' });
    doc.text(`Instância: ${connectionConfig.host}:${connectionConfig.port}`, center, 118, { align: 'center' });
    doc.text(`Versão PostgreSQL: ${pgVer}`, center, 128, { align: 'center' });
    doc.text(`Data da Emissão: ${ts}`, center, 138, { align: 'center' });

    // Badge de classificação
    doc.setFillColor(...C.header);
    doc.roundedRect(center - 40, 152, 80, 16, 3, 3, 'F');
    doc.setFontSize(10);
    doc.setTextColor(...C.yellow);
    doc.setFont('helvetica', 'bold');
    doc.text('DOCUMENTO CONFIDENCIAL', center, 162, { align: 'center' });

    // Rodapé da capa
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text('Gerado automaticamente pelo motor de diagnóstico PG-OmniScan', center, pageH - 20, { align: 'center' });
    doc.text('Base de Conhecimento: fabiotr/pg_scripts | Modo: Read-Only (Somente Leitura)', center, pageH - 14, { align: 'center' });

    // ═══ PÁGINA 2: SUMÁRIO EXECUTIVO ════════════════════
    doc.addPage();
    doc.setTextColor(...C.black);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Sumário Executivo', 14, 22);

    doc.setDrawColor(...C.blue);
    doc.setLineWidth(0.5);
    doc.line(14, 26, 120, 26);

    // Card de Nota de Saúde
    doc.setFillColor(...C.bg);
    doc.roundedRect(14, 32, pageW - 28, 32, 4, 4, 'F');
    doc.setFontSize(11);
    doc.setTextColor(...C.white);
    doc.text('NOTA DE SAÚDE DO BANCO DE DADOS', 24, 44);
    doc.setFontSize(28);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...health.color);
    doc.text(`${health.score}/10`, 24, 58);
    doc.setFontSize(14);
    doc.text(`— ${health.label}`, 62, 58);

    // Matriz de risco
    const critical = countByPriority(recs, 'CRITICAL');
    const high = countByPriority(recs, 'HIGH');
    const medium = countByPriority(recs, 'MEDIUM');
    const low = countByPriority(recs, 'LOW');

    autoTable(doc, {
      startY: 72,
      head: [['Severidade', 'Quantidade', 'Classificação']],
      body: [
        ['CRÍTICO', String(critical), 'Requer ação imediata — risco de indisponibilidade'],
        ['ALTO', String(high), 'Requer ação planejada — degradação ativa de performance'],
        ['MÉDIO', String(medium), 'Recomendação de melhoria — otimização recomendada'],
        ['BAIXO', String(low), 'Observação — boas práticas a considerar'],
      ],
      theme: 'grid',
      styles: { fontSize: 10, cellPadding: 4 },
      headStyles: { fillColor: C.header, textColor: C.white },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 0) {
          const colors = [C.red, C.yellow, C.indigo, C.gray];
          data.cell.styles.textColor = colors[data.row.index] || C.black;
          data.cell.styles.fontStyle = 'bold';
        }
      },
      columnStyles: { 0: { cellWidth: 35, halign: 'center' }, 1: { cellWidth: 30, halign: 'center' } }
    });

    // Resumo de métricas
    autoTable(doc, {
      startY: doc.lastAutoTable.finalY + 10,
      body: [
        ['Scripts Executados', `${analysis.stats.executed} de ${analysis.stats.total}`],
        ['Achados com Dados', String(analysis.stats.executed - analysis.stats.empty)],
        ['Erros de Permissão/Timeout', String(analysis.stats.errors)],
        ['Estatísticas Coletadas Desde', analysis.stats_reset || 'Desconhecido'],
        ['Versão PostgreSQL', pgVer],
        ['Data do Diagnóstico', ts],
      ],
      theme: 'plain',
      styles: { fontSize: 10, cellPadding: 3 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 70, textColor: C.gray },
        1: { cellWidth: 100 }
      }
    });

    // ═══ PÁGINA 3: ESCOPO E METODOLOGIA ═════════════════
    doc.addPage();
    doc.setTextColor(...C.black);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('2. Escopo e Metodologia', 14, 22);
    doc.setDrawColor(...C.blue);
    doc.line(14, 26, 140, 26);

    const catNames = Object.keys(analysis.categories || {});
    const totalScripts = Object.values(analysis.categories || {}).reduce((s, arr) => s + arr.length, 0);

    autoTable(doc, {
      startY: 34,
      body: [
        ['Objetivo', 'Avaliar a saúde operacional, segurança e performance do banco de dados PostgreSQL'],
        ['Banco Analisado', `${connectionConfig.database} @ ${connectionConfig.host}:${connectionConfig.port}`],
        ['Categorias Auditadas', catNames.map(c => c.toUpperCase()).join(', ')],
        ['Total de Scripts', `${totalScripts} scripts diagnósticos executados`],
        ['Ferramenta', 'PG-OmniScan (Motor de Diagnóstico Automatizado)'],
        ['Base de Conhecimento', 'fabiotr/pg_scripts — Arsenal com 469+ scripts SQL'],
        ['Modo de Operação', 'READ-ONLY — Nenhum comando de escrita foi executado'],
        ['Limitações', `${analysis.stats.errors} script(s) falharam por falta de permissão ou timeout`],
      ],
      theme: 'striped',
      styles: { fontSize: 10, cellPadding: 4 },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 55, fillColor: [240, 242, 245] },
      }
    });

    // ═══ PÁGINAS 4-N: ACHADOS DETALHADOS ════════════════
    if (recs.length > 0) {
      doc.addPage();
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.black);
      doc.text('3. Achados e Recomendações Detalhadas', 14, 22);
      doc.setDrawColor(...C.blue);
      doc.line(14, 26, 180, 26);

      doc.setFontSize(9);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(...C.gray);
      doc.text('Cada achado segue o framework profissional "5 Cs" (Critério, Condição, Causa, Consequência, Ação Corretiva).', 14, 33);

      const recsBody = recs.map(r => [
        r.priority,
        r.category,
        r.message,
        r.rationale || '-',
        r.action
      ]);

      autoTable(doc, {
        startY: 38,
        head: [['Nível', 'Área', 'Achado (Condição)', 'Causa / Raciocínio DBA', 'Ação Corretiva']],
        body: recsBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 3, lineColor: C.lightGray },
        headStyles: { fillColor: C.header, textColor: C.white, fontSize: 9 },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const color = PRIORITY_COLORS[data.cell.raw] || C.black;
            data.cell.styles.textColor = color;
            data.cell.styles.fontStyle = 'bold';
          }
          if (data.section === 'body' && data.column.index === 4) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.textColor = [0, 80, 0];
          }
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 20 },
          1: { cellWidth: 28 },
          2: { cellWidth: 70 },
          3: { cellWidth: 75 },
          4: { cellWidth: 75 }
        }
      });
    }

    // ═══ DADOS BRUTOS POR CATEGORIA ═════════════════════
    doc.addPage();
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.black);
    doc.text(`${recs.length > 0 ? '4' : '3'}. Detalhamento Técnico (Dados Brutos)`, 14, 22);
    doc.setDrawColor(...C.blue);
    doc.line(14, 26, 200, 26);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.gray);
    doc.text('Evidências coletadas diretamente dos scripts de diagnóstico. Limitado a 50 linhas por script.', 14, 33);

    let currentY = 40;

    Object.entries(analysis.categories || {}).forEach(([catName, scripts]) => {
      scripts.forEach(script => {
        const rows = script.data || [];
        if (rows.length === 0) return;

        if (currentY > pageH - 40) {
          doc.addPage();
          currentY = 20;
        }

        // Cabeçalho da seção com barra de cor
        doc.setFillColor(...C.blue);
        doc.rect(14, currentY - 4, 3, 10, 'F');
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...C.indigo);
        doc.text(`${catName.toUpperCase()}: ${script.baseName.replace(/_/g, ' ')}`, 20, currentY + 3);
        doc.setTextColor(...C.black);

        const keys = Object.keys(rows[0]);
        const tableBody = rows.slice(0, 50).map(r => keys.map(k => {
          let val = r[k];
          return formatExportValue(val);
        }));

        autoTable(doc, {
          startY: currentY + 7,
          head: [keys],
          body: tableBody,
          styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
          headStyles: { fillColor: C.header, textColor: C.white, fontSize: 7 },
          alternateRowStyles: { fillColor: C.rowAlt },
          theme: 'striped',
          margin: { left: 14, right: 14 },
          didDrawPage: (data) => { currentY = data.cursor.y + 12; }
        });

        if (rows.length > 50) {
          doc.setFontSize(7);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(...C.gray);
          doc.text(`* Exibindo 50 de ${rows.length} linhas.`, 14, currentY - 5);
        }
      });
    });

    // ═══ RODAPÉ PROFISSIONAL ════════════════════════════
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 2; i <= pageCount; i++) {
      doc.setPage(i);
      // Linha de rodapé
      doc.setDrawColor(...C.lightGray);
      doc.setLineWidth(0.3);
      doc.line(14, pageH - 12, pageW - 14, pageH - 12);
      // Texto
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.gray);
      doc.text(`PG-OmniScan | Auditoria: ${connectionConfig.database} | ${ts}`, 14, pageH - 7);
      doc.text(`Página ${i} de ${pageCount}`, pageW - 14, pageH - 7, { align: 'right' });
    }

    doc.save(`auditoria_${connectionConfig.database}_${Date.now()}.pdf`);
  } catch (err) {
    console.error('Erro ao gerar PDF Enterprise:', err);
    alert('Erro ao gerar o relatório PDF. Verifique o console para detalhes.');
  }
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MARKDOWN EXPORT — ENTERPRISE EDITION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const exportToMarkdown = (analysis, connectionConfig) => {
  try {
    const ts = new Date(analysis.timestamp).toLocaleString('pt-BR');
    const pgVer = getPgVersionString(analysis.version);
    const recs = analysis.recommendations || [];
    const health = calculateHealthScore(recs);
    const critical = countByPriority(recs, 'CRITICAL');
    const high = countByPriority(recs, 'HIGH');
    const medium = countByPriority(recs, 'MEDIUM');
    const low = countByPriority(recs, 'LOW');

    let md = '';

    // Cabeçalho
    md += `# 🏥 Relatório de Auditoria PostgreSQL — \`${connectionConfig.database}\`\n\n`;
    md += `> **Emitido em:** ${ts} | **Versão PG:** ${pgVer} | **Instância:** \`${connectionConfig.host}:${connectionConfig.port}\`\n`;
    md += `> **Modo:** Read-Only | **Motor:** PG-OmniScan | **Base:** fabiotr/pg_scripts\n\n`;
    md += `---\n\n`;

    // Sumário Executivo
    md += `## 📋 Sumário Executivo\n\n`;
    const emoji = health.score >= 8 ? '🟢' : health.score >= 6 ? '🟡' : '🔴';
    md += `**Nota de Saúde:** ${emoji} **${health.score}/10** — ${health.label}\n\n`;

    md += `| Severidade | Quantidade |\n`;
    md += `|:---|:---:|\n`;
    md += `| 🔴 Crítico | ${critical} |\n`;
    md += `| 🟠 Alto | ${high} |\n`;
    md += `| 🔵 Médio | ${medium} |\n`;
    md += `| ⚪ Baixo | ${low} |\n\n`;

    md += `**Métricas da Auditoria:**\n`;
    md += `- Scripts executados: ${analysis.stats.executed} de ${analysis.stats.total}\n`;
    md += `- Erros de permissão/timeout: ${analysis.stats.errors}\n`;
    md += `- Estatísticas coletadas desde: ${analysis.stats_reset || 'Desconhecido'}\n\n`;
    md += `---\n\n`;

    // Achados Críticos e Ações
    if (recs.length > 0) {
      md += `## 🚨 Achados e Ações Corretivas\n\n`;
      md += `| Nível | Área | Achado | Ação Corretiva |\n`;
      md += `|:---:|:---|:---|:---|\n`;
      recs.forEach(r => {
        const icon = r.priority === 'CRITICAL' ? '🔴' : r.priority === 'HIGH' ? '🟠' : r.priority === 'MEDIUM' ? '🔵' : '⚪';
        const msg = r.message.replace(/\|/g, '\\|');
        const act = r.action.replace(/\|/g, '\\|');
        md += `| ${icon} ${r.priority} | ${r.category} | ${msg} | ${act} |\n`;
      });
      md += `\n---\n\n`;
    }

    // Diagnóstico por Categoria
    md += `## 📊 Diagnóstico Detalhado por Categoria\n\n`;
    Object.entries(analysis.categories || {}).forEach(([catName, scripts]) => {
      md += `### 📁 ${catName.toUpperCase()}\n\n`;
      scripts.forEach(script => {
        const dataRows = script.data || [];
        if (dataRows.length > 0) {
          md += `#### \`${script.baseName}\`\n`;
          if (script.baseRecommendation) {
            const sev = script.baseRecommendation.severity === 'critical' ? '🔴' : script.baseRecommendation.severity === 'warning' ? '🟡' : 'ℹ️';
            md += `> ${sev} **${script.baseRecommendation.title}:** ${script.baseRecommendation.advice}\n\n`;
          }
          const keys = Object.keys(dataRows[0]);
          md += `| ${keys.join(' | ')} |\n`;
          md += `| ${keys.map(() => '---').join(' | ')} |\n`;
          dataRows.slice(0, 30).forEach(row => {
            md += `| ${keys.map(k => {
              let val = row[k];
              return (val !== null && val !== undefined) ? formatExportValue(val).replace(/\|/g, '\\|').replace(/\n/g, ' ') : '-';
            }).join(' | ')} |\n`;
          });
          if (dataRows.length > 30) md += `\n*...e mais ${dataRows.length - 30} linhas omitidas.*\n`;
          md += `\n`;
        }
      });
    });

    // Rodapé
    md += `---\n\n`;
    md += `*Relatório gerado automaticamente pelo PG-OmniScan — Motor de Diagnóstico PostgreSQL.*\n`;
    md += `*Os dados refletem o estado do banco no momento da coleta. Modo: Read-Only.*\n`;

    // Download
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_${connectionConfig.database}_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Erro ao gerar Markdown Enterprise:', err);
    alert('Erro ao gerar o relatório Markdown. Verifique o console.');
  }
};
