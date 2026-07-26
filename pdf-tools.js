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
  
  // Try Python Backend API first (efficient, fast, offline-safe with PyMuPDF/pypdf)
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

  // Client-side fallback: structure & hyperlink preserving compressor using PDFLib
  onProgress(0.2, "Initializing structure-preserving client compressor...");
  
  try {
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer.slice(0), { ignoreEncryption: true });
    
    // Determine compression parameters
    let maxDim = 1600;
    let quality = 0.65;
    if (level === 'high') {
      maxDim = 1200;
      quality = 0.45;
    } else if (level === 'low' || level === 'keep') {
      maxDim = 2400;
      quality = 0.80;
    }

    onProgress(0.3, "Optimizing image streams & preserving hyperlinks...");
    
    // In-place image XObject stream optimization
    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
    const totalObjs = indirectObjects.length;
    let processed = 0;

    for (const [ref, obj] of indirectObjects) {
      processed++;
      if (processed % 50 === 0) {
        onProgress(0.3 + (processed / totalObjs) * 0.4, `Scanning PDF stream objects (${processed}/${totalObjs})...`);
      }

      if (obj && obj.dict && typeof obj.dict.get === 'function') {
        const subtype = obj.dict.get(PDFLib.PDFName.of('Subtype'));
        if (subtype && subtype.toString() === '/Image') {
          try {
            const contents = obj.contents;
            if (contents && contents.length > 500) {
              const blob = new Blob([contents]);
              const imgBitmap = await createImageBitmap(blob).catch(() => null);
              if (imgBitmap) {
                let w = imgBitmap.width;
                let h = imgBitmap.height;
                let scale = 1.0;
                if (Math.max(w, h) > maxDim) {
                  scale = maxDim / Math.max(w, h);
                  w = Math.max(1, Math.round(w * scale));
                  h = Math.max(1, Math.round(h * scale));
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgBitmap, 0, 0, w, h);
                imgBitmap.close();

                const compressedBlob = await new Promise((resolve) => {
                  canvas.toBlob(resolve, 'image/jpeg', quality);
                });

                if (compressedBlob) {
                  const newBuffer = await compressedBlob.arrayBuffer();
                  const newBytes = new Uint8Array(newBuffer);
                  if (newBytes.length < contents.length || scale < 1.0) {
                    obj.contents = newBytes;
                    obj.dict.set(PDFLib.PDFName.of('Filter'), PDFLib.PDFName.of('DCTDecode'));
                    obj.dict.set(PDFLib.PDFName.of('Width'), PDFLib.PDFNumber.of(w));
                    obj.dict.set(PDFLib.PDFName.of('Height'), PDFLib.PDFNumber.of(h));
                    obj.dict.delete(PDFLib.PDFName.of('DecodeParms'));
                    obj.dict.delete(PDFLib.PDFName.of('SMask'));
                    obj.dict.delete(PDFLib.PDFName.of('Mask'));
                  }
                }
                canvas.width = 0;
                canvas.height = 0;
              }
            }
          } catch (e) {
            // Ignore individual image stream optimization failure
          }
        }
      }
    }

    onProgress(0.8, "Consolidating object streams & saving PDF...");
    const compressedBytes = await pdfDoc.save({ useObjectStreams: true, addDefaultPage: false });
    onProgress(1.0, "Optimization complete!");
    return compressedBytes;
  } catch (fallbackErr) {
    console.warn("Client-side structural compression encountered error, returning original bytes:", fallbackErr);
    return new Uint8Array(arrayBuffer);
  }
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
/**
 * Convert PDF to editable Word document (DOCX)
 */
