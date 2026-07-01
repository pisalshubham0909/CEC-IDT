// Main Application Router & Controller

document.addEventListener('DOMContentLoaded', () => {
  initRouting();
  initMergerTab();
  initImagesTab();
  initResizerTab();
  initExcelTab();
  initCompressTab();
  initConvertersTab();
  initGlobalCardEffects();
});

/**
 * Premium mouse hover glow effects on dashboard cards
 */
function initGlobalCardEffects() {
  document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      card.style.setProperty('--x', `${x}px`);
      card.style.setProperty('--y', `${y}px`);
    });
  });
}

/**
 * Handle Tab-based Single Page Routing
 */
function initRouting() {
  const tabs = document.querySelectorAll('.nav-tab');
  const sections = document.querySelectorAll('.tool-section');
  
  function switchTab(targetId) {
    // Deactivate all
    tabs.forEach(t => t.classList.remove('active'));
    sections.forEach(s => s.classList.remove('active'));
    
    // Activate target
    const activeSection = document.getElementById(targetId);
    if (activeSection) {
      activeSection.classList.add('active');
    }
    
    const activeTab = document.querySelector(`.nav-tab[data-target="${targetId}"]`);
    if (activeTab) {
      activeTab.classList.add('active');
    }
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      switchTab(tab.getAttribute('data-target'));
    });
  });

  // Home Dashboard Card redirection
  document.querySelectorAll('.tool-card').forEach(card => {
    card.addEventListener('click', () => {
      switchTab(card.getAttribute('data-target'));
    });
  });

  // Logo home button redirection
  document.getElementById('logo-home').addEventListener('click', () => {
    switchTab('home-section');
  });
}

/**
 * Helper to display size nicely
 */
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


/* ==========================================================================
   1. PDF MERGER TAB LOGIC
   ========================================================================== */
