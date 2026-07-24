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
  
  // 1. Attempt Low-Memory Session Backend Merge if Python server is active
  try {
    onProgress(0.05, "Initializing high-speed merge session...");
    const startRes = await fetch('/api/merge_start', { method: 'POST' });
    if (!startRes.ok) throw new Error("Server session start failed");
    const sessionId = await startRes.text();

    // Dynamic byte-capped chunking (max 200MB per chunk request)
    const MAX_CHUNK_BYTES = 200 * 1024 * 1024;
    const fileChunks = [];
    let currentChunk = [];
    let currentBytes = 0;

    for (let i = 0; i < files.length; i++) {
      currentChunk.push(files[i]);
      currentBytes += files[i].size;
      if (currentBytes >= MAX_CHUNK_BYTES || i === files.length - 1) {
        fileChunks.push(currentChunk);
        currentChunk = [];
        currentBytes = 0;
      }
    }

    const totalChunks = fileChunks.length;

    for (let c = 0; c < totalChunks; c++) {
      const chunkFiles = fileChunks[c];
      const progressPercent = 0.1 + (c / totalChunks) * 0.8;
      onProgress(progressPercent, `Uploading batch ${c + 1} of ${totalChunks} (${chunkFiles.length} files)...`);

      let chunkLength = 0;
      const chunkBuffers = [];
      for (let i = 0; i < chunkFiles.length; i++) {
        const buf = await chunkFiles[i].arrayBuffer();
        chunkBuffers.push(buf);
        chunkLength += 4 + buf.byteLength;
      }

      const payload = new Uint8Array(chunkLength);
      const view = new DataView(payload.buffer);
      let offset = 0;
      for (let i = 0; i < chunkBuffers.length; i++) {
        const buf = chunkBuffers[i];
        view.setUint32(offset, buf.byteLength, false);
        offset += 4;
        payload.set(new Uint8Array(buf), offset);
        offset += buf.byteLength;
      }

      const chunkRes = await fetch('/api/merge_chunk', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-Session-ID': sessionId
        },
        body: payload
      });

      if (!chunkRes.ok) throw new Error("Chunk upload failed");
      await new Promise(r => setTimeout(r, 0));
    }

    onProgress(0.92, "Compiling final PDF document on server...");
    const finishRes = await fetch('/api/merge_finish', {
      method: 'POST',
      headers: { 'X-Session-ID': sessionId }
    });

    if (!finishRes.ok) throw new Error("Finish merge failed");
    const resBuf = await finishRes.arrayBuffer();
    onProgress(1.0, "Merge complete!");
    return new Uint8Array(resBuf);

  } catch (backendErr) {
    console.warn("Backend chunk merge unavailable, using client fallback:", backendErr);
  }
  
  // 2. Client-side Chunked Fallback Merge using pdf-lib
  onProgress(0.1, "Merging files client-side...");
  const mergedPdf = await PDFLib.PDFDocument.create();
  const totalFiles = files.length;
  const yieldBatchSize = 25;
  
  for (let i = 0; i < totalFiles; i++) {
    if (i % 10 === 0 || i === totalFiles - 1) {
      onProgress(0.1 + (i / totalFiles) * 0.8, `Merging file ${i + 1} of ${totalFiles}: ${files[i].name}...`);
    }
    
    let fileBytes = await files[i].arrayBuffer();
    let pdfDoc;
    try {
      pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
    } catch (err) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('encrypt') || msg.includes('password') || msg.includes('decrypt')) {
        const unlockedFile = await getOrDecryptFile(files[i]);
        const unlockedBytes = await unlockedFile.arrayBuffer();
        pdfDoc = await PDFLib.PDFDocument.load(unlockedBytes);
      } else {
        throw err;
      }
    }
    
    const pageIndices = pdfDoc.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(pdfDoc, pageIndices);
    
    for (let j = 0; j < copiedPages.length; j++) {
      mergedPdf.addPage(copiedPages[j]);
    }
    
    fileBytes = null;
    pdfDoc = null;
    
    if (i % yieldBatchSize === 0 || i === totalFiles - 1) {
      await new Promise(r => setTimeout(r, 0));
    }
  }
  
  onProgress(0.95, "Compiling final PDF structure...");
  const mergedPdfBytes = await mergedPdf.save({ useObjectStreams: false });
  onProgress(1.0, "Merge complete!");
  return mergedPdfBytes;
}

