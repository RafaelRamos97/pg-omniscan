import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Utilitário de Exportação da Telemetria (Local / Sem Backend)
 */

export const exportToMarkdown = (analysis, connectionConfig) => {
  try {
    let md = `# PG-OmniScan: Relatório de Saúde DBA\n`;
    md += `**Database:** \`${connectionConfig.database}\`\n`;
    md += `**Análise Executada:** ${new Date(analysis.timestamp).toLocaleString()}\n`;
    md += `**Versão PostgreSQL:** ${Math.floor((analysis.version || 0)/10000)}\n\n`;
    md += `---\n\n`;

    md += `## ⚠️ Resumo de Recomendações Vitais\n`;
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      analysis.recommendations.forEach(r => {
        md += `- **[${r.priority}]** *${r.category}*: ${r.message}\n`;
        md += `  - 💡 Ação Sugerida: ${r.action}\n`;
      });
    } else {
      md += `Nenhuma recomendação grave reportada no fluxo principal.\n`;
    }
    md += `\n---\n\n`;

    md += `## 📊 Diagnóstico Detalhado por Categorias\n`;
    Object.entries(analysis.categories || {}).forEach(([catName, scripts]) => {
      md += `\n### 📁 ${catName.toUpperCase()}\n`;
      scripts.forEach(script => {
        const dataRows = script.data || [];
        if (dataRows.length > 0) {
          md += `\n#### Script: \`${script.name || script.baseName}\`\n`;
          const keys = Object.keys(dataRows[0]);
          md += `| ${keys.join(' | ')} |\n`;
          md += `| ${keys.map(() => '---').join(' | ')} |\n`;
          
          dataRows.forEach(row => {
            md += `| ${keys.map(k => {
              let val = row[k];
              return (val !== null && val !== undefined) ? String(val).replace(/\\n/g, ' ') : '-';
            }).join(' | ')} |\n`;
          });
        }
      });
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `auditoria_${connectionConfig.database}_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (err) {
    console.error('Erro ao gerar Markdown:', err);
    alert('Erro ao gerar Markdown. Verifique o console.');
  }
};

export const exportToPDF = (analysis, connectionConfig) => {
  try {
    const doc = new jsPDF('landscape');
    
    // Cabeçalho
    doc.setFontSize(22);
    doc.text('PG-OmniScan: Relatorio Oficial Executivo', 14, 20);
    
    doc.setFontSize(12);
    doc.setTextColor(100, 100, 100);
    doc.text(`Banco Destino: ${connectionConfig.database}`, 14, 30);
    doc.text(`Criado em: ${new Date(analysis.timestamp).toLocaleString()}`, 14, 36);
    
    let startYPos = 46;
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.text('Avisos & Recomendações Acionáveis', 14, startYPos);
      
      const recsBody = analysis.recommendations.map(r => [
        r.priority, 
        r.category, 
        r.message, 
        r.action
      ]);

      autoTable(doc, {
        startY: startYPos + 4,
        head: [['Risco', 'Categoria', 'Diagnóstico/Motivo', 'Plano da Ação']],
        body: recsBody,
        headStyles: { fillColor: [99, 102, 241] },
        theme: 'grid',
        columnStyles: { 
          0: { fontStyle: 'bold', halign: 'center', cellWidth: 25 },
          1: { cellWidth: 40 },
        }
      });
    }

    // Tabelas por Categoria
    Object.entries(analysis.categories || {}).forEach(([catName, scripts]) => {
      scripts.forEach(script => {
        const rows = script.data || [];
        if (rows.length > 0) {
          doc.addPage();
          doc.setFontSize(18);
          doc.text(`Dados Brutos: ${script.name || script.baseName}`, 14, 20);
          
          const keys = Object.keys(rows[0]);
          const tableBody = rows.map(r => keys.map(k => (r[k] !== null && r[k] !== undefined) ? String(r[k]) : '-'));
          
          autoTable(doc, {
            startY: 30,
            head: [keys],
            body: tableBody,
            styles: { fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [50, 50, 50] },
            theme: 'striped',
            horizontalPageBreak: true
          });
        }
      });
    });

    doc.save(`auditoria_${connectionConfig.database}_${Date.now()}.pdf`);
  } catch (err) {
    console.error('Erro detalhado ao gerar PDF:', err);
    alert('Falha ao gerar o PDF. Verifique se o npm install jspdf jspdf-autotable foi executado no diretório client.');
  }
};