function initMergerTab() {
  let mergeQueue = [];
  let mergedPdfUrl = null;
  let mergedPdfBytes = null;
  
  const dropzone = document.getElementById('merge-dropzone');
  const fileInput = document.getElementById('merge-file-input');
  const fileListContainer = document.getElementById('merge-file-list');
  const btnRun = document.getElementById('btn-run-merge');
  const progressContainer = document.getElementById('merge-progress');
  const progressBar = document.getElementById('merge-progress-bar');
  const progressPercent = document.getElementById('merge-progress-percent');
  const progressMsg = document.getElementById('merge-progress-msg');
  const successCard = document.getElementById('merge-success');
  const btnDownload = document.getElementById('btn-download-merge');
  const outputNameInput = document.getElementById('merge-output-name');

  // Trigger file browser on click
  dropzone.addEventListener('click', () => fileInput.click());

  // Input change
  fileInput.addEventListener('change', (e) => {
    handleFiles(e.target.files);
    fileInput.value = ''; // clear select
  });

  // Drag and drop listeners
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  });

  function handleFiles(files) {
    successCard.style.display = 'none';
    for (const file of files) {
      if (file.type === 'application/pdf') {
        mergeQueue.push({
          id: crypto.randomUUID(),
          file: file
        });
      }
    }
    renderQueue();
  }

  function renderQueue() {
    fileListContainer.innerHTML = '';
    btnRun.disabled = mergeQueue.length < 2;

    mergeQueue.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'file-item';
      itemEl.draggable = true;
      
      // Keep track of indexes for drag events
      itemEl.dataset.id = item.id;
      itemEl.dataset.index = index;

      const canvas = document.createElement('canvas');
      canvas.className = 'thumbnail-canvas';
      
      itemEl.innerHTML = `
        <div class="file-drag-handle">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <div class="file-thumbnail" id="thumb-${item.id}">
          <span class="file-thumbnail-icon">PDF</span>
        </div>
        <div class="file-info">
          <div class="file-name">${item.file.name}</div>
          <div class="file-meta">
            <span>${formatBytes(item.file.size)}</span>
            <span id="pages-${item.id}">Reading pages...</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="file-btn" onclick="window.moveMergeItem(${index}, -1)" ${index === 0 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="file-btn" onclick="window.moveMergeItem(${index}, 1)" ${index === mergeQueue.length - 1 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="file-btn delete" onclick="window.deleteMergeItem('${item.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      `;

      fileListContainer.appendChild(itemEl);

      // Async render pdf thumbnail
      renderPDFInfoAndThumbnail(item);

      // Drag events
      itemEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        itemEl.style.opacity = '0.4';
      });
      
      itemEl.addEventListener('dragend', () => {
        itemEl.style.opacity = '1';
        renderQueue();
      });

      itemEl.addEventListener('dragover', (e) => {
        e.preventDefault();
      });

      itemEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = parseInt(itemEl.dataset.index);
        
        if (fromIndex !== toIndex) {
          const moved = mergeQueue.splice(fromIndex, 1)[0];
          mergeQueue.splice(toIndex, 0, moved);
          renderQueue();
        }
      });
    });
  }

  // PDF Page loader & Preview helper
  async function renderPDFInfoAndThumbnail(item) {
    try {
      const arrayBuffer = await fileToArrayBuffer(item.file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      // Update page numbers in UI
      const pagesLabel = document.getElementById(`pages-${item.id}`);
      if (pagesLabel) pagesLabel.textContent = `Pages: ${pdf.numPages}`;
      
      // Render Thumbnail Canvas
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.15 });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      const context = canvas.getContext('2d');
      await page.render({ canvasContext: context, viewport: viewport }).promise;
      
      const thumbWrap = document.getElementById(`thumb-${item.id}`);
      if (thumbWrap) {
        thumbWrap.innerHTML = '';
        thumbWrap.appendChild(canvas);
      }
    } catch (e) {
      console.error(e);
      const pagesLabel = document.getElementById(`pages-${item.id}`);
      if (pagesLabel) pagesLabel.textContent = 'Pages: Error';
    }
  }

  // Global functions attached to window for list operations
  window.deleteMergeItem = (id) => {
    mergeQueue = mergeQueue.filter(item => item.id !== id);
    renderQueue();
  };

  window.moveMergeItem = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx >= 0 && targetIdx < mergeQueue.length) {
      const temp = mergeQueue[index];
      mergeQueue[index] = mergeQueue[targetIdx];
      mergeQueue[targetIdx] = temp;
      renderQueue();
    }
  };

  // Run Merger
  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';

    try {
      const filesOnly = mergeQueue.map(item => item.file);
      mergedPdfBytes = await mergePDFs(filesOnly, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });

      // Prepare Download
      if (mergedPdfUrl) URL.revokeObjectURL(mergedPdfUrl);
      const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
      mergedPdfUrl = URL.createObjectURL(blob);

      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
    } catch (err) {
      alert(`Error during merge: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
    }
  });

  // Download Trigger
  btnDownload.addEventListener('click', () => {
    if (mergedPdfUrl) {
      const link = document.createElement('a');
      link.href = mergedPdfUrl;
      link.download = outputNameInput.value || 'Merged_Documents.pdf';
      link.click();
    }
  });
}


/* ==========================================================================
   2. JPG/IMAGES TO PDF TAB LOGIC
   ========================================================================== */
function initImagesTab() {
  let imageQueue = [];
  let pdfUrl = null;
  let pdfBytes = null;
  
  const dropzone = document.getElementById('jpg-dropzone');
  const fileInput = document.getElementById('jpg-file-input');
  const fileListContainer = document.getElementById('jpg-file-list');
  const btnRun = document.getElementById('btn-run-jpg');
  const progressContainer = document.getElementById('jpg-progress');
  const progressBar = document.getElementById('jpg-progress-bar');
  const progressPercent = document.getElementById('jpg-progress-percent');
  const progressMsg = document.getElementById('jpg-progress-msg');
  const successCard = document.getElementById('jpg-success');
  const btnDownload = document.getElementById('btn-download-jpg');
  const outputNameInput = document.getElementById('jpg-output-name');
  
  // Settings Elements
  const pageSizeSelect = document.getElementById('jpg-page-size');
  const orientationGroup = document.getElementById('jpg-orientation-group');
  const orientationSelect = document.getElementById('jpg-orientation');
  const marginsSelect = document.getElementById('jpg-margins');
  const fitGroup = document.getElementById('jpg-fit-group');
  const fitModeSelect = document.getElementById('jpg-fit-mode');

  // Toggle dynamic inputs based on Page Size Selection
  pageSizeSelect.addEventListener('change', () => {
    if (pageSizeSelect.value === 'fit') {
      orientationGroup.style.display = 'none';
      fitGroup.style.display = 'none';
    } else {
      orientationGroup.style.display = 'block';
      fitGroup.style.display = 'block';
    }
  });

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    handleImages(e.target.files);
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleImages(e.dataTransfer.files);
    }
  });

  function handleImages(files) {
    successCard.style.display = 'none';
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    for (const file of files) {
      if (allowed.includes(file.type)) {
        imageQueue.push({
          id: crypto.randomUUID(),
          file: file,
          tempUrl: URL.createObjectURL(file)
        });
      }
    }
    renderQueue();
  }

  function renderQueue() {
    fileListContainer.innerHTML = '';
    btnRun.disabled = imageQueue.length === 0;

    imageQueue.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'file-item';
      itemEl.draggable = true;
      itemEl.dataset.id = item.id;
      itemEl.dataset.index = index;
      
      itemEl.innerHTML = `
        <div class="file-drag-handle">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
        </div>
        <div class="file-thumbnail">
          <img src="${item.tempUrl}" alt="thumbnail">
        </div>
        <div class="file-info">
          <div class="file-name">${item.file.name}</div>
          <div class="file-meta">
            <span>${formatBytes(item.file.size)}</span>
            <span>Image</span>
          </div>
        </div>
        <div class="file-actions">
          <button class="file-btn" onclick="window.moveImageItem(${index}, -1)" ${index === 0 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="file-btn" onclick="window.moveImageItem(${index}, 1)" ${index === imageQueue.length - 1 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="file-btn delete" onclick="window.deleteImageItem('${item.id}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      `;

      fileListContainer.appendChild(itemEl);

      // Drag over operations
      itemEl.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', index);
        itemEl.style.opacity = '0.4';
      });
      
      itemEl.addEventListener('dragend', () => {
        itemEl.style.opacity = '1';
        renderQueue();
      });

      itemEl.addEventListener('dragover', (e) => e.preventDefault());

      itemEl.addEventListener('drop', (e) => {
        e.preventDefault();
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
        const toIndex = parseInt(itemEl.dataset.index);
        
        if (fromIndex !== toIndex) {
          const moved = imageQueue.splice(fromIndex, 1)[0];
          imageQueue.splice(toIndex, 0, moved);
          renderQueue();
        }
      });
    });
  }

  window.deleteImageItem = (id) => {
    const target = imageQueue.find(item => item.id === id);
    if (target) URL.revokeObjectURL(target.tempUrl);
    imageQueue = imageQueue.filter(item => item.id !== id);
    renderQueue();
  };

  window.moveImageItem = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx >= 0 && targetIdx < imageQueue.length) {
      const temp = imageQueue[index];
      imageQueue[index] = imageQueue[targetIdx];
      imageQueue[targetIdx] = temp;
      renderQueue();
    }
  };

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';

    try {
      const options = {
        pageSize: pageSizeSelect.value,
        orientation: orientationSelect.value,
        marginSize: marginsSelect.value,
        imgFit: fitModeSelect.value
      };
      
      const filesOnly = imageQueue.map(item => item.file);
      pdfBytes = await imagesToPDF(filesOnly, options, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      pdfUrl = URL.createObjectURL(blob);

      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
    } catch (err) {
      alert(`Error creating PDF: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
    }
  });

  btnDownload.addEventListener('click', () => {
    if (pdfUrl) {
      const link = document.createElement('a');
      link.href = pdfUrl;
      link.download = outputNameInput.value || 'Images_Document.pdf';
      link.click();
    }
  });
}


/* ==========================================================================
   3. PDF RESIZER TAB LOGIC
   ========================================================================== */
function initResizerTab() {
  let targetFile = null;
  let resizedPdfUrl = null;
  let resizedPdfBytes = null;
  
  const dropzone = document.getElementById('resize-dropzone');
  const fileInput = document.getElementById('resize-file-input');
  const infoBlock = document.getElementById('resize-file-info');
  const previewContainer = document.getElementById('resize-canvas-preview');
  const btnRun = document.getElementById('btn-run-resize');
  
  const fileNameLabel = document.getElementById('resize-file-name');
  const fileSizeLabel = document.getElementById('resize-file-size');
  const filePagesLabel = document.getElementById('resize-file-pages');
  const btnClear = document.getElementById('btn-clear-resize');

  // Options inputs
  const sizeSelect = document.getElementById('resize-target-format');
  const orientationSelect = document.getElementById('resize-orientation');
  const scaleModeSelect = document.getElementById('resize-scaling-mode');
  const outputNameInput = document.getElementById('resize-output-name');

  const progressContainer = document.getElementById('resize-progress');
  const progressBar = document.getElementById('resize-progress-bar');
  const progressPercent = document.getElementById('resize-progress-percent');
  const progressMsg = document.getElementById('resize-progress-msg');
  
  const successCard = document.getElementById('resize-success');
  const btnDownload = document.getElementById('btn-download-resize');

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  async function loadFile(file) {
    if (file.type !== 'application/pdf') {
      alert("Only PDF files are supported in this tool.");
      return;
    }
    
    targetFile = file;
    successCard.style.display = 'none';
    
    // UI state toggles
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    previewContainer.style.display = 'flex';
    btnRun.disabled = false;
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Loading pages...";
    
    previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Rendering live page format preview...</span>';

    try {
      const arrayBuffer = await fileToArrayBuffer(file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      
      filePagesLabel.textContent = `Pages: ${pdf.numPages}`;
      
      // Render first page preview
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.4 });
      
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      
      previewContainer.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'canvas-page-wrapper';
      wrap.appendChild(canvas);
      previewContainer.appendChild(wrap);
      
      await page.render({ canvasContext: context, viewport: viewport }).promise;
    } catch (e) {
      console.error(e);
      filePagesLabel.textContent = "Pages: Error";
    }
  }

  btnClear.addEventListener('click', () => {
    targetFile = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    previewContainer.style.display = 'none';
    btnRun.disabled = true;
    successCard.style.display = 'none';
  });

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';

    try {
      const options = {
        targetSize: sizeSelect.value,
        orientation: orientationSelect.value,
        scalingMode: scaleModeSelect.value
      };
      
      resizedPdfBytes = await resizePDF(targetFile, options, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });

      if (resizedPdfUrl) URL.revokeObjectURL(resizedPdfUrl);
      const blob = new Blob([resizedPdfBytes], { type: 'application/pdf' });
      resizedPdfUrl = URL.createObjectURL(blob);

      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnClear.disabled = false;
    } catch (err) {
      alert(`Error resizing PDF: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });

  btnDownload.addEventListener('click', () => {
    if (resizedPdfUrl) {
      const link = document.createElement('a');
      link.href = resizedPdfUrl;
      link.download = outputNameInput.value || 'Resized_Document.pdf';
      link.click();
    }
  });
}


