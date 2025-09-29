// pdfGenerator.js
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

export default async function generateDietPdf(dietData) {
    // 1. INITIALIZATION
    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage();
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    // --- AYURVEDIC COLOR PALETTE ---
    const COLOR_PRIMARY_TITLE = rgb(0.55, 0.27, 0.07);
    const COLOR_SECTION_TITLE = rgb(0.85, 0.53, 0.10);
    const COLOR_TEXT_MAIN = rgb(0.36, 0.25, 0.20);
    const COLOR_TABLE_HEADER_TEXT = rgb(0.3, 0.18, 0.05);
    const COLOR_TABLE_HEADER_BG = rgb(0.98, 0.95, 0.88);
    const COLOR_PRIMARY_LINE = rgb(0.85, 0.53, 0.10);

    // 2. SHARED UTILITIES
    const margin = 40;
    let y = height - margin;
    const textPadding = 5;
    const lineHeight = 12;

    const checkAddNewPage = (requiredHeight = 20) => {
        if (y < margin + requiredHeight) {
            page = pdfDoc.addPage();
            y = height - margin;
            return true;
        }
        return false;
    };

    const wrapText = (text, cellWidth, font, fontSize) => {
        const S = String(text);
        const words = S.split(' ');
        let line = '';
        const lines = [];
        for (const word of words) {
            const testLine = line + (line ? ' ' : '') + word;
            if (font.widthOfTextAtSize(testLine, fontSize) > cellWidth) {
                if (line) lines.push(line);
                line = word;
            } else {
                line = testLine;
            }
        }
        if (line) lines.push(line);
        return lines.length > 0 ? lines : [' '];
    };

    const drawSectionTitle = (title) => {
        checkAddNewPage(40);
        page.drawText(String(title || ''), { x: margin, y, font: boldFont, size: 14, color: COLOR_SECTION_TITLE });
        y -= 25;
    };

    const drawParagraph = (text, options = {}) => {
        const { size = 10, font: pFont = font, lineHeight: pLineHeight = 1.5 } = options;
        checkAddNewPage(50);
        const textWidth = width - (2 * margin);
        const lines = wrapText(text, textWidth, pFont, size);
        lines.forEach(line => {
            checkAddNewPage(size * pLineHeight);
            page.drawText(line, { x: margin, y, font: pFont, size, color: COLOR_TEXT_MAIN });
            y -= size * pLineHeight;
        });
        y -= 20;
    };

    const drawTable = (headers, rows, options = {}) => {
        const { colWidths = headers.map(() => 1 / headers.length), headerFontSize = 9, rowFontSize = 9 } = options;
        const tableWidth = width - 2 * margin;
        const columnWidths = colWidths.map(w => w * tableWidth);
        const columnPositions = [margin];
        for (let i = 0; i < columnWidths.length - 1; i++) {
            columnPositions.push(columnPositions[i] + columnWidths[i]);
        }

        const drawHeader = () => {
            checkAddNewPage(20);
            y -= 20;
            page.drawRectangle({ x: margin, y, width: tableWidth, height: 20, color: COLOR_TABLE_HEADER_BG });
            headers.forEach((header, i) => {
                page.drawText(String(header || ''), {
                    x: columnPositions[i] + textPadding,
                    y: y + 6,
                    font: boldFont,
                    size: headerFontSize,
                    color: COLOR_TABLE_HEADER_TEXT
                });
            });
        };
        drawHeader();

        rows.forEach(row => {
            const wrappedCells = row.map((cell, i) => wrapText(
                typeof cell === 'object' ? JSON.stringify(cell) : String(cell),
                columnWidths[i] - 2 * textPadding,
                font,
                rowFontSize
            ));
            const maxLines = Math.max(...wrappedCells.map(cell => cell.length));
            const rowHeight = maxLines * (rowFontSize + 2) + (2 * textPadding);

            if (checkAddNewPage(rowHeight)) drawHeader();
            const startY = y;

            wrappedCells.forEach((lines, i) => {
                let cellY = startY - (rowFontSize + textPadding);
                lines.forEach(line => {
                    page.drawText(line, { x: columnPositions[i] + textPadding, y: cellY, font, size: rowFontSize, color: COLOR_TEXT_MAIN });
                    cellY -= (rowFontSize + 2);
                });
            });
            y -= rowHeight;

            page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
            columnPositions.slice(1).forEach(xPos => {
                page.drawLine({ start: { x: xPos, y: startY }, end: { x: xPos, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
            });
        });
        y -= 25;
    };

    const transformRows = (section) => {
        if (!section || !section.rows || !section.headers) return [];
        return section.rows.map(row =>
            section.headers.map(header => {
                const value = row[header];
                if (typeof value === 'object') return JSON.stringify(value);
                return String(value || '');
            })
        );
    };

    // --- 3. PDF CONTENT GENERATION ---
    checkAddNewPage(60);
    page.drawText(String(dietData.title || 'Ayurvedic Diet Report'), { x: margin, y, font: boldFont, size: 22, color: COLOR_PRIMARY_TITLE });
    y -= 30;
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1.5, color: COLOR_PRIMARY_LINE });
    y -= 25;
    drawParagraph(dietData.introduction || '');

    if (dietData.user_details) {
        drawSectionTitle(dietData.user_details.table_name);
        drawTable(dietData.user_details.headers, transformRows(dietData.user_details), { colWidths: [0.3, 0.7] });
    }

    if (dietData.ayurvedic_diagnosis) {
        drawSectionTitle(dietData.ayurvedic_diagnosis.table_name);
        drawTable(dietData.ayurvedic_diagnosis.headers, transformRows(dietData.ayurvedic_diagnosis), { colWidths: [0.2, 0.2, 0.3, 0.3] });
    }

    if (dietData.daily_ayurvedic_recommendations) {
        drawSectionTitle(dietData.daily_ayurvedic_recommendations.table_name);
        drawTable(dietData.daily_ayurvedic_recommendations.headers, transformRows(dietData.daily_ayurvedic_recommendations), { colWidths: [0.3, 0.7] });
    }

    if (dietData.ayurvedic_home_remedies) {
        drawSectionTitle(dietData.ayurvedic_home_remedies.table_name);
        drawTable(dietData.ayurvedic_home_remedies.headers, transformRows(dietData.ayurvedic_home_remedies), { colWidths: [0.2, 0.3, 0.2, 0.3] });
    }

    if (dietData.diet_chart) {
        drawSectionTitle(dietData.diet_chart.table_name);

        const formatNutrition = (nutriValue) => {
            if (!nutriValue) return '';
            if (typeof nutriValue === 'object') {
                return `Cal: ${nutriValue.Calories || ''}, P: ${nutriValue.Protein || ''}, C: ${nutriValue.Carbs || ''}, F: ${nutriValue.Fat || ''}`;
            }
            return String(nutriValue);
        };

        dietData.diet_chart.days.forEach(day => {
            checkAddNewPage(40);
            page.drawText(String(day.day || ''), { x: margin, y, font: boldFont, size: 12, color: COLOR_SECTION_TITLE });
            y -= 20;

            const mealRows = (day.meals || []).map(meal => [
                String(meal.Time || ''),
                String(meal['Meal Type'] || ''),
                String(meal.Recipe || ''),
                formatNutrition(meal['Nutritional Value'])
            ]);

            drawTable(dietData.diet_chart.headers, mealRows, { colWidths: [0.12, 0.18, 0.45, 0.25] });
        });
    }

    if (dietData.important_notes && dietData.important_notes.length > 0) {
        drawSectionTitle("Important Notes & Guidelines");
        dietData.important_notes.forEach(note => {
            const textWidth = width - 2 * margin;
            checkAddNewPage(50);
            const wrappedLines = wrapText(note, textWidth, font, 9);
            wrappedLines.forEach(line => {
                page.drawText(line, { x: margin, y, font, size: 9, color: COLOR_TEXT_MAIN });
                y -= 11;
            });
            y -= 5;
        });
    }

    // --- 4. FINALIZE AND RETURN ---
    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
}
