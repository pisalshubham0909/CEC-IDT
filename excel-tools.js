// PDF to Excel and OCR Processing Module

/**
 * Perform PDF-to-Excel text extraction (digital text or scanned OCR)
 * @param {File} file PDF or Image file
 * @param {Boolean} isScanned Force OCR path
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Array<Array<String>>>>} 2D array representing table rows and columns
 */
async function extractTableData(file, isScanned, onProgress = () => {}) {
  const fileType = file.type;
  const ext = file.name.split('.').pop().toLowerCase();
  
  const isImage = fileType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
  const isPdf = fileType === 'application/pdf' || ext === 'pdf';
  
  if (isImage) {
    onProgress(0.1, "Initializing OCR worker...");
    return await extractFromImageOCR(file, onProgress);
  } else if (isPdf) {
    if (isScanned) {
      return await extractFromPDFOCR(file, onProgress);
    } else {
      try {
        return await extractFromPDFDigital(file, onProgress);
      } catch (err) {
        console.warn("Digital extraction failed or empty, falling back to OCR...", err);
        return await extractFromPDFOCR(file, onProgress);
      }
    }
  } else {
    throw new Error("Unsupported file format. Please upload a PDF or an Image.");
  }
}

/**
 * Extract text from digital PDF using pdf.js
 */