/* ==========================================================================
   4. PDF TO EXCEL AND OCR SPREADSHEET EDITOR TAB LOGIC
   ========================================================================== */
function initExcelTab() {
  let excelFile = null;
  let currentGridData = [[]];
  
  const uploadView = document.getElementById('excel-upload-view');
  const editorView = document.getElementById('excel-editor-view');
  
  const dropzone = document.getElementById('excel-dropzone');
  const fileInput = document.getElementById('excel-file-input');
  
  const infoBlock = document.getElementById('excel-file-info');
  const fileNameLabel = document.getElementById('excel-file-name');
  const fileSizeLabel = document.getElementById('excel-file-size');
  const filePagesLabel = document.getElementById('excel-file-pages');
  const thumbnailText = document.getElementById('excel-thumbnail-text');
  
  const previewContainer = document.getElementById('excel-canvas-preview');
  const btnClear = document.getElementById('btn-clear-excel');
  const btnRun = document.getElementById('btn-run-excel');
  
  const forceOcrSwitch = document.getElementById('excel-force-ocr');
  const outputNameInput = document.getElementById('excel-output-name');
  
  const progressContainer = document.getElementById('excel-progress');
  const progressBar = document.getElementById('excel-progress-bar');
  const progressPercent = document.getElementById('excel-progress-percent');
  const progressMsg = document.getElementById('excel-progress-msg');
  
  // Editor controls
  const editorFilename = document.getElementById('excel-editor-filename');
  const spreadsheetTable = document.getElementById('spreadsheet-table');
  const btnAddRow = document.getElementById('btn-grid-add-row');
  const btnAddCol = document.getElementById('btn-grid-add-col');
  const btnExport = document.getElementById('btn-grid-export');
  const btnBack = document.getElementById('btn-grid-back');

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  async function loadFile(file) {
    const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowed.includes(file.type)) {
      alert("Unsupported file format. Please upload a PDF or an Image (JPG/PNG).");
      return;
    }

    excelFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    
    // Auto-check Force OCR switch if it's an image
    if (file.type.startsWith('image/')) {
      forceOcrSwitch.checked = true;
      forceOcrSwitch.disabled = true;
      thumbnailText.textContent = "IMG";
      filePagesLabel.textContent = "Format: Image";
      previewContainer.style.display = 'flex';
      previewContainer.innerHTML = '';
      
      // Draw image preview
      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.style.maxHeight = '240px';
      img.style.borderRadius = '8px';
      previewContainer.appendChild(img);
    } else {
      forceOcrSwitch.disabled = false;
      thumbnailText.textContent = "PDF";
      filePagesLabel.textContent = "Reading pages...";
      previewContainer.style.display = 'flex';
      previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Rendering preview...</span>';
      
      try {
        const arrayBuffer = await fileToArrayBuffer(file);
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        filePagesLabel.textContent = `Pages: ${pdf.numPages}`;
        
        // Render thumbnail
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        previewContainer.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'canvas-page-wrapper';
        wrap.appendChild(canvas);
        previewContainer.appendChild(wrap);
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
      } catch (e) {
        console.error(e);
        filePagesLabel.textContent = "Pages: Error";
      }
    }
  }

  btnClear.addEventListener('click', resetExcelTab);

  function resetExcelTab() {
    excelFile = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    previewContainer.style.display = 'none';
    btnRun.disabled = true;
    progressContainer.style.display = 'none';
    uploadView.style.display = 'grid';
    editorView.style.display = 'none';
  }

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';

    try {
      const isScanned = forceOcrSwitch.checked;
      
      currentGridData = await extractTableData(excelFile, isScanned, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });

      // Switch to spreadsheet editor layout
      progressContainer.style.display = 'none';
      uploadView.style.display = 'none';
      editorView.style.display = 'flex';
      
      editorFilename.textContent = outputNameInput.value || 'Extracted_Spreadsheet.xlsx';
      
      renderSpreadsheet();
      btnRun.disabled = false;
      btnClear.disabled = false;
    } catch (err) {
      alert(`Extraction failed: ${err.message}`);
      console.error(err);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });

  // Render spreadsheet grid table from currentGridData 2D array
  function renderSpreadsheet() {
    spreadsheetTable.innerHTML = '';
    
    if (currentGridData.length === 0) return;
    
    const colCount = currentGridData[0].length;
    
    // 1. Column header names (A, B, C...) + Col action controls
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    // Empty row corner cell
    const emptyCorner = document.createElement('th');
    emptyCorner.style.width = '45px';
    headerRow.appendChild(emptyCorner);
    
    for (let c = 0; c < colCount; c++) {
      const th = document.createElement('th');
      
      const colLetter = getColumnLetter(c);
      
      th.innerHTML = `
        <div class="col-header-wrapper">
          <span>Column ${colLetter}</span>
          <button class="col-btn-del" onclick="window.deleteGridCol(${c})" title="Delete Column">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      `;
      headerRow.appendChild(th);
    }
    thead.appendChild(headerRow);
    spreadsheetTable.appendChild(thead);
    
    // 2. Data Rows
    const tbody = document.createElement('tbody');
    currentGridData.forEach((row, rIdx) => {
      const tr = document.createElement('tr');
      
      // Row Number Header + Row delete button
      const rowHeader = document.createElement('td');
      rowHeader.className = 'row-header';
      rowHeader.innerHTML = `
        <span>${rIdx + 1}</span>
        <button class="row-btn-del" onclick="window.deleteGridRow(${rIdx})" title="Delete Row">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      `;
      tr.appendChild(rowHeader);
      
      // Cell Inputs
      row.forEach((cellVal, cIdx) => {
        const td = document.createElement('td');
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'cell-input';
        input.value = cellVal || '';
        
        // Listeners to update memory grid on write
        input.addEventListener('input', (e) => {
          currentGridData[rIdx][cIdx] = e.target.value;
        });
        
        td.appendChild(input);
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
    
    spreadsheetTable.appendChild(tbody);
  }

  // Helper to map index to excel column letters (A, B... Z, AA, AB)
  function getColumnLetter(colIndex) {
    let letter = "";
    let temp = colIndex;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  }

  // Grid editing utilities attached to window
  window.deleteGridCol = (colIdx) => {
    if (currentGridData[0].length <= 1) {
      alert("Spreadsheet must contain at least one column.");
      return;
    }
    currentGridData.forEach(row => {
      row.splice(colIdx, 1);
    });
    renderSpreadsheet();
  };

  window.deleteGridRow = (rowIdx) => {
    if (currentGridData.length <= 1) {
      alert("Spreadsheet must contain at least one row.");
      return;
    }
    currentGridData.splice(rowIdx, 1);
    renderSpreadsheet();
  };

  btnAddRow.addEventListener('click', () => {
    const colCount = currentGridData[0] ? currentGridData[0].length : 1;
    const newRow = new Array(colCount).fill("");
    currentGridData.push(newRow);
    renderSpreadsheet();
    
    // Auto-scroll to bottom of grid
    setTimeout(() => {
      const container = document.querySelector('.spreadsheet-container');
      container.scrollTop = container.scrollHeight;
    }, 50);
  });

  btnAddCol.addEventListener('click', () => {
    if (currentGridData.length === 0) {
      currentGridData.push([""]);
    } else {
      currentGridData.forEach(row => {
        row.push("");
      });
    }
    renderSpreadsheet();
  });

  btnExport.addEventListener('click', () => {
    const sheetName = outputNameInput.value || 'Extracted_Table.xlsx';
    try {
      saveGridToExcel(currentGridData, sheetName);
    } catch (e) {
      alert(`Export failed: ${e.message}`);
    }
  });
  btnBack.addEventListener('click', resetExcelTab);
}

/* ==========================================================================
   5. PDF COMPRESS TAB LOGIC
   ========================================================================== */
function initCompressTab() {
  let compressFile = null;
  let compressedPdfUrl = null;
  let compressedPdfBytes = null;

  const dropzone = document.getElementById('compress-dropzone');
  const fileInput = document.getElementById('compress-file-input');
  const infoBlock = document.getElementById('compress-file-info');
  const fileNameLabel = document.getElementById('compress-file-name');
  const fileSizeLabel = document.getElementById('compress-file-size');
  const filePagesLabel = document.getElementById('compress-file-pages');
  const btnClear = document.getElementById('btn-clear-compress');
  const btnRun = document.getElementById('btn-run-compress');
  const previewContainer = document.getElementById('compress-canvas-preview');

  const levelSelect = document.getElementById('compress-level');
  const outputNameInput = document.getElementById('compress-output-name');
  
  const progressContainer = document.getElementById('compress-progress');
  const progressBar = document.getElementById('compress-progress-bar');
  const progressPercent = document.getElementById('compress-progress-percent');
  const progressMsg = document.getElementById('compress-progress-msg');
  
  const successCard = document.getElementById('compress-success');
  const savingsLabel = document.getElementById('compress-savings-label');
  const btnDownload = document.getElementById('btn-download-compress');

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  async function loadFile(file) {
    if (file.type !== 'application/pdf') {
      alert("Only PDF files are supported.");
      return;
    }

    compressFile = file;
    successCard.style.display = 'none';
    
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    previewContainer.style.display = 'flex';
    btnRun.disabled = false;

    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Loading pages...";
    previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Rendering preview...</span>';

    try {
      const arrayBuffer = await fileToArrayBuffer(file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      filePagesLabel.textContent = `Pages: ${pdf.numPages}`;
      
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const context = canvas.getContext('2d');
      
      previewContainer.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'canvas-page-wrapper';
      wrap.appendChild(canvas);
      previewContainer.appendChild(wrap);
      
      await page.render({ canvasContext: context, viewport: viewport }).promise;
    } catch (e) {
      console.error(e);
      filePagesLabel.textContent = "Pages: Error";
    }
  }

  btnClear.addEventListener('click', () => {
    compressFile = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    previewContainer.style.display = 'none';
    btnRun.disabled = true;
    successCard.style.display = 'none';
  });

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';

    try {
      compressedPdfBytes = await compressPDF(compressFile, levelSelect.value, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });

      const origSize = compressFile.size;
      const optSize = compressedPdfBytes.length;
      const savings = origSize - optSize;
      
      if (savings > 0) {
        const percent = Math.round((savings / origSize) * 100);
        savingsLabel.textContent = `Optimized file size is smaller by ${formatBytes(savings)} (${percent}% savings).`;
      } else {
        savingsLabel.textContent = `File streams consolidated. Original file was already highly optimized.`;
      }

      if (compressedPdfUrl) URL.revokeObjectURL(compressedPdfUrl);
      const blob = new Blob([compressedPdfBytes], { type: 'application/pdf' });
      compressedPdfUrl = URL.createObjectURL(blob);

      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnClear.disabled = false;
    } catch (err) {
      alert(`Compression failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });

  btnDownload.addEventListener('click', () => {
    if (compressedPdfUrl) {
      const link = document.createElement('a');
      link.href = compressedPdfUrl;
      link.download = outputNameInput.value || 'Compressed_Document.pdf';
      link.click();
    }
  });
}


/* ==========================================================================
   6. DOCUMENT CONVERTERS TAB LOGIC
   ========================================================================== */
function initConvertersTab() {
  let convFile = null;
  let currentConvType = 'pdf-to-word'; // 'pdf-to-word', 'pdf-to-pptx', 'word-to-pdf'
  let resultBlobUrl = null;
  let resultBlob = null;

  const dropzone = document.getElementById('conv-dropzone');
  const fileInput = document.getElementById('conv-file-input');
  const infoBlock = document.getElementById('conv-file-info');
  const fileNameLabel = document.getElementById('conv-file-name');
  const fileSizeLabel = document.getElementById('conv-file-size');
  const thumbnailText = document.getElementById('conv-thumbnail-text');
  const btnClear = document.getElementById('btn-clear-conv');
  const btnRun = document.getElementById('btn-run-conv');
  
  const dropzoneTitle = document.getElementById('conv-dropzone-title');
  const outputNameInput = document.getElementById('conv-output-name');
  const previewContainer = document.getElementById('conv-canvas-preview');

  const btnTypeWord = document.getElementById('btn-conv-pdf-to-word');
  const btnTypePptx = document.getElementById('btn-conv-pdf-to-pptx');
  const btnTypePdf = document.getElementById('btn-conv-word-to-pdf');

  const progressContainer = document.getElementById('conv-progress');
  const progressBar = document.getElementById('conv-progress-bar');
  const progressPercent = document.getElementById('conv-progress-percent');
  const progressMsg = document.getElementById('conv-progress-msg');
  
  const successCard = document.getElementById('conv-success');
  const btnDownload = document.getElementById('btn-download-conv');

  // Toggle conversion modes
  function setConvType(type) {
    currentConvType = type;
    resetConvFile();

    btnTypeWord.style.background = 'transparent';
    btnTypePptx.style.background = 'transparent';
    btnTypePdf.style.background = 'transparent';

    if (type === 'pdf-to-word') {
      btnTypeWord.style.background = 'rgba(255,255,255,0.08)';
      dropzoneTitle.textContent = "Drag & drop PDF file to convert to Word";
      fileInput.accept = "application/pdf";
      outputNameInput.value = "Converted_Document.docx";
      thumbnailText.textContent = "PDF";
    } else if (type === 'pdf-to-pptx') {
      btnTypePptx.style.background = 'rgba(255,255,255,0.08)';
      dropzoneTitle.textContent = "Drag & drop PDF file to convert to PowerPoint";
      fileInput.accept = "application/pdf";
      outputNameInput.value = "Converted_Presentation.pptx";
      thumbnailText.textContent = "PDF";
    } else if (type === 'word-to-pdf') {
      btnTypePdf.style.background = 'rgba(255,255,255,0.08)';
      dropzoneTitle.textContent = "Drag & drop Word (.docx) file to convert to PDF";
      fileInput.accept = ".docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document";
      outputNameInput.value = "Converted_Document.pdf";
      thumbnailText.textContent = "DOCX";
    }
  }

  btnTypeWord.addEventListener('click', () => setConvType('pdf-to-word'));
  btnTypePptx.addEventListener('click', () => setConvType('pdf-to-pptx'));
  btnTypePdf.addEventListener('click', () => setConvType('word-to-pdf'));

  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      loadFile(e.target.files[0]);
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      loadFile(e.dataTransfer.files[0]);
    }
  });

  async function loadFile(file) {
    // Validate correct format based on mode
    if (currentConvType === 'word-to-pdf') {
      if (!file.name.endsWith('.docx')) {
        alert("Please upload a valid Microsoft Word (.docx) file.");
        return;
      }
    } else {
      if (file.type !== 'application/pdf') {
        alert("Please upload a PDF file.");
        return;
      }
    }

    convFile = file;
    successCard.style.display = 'none';
    
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;

    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    
    if (file.type === 'application/pdf') {
      previewContainer.style.display = 'flex';
      previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Rendering preview...</span>';
      try {
        const arrayBuffer = await fileToArrayBuffer(file);
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        previewContainer.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'canvas-page-wrapper';
        wrap.appendChild(canvas);
        previewContainer.appendChild(wrap);
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
      } catch (e) {
        console.error(e);
      }
    } else {
      previewContainer.style.display = 'none';
    }
  }

  btnClear.addEventListener('click', resetConvFile);

  function resetConvFile() {
    convFile = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    previewContainer.style.display = 'none';
    btnRun.disabled = true;
    successCard.style.display = 'none';
  }

  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';

    try {
      const outName = outputNameInput.value || 'Converted_File';
      
      if (currentConvType === 'pdf-to-word') {
        resultBlob = await pdfToWord(convFile, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
        
        if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
        resultBlobUrl = URL.createObjectURL(resultBlob);
        
        progressContainer.style.display = 'none';
        successCard.style.display = 'flex';
      } else if (currentConvType === 'pdf-to-pptx') {
        await pdfToPPTX(convFile, outName, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
        
        // PptxGenJS triggers its own browser save dialog, so we hide progress directly
        progressContainer.style.display = 'none';
        resetConvFile();
        alert("PowerPoint file conversion complete! Save dialog has launched.");
      } else if (currentConvType === 'word-to-pdf') {
        await wordToPDF(convFile, outName, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
        
        progressContainer.style.display = 'none';
        resetConvFile();
        alert("PDF file generated successfully!");
      }
      
      btnClear.disabled = false;
    } catch (err) {
      alert(`Conversion failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });

  btnDownload.addEventListener('click', () => {
    if (resultBlobUrl && currentConvType === 'pdf-to-word') {
      const link = document.createElement('a');
      link.href = resultBlobUrl;
      link.download = outputNameInput.value || 'Converted_Document.docx';
      link.click();
    }
  });
}