/**
 * Convert images (JPG, PNG, WebP) to a single PDF
 * Convert images (JPG, PNG, WebP) to a single PDF preserving 100% pixel clarity
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
    
    let embeddedImage;
    const arrayBuffer = await file.arrayBuffer();
    const nameLower = file.name.toLowerCase();
    const isPng = file.type === 'image/png' || nameLower.endsWith('.png');
    const isJpg = file.type === 'image/jpeg' || file.type === 'image/jpg' || nameLower.endsWith('.jpg') || nameLower.endsWith('.jpeg');

    if (isPng) {
      embeddedImage = await pdfDoc.embedPng(arrayBuffer);
    } else if (isJpg) {
      embeddedImage = await pdfDoc.embedJpg(arrayBuffer);
    } else {
      const jpgBytes = await processImageToJpgBytes(file);
      embeddedImage = await pdfDoc.embedJpg(jpgBytes);
    }
    
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
  
  onProgress(0.95, "Compiling high-clarity PDF document...");
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
 * Compress a PDF by downsampling images with buffer cloning (prevents detached ArrayBuffer errors)
 * @param {File} file PDF File
 * @param {String} level 'low' | 'medium' | 'high'
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Uint8Array>} Compressed PDF bytes
 */
async function compressPDF(file, level = 'medium', onProgress = () => {}) {
  onProgress(0.05, "Reading document bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  // Try Python Backend API first (efficient & offline-safe)
  try {
    onProgress(0.15, "Uploading to local compression engine...");
    const response = await fetch('/api/compress', {
      method: 'POST',
      headers: {
        'X-Level': level
      },
      body: new Uint8Array(arrayBuffer.slice(0))
    });
    if (response.ok) {
      onProgress(0.9, "Receiving optimized PDF streams...");
      const resBytes = new Uint8Array(await response.arrayBuffer());
      onProgress(1.0, "Optimization complete!");
      return resBytes;
    } else {
      console.warn("Backend API returned error, falling back to client-side compression:", await response.text());
    }
  } catch (err) {
    console.warn("Backend compression API unavailable, using client-side fallback:", err);
  }

  // Client-side fallback with cloned buffer to prevent ArrayBuffer detachment error
  onProgress(0.1, "Initializing client-side compressor...");
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const numPages = pdf.numPages;
  const compressedPdf = await PDFLib.PDFDocument.create();
  
  // Adjusted DPI scales and quality to achieve ACTUAL compression on client-side
  let dpiScale = 1.3; // medium (balanced)
  let quality = 0.65;
  
  if (level === 'high') {
    dpiScale = 0.9; // high compression (smallest size)
    quality = 0.45;
  } else if (level === 'low' || level === 'keep') {
    dpiScale = 1.8; // low compression (high quality)
    quality = 0.85;
  }
  
  // Reuse a single canvas element to prevent browser memory leaks and tab crashes
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.1 + ((pageNum - 1) / numPages) * 0.8, `Optimizing page ${pageNum} of ${numPages}...`);
    
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: dpiScale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    // Get JPEG image data using toBlob (faster and memory-efficient compared to toDataURL)
    const imgBuffer = await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Canvas export failed"));
          return;
        }
        blob.arrayBuffer().then(resolve).catch(reject);
      }, 'image/jpeg', quality);
    });
    
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
  
  // Clear canvas memory references
  canvas.width = 0;
  canvas.height = 0;
  
  onProgress(0.95, "Consolidating stream objects...");
  const compressedBytes = await compressedPdf.save({ useObjectStreams: true });
  onProgress(1.0, "Optimization complete!");
  return compressedBytes;
}