async function extractFromPDFDigital(file, onProgress) {
  onProgress(0.1, "Reading digital PDF structure...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  // Set up pdf.js worker
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  let allTokens = [];
  let pageVerticalOffset = 0; // Cumulative height to stack pages
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.1 + (pageNum / numPages) * 0.7, `Parsing page ${pageNum} of ${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    
    const textContent = await page.getTextContent();
    
    // Normalize tokens from pdf.js coordinates (origin bottom-left) to standard top-left
    const pageTokens = textContent.items.map((item) => {
      // transform: [scaleX, skewY, skewX, scaleY, translateX, translateY]
      const tx = item.transform[4];
      const ty = item.transform[5];
      
      return {
        text: item.str,
        x: tx,
        // invert Y axis so Y starts from top of page stack
        y: pageVerticalOffset + (pageHeight - ty - (item.height || 10)),
        w: item.width || (item.str.length * 6),
        h: item.height || 10
      };
    });
    
    // Filter out empty text tokens
    allTokens = allTokens.concat(pageTokens.filter(t => t.text.trim() !== ''));
    
    // Add page height with buffer to vertical stack
    pageVerticalOffset += pageHeight + 100; 
  }
  
  onProgress(0.9, "Reconstructing table columns and rows...");
  const tableGrid = reconstructTableFromTokens(allTokens);
  
  onProgress(1.0, "Extraction complete!");
  return tableGrid;
}

/**
 * Extract text from Scanned PDF by rendering pages to canvas and OCR'ing
 */
async function extractFromPDFOCR(file, onProgress) {
  onProgress(0.05, "Reading PDF bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  let allTokens = [];
  let pageVerticalOffset = 0;
  
  // Initialize Tesseract Worker
  onProgress(0.1, "Initializing OCR Engine...");
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing') {
        const pageProgress = m.progress || 0;
        // Map individual page progress to overall progress bar
        const totalProgress = 0.15 + (pageProgress * 0.7);
        onProgress(totalProgress, `OCR running: ${Math.round(pageProgress * 100)}%`);
      }
    }
  });
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.15, `Rendering page ${pageNum}/${numPages} for OCR...`);
    const page = await pdf.getPage(pageNum);
    
    // Render at scale 2.0 for higher OCR accuracy
    const scale = 2.0;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    onProgress(0.2, `Running OCR on page ${pageNum}...`);
    const { data } = await worker.recognize(canvas);
    
    // Convert OCR words to standardized tokens
    const pageTokens = data.words.map(w => {
      // Scale coordinates back down to 1.0 scale
      return {
        text: w.text,
        x: w.bbox.x0 / scale,
        y: pageVerticalOffset + (w.bbox.y0 / scale),
        w: (w.bbox.x1 - w.bbox.x0) / scale,
        h: (w.bbox.y1 - w.bbox.y0) / scale
      };
    });
    
    allTokens = allTokens.concat(pageTokens);
    pageVerticalOffset += (viewport.height / scale) + 100;
  }
  
  await worker.terminate();
  
  onProgress(0.9, "Analyzing layout and structuring tables...");
  const tableGrid = reconstructTableFromTokens(allTokens);
  
  onProgress(1.0, "Extraction complete!");
  return tableGrid;
}

/**
 * Extract text from Image using OCR
 */
async function extractFromImageOCR(file, onProgress) {
  onProgress(0.1, "Initializing OCR Engine...");
  
  const worker = await Tesseract.createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing') {
        const pageProgress = m.progress || 0;
        onProgress(0.15 + pageProgress * 0.7, `OCR running: ${Math.round(pageProgress * 100)}%`);
      }
    }
  });
  
  onProgress(0.15, "Loading image content...");
  const imgElement = await loadImageElement(file);
  
  const { data } = await worker.recognize(imgElement);
  
  const tokens = data.words.map(w => {
    return {
      text: w.text,
      x: w.bbox.x0,
      y: w.bbox.y0,
      w: w.bbox.x1 - w.bbox.x0,
      h: w.bbox.y1 - w.bbox.y0
    };
  });
  
  await worker.terminate();
  
  onProgress(0.9, "Structuring tabular data...");
  const tableGrid = reconstructTableFromTokens(tokens);
  
  onProgress(1.0, "Extraction complete!");
  return tableGrid;
}

/**
 * Advanced Table Reconstruction Heuristic
 * Groups unstructured words into rows & columns based on visual coordinates.
 */
function reconstructTableFromTokens(tokens) {
  if (!tokens || tokens.length === 0) {
    return [["No text could be extracted."]];
  }
  
  // Step 1: Merge close tokens on the same horizontal plane (reconstruct words/phrases)
  const mergedTokens = [];
  // Sort primarily by Y, then by X
  tokens.sort((a, b) => a.y - b.y || a.x - b.x);
  
  while (tokens.length > 0) {
    let current = tokens.shift();
    
    // Look for adjacent tokens that are horizontally close and vertically aligned
    for (let i = 0; i < tokens.length; i++) {
      let target = tokens[i];
      
      const verticalOverlap = Math.min(current.y + current.h, target.y + target.h) - Math.max(current.y, target.y);
      const minHeight = Math.min(current.h, target.h);
      
      // If they overlap vertically by more than 50% of the height
      if (verticalOverlap > minHeight * 0.5) {
        const gap = target.x - (current.x + current.w);
        
        // If the horizontal gap is tiny (e.g. less than 1.5 times the font size or 16px)
        if (gap >= -5 && gap < (current.h * 1.5)) {
          // Merge target into current
          current.text = current.text + " " + target.text;
          current.w = (target.x + target.w) - current.x;
          current.h = Math.max(current.h, target.h);
          current.y = Math.min(current.y, target.y);
          
          tokens.splice(i, 1); // remove merged token
          i--; // adjust index
        }
      }
    }
    
    mergedTokens.push(current);
  }
  
  // Step 2: Group merged tokens into rows based on vertical centers
  const rows = [];
  mergedTokens.sort((a, b) => (a.y + a.h/2) - (b.y + b.h/2));
  
  for (const token of mergedTokens) {
    let placed = false;
    const tokenCenterY = token.y + token.h / 2;
    
    for (const row of rows) {
      // Find average row center Y
      const rowCenterY = row.reduce((sum, t) => sum + (t.y + t.h/2), 0) / row.length;
      const rowAvgHeight = row.reduce((sum, t) => sum + t.h, 0) / row.length;
      
      // If token center is close to average row center (within 60% of row height)
      if (Math.abs(tokenCenterY - rowCenterY) < rowAvgHeight * 0.6) {
        row.push(token);
        placed = true;
        break;
      }
    }
    
    if (!placed) {
      rows.push([token]);
    }
  }
  
  // Sort items inside rows from left to right
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
  }
  
  // Sort rows from top to bottom
  rows.sort((a, b) => {
    const aY = a.reduce((sum, t) => sum + t.y, 0) / a.length;
    const bY = b.reduce((sum, t) => sum + t.y, 0) / b.length;
    return aY - bY;
  });
  
  // Step 3: Projection Profile Column Gutters detection
  // Determine global horizontal bounds
  let minX = Infinity;
  let maxX = -Infinity;
  for (const token of mergedTokens) {
    if (token.x < minX) minX = token.x;
    if (token.x + token.w > maxX) maxX = token.x + token.w;
  }
  
  const span = Math.ceil(maxX - minX);
  if (span <= 0) {
    // Fallback: simple text stacking
    return rows.map(r => r.map(t => t.text));
  }
  
  // Fill density array
  const density = new Array(span).fill(0);
  for (const token of mergedTokens) {
    // Ignore extremely wide tokens (headers/footers/titles) for column profile detection
    if (token.w > span * 0.5) continue;
    
    const start = Math.max(0, Math.floor(token.x - minX));
    const end = Math.min(span - 1, Math.ceil(token.x + token.w - minX));
    for (let j = start; j <= end; j++) {
      density[j] += token.h; // weight by height of letters
    }
  }
  
  // Apply a moving average (box filter) to smooth spacing gaps
  // A width of 15px is a reasonable guess for spaces between columns
  const filterWidth = 15;
  const smoothed = new Array(span).fill(0);
  for (let i = 0; i < span; i++) {
    let sum = 0;
    let count = 0;
    for (let d = -Math.floor(filterWidth/2); d <= Math.floor(filterWidth/2); d++) {
      const idx = i + d;
      if (idx >= 0 && idx < span) {
        sum += density[idx];
        count++;
      }
    }
    smoothed[i] = sum / count;
  }
  
  // Detect column boundaries: intervals where smoothed density > threshold
  const columns = [];
  let inColumn = false;
  let colStart = 0;
  // Adaptive threshold: 0.5% of peak density, capped between 0.1 and 1.5 to capture sparse columns
  const threshold = Math.max(0.1, Math.min(1.5, Math.max(...smoothed) * 0.005));
  
  for (let i = 0; i < span; i++) {
    if (smoothed[i] > threshold) {
      if (!inColumn) {
        inColumn = true;
        colStart = i;
      }
    } else {
      if (inColumn) {
        inColumn = false;
        columns.push({
          start: colStart + minX,
          end: i + minX
        });
      }
    }
  }
  
  if (inColumn) {
    columns.push({
      start: colStart + minX,
      end: span + minX
    });
  }
  
  // If we couldn't find columns, fallback to basic list mapping
  if (columns.length === 0) {
    return rows.map(r => r.map(t => t.text));
  }
  
  // Step 4: Map row tokens into detected column buckets
  const grid = [];
  for (const row of rows) {
    const gridRow = new Array(columns.length).fill("");
    
    for (const token of row) {
      const tokenCenterX = token.x + token.w / 2;
      
      // Find the column index that this token's center X belongs to
      let colIdx = -1;
      let minDistance = Infinity;
      
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c];
        
        // Exact fit
        if (tokenCenterX >= col.start && tokenCenterX <= col.end) {
          colIdx = c;
          break;
        }
        
        // Nearest distance fallback
        const colCenter = (col.start + col.end) / 2;
        const dist = Math.abs(tokenCenterX - colCenter);
        if (dist < minDistance) {
          minDistance = dist;
          colIdx = c;
        }
      }
      
      if (colIdx !== -1) {
        // Concatenate if a cell already contains data
        if (gridRow[colIdx]) {
          gridRow[colIdx] += " " + token.text;
        } else {
          gridRow[colIdx] = token.text;
        }
      }
    }
    
    // Add row to grid only if it has some content
    if (gridRow.some(cell => cell.trim() !== "")) {
      grid.push(gridRow);
    }
  }
  
  // If the layout grid is too narrow or wide, filter empty columns
  const activeColumns = [];
  for (let c = 0; c < columns.length; c++) {
    const hasData = grid.some(r => r[c] && r[c].trim() !== "");
    if (hasData) {
      activeColumns.push(c);
    }
  }
  
  // Clean final grid by removing completely empty columns
  const cleanedGrid = grid.map(row => activeColumns.map(cIdx => row[cIdx]));
  
  return cleanedGrid.length > 0 ? cleanedGrid : [["No structured text parsed."]];
}

/**
 * Export table grid data to Excel using xlsx.js (SheetJS)
 * @param {Array<Array<String>>} tableData 2D array of spreadsheet cells
 * @param {String} fileName Name of file to save
 */
function saveGridToExcel(tableData, fileName = "ExtractedTable.xlsx") {
  if (!tableData || tableData.length === 0) {
    throw new Error("No table data to export.");
  }
  
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet(tableData);
  
  // Append sheet to workbook
  XLSX.utils.book_append_sheet(workbook, sheet, "Extracted Data");
  
  // Write and download
  XLSX.writeFile(workbook, fileName);
}

/**
 * Convert PDF to editable Word document (DOCX) client-side
 * @param {File} file PDF File
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Blob>} Generated DOCX blob
 */
async function pdfToWord(file, onProgress = () => {}) {
  onProgress(0.1, "Analyzing text blocks in PDF...");
  
  // Reuse our digital text extraction helper
  const tableData = await extractFromPDFDigital(file, (p, m) => {
    onProgress(0.1 + p * 0.7, m);
  });
  
  onProgress(0.85, "Creating Word structure...");
  
  const docChildren = [];
  const tableRows = [];
  
  tableData.forEach((row) => {
    // If it's a completely empty row, skip
    if (row.every(cell => cell.trim() === "")) return;
    
    // Check if this row is a single-cell line (like a title or heading)
    const nonEmptyCells = row.filter(cell => cell.trim() !== "");
    if (nonEmptyCells.length === 1 && row.length > 1) {
      // If we have accumulated table rows, compile and push the table!
      if (tableRows.length > 0) {
        docChildren.push(createDocxTable(tableRows));
        tableRows.length = 0; // reset
      }
      
      docChildren.push(
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: nonEmptyCells[0],
              font: "Calibri",
              size: 24,
              bold: nonEmptyCells[0].length < 60 // bold shorter headings
            })
          ],
          spacing: { before: 180, after: 120 }
        })
      );
    } else {
      // Accumulate as a table row
      tableRows.push(row);
    }
  });
  
  // Push any remaining table rows
  if (tableRows.length > 0) {
    docChildren.push(createDocxTable(tableRows));
  }

  if (docChildren.length === 0) {
    docChildren.push(
      new docx.Paragraph({
        children: [new docx.TextRun("No extractable text could be found in the source PDF.")]
      })
    );
  }

  const doc = new docx.Document({
    sections: [{
      properties: {},
      children: docChildren
    }]
  });
  
  onProgress(0.92, "Assembling DOCX file stream...");
  const docxBlob = await docx.Packer.toBlob(doc);
  onProgress(1.0, "Conversion finished!");
  return docxBlob;
}

/**
 * Convert PDF pages to full-bleed PowerPoint slides (PPTX) client-side
 * @param {File} file PDF File
 * @param {String} outputName Target filename
 * @param {Function} onProgress Progress callback
 */
async function pdfToPPTX(file, outputName = "Presentation.pptx", onProgress = () => {}) {
  onProgress(0.05, "Reading PDF bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  // Create PowerPoint instance
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // Standard 16:9 widescreen
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.1 + ((pageNum - 1) / numPages) * 0.8, `Rendering slide ${pageNum} of ${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    
    // Render at scale 1.5 to maintain quality while keeping file size small
    const scale = 1.5;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    const pngUrl = canvas.toDataURL('image/png');
    
    // Add slide
    const slide = pptx.addSlide();
    
    // Draw page image full size on slide
    slide.addImage({
      data: pngUrl,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%'
    });
  }
  
  onProgress(0.95, "Compiling PPTX archive...");
  await pptx.writeFile({ fileName: outputName });
  onProgress(1.0, "Conversion complete!");
}

/**
 * Convert Word Document (DOCX) to PDF client-side
 * @param {File} file DOCX File
 * @param {String} outputName Target filename
 * @param {Function} onProgress Progress callback
 */
async function wordToPDF(file, outputName = "Document.pdf", onProgress = () => {}) {
  onProgress(0.1, "Reading DOCX file buffer...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  onProgress(0.3, "Parsing DOCX elements...");
  const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
  const htmlContent = result.value; // Clean parsed HTML
  
  onProgress(0.65, "Rendering print views...");
  
  // Inject HTML into a hidden print container in the DOM
  const printDiv = document.createElement('div');
  printDiv.id = 'temp-word-print-element';
  printDiv.style.position = 'absolute';
  printDiv.style.left = '-9999px';
  printDiv.style.top = '-9999px';
  printDiv.style.width = '700px'; // standard width close to A4
  printDiv.style.padding = '30px';
  printDiv.style.color = '#000000';
  printDiv.style.background = '#ffffff';
  printDiv.style.fontFamily = 'Calibri, Arial, sans-serif';
  printDiv.style.lineHeight = '1.5';
  printDiv.innerHTML = htmlContent;
  
  document.body.appendChild(printDiv);
  
  onProgress(0.8, "Creating PDF pages...");
  
  const opt = {
    margin: 15,
    filename: outputName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  await html2pdf().from(printDiv).set(opt).save();
  
  // Cleanup
  document.body.removeChild(printDiv);
  onProgress(1.0, "Conversion finished!");
}

/**
 * Helper to build a native formatted table structure for docx.js Word exports
 */
function createDocxTable(rowsData) {
  // Find maximum column count in this table block
  const maxCols = Math.max(...rowsData.map(r => r.length));
  
  return new docx.Table({
    width: {
      size: 100,
      type: docx.WidthType.PERCENTAGE
    },
    rows: rowsData.map(row => {
      // Pad row to maxCols to prevent structure misalignment
      const paddedRow = [...row];
      while (paddedRow.length < maxCols) paddedRow.push("");
      
      return new docx.TableRow({
        children: paddedRow.map(cellText => {
          return new docx.TableCell({
            children: [
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: cellText.trim(),
                    font: "Calibri",
                    size: 20 // 10pt font for compact, readable cells
                  })
                ],
                spacing: { after: 60, before: 60 }
              })
            ],
            verticalAlign: docx.VerticalAlign.CENTER,
            margins: {
              top: 100,
              bottom: 100,
              left: 150,
              right: 150
            }
          });
        })
      });
    })
  });
}

