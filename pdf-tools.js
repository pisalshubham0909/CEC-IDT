// PDF Operations Module using pdf-lib

const PageSizeMap = {
  a4: { width: 595.27, height: 841.89 },
  letter: { width: 612, height: 792 },
  a3: { width: 841.89, height: 1190.55 },
  legal: { width: 612, height: 1008 },
  a5: { width: 419.53, height: 595.27 }
};

/**
 * Utility to convert file to ArrayBuffer
 */
function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Utility to load an image element for canvas manipulation
 */
function loadImageElement(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Converts any image (JPEG, PNG, WebP, etc.) into JPEG/PNG bytes using canvas
 */
async function processImageToJpgBytes(file) {
  const img = await loadImageElement(file);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  
  return new Promise((resolve) => {
    // Convert to JPEG
    canvas.toBlob((blob) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsArrayBuffer(blob);
    }, 'image/jpeg', 0.92);
  });
}

/**
 * Merge multiple PDF files into one
 * @param {Array<File>} files List of PDF files
 * @param {Function} onProgress Callback for progress tracking
 * @returns {Promise<Uint8Array>} Merged PDF bytes
 */
async function mergePDFs(files, onProgress = () => {}) {
  if (!files || files.length === 0) {
    throw new Error("No files selected for merging.");
  }
  
  const mergedPdf = await PDFLib.PDFDocument.create();
  
  for (let i = 0; i < files.length; i++) {
    onProgress(i / files.length, `Loading file ${i + 1} of ${files.length}: ${files[i].name}...`);
    
    const fileBytes = await fileToArrayBuffer(files[i]);
    const pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
    const pages = await mergedPdf.copyPages(pdfDoc, pdfDoc.getPageIndices());
    
    pages.forEach((page) => {
      mergedPdf.addPage(page);
    });
  }
  
  onProgress(0.95, "Compiling final PDF structure...");
  const mergedPdfBytes = await mergedPdf.save();
  onProgress(1.0, "Merge complete!");
  return mergedPdfBytes;
}

/**
 * Convert images (JPG, PNG, WebP) to a single PDF
 * @param {Array<File>} files List of image files
 * @param {Object} options Configuration parameters
 * @param {Function} onProgress Callback for progress tracking
 * @returns {Promise<Uint8Array>} Generated PDF bytes
 */
async function imagesToPDF(files, options = {}, onProgress = () => {}) {
  const {
    pageSize = 'a4',       // 'a4', 'letter', 'fit'
    orientation = 'portrait', // 'portrait', 'landscape'
    marginSize = 'none',    // 'none' (0), 'small' (20), 'large' (40)
    imgFit = 'contain'     // 'contain', 'cover'
  } = options;
  
  const pdfDoc = await PDFLib.PDFDocument.create();
  
  const marginMap = { none: 0, small: 20, large: 40 };
  const margin = marginMap[marginSize] !== undefined ? marginMap[marginSize] : 0;
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress(i / files.length, `Processing image ${i + 1} of ${files.length}...`);
    
    // Process image to standardized JPEG bytes (helps handle webp/gifs/pngs consistently)
    const jpgBytes = await processImageToJpgBytes(file);
    const embeddedImage = await pdfDoc.embedJpg(jpgBytes);
    const imgWidth = embeddedImage.width;
    const imgHeight = embeddedImage.height;
    
    let pageWidth, pageHeight;
    
    if (pageSize === 'fit') {
      pageWidth = imgWidth + margin * 2;
      pageHeight = imgHeight + margin * 2;
    } else {
      const baseSize = PageSizeMap[pageSize] || PageSizeMap.a4;
      if (orientation === 'landscape') {
        pageWidth = baseSize.height;
        pageHeight = baseSize.width;
      } else {
        pageWidth = baseSize.width;
        pageHeight = baseSize.height;
      }
    }
    
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    
    // Calculate draw dimensions based on fit constraints
    const maxDrawWidth = pageWidth - margin * 2;
    const maxDrawHeight = pageHeight - margin * 2;
    
    let drawWidth = maxDrawWidth;
    let drawHeight = maxDrawHeight;
    
    const pageRatio = maxDrawWidth / maxDrawHeight;
    const imgRatio = imgWidth / imgHeight;
    
    if (imgFit === 'contain') {
      if (imgRatio > pageRatio) {
        // Image is wider than page ratio
        drawWidth = maxDrawWidth;
        drawHeight = maxDrawWidth / imgRatio;
      } else {
        // Image is taller than page ratio
        drawHeight = maxDrawHeight;
        drawWidth = maxDrawHeight * imgRatio;
      }
    } else if (imgFit === 'cover') {
      if (imgRatio > pageRatio) {
        drawHeight = maxDrawHeight;
        drawWidth = maxDrawHeight * imgRatio;
      } else {
        drawWidth = maxDrawWidth;
        drawHeight = maxDrawWidth / imgRatio;
      }
    }
    
    // Center alignment in the printable area
    const drawX = margin + (maxDrawWidth - drawWidth) / 2;
    const drawY = margin + (maxDrawHeight - drawHeight) / 2;
    
    page.drawImage(embeddedImage, {
      x: drawX,
      y: drawY,
      width: drawWidth,
      height: drawHeight
    });
  }
  
  onProgress(0.95, "Compiling PDF document...");
  const pdfBytes = await pdfDoc.save();
  onProgress(1.0, "Conversion complete!");
  return pdfBytes;
}