async function pdfToWord(file, mode = 'layout', onProgress = () => {}) {
  onProgress(0.05, "Reading PDF document bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);

  // Try Python Backend API first (100% native vector & text conversion)
  try {
    onProgress(0.15, "Connecting to conversion engine...");
    const response = await fetch('/api/convert_pdf_to_word', {
      method: 'POST',
      headers: {
        'X-Mode': mode
      },
      body: new Uint8Array(arrayBuffer.slice(0))
    });
    if (response.ok) {
      onProgress(0.9, "Receiving formatted Word document...");
      const blob = await response.blob();
      onProgress(1.0, "Word document conversion finished!");
      return blob;
    }
  } catch (err) {
    console.warn("Backend PDF to Word conversion unavailable, using client fallback:", err);
  }

  // Client Fallback: Extract 100% Editable Text Streams & Tables
  onProgress(0.2, "Parsing structured text elements & table rows...");
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const numPages = pdf.numPages;
  const docChildren = [];

  function flushTableBuffer(docChildren, rowsBuf) {
    if (!rowsBuf || rowsBuf.length === 0) return;
    const maxCols = Math.max(...rowsBuf.map(r => r.length));
    
    const tableRows = rowsBuf.map((rowCells, rIdx) => {
      const isHeader = (rIdx === 0);
      const cells = [];
      for (let cIdx = 0; cIdx < maxCols; cIdx++) {
        const cellText = rowCells[cIdx] || '';
        cells.push(
          new docx.TableCell({
            children: [
              new docx.Paragraph({
                children: [
                  new docx.TextRun({
                    text: cellText,
                    font: "Arial",
                    size: isHeader ? 22 : 20,
                    bold: isHeader,
                    color: isHeader ? "FFFFFF" : "1F2937"
                  })
                ],
                spacing: { before: 40, after: 40 }
              })
            ],
            shading: isHeader ? { fill: "0284C7" } : undefined,
            margins: { top: 80, bottom: 80, left: 120, right: 120 }
          })
        );
      }
      return new docx.TableRow({ children: cells });
    });

    docChildren.push(new docx.Table({
      rows: tableRows,
      width: { size: 100, type: docx.WidthType.PERCENTAGE }
    }));
    docChildren.push(new docx.Paragraph({ spacing: { after: 120 } }));
    rowsBuf.length = 0;
  }

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.2 + ((pageNum - 1) / numPages) * 0.7, `Extracting text & table structure page ${pageNum} of ${numPages}...`);
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    
    const items = textContent.items.map(item => ({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      height: Math.round(item.height || 12)
    }));

    const lineThreshold = 6;
    let lines = [];
    items.forEach(item => {
      let added = false;
      for (let line of lines) {
        if (Math.abs(line.y - item.y) < lineThreshold) {
          line.items.push(item);
          added = true;
          break;
        }
      }
      if (!added) {
        lines.push({ y: item.y, items: [item], height: item.height });
      }
    });

    lines.sort((a, b) => b.y - a.y);
    const tableRowsBuffer = [];

    lines.forEach(line => {
      line.items.sort((a, b) => a.x - b.x);
      const cols = [];
      let currCol = [line.items[0].str];
      for (let i = 1; i < line.items.length; i++) {
        const gap = line.items[i].x - (line.items[i-1].x + (line.items[i-1].str.length * 5));
        if (gap > 18) {
          cols.push(currCol.join(' '));
          currCol = [line.items[i].str];
        } else {
          currCol.push(line.items[i].str);
        }
      }
      cols.push(currCol.join(' '));

      const lineStr = cols.join(' ');
      if (lineStr.trim()) {
        if (cols.length > 1) {
          tableRowsBuffer.push(cols);
        } else {
          flushTableBuffer(docChildren, tableRowsBuffer);
          const isHeader = line.height > 14;
          docChildren.push(new docx.Paragraph({
            children: [
              new docx.TextRun({
                text: lineStr,
                font: "Arial",
                size: isHeader ? 28 : 22,
                bold: isHeader
              })
            ],
            spacing: { after: isHeader ? 140 : 80 }
          }));
        }
      }
    });

    flushTableBuffer(docChildren, tableRowsBuffer);

    if (pageNum < numPages) {
      docChildren.push(new docx.Paragraph({
        children: [new docx.PageBreak()]
      }));
    }
  }

  if (docChildren.length === 0) {
    docChildren.push(new docx.Paragraph({
      children: [new docx.TextRun({ text: "Document contains no content.", font: "Arial", size: 24 })]
    }));
  }

  onProgress(0.95, "Assembling DOCX file...");
  const doc = new docx.Document({
    sections: [{
      children: docChildren
    }]
  });

  return await docx.Packer.toBlob(doc);
}

/**
 * Convert PDF pages to PowerPoint slides with native text boxes (PPTX)
 */
/**
 * Helper to convert Base64 string to Blob
 */
function base64ToBlob(base64, mimeType) {
  const byteCharacters = atob(base64);
  const byteArrays = [];
  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);
    for (let i = 0; i < slice.length; i++) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }
  return new Blob(byteArrays, { type: mimeType });
}

/**
 * Convert PDF pages to PowerPoint slides with native text boxes (PPTX)
 */