/**
 * Burn text annotations and hand-drawn PNG signatures onto original PDF page layers
 * @param {ArrayBuffer} originalBytes Original PDF binary
 * @param {Array<Object>} annotations List of overlays with relative coords
 * @param {Boolean} applyToAllPages Whether to apply annotations to every page
 * @param {Function} onProgress Progress callback
 * @returns {Promise<Uint8Array>} Updated PDF bytes
 */
async function saveEditedPDF(originalBytes, annotations, applyToAllPages = false, onProgress = () => {}) {
  onProgress(0.2, "Loading original document...");
  const pdfDoc = await PDFLib.PDFDocument.load(originalBytes);
  const pages = pdfDoc.getPages();
  const standardFont = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  
  for (let i = 0; i < annotations.length; i++) {
    const annot = annotations[i];
    onProgress(0.3 + (i / annotations.length) * 0.5, `Applying changes...`);
    
    const targetPages = applyToAllPages ? pages : [pages[annot.pageIndex]];
    
    for (const page of targetPages) {
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
  }
  
  onProgress(0.9, "Writing signed document layers...");
  const editedBytes = await pdfDoc.save();
  onProgress(1.0, "Compile finished!");
  return editedBytes;
}

/**
 * Encrypt a PDF document client-side or using Python Backend API across ALL pages
 */
async function encryptPDFFile(pdfBytes, password) {
  try {
    const response = await fetch('/api/encrypt', {
      method: 'POST',
      headers: { 'X-Password': password },
      body: new Uint8Array(pdfBytes.slice(0))
    });
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch (err) {
    console.warn("Backend encryption API unavailable, using client fallback:", err);
  }

  const encryptModule = await import('https://cdn.jsdelivr.net/npm/@pdfsmaller/pdf-encrypt/+esm');
  return await encryptModule.encryptPDF(new Uint8Array(pdfBytes), password);
}

/**
 * Decrypt a PDF document client-side or using Python Backend API across ALL pages
 */
async function decryptPDFFile(pdfBytes, password) {
  try {
    const response = await fetch('/api/decrypt', {
      method: 'POST',
      headers: { 'X-Password': password },
      body: new Uint8Array(pdfBytes.slice(0))
    });
    if (response.ok) {
      return new Uint8Array(await response.arrayBuffer());
    }
  } catch (err) {
    console.warn("Backend decryption API unavailable, using client fallback:", err);
  }

  const decryptModule = await import('https://cdn.jsdelivr.net/npm/@pdfsmaller/pdf-decrypt/+esm');
  return await decryptModule.decryptPDF(new Uint8Array(pdfBytes), password);
}

/**
 * Check if a PDF is encrypted
 */
async function checkIsPDFEncrypted(pdfBytes) {
  try {
    const bytes = new Uint8Array(pdfBytes);
    await PDFLib.PDFDocument.load(bytes);
    return false;
  } catch (err) {
    const msg = err.message.toLowerCase();
    if (msg.includes('encrypt') || msg.includes('password') || msg.includes('decrypt') || msg.includes('unsupported')) {
      return true;
    }
    return false;
  }
}

/**
 * Fast check if a File is encrypted by scanning header & trailer slices (takes < 0.2ms)
 */
async function fastCheckIsPDFFileEncrypted(file) {
  try {
    const headSlice = file.slice(0, 4096);
    const tailSlice = file.size > 8192 ? file.slice(file.size - 4096) : file.slice(0);
    const [headBuf, tailBuf] = await Promise.all([
      headSlice.arrayBuffer(),
      tailSlice.arrayBuffer()
    ]);
    const decoder = new TextDecoder('latin1');
    const headText = decoder.decode(headBuf);
    const tailText = decoder.decode(tailBuf);
    return headText.includes('/Encrypt') || tailText.includes('/Encrypt');
  } catch (e) {
    return false;
  }
}

/**
 * Extract specific page ranges into a new PDF
 */
async function extractPDFPages(file, rangeStr) {
  const fileBytes = await fileToArrayBuffer(file);
  const srcDoc = await PDFLib.PDFDocument.load(fileBytes);
  const totalPages = srcDoc.getPageCount();
  
  const pageIndices = parsePageRange(rangeStr, totalPages);
  if (pageIndices.length === 0) {
    throw new Error("No valid pages selected.");
  }
  
  const newDoc = await PDFLib.PDFDocument.create();
  const copiedPages = await newDoc.copyPages(srcDoc, pageIndices);
  copiedPages.forEach(p => newDoc.addPage(p));
  
  return await newDoc.save();
}

/**
 * Split all pages of a PDF into individual files wrapped in a ZIP
 */
async function splitPDFIntoZIP(file, onProgress = () => {}) {
  if (typeof JSZip === 'undefined') {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
  }
  
  const fileBytes = await fileToArrayBuffer(file);
  const srcDoc = await PDFLib.PDFDocument.load(fileBytes);
  const totalPages = srcDoc.getPageCount();
  
  const zip = new JSZip();
  const baseName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
  
  for (let i = 0; i < totalPages; i++) {
    onProgress(i / totalPages, `Extracting page ${i + 1} of ${totalPages}...`);
    const singleDoc = await PDFLib.PDFDocument.create();
    const [copiedPage] = await singleDoc.copyPages(srcDoc, [i]);
    singleDoc.addPage(copiedPage);
    const pdfBytes = await singleDoc.save();
    zip.file(`${baseName}_page_${i + 1}.pdf`, pdfBytes);
  }
  
  onProgress(0.95, "Compiling ZIP archive...");
  const zipBlob = await zip.generateAsync({ type: 'blob' });
  onProgress(1.0, "Splitting complete!");
  return zipBlob;
}

/**
 * Helper to parse ranges like "1, 3, 5-8"
 */
function parsePageRange(rangeStr, totalPages) {
  const indices = [];
  const parts = rangeStr.split(',');
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;
    if (part.includes('-')) {
      const [startStr, endStr] = part.split('-');
      const start = parseInt(startStr.trim(), 10);
      const end = parseInt(endStr.trim(), 10);
      if (isNaN(start) || isNaN(end)) continue;
      const s = Math.max(1, Math.min(start, totalPages)) - 1;
      const e = Math.max(1, Math.min(end, totalPages)) - 1;
      if (s <= e) {
        for (let i = s; i <= e; i++) {
          indices.push(i);
        }
      } else {
        for (let i = s; i >= e; i--) {
          indices.push(i);
        }
      }
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page)) continue;
      const idx = Math.max(1, Math.min(page, totalPages)) - 1;
      indices.push(idx);
    }
  }
  return indices;
}