/**
 * Resize a PDF file's pages to standard size with scaling support
 * @param {File} file PDF file
 * @param {Object} options Configuration parameters
 * @param {Function} onProgress Callback for progress tracking
 * @returns {Promise<Uint8Array>} Resized PDF bytes
 */
async function resizePDF(file, options = {}, onProgress = () => {}) {
  const {
    targetSize = 'a4',       // 'a4', 'letter', 'a3', etc.
    scalingMode = 'scale-content', // 'scale-content', 'fit-canvas'
    orientation = 'portrait' // 'portrait', 'landscape'
  } = options;
  
  onProgress(0.1, "Loading PDF file...");
  const fileBytes = await fileToArrayBuffer(file);
  const pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  
  const baseSize = PageSizeMap[targetSize] || PageSizeMap.a4;
  let targetWidth = baseSize.width;
  let targetHeight = baseSize.height;
  
  if (orientation === 'landscape') {
    targetWidth = baseSize.height;
    targetHeight = baseSize.width;
  }
  
  for (let i = 0; i < totalPages; i++) {
    onProgress(0.1 + (i / totalPages) * 0.8, `Resizing page ${i + 1} of ${totalPages}...`);
    
    const page = pages[i];
    const { width: origWidth, height: origHeight } = page.getSize();
    
    if (scalingMode === 'scale-content') {
      const scaleX = targetWidth / origWidth;
      const scaleY = targetHeight / origHeight;
      
      // Resize page canvas
      page.setSize(targetWidth, targetHeight);
      // Scale content to fit the new canvas size
      page.scaleContent(scaleX, scaleY);
    } else {
      // fit-canvas: Keep content centered or top-left, just resize dimensions
      page.setSize(targetWidth, targetHeight);
      
      // Calculate translation to keep it centered
      const tx = (targetWidth - origWidth) / 2;
      const ty = (targetHeight - origHeight) / 2;
      
      page.translateContent(tx, ty);
    }
  }
  
  onProgress(0.95, "Saving resized document...");
  const resizedPdfBytes = await pdfDoc.save();
  onProgress(1.0, "Resizing complete!");
  return resizedPdfBytes;
}

/**
 * Compress a PDF by re-rendering pages to compressed JPEGs
 * @param {File} file PDF File
 * @param {String} level 'low' | 'medium' | 'high'
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Uint8Array>} Compressed PDF bytes
 */
async function compressPDF(file, level = 'medium', onProgress = () => {}) {
  onProgress(0.05, "Reading document bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  const compressedPdf = await PDFLib.PDFDocument.create();
  
  let dpiScale = 1.25; // standard
  let quality = 0.7;
  
  if (level === 'high') {
    dpiScale = 0.95;
    quality = 0.5;
  } else if (level === 'low') {
    dpiScale = 1.6;
    quality = 0.85;
  }
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.1 + ((pageNum - 1) / numPages) * 0.8, `Optimizing page ${pageNum} of ${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: dpiScale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Get JPEG image data
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const response = await fetch(dataUrl);
    const imgBuffer = await response.arrayBuffer();
    
    const embeddedImage = await compressedPdf.embedJpg(imgBuffer);
    
    // Target dimensions at scale 1.0 (original dimensions in points)
    const wPoints = viewport.width / dpiScale;
    const hPoints = viewport.height / dpiScale;
    const newPage = compressedPdf.addPage([wPoints, hPoints]);
    
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: wPoints,
      height: hPoints
    });
  }
  
  onProgress(0.92, "Encoding optimized stream layers...");
  const compressedBytes = await compressedPdf.save();
  onProgress(1.0, "Optimization complete!");
  return compressedBytes;
}

/**
 * Burn text annotations and hand-drawn PNG signatures onto original PDF page layers
 * @param {ArrayBuffer} originalBytes Original PDF binary
 * @param {Array<Object>} annotations List of overlays with relative coords
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Uint8Array>} Updated PDF bytes
 */
async function saveEditedPDF(originalBytes, annotations, onProgress = () => {}) {
  onProgress(0.2, "Loading original document...");
  const pdfDoc = await PDFLib.PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();
  
  const standardFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  
  for (let i = 0; i < annotations.length; i++) {
    const annot = annotations[i];
    onProgress(0.3 + (i / annotations.length) * 0.5, `Applying changes...`);
    
    const page = pages[annot.pageIndex];
    if (!page) continue;
    
    const { width, height } = page.getSize();
    
    if (annot.type === 'text') {
      // Map coordinates back: x is left percent, y is top percent
      const pdfX = annot.x * width;
      // Adjust vertical align since PDF draws baseline up
      const pdfY = (1.0 - annot.y) * height - (annot.fontSize * 0.82);
      
      page.drawText(annot.text, {
        x: pdfX,
        y: pdfY,
        size: annot.fontSize,
        font: standardFont,
        color: PDFLib.rgb(0, 0, 0)
      });
    } else if (annot.type === 'image') {
      const response = await fetch(annot.imageSrc);
      const imgBuffer = await response.arrayBuffer();
      const embeddedImg = await pdfDoc.embedPng(imgBuffer);
      
      const pdfW = annot.width * width;
      const pdfH = annot.height * height;
      const pdfX = annot.x * width;
      const pdfY = (1.0 - annot.y) * height - pdfH;
      
      page.drawImage(embeddedImg, {
        x: pdfX,
        y: pdfY,
        width: pdfW,
        height: pdfH
      });
    }
  }
  
  onProgress(0.9, "Writing signed document layers...");
  const editedBytes = await pdfDoc.save();
  onProgress(1.0, "Compile finished!");
  return editedBytes;
}

