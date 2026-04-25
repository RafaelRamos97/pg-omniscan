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
    const timestamp = new Date(analysis.timestamp).toLocaleString();
    
    // 🎨 CAPA PROFISSIONAL
    doc.setFillColor(23, 24, 37); // Cor de fundo do app
    doc.rect(0, 0, 300, 210, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(40);
    doc.setFont('helvetica', 'bold');
    doc.text('PG-OmniScan', 148, 80, { align: 'center' });
    
    doc.setFontSize(20);
    doc.setFont('helvetica', 'normal');
    doc.text('Relatório de Diagnóstico e Saúde PostgreSQL', 148, 95, { align: 'center' });
    
    doc.setDrawColor(99, 102, 241);
    doc.setLineWidth(1);
    doc.line(100, 105, 200, 105);
    
    doc.setFontSize(14);
    doc.text(`Banco de Dados: ${connectionConfig.database}`, 148, 120, { align: 'center' });
    doc.text(`Instância: ${connectionConfig.host}:${connectionConfig.port}`, 148, 130, { align: 'center' });
    doc.text(`Data da Emissão: ${timestamp}`, 148, 140, { align: 'center' });
    
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text('Documento gerado automaticamente pelo motor de diagnóstico PG-OmniScan.', 148, 190, { align: 'center' });
    doc.text('Base de Conhecimento: fabiotr/pg_scripts', 148, 195, { align: 'center' });

    // 📄 PÁGINA 2: SUMÁRIO EXECUTIVO
    doc.addPage();
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('1. Sumário Executivo', 14, 25);
    
    const statsBody = [
      ['Total de Scripts Executados', String(analysis.stats.executed)],
      ['Achados Relevantes', String(analysis.recommendations?.length || 0)],
      ['Scripts Sem Achados (Saudáveis)', String(analysis.stats.empty)],
      ['Erros de Execução/Permissão', String(analysis.stats.errors)],
      ['Versão do PostgreSQL', `${Math.floor(analysis.version/10000)}.${(analysis.version%10000)/100}`],
      ['Estatísticas coletadas desde', analysis.stats_reset || 'Desconhecido']
    ];

    autoTable(doc, {
      startY: 35,
      body: statsBody,
      theme: 'grid',
      styles: { fontSize: 12, cellPadding: 5 },
      columnStyles: { 0: { fontStyle: 'bold', fillColor: [245, 245, 245], cellWidth: 80 } }
    });

    // 📄 RECOMENDAÇÕES PRIORIZADAS
    if (analysis.recommendations && analysis.recommendations.length > 0) {
      doc.addPage();
      doc.setFontSize(24);
      doc.text('2. Recomendações Críticas e Ações', 14, 25);
      
      const priorityColors = {
        'CRITICAL': [239, 68, 68],
        'HIGH': [245, 158, 11],
        'MEDIUM': [99, 102, 241],
        'LOW': [107, 114, 128]
      };

      const recsBody = analysis.recommendations.map(r => [
        r.priority, 
        r.category, 
        r.message, 
        r.rationale,
        r.action
      ]);

      autoTable(doc, {
        startY: 35,
        head: [['Nível', 'Área', 'Achado', 'Raciocínio DBA', 'Ação Sugerida']],
        body: recsBody,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [23, 24, 37] },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 0) {
            const color = priorityColors[data.cell.raw] || [0, 0, 0];
            data.cell.styles.textColor = color;
            data.cell.styles.fontStyle = 'bold';
          }
        },
        columnStyles: {
          0: { halign: 'center', cellWidth: 20 },
          1: { cellWidth: 30 },
          3: { cellWidth: 80 },
          4: { fontStyle: 'bold', textColor: [0, 100, 0], cellWidth: 80 }
        }
      });
    }

    // 📄 DETALHAMENTO TÉCNICO (Scripts Originais)
    doc.addPage();
    doc.setFontSize(24);
    doc.text('3. Detalhamento Técnico (Scripts)', 14, 25);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text('Abaixo constam os dados brutos extraídos diretamente dos scripts de diagnóstico.', 14, 35);

    let currentY = 45;
    Object.entries(analysis.categories || {}).forEach(([catName, scripts]) => {
      scripts.forEach(script => {
        const rows = script.data || [];
        if (rows.length > 0) {
          // Verifica se cabe na página ou precisa de nova
          if (currentY > 180) {
            doc.addPage();
            currentY = 25;
          }

          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(99, 102, 241);
          doc.text(`> ${catName.toUpperCase()}: ${script.baseName.replace(/_/g, ' ')}`, 14, currentY);
          doc.setTextColor(0, 0, 0);
          
          const keys = Object.keys(rows[0]);
          const tableBody = rows.slice(0, 50).map(r => keys.map(k => {
            let val = r[k];
            if (val === null || val === undefined) return '-';
            if (typeof val === 'boolean') return val ? 'SIM' : 'NÃO';
            return String(val);
          }));

          autoTable(doc, {
            startY: currentY + 5,
            head: [keys],
            body: tableBody,
            styles: { fontSize: 7, cellPadding: 1.5, overflow: 'linebreak' },
            headStyles: { fillColor: [60, 60, 60] },
            theme: 'striped',
            margin: { left: 14, right: 14 },
            didDrawPage: (data) => {
              currentY = data.cursor.y + 15;
            }
          });
          
          if (rows.length > 50) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text(`* Exibindo apenas as primeiras 50 de ${rows.length} linhas para este script.`, 14, currentY - 8);
          }
        }
      });
    });

    // Rodapé em todas as páginas (exceto capa)
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 2; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`PG-OmniScan Auditoria - ${connectionConfig.database} - Página ${i} de ${pageCount}`, 148, 205, { align: 'center' });
    }

    doc.save(`auditoria_${connectionConfig.database}_${Date.now()}.pdf`);
  } catch (err) {
    console.error('Erro detalhado ao gerar PDF:', err);
    alert('Erro ao gerar o PDF profissional. Verifique os logs.');
  }
};