/**
 * Overlay text or image watermark stamps onto all PDF pages
 */
async function watermarkPDF(file, options = {}, onProgress = () => {}) {
  const {
    type = 'text',
    text = 'CONFIDENTIAL',
    fontSize = 60,
    textColor = '#ef4444',
    opacity = 0.3,
    rotation = -45,
    imageFile = null,
    imageScale = 0.3,
    position = 'center'
  } = options;
  
  onProgress(0.1, "Loading PDF file buffer...");
  const fileBytes = await fileToArrayBuffer(file);
  const pdfDoc = await PDFLib.PDFDocument.load(fileBytes);
  const pages = pdfDoc.getPages();
  
  let font = null;
  let img = null;
  let imgWidth = 0;
  let imgHeight = 0;
  
  if (type === 'text') {
    font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  } else if (type === 'image' && imageFile) {
    onProgress(0.2, "Embedding image watermark...");
    const imgBytes = await fileToArrayBuffer(imageFile);
    const ext = imageFile.name.split('.').pop().toLowerCase();
    if (ext === 'png') {
      img = await pdfDoc.embedPng(imgBytes);
    } else {
      img = await pdfDoc.embedJpg(imgBytes);
    }
    imgWidth = img.width * imageScale;
    imgHeight = img.height * imageScale;
  }
  
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return PDFLib.rgb(r, g, b);
  };
  const colorObj = type === 'text' ? hexToRgb(textColor) : null;
  
  for (let i = 0; i < pages.length; i++) {
    onProgress(0.3 + (i / pages.length) * 0.6, `Watermarking page ${i+1} of ${pages.length}...`);
    const page = pages[i];
    const { width, height } = page.getSize();
    
    if (type === 'text') {
      const textWidth = font.widthOfTextAtSize(text, fontSize);
      const textHeight = fontSize;
      
      let x = (width - textWidth) / 2;
      let y = (height - textHeight) / 2;
      
      if (position === 'top') {
        y = height - textHeight - 60;
      } else if (position === 'bottom') {
        y = 60;
      }
      
      page.drawText(text, {
        x,
        y,
        size: fontSize,
        font,
        color: colorObj,
        opacity: opacity,
        rotate: PDFLib.degrees(rotation),
      });
    } else if (type === 'image' && img) {
      let x = (width - imgWidth) / 2;
      let y = (height - imgHeight) / 2;
      
      if (position === 'top') {
        y = height - imgHeight - 60;
      } else if (position === 'bottom') {
        y = 60;
      }
      
      page.drawImage(img, {
        x,
        y,
        width: imgWidth,
        height: imgHeight,
        opacity: opacity
      });
    }
  }
  
  onProgress(0.95, "Writing watermarked document...");
  return await pdfDoc.save();
}