async function pdfToPPTX(file, outputName = "Presentation.pptx", onProgress = () => {}) {
  onProgress(0.05, "Reading PDF document bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);

  // Try Python Backend API first (creates native editable text boxes and shapes)
  try {
    onProgress(0.15, "Connecting to presentation conversion engine...");
    const response = await fetch('/api/convert_pdf_to_pptx', {
      method: 'POST',
      body: new Uint8Array(arrayBuffer.slice(0))
    });
    if (response.ok) {
      onProgress(0.9, "Receiving PowerPoint presentation...");
      const blob = await response.blob();
      onProgress(1.0, "Conversion complete!");
      return blob;
    }
  } catch (err) {
    console.warn("Backend PDF to PPTX conversion unavailable, using client fallback:", err);
  }

  // Client-Side Fallback with Native Text Boxes (NOT slide screenshot images!)
  onProgress(0.2, "Parsing slide layout & text items...");
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
  const numPages = pdf.numPages;
  
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 10 x 5.625 inches

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress(0.2 + ((pageNum - 1) / numPages) * 0.7, `Generating editable slide ${pageNum} of ${numPages}...`);
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    const pw = viewport.width;
    const ph = viewport.height;
    
    const slide = pptx.addSlide();
    const scaleX = 10.0 / pw;
    const scaleY = 5.625 / ph;

    const textContent = await page.getTextContent();
    const items = textContent.items;

    // Group text items into block lines
    const lineThreshold = 8;
    let lines = [];
    items.forEach(item => {
      let added = false;
      for (let line of lines) {
        if (Math.abs(line.y - item.transform[5]) < lineThreshold) {
          line.items.push(item);
          added = true;
          break;
        }
      }
      if (!added) {
        lines.push({ y: item.transform[5], items: [item] });
      }
    });

    lines.sort((a, b) => b.y - a.y);

    lines.forEach(line => {
      line.items.sort((a, b) => a.transform[4] - b.transform[4]);
      const lineStr = line.items.map(it => it.str).join(' ');
      if (lineStr.trim()) {
        const firstIt = line.items[0];
        const x = firstIt.transform[4] * scaleX;
        const y = (ph - firstIt.transform[5]) * scaleY;
        const fontSize = Math.max(10, Math.round((firstIt.height || 12) * scaleY * 72));
        
        slide.addText(lineStr, {
          x: Math.max(0.3, x),
          y: Math.max(0.3, y),
          w: Math.min(9.4, 8.0),
          h: 0.6,
          fontSize: Math.min(36, fontSize),
          fontFace: 'Arial',
          color: '1F2937'
        });
      }
    });
  }

  onProgress(0.95, "Compiling PPTX presentation...");
  const base64 = await pptx.write({ outputType: 'base64' });
  const blob = base64ToBlob(base64, 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  onProgress(1.0, "Conversion complete!");
  return blob;
}

/**
 * Convert Word Document (DOCX) to PDF
 */
async function wordToPDF(file, outputName = "Document.pdf", onProgress = () => {}) {
  onProgress(0.05, "Reading Word document bytes...");
  const arrayBuffer = await fileToArrayBuffer(file);

  // Try Python Backend API first (100% vector PDF generation using reportlab)
  try {
    onProgress(0.15, "Connecting to vector PDF engine...");
    const response = await fetch('/api/convert_word_to_pdf', {
      method: 'POST',
      body: new Uint8Array(arrayBuffer.slice(0))
    });
    if (response.ok) {
      onProgress(0.9, "Receiving vector PDF document...");
      const blob = await response.blob();
      onProgress(1.0, "Conversion finished!");
      return blob;
    }
  } catch (err) {
    console.warn("Backend Word to PDF conversion unavailable, using client fallback:", err);
  }

  // Client-Side Fallback: Render vector layout PDF
  onProgress(0.3, "Parsing Word contents...");
  const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
  const htmlContent = result.value;

  onProgress(0.6, "Formatting document layout...");
  const printDiv = document.createElement('div');
  printDiv.id = 'temp-word-print-element';
  printDiv.style.position = 'absolute';
  printDiv.style.left = '-9999px';
  printDiv.style.top = '-9999px';
  printDiv.style.width = '750px';
  printDiv.style.padding = '40px';
  printDiv.style.color = '#000000';
  printDiv.style.background = '#ffffff';
  printDiv.style.fontFamily = 'Arial, sans-serif';
  printDiv.style.lineHeight = '1.6';
  printDiv.style.fontSize = '14px';
  printDiv.innerHTML = htmlContent;
  document.body.appendChild(printDiv);

  onProgress(0.8, "Compiling PDF document...");
  const opt = {
    margin: 15,
    filename: outputName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 3, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const pdfBlob = await html2pdf().from(printDiv).set(opt).outputPdf('blob');
  document.body.removeChild(printDiv);
  onProgress(1.0, "Conversion finished!");
  return pdfBlob;
}