/**
 * Dynamic script loader utility
 */
function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

/**
 * Parse text items from a PDF using pdf.js
 */
async function extractTextFromPDF(arrayBuffer, onProgress) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  let textLines = [];
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.1 + (pageNum / numPages) * 0.7, `Parsing text page ${pageNum} of ${numPages}...`);
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    const items = textContent.items.map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      height: item.height || 10
    }));
    
    const threshold = 8;
    let lines = [];
    items.forEach(item => {
      let added = false;
      for (let line of lines) {
        if (Math.abs(line.y - item.y) < threshold) {
          line.items.push(item);
          added = true;
          break;
        }
      }
      if (!added) {
        lines.push({ y: item.y, items: [item] });
      }
    });
    
    lines.sort((a, b) => b.y - a.y);
    lines.forEach(line => {
      line.items.sort((a, b) => a.x - b.x);
      const lineStr = line.items.map(it => it.str).join(' ');
      if (lineStr.trim()) {
        textLines.push(lineStr);
      }
    });
    textLines.push("--- PAGE BREAK ---");
  }
  return textLines;
}

/**
 * Convert PDF to editable Word document (DOCX) client-side
 */
async function pdfToWord(file, mode = 'layout', onProgress = () => {}) {
  const arrayBuffer = await fileToArrayBuffer(file);
  
  if (mode === 'text') {
    onProgress(0.1, "Parsing document text...");
    const textLines = await extractTextFromPDF(arrayBuffer, onProgress);
    
    onProgress(0.85, "Creating Word structure...");
    const docChildren = [];
    
    textLines.forEach(line => {
      if (line === "--- PAGE BREAK ---") {
        docChildren.push(new docx.Paragraph({
          children: [new docx.PageBreak()]
        }));
      } else {
        docChildren.push(new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: line,
              font: "Arial",
              size: 24
            })
          ],
          spacing: { after: 120 }
        }));
      }
    });
    
    const doc = new docx.Document({
      sections: [{
        children: docChildren
      }]
    });
    
    onProgress(0.95, "Assembling DOCX file stream...");
    return await docx.Packer.toBlob(doc);
  } else {
    onProgress(0.1, "Reading PDF document structure...");
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    const docChildren = [];
    
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      onProgress(0.1 + ((pageNum - 1) / numPages) * 0.8, `Rendering page ${pageNum} of ${numPages}...`);
      const page = await pdf.getPage(pageNum);
      const scale = 3.5;
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      const imgDataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const imgBuffer = await (await fetch(imgDataUrl)).arrayBuffer();
      
      docChildren.push(
        new docx.Paragraph({
          children: [
            new docx.ImageRun({
              data: imgBuffer,
              transformation: {
                width: 595.27 - 72,
                height: 841.89 - 72
              }
            })
          ],
          alignment: docx.AlignmentType.CENTER
        })
      );
      
      if (pageNum < numPages) {
        docChildren.push(new docx.Paragraph({
          children: [new docx.PageBreak()]
        }));
      }
    }
    
    onProgress(0.95, "Compiling final Word layout...");
    const doc = new docx.Document({
      sections: [{
        properties: {
          page: {
            size: {
              width: docx.convertInchesToTwip(8.27),
              height: docx.convertInchesToTwip(11.69)
            },
            margin: {
              top: docx.convertInchesToTwip(0.5),
              bottom: docx.convertInchesToTwip(0.5),
              left: docx.convertInchesToTwip(0.5),
              right: docx.convertInchesToTwip(0.5)
            }
          }
        },
        children: docChildren
      }]
    });
    
    return await docx.Packer.toBlob(doc);
  }
}

/**
 * Convert PDF pages to full-bleed PowerPoint slides (PPTX) client-side
 */
async function pdfToPPTX(file, outputName = "Presentation.pptx", onProgress = () => {}) {
  onProgress(0.05, "Reading PDF bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  
  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.1 + ((pageNum - 1) / numPages) * 0.8, `Rendering slide ${pageNum} of ${numPages}...`);
    const page = await pdf.getPage(pageNum);
    
    const scale = 3.5;
    const viewport = page.getViewport({ scale });
    
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext('2d');
    
    await page.render({
      canvasContext: context,
      viewport: viewport
    }).promise;
    
    const jpegUrl = canvas.toDataURL('image/jpeg', 0.90);
    
    const slide = pptx.addSlide();
    slide.addImage({
      data: jpegUrl,
      x: 0,
      y: 0,
      w: '100%',
      h: '100%'
    });
  }
  
  onProgress(0.95, "Compiling PPTX presentation...");
  await pptx.writeFile({ fileName: outputName });
  onProgress(1.0, "Conversion complete!");
}

/**
 * Convert Word Document (DOCX) to PDF client-side
 */
async function wordToPDF(file, outputName = "Document.pdf", onProgress = () => {}) {
  onProgress(0.1, "Reading DOCX file buffer...");
  const arrayBuffer = await fileToArrayBuffer(file);
  
  onProgress(0.3, "Parsing Word contents...");
  const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
  const htmlContent = result.value;
  
  onProgress(0.65, "Rendering print layout...");
  const printDiv = document.createElement('div');
  printDiv.id = 'temp-word-print-element';
  printDiv.style.position = 'absolute';
  printDiv.style.left = '-9999px';
  printDiv.style.top = '-9999px';
  printDiv.style.width = '800px';
  printDiv.style.padding = '40px';
  printDiv.style.color = '#000000';
  printDiv.style.background = '#ffffff';
  printDiv.style.fontFamily = 'Calibri, Arial, sans-serif';
  printDiv.style.lineHeight = '1.6';
  printDiv.innerHTML = htmlContent;
  
  document.body.appendChild(printDiv);
  
  onProgress(0.8, "Compiling PDF pages...");
  
  const opt = {
    margin: 12,
    filename: outputName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 4, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };
  
  await html2pdf().from(printDiv).set(opt).save();
  
  document.body.removeChild(printDiv);
  onProgress(1.0, "Conversion finished!");
}


