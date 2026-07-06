// Main Application Router & Controller

document.addEventListener('DOMContentLoaded', () => {
  initRouting();
  initMergerTab();
  initImagesTab();
  initResizerTab();
  initSplitTab();
  initWatermarkTab();
  initEditTab();
  initCompressTab();
  initSecurityTab();
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
  const btnClearMerge = document.getElementById('btn-clear-merge');
  const btnBrowseMerge = document.getElementById('btn-browse-merge');

  // Trigger file browser on click
  dropzone.addEventListener('click', () => fileInput.click());
  if (btnBrowseMerge) {
    btnBrowseMerge.addEventListener('click', () => fileInput.click());
  }

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

  async function handleFiles(files) {
    successCard.style.display = 'none';
    const fileList = Array.from(files);
    for (const file of fileList) {
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        try {
          const processedFile = await getOrDecryptFile(file);
          mergeQueue.push({
            id: crypto.randomUUID(),
            file: processedFile
          });
          renderQueue();
        } catch (err) {
          alert(`Could not add file "${file.name}": ${err.message}`);
        }
      }
    }
  }

  function renderQueue() {
    fileListContainer.innerHTML = '';
    btnRun.disabled = mergeQueue.length < 2;
    btnClearMerge.style.display = mergeQueue.length > 0 ? 'block' : 'none';

    mergeQueue.forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'file-item';
      itemEl.draggable = true;
      
      // Keep track of indexes for drag events
      itemEl.dataset.id = item.id;
      itemEl.dataset.index = index;

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
          <button class="file-btn move-up" ${index === 0 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </button>
          <button class="file-btn move-down" ${index === mergeQueue.length - 1 ? 'disabled' : ''}>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <button class="file-btn delete">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      `;

      fileListContainer.appendChild(itemEl);

      // Dynamic event bindings
      itemEl.querySelector('.file-btn.delete').addEventListener('click', () => {
        mergeQueue = mergeQueue.filter(x => x.id !== item.id);
        renderQueue();
      });

      itemEl.querySelector('.file-btn.move-up').addEventListener('click', () => {
        if (index > 0) {
          const temp = mergeQueue[index];
          mergeQueue[index] = mergeQueue[index - 1];
          mergeQueue[index - 1] = temp;
          renderQueue();
        }
      });

      itemEl.querySelector('.file-btn.move-down').addEventListener('click', () => {
        if (index < mergeQueue.length - 1) {
          const temp = mergeQueue[index];
          mergeQueue[index] = mergeQueue[index + 1];
          mergeQueue[index + 1] = temp;
          renderQueue();
        }
      });

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

  // Clear Merger queue list handler
  btnClearMerge.addEventListener('click', () => {
    mergeQueue = [];
    renderQueue();
    successCard.style.display = 'none';
    if (mergedPdfUrl) {
      URL.revokeObjectURL(mergedPdfUrl);
      mergedPdfUrl = null;
    }
  });

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
  const btnBrowseJpg = document.getElementById('btn-browse-jpg');
  if (btnBrowseJpg) {
    btnBrowseJpg.addEventListener('click', () => fileInput.click());
  }

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
    const allowedExts = ['jpg', 'jpeg', 'png', 'webp'];
    const fileList = Array.from(files);
    for (const file of fileList) {
      const ext = file.name.split('.').pop().toLowerCase();
      if (allowed.includes(file.type) || allowedExts.includes(ext)) {
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
  const btnBrowseResize = document.getElementById('btn-browse-resize');
  if (btnBrowseResize) {
    btnBrowseResize.addEventListener('click', () => fileInput.click());
  }

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.target.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.dataTransfer.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
  });

  async function loadFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
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

/**
 * Intercepts a PDF upload. If it is encrypted, prompts for password,
 * decrypts it client-side using Web Crypto, and returns the unlocked file.
 */
async function getOrDecryptFile(file) {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return file;
  
  const arrayBuffer = await fileToArrayBuffer(file);
  const encrypted = await checkIsPDFEncrypted(arrayBuffer);
  if (!encrypted) return file;
  
  return new Promise((resolve, reject) => {
    const modal = document.getElementById('global-password-modal');
    const input = document.getElementById('global-pdf-password');
    const submitBtn = document.getElementById('btn-global-password-submit');
    const cancelBtn = document.getElementById('btn-global-password-cancel');
    
    input.value = '';
    modal.classList.add('active');
    
    const handleUnlock = async () => {
      const password = input.value;
      if (!password) {
        alert("Please enter the decryption password.");
        return;
      }
      try {
        const decryptedBytes = await decryptPDFFile(arrayBuffer, password);
        modal.classList.remove('active');
        cleanup();
        const decryptedFile = new File([decryptedBytes], file.name, { type: 'application/pdf' });
        resolve(decryptedFile);
      } catch (err) {
        alert("Incorrect password or file decryption failed. Please try again.");
      }
    };
    
    const handleCancel = () => {
      modal.classList.remove('active');
      cleanup();
      reject(new Error("File decryption cancelled by user."));
    };
    
    const cleanup = () => {
      submitBtn.removeEventListener('click', handleUnlock);
      cancelBtn.removeEventListener('click', handleCancel);
    };
    
    submitBtn.addEventListener('click', handleUnlock);
    cancelBtn.addEventListener('click', handleCancel);
  });
}

/* ==========================================================================
   4. PDF SECURITY TAB LOGIC
   ========================================================================== */
function initSecurityTab() {
  let securityFile = null;
  let securedPdfUrl = null;
  let securedPdfBytes = null;
  
  const dropzone = document.getElementById('security-dropzone');
  const fileInput = document.getElementById('security-file-input');
  const infoBlock = document.getElementById('security-file-info');
  const fileNameLabel = document.getElementById('security-file-name');
  const fileSizeLabel = document.getElementById('security-file-size');
  const filePagesLabel = document.getElementById('security-file-pages');
  const btnClear = document.getElementById('btn-clear-security');
  const btnRun = document.getElementById('btn-run-security');
  const previewContainer = document.getElementById('security-canvas-preview');
  
  const modeSelect = document.getElementById('security-mode');
  const passwordInput = document.getElementById('security-password');
  const passwordLabel = document.getElementById('security-password-label');
  const outputNameInput = document.getElementById('security-output-name');
  
  const progressContainer = document.getElementById('security-progress');
  const progressBar = document.getElementById('security-progress-bar');
  const progressPercent = document.getElementById('security-progress-percent');
  const progressMsg = document.getElementById('security-progress-msg');
  
  const successCard = document.getElementById('security-success');
  const successTitle = document.getElementById('security-success-title');
  const btnDownload = document.getElementById('btn-download-security');
  
  dropzone.addEventListener('click', () => fileInput.click());
  const btnBrowseSplit = document.getElementById('btn-browse-split');
  if (btnBrowseSplit) {
    btnBrowseSplit.addEventListener('click', () => fileInput.click());
  }
  
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
  
  modeSelect.addEventListener('change', () => {
    if (modeSelect.value === 'encrypt') {
      passwordLabel.textContent = "Set Open Password";
      outputNameInput.value = securityFile ? securityFile.name.replace('.pdf', '_Protected.pdf') : 'Protected_Document.pdf';
    } else {
      passwordLabel.textContent = "Decrypt Key (Removes security checks)";
      outputNameInput.value = securityFile ? securityFile.name.replace('.pdf', '_Unlocked.pdf') : 'Unlocked_Document.pdf';
    }
  });
  
  async function loadFile(file) {
    securityFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;
    successCard.style.display = 'none';
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Reading pages...";
    
    outputNameInput.value = modeSelect.value === 'encrypt' ? file.name.replace('.pdf', '_Protected.pdf') : file.name.replace('.pdf', '_Unlocked.pdf');
    
    previewContainer.style.display = 'flex';
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
      filePagesLabel.textContent = "Pages: Unknown";
      previewContainer.innerHTML = '<span style="color: var(--error); font-size: 0.85rem;">Preview unavailable</span>';
    }
  }
  
  btnClear.addEventListener('click', resetSecurityTab);
  
  function resetSecurityTab() {
    securityFile = null;
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
      const password = passwordInput.value;
      if (!password && modeSelect.value === 'encrypt') {
        throw new Error("Password is required for encryption.");
      }
      
      const fileBytes = await fileToArrayBuffer(securityFile);
      
      if (modeSelect.value === 'encrypt') {
        progressMsg.textContent = "Encrypting file stream...";
        progressBar.style.width = "40%";
        progressPercent.textContent = "40%";
        
        securedPdfBytes = await encryptPDFFile(fileBytes, password);
        
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        progressMsg.textContent = "Encryption finished!";
        successTitle.textContent = "Encryption Succeeded!";
      } else {
        progressMsg.textContent = "Removing security layers...";
        progressBar.style.width = "40%";
        progressPercent.textContent = "40%";
        
        const isEncrypted = await checkIsPDFEncrypted(fileBytes);
        if (!isEncrypted) {
          securedPdfBytes = new Uint8Array(fileBytes);
          progressMsg.textContent = "PDF is not encrypted. Unlocked file saved.";
        } else {
          securedPdfBytes = await decryptPDFFile(fileBytes, password);
        }
        
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        progressMsg.textContent = "Decryption finished!";
        successTitle.textContent = "Decryption Succeeded!";
      }
      
      if (securedPdfUrl) URL.revokeObjectURL(securedPdfUrl);
      const blob = new Blob([securedPdfBytes], { type: 'application/pdf' });
      securedPdfUrl = URL.createObjectURL(blob);
      
      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnClear.disabled = false;
    } catch (err) {
      alert(`Security operation failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });
  
  btnDownload.addEventListener('click', () => {
    if (securedPdfUrl) {
      const link = document.createElement('a');
      link.href = securedPdfUrl;
      link.download = outputNameInput.value || 'Protected.pdf';
      link.click();
    }
  });
}

/* ==========================================================================
   5. PDF SPLITTER TAB LOGIC
   ========================================================================== */
function initSplitTab() {
  let splitFile = null;
  let splitResultBlob = null;
  let splitResultUrl = null;
  let isZipOutput = false;
  let totalPagesCount = 0;
  let selectedPages = new Set();
  
  const dropzone = document.getElementById('split-dropzone');
  const fileInput = document.getElementById('split-file-input');
  const infoBlock = document.getElementById('split-file-info');
  const fileNameLabel = document.getElementById('split-file-name');
  const fileSizeLabel = document.getElementById('split-file-size');
  const filePagesLabel = document.getElementById('split-file-pages');
  const btnClear = document.getElementById('btn-clear-split');
  const btnRun = document.getElementById('btn-run-split');
  const splitGrid = document.getElementById('split-grid');
  
  const modeSelect = document.getElementById('split-mode');
  const rangeGroup = document.getElementById('split-range-group');
  const rangeInput = document.getElementById('split-range');
  const outputNameInput = document.getElementById('split-output-name');
  
  const progressContainer = document.getElementById('split-progress');
  const progressBar = document.getElementById('split-progress-bar');
  const progressPercent = document.getElementById('split-progress-percent');
  const progressMsg = document.getElementById('split-progress-msg');
  
  const successCard = document.getElementById('split-success');
  const btnDownload = document.getElementById('btn-download-split');
  
  dropzone.addEventListener('click', () => fileInput.click());
  const btnBrowseWatermark = document.getElementById('btn-browse-watermark');
  if (btnBrowseWatermark) {
    btnBrowseWatermark.addEventListener('click', () => fileInput.click());
  }
  
  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.target.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
    fileInput.value = '';
  });
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.dataTransfer.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
  });
  
  modeSelect.addEventListener('change', () => {
    if (modeSelect.value === 'all') {
      rangeGroup.style.display = 'none';
      outputNameInput.value = splitFile ? splitFile.name.replace('.pdf', '_all_pages.zip') : 'Split_Pages.zip';
    } else {
      rangeGroup.style.display = 'block';
      outputNameInput.value = splitFile ? splitFile.name.replace('.pdf', '_split.pdf') : 'Split_Pages.pdf';
    }
  });
  
  async function loadFile(file) {
    splitFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;
    successCard.style.display = 'none';
    selectedPages.clear();
    rangeInput.value = '';
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Loading pages...";
    
    if (modeSelect.value === 'all') {
      outputNameInput.value = file.name.replace('.pdf', '_all_pages.zip');
    } else {
      outputNameInput.value = file.name.replace('.pdf', '_split.pdf');
    }
    
    splitGrid.style.display = 'grid';
    splitGrid.innerHTML = '<span style="color: var(--text-muted); padding: 1.5rem; font-size: 0.85rem;">Drawing thumbnails...</span>';
    
    try {
      const arrayBuffer = await fileToArrayBuffer(file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      totalPagesCount = pdf.numPages;
      filePagesLabel.textContent = `Pages: ${totalPagesCount}`;
      
      splitGrid.innerHTML = '';
      
      for (let pageNum = 1; pageNum <= totalPagesCount; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 0.22 });
        
        const card = document.createElement('div');
        card.className = 'split-card';
        card.dataset.page = pageNum;
        
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        const checkbox = document.createElement('div');
        checkbox.className = 'checkbox-indicator';
        checkbox.innerHTML = '✓';
        
        const label = document.createElement('div');
        label.className = 'page-num';
        label.textContent = `Page ${pageNum}`;
        
        card.appendChild(checkbox);
        card.appendChild(canvas);
        card.appendChild(label);
        splitGrid.appendChild(card);
        
        page.render({ canvasContext: context, viewport: viewport });
        
        card.addEventListener('click', () => {
          if (modeSelect.value === 'all') return;
          
          if (selectedPages.has(pageNum)) {
            selectedPages.delete(pageNum);
            card.classList.remove('selected');
          } else {
            selectedPages.add(pageNum);
            card.classList.add('selected');
          }
          
          const sorted = Array.from(selectedPages).sort((a,b) => a-b);
          rangeInput.value = sorted.join(', ');
        });
      }
    } catch (err) {
      console.error(err);
      filePagesLabel.textContent = "Pages: Error";
      splitGrid.innerHTML = '<span style="color: var(--error); padding: 1.5rem;">Could not load page grid.</span>';
    }
  }
  
  rangeInput.addEventListener('input', () => {
    const pages = parsePageRange(rangeInput.value, totalPagesCount);
    selectedPages = new Set(pages.map(idx => idx + 1));
    
    document.querySelectorAll('.split-card').forEach(card => {
      const pageNum = parseInt(card.dataset.page);
      if (selectedPages.has(pageNum)) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  });
  
  btnClear.addEventListener('click', resetSplitTab);
  
  function resetSplitTab() {
    splitFile = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    splitGrid.style.display = 'none';
    btnRun.disabled = true;
    successCard.style.display = 'none';
    selectedPages.clear();
  }
  
  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';
    
    try {
      if (modeSelect.value === 'all') {
        isZipOutput = true;
        splitResultBlob = await splitPDFIntoZIP(splitFile, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
      } else {
        isZipOutput = false;
        const range = rangeInput.value.trim();
        if (!range) {
          throw new Error("Please specify at least one page to split.");
        }
        
        progressMsg.textContent = "Extracting ranges...";
        progressBar.style.width = "40%";
        progressPercent.textContent = "40%";
        
        const outputBytes = await extractPDFPages(splitFile, range);
        splitResultBlob = new Blob([outputBytes], { type: 'application/pdf' });
        
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        progressMsg.textContent = "Compilation finished!";
      }
      
      if (splitResultUrl) URL.revokeObjectURL(splitResultUrl);
      splitResultUrl = URL.createObjectURL(splitResultBlob);
      
      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnClear.disabled = false;
    } catch (err) {
      alert(`Split failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });
  
  btnDownload.addEventListener('click', () => {
    if (splitResultUrl) {
      const link = document.createElement('a');
      link.href = splitResultUrl;
      link.download = outputNameInput.value || (isZipOutput ? 'Split_Pages.zip' : 'Split_Document.pdf');
      link.click();
    }
  });
}

/* ==========================================================================
   7. PDF WATERMARK TAB LOGIC
   ========================================================================== */
function initWatermarkTab() {
  let watermarkFile = null;
  let watermarkResultBytes = null;
  let watermarkResultUrl = null;
  
  const dropzone = document.getElementById('watermark-dropzone');
  const fileInput = document.getElementById('watermark-file-input');
  const infoBlock = document.getElementById('watermark-file-info');
  const fileNameLabel = document.getElementById('watermark-file-name');
  const fileSizeLabel = document.getElementById('watermark-file-size');
  const filePagesLabel = document.getElementById('watermark-file-pages');
  const btnClear = document.getElementById('btn-clear-watermark');
  const btnRun = document.getElementById('btn-run-watermark');
  const previewContainer = document.getElementById('watermark-canvas-preview');
  
  const wmType = document.getElementById('watermark-type');
  const textOptions = document.getElementById('watermark-text-options');
  const imageOptions = document.getElementById('watermark-image-options');
  
  const wmText = document.getElementById('watermark-text');
  const wmFontSize = document.getElementById('watermark-font-size');
  const wmColor = document.getElementById('watermark-color');
  const wmRotation = document.getElementById('watermark-rotation');
  
  const wmImgFileInput = document.getElementById('watermark-img-file');
  const wmImgScale = document.getElementById('watermark-img-scale');
  
  const wmOpacity = document.getElementById('watermark-opacity');
  const wmPosition = document.getElementById('watermark-position');
  
  const outputNameInput = document.getElementById('watermark-output-name');
  
  const progressContainer = document.getElementById('watermark-progress');
  const progressBar = document.getElementById('watermark-progress-bar');
  const progressPercent = document.getElementById('watermark-progress-percent');
  const progressMsg = document.getElementById('watermark-progress-msg');
  
  const successCard = document.getElementById('watermark-success');
  const btnDownload = document.getElementById('btn-download-watermark');
  
  dropzone.addEventListener('click', () => fileInput.click());
  const btnBrowseEdit = document.getElementById('btn-browse-edit');
  if (btnBrowseEdit) {
    btnBrowseEdit.addEventListener('click', () => fileInput.click());
  }
  
  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.target.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
    fileInput.value = '';
  });
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.dataTransfer.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
  });
  
  wmType.addEventListener('change', () => {
    if (wmType.value === 'text') {
      textOptions.style.display = 'block';
      imageOptions.style.display = 'none';
    } else {
      textOptions.style.display = 'none';
      imageOptions.style.display = 'block';
    }
  });
  
  async function loadFile(file) {
    watermarkFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;
    successCard.style.display = 'none';
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Loading pages...";
    outputNameInput.value = file.name.replace('.pdf', '_Watermarked.pdf');
    
    previewContainer.style.display = 'flex';
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
  
  btnClear.addEventListener('click', resetWatermarkTab);
  
  function resetWatermarkTab() {
    watermarkFile = null;
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
      const options = {
        type: wmType.value,
        text: wmText.value,
        fontSize: parseInt(wmFontSize.value, 10),
        textColor: wmColor.value,
        opacity: parseFloat(wmOpacity.value) / 100,
        rotation: parseInt(wmRotation.value, 10),
        imageScale: parseFloat(wmImgScale.value) / 100,
        position: wmPosition.value,
        imageFile: wmImgFileInput.files[0] || null
      };
      
      if (options.type === 'image' && !options.imageFile) {
        throw new Error("Please upload an image file first.");
      }
      
      watermarkResultBytes = await watermarkPDF(watermarkFile, options, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });
      
      if (watermarkResultUrl) URL.revokeObjectURL(watermarkResultUrl);
      const blob = new Blob([watermarkResultBytes], { type: 'application/pdf' });
      watermarkResultUrl = URL.createObjectURL(blob);
      
      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnClear.disabled = false;
    } catch (err) {
      alert(`Watermarking failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });
  
  btnDownload.addEventListener('click', () => {
    if (watermarkResultUrl) {
      const link = document.createElement('a');
      link.href = watermarkResultUrl;
      link.download = outputNameInput.value || 'Watermarked_Document.pdf';
      link.click();
    }
  });
}

/* ==========================================================================
   8. PDF EDIT & SIGN (ANNOTATOR) TAB LOGIC
   ========================================================================== */
function initEditTab() {
  let editFile = null;
  let originalPdfBytes = null;
  let editedPdfBytes = null;
  let editedPdfUrl = null;
  
  let totalPages = 0;
  let annotations = [];
  let activePageIndex = 0;
  
  let sigPadCanvas = document.getElementById('signature-pad-canvas');
  let sigPadCtx = sigPadCanvas.getContext('2d');
  let isDrawing = false;
  
  const dropzone = document.getElementById('edit-dropzone');
  const fileInput = document.getElementById('edit-file-input');
  const infoBlock = document.getElementById('edit-file-info');
  const fileNameLabel = document.getElementById('edit-file-name');
  const fileSizeLabel = document.getElementById('edit-file-size');
  const filePagesLabel = document.getElementById('edit-file-pages');
  const btnClear = document.getElementById('btn-clear-edit');
  const btnRun = document.getElementById('btn-run-edit');
  const outputNameInput = document.getElementById('edit-output-name');
  
  const workspace = document.getElementById('editor-workspace');
  
  const btnAddText = document.getElementById('btn-edit-add-text');
  const btnAddDrawSig = document.getElementById('btn-edit-add-draw-sig');
  const btnAddImgSig = document.getElementById('btn-edit-add-img-sig');
  const editLogoInput = document.getElementById('edit-logo-input');
  
  const sigModal = document.getElementById('editor-sig-modal');
  const btnSigClose = document.getElementById('btn-editor-sig-close');
  const btnSigSave = document.getElementById('btn-editor-sig-save');
  const btnSigClear = document.getElementById('btn-editor-sig-clear');
  
  const progressContainer = document.getElementById('edit-progress');
  const progressBar = document.getElementById('edit-progress-bar');
  const progressPercent = document.getElementById('edit-progress-percent');
  const progressMsg = document.getElementById('edit-progress-msg');
  
  const successCard = document.getElementById('edit-success');
  const btnDownload = document.getElementById('btn-download-edit');
  
  dropzone.addEventListener('click', () => fileInput.click());
  const btnBrowseCompress = document.getElementById('btn-browse-compress');
  if (btnBrowseCompress) {
    btnBrowseCompress.addEventListener('click', () => fileInput.click());
  }
  
  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.target.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
    fileInput.value = '';
  });
  
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.dataTransfer.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
  });
  
  async function loadFile(file) {
    editFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;
    successCard.style.display = 'none';
    annotations = [];
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Loading pages...";
    outputNameInput.value = file.name.replace('.pdf', '_Signed.pdf');
    
    workspace.style.display = 'flex';
    workspace.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9rem;">Rendering visual editor workspace...</span>';
    
    try {
      originalPdfBytes = await fileToArrayBuffer(file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: originalPdfBytes }).promise;
      totalPages = pdf.numPages;
      filePagesLabel.textContent = `Pages: ${totalPages}`;
      
      workspace.innerHTML = '';
      
      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const pageIndex = pageNum - 1;
        const page = await pdf.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        
        const frame = document.createElement('div');
        frame.className = 'editor-page-frame';
        frame.id = `editor-page-${pageIndex}`;
        frame.style.width = `${viewport.width}px`;
        frame.style.height = `${viewport.height}px`;
        
        const canvas = document.createElement('canvas');
        canvas.className = 'editor-canvas';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        
        const overlay = document.createElement('div');
        overlay.className = 'editor-overlay';
        overlay.id = `editor-overlay-${pageIndex}`;
        
        frame.appendChild(canvas);
        frame.appendChild(overlay);
        workspace.appendChild(frame);
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
        
        frame.addEventListener('click', () => {
          activePageIndex = pageIndex;
          document.querySelectorAll('.editor-page-frame').forEach(f => f.style.borderColor = 'rgba(255,255,255,0.15)');
          frame.style.borderColor = 'var(--secondary)';
        });
      }
      
      activePageIndex = 0;
      const firstFrame = document.getElementById('editor-page-0');
      if (firstFrame) firstFrame.style.borderColor = 'var(--secondary)';
      
      btnAddText.disabled = false;
      btnAddDrawSig.disabled = false;
      btnAddImgSig.disabled = false;
    } catch (err) {
      console.error(err);
      filePagesLabel.textContent = "Pages: Error";
      workspace.innerHTML = '<span style="color: var(--error);">Failed to load visual editor layout.</span>';
    }
  }
  
  btnClear.addEventListener('click', resetEditTab);
  
  function resetEditTab() {
    editFile = null;
    originalPdfBytes = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    workspace.style.display = 'none';
    btnRun.disabled = true;
    successCard.style.display = 'none';
    
    btnAddText.disabled = true;
    btnAddDrawSig.disabled = true;
    btnAddImgSig.disabled = true;
    annotations = [];
  }
  
  btnAddText.addEventListener('click', () => {
    if (!editFile) return;
    
    const overlay = document.getElementById(`editor-overlay-${activePageIndex}`);
    if (!overlay) return;
    
    const node = document.createElement('div');
    node.className = 'editor-text-node';
    node.contentEditable = 'true';
    node.textContent = 'Type notes...';
    node.style.left = '50px';
    node.style.top = '50px';
    
    const delBtn = document.createElement('button');
    delBtn.className = 'editor-node-delete-btn';
    delBtn.textContent = '×';
    node.appendChild(delBtn);
    
    overlay.appendChild(node);
    
    setTimeout(() => {
      node.focus();
      document.execCommand('selectAll', false, null);
    }, 50);
    
    makeElementDraggable(node, overlay);
    
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      node.remove();
    });
  });
  
  btnAddDrawSig.addEventListener('click', () => {
    sigModal.classList.add('active');
    sigPadCtx.clearRect(0, 0, sigPadCanvas.width, sigPadCanvas.height);
    sigPadCtx.lineWidth = 3;
    sigPadCtx.lineCap = 'round';
    sigPadCtx.strokeStyle = '#000000';
  });
  
  btnSigClose.addEventListener('click', () => sigModal.classList.remove('active'));
  
  sigPadCanvas.addEventListener('mousedown', startDrawing);
  sigPadCanvas.addEventListener('mousemove', draw);
  sigPadCanvas.addEventListener('mouseup', stopDrawing);
  sigPadCanvas.addEventListener('mouseleave', stopDrawing);
  
  sigPadCanvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousedown", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    sigPadCanvas.dispatchEvent(mouseEvent);
  });
  sigPadCanvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent("mousemove", {
      clientX: touch.clientX,
      clientY: touch.clientY
    });
    sigPadCanvas.dispatchEvent(mouseEvent);
  });
  sigPadCanvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    const mouseEvent = new MouseEvent("mouseup", {});
    sigPadCanvas.dispatchEvent(mouseEvent);
  });
  
  function startDrawing(e) {
    isDrawing = true;
    const rect = sigPadCanvas.getBoundingClientRect();
    sigPadCtx.beginPath();
    sigPadCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }
  
  function draw(e) {
    if (!isDrawing) return;
    const rect = sigPadCanvas.getBoundingClientRect();
    sigPadCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    sigPadCtx.stroke();
  }
  
  function stopDrawing() {
    isDrawing = false;
  }
  
  btnSigClear.addEventListener('click', () => {
    sigPadCtx.clearRect(0, 0, sigPadCanvas.width, sigPadCanvas.height);
  });
  
  btnSigSave.addEventListener('click', () => {
    const dataUrl = sigPadCanvas.toDataURL('image/png');
    sigModal.classList.remove('active');
    insertImageAnnotation(dataUrl);
  });
  
  btnAddImgSig.addEventListener('click', () => editLogoInput.click());
  editLogoInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        insertImageAnnotation(event.target.result);
      };
      reader.readAsDataURL(file);
    }
    editLogoInput.value = '';
  });
  
  function insertImageAnnotation(src) {
    const overlay = document.getElementById(`editor-overlay-${activePageIndex}`);
    if (!overlay) return;
    
    const node = document.createElement('div');
    node.className = 'editor-img-node';
    node.style.left = '80px';
    node.style.top = '80px';
    node.style.width = '160px';
    node.style.height = '70px';
    
    const img = document.createElement('img');
    img.src = src;
    
    const delBtn = document.createElement('button');
    delBtn.className = 'editor-node-delete-btn';
    delBtn.textContent = '×';
    
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'editor-node-resize-handle';
    
    node.appendChild(img);
    node.appendChild(delBtn);
    node.appendChild(resizeHandle);
    overlay.appendChild(node);
    
    makeElementDraggable(node, overlay);
    makeElementResizable(node, resizeHandle);
    
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      node.remove();
    });
  }
  
  function makeElementDraggable(el, container) {
    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
    el.addEventListener('mousedown', dragMouseDown);
    
    function dragMouseDown(e) {
      if (e.target.className === 'editor-node-delete-btn' || e.target.className === 'editor-node-resize-handle') return;
      e.preventDefault();
      pos3 = e.clientX;
      pos4 = e.clientY;
      document.addEventListener('mouseup', closeDragElement);
      document.addEventListener('mousemove', elementDrag);
    }
    
    function elementDrag(e) {
      e.preventDefault();
      pos1 = pos3 - e.clientX;
      pos2 = pos4 - e.clientY;
      pos3 = e.clientX;
      pos4 = e.clientY;
      
      const newTop = el.offsetTop - pos2;
      const newLeft = el.offsetLeft - pos1;
      
      const maxLeft = container.offsetWidth - el.offsetWidth;
      const maxTop = container.offsetHeight - el.offsetHeight;
      
      el.style.top = `${Math.max(0, Math.min(newTop, maxTop))}px`;
      el.style.left = `${Math.max(0, Math.min(newLeft, maxLeft))}px`;
    }
    
    function closeDragElement() {
      document.removeEventListener('mouseup', closeDragElement);
      document.removeEventListener('mousemove', elementDrag);
    }
  }
  
  function makeElementResizable(el, handle) {
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      document.addEventListener('mousemove', resizeDrag);
      document.addEventListener('mouseup', stopResizeDrag);
    });
    
    function resizeDrag(e) {
      const rect = el.getBoundingClientRect();
      const newWidth = e.clientX - rect.left;
      const newHeight = e.clientY - rect.top;
      
      if (newWidth > 40) el.style.width = `${newWidth}px`;
      if (newHeight > 20) el.style.height = `${newHeight}px`;
    }
    
    function stopResizeDrag() {
      document.removeEventListener('mousemove', resizeDrag);
      document.removeEventListener('mouseup', stopResizeDrag);
    }
  }
  
  btnRun.addEventListener('click', async () => {
    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';
    
    try {
      annotations = [];
      
      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        const overlay = document.getElementById(`editor-overlay-${pIdx}`);
        if (!overlay) continue;
        
        const frameW = overlay.offsetWidth;
        const frameH = overlay.offsetHeight;
        
        const textNodes = overlay.querySelectorAll('.editor-text-node');
        textNodes.forEach(node => {
          const cleanText = node.firstChild.textContent;
          if (cleanText.trim() === 'Type notes...' || !cleanText.trim()) return;
          
          annotations.push({
            type: 'text',
            pageIndex: pIdx,
            x: node.offsetLeft / frameW,
            y: node.offsetTop / frameH,
            text: cleanText.trim(),
            fontSize: 16
          });
        });
        
        const imgNodes = overlay.querySelectorAll('.editor-img-node');
        imgNodes.forEach(node => {
          const imgEl = node.querySelector('img');
          annotations.push({
            type: 'image',
            pageIndex: pIdx,
            x: node.offsetLeft / frameW,
            y: node.offsetTop / frameH,
            width: node.offsetWidth / frameW,
            height: node.offsetHeight / frameH,
            imageSrc: imgEl.src
          });
        });
      }
      
      progressMsg.textContent = "Writing overlay streams...";
      progressBar.style.width = "40%";
      progressPercent.textContent = "40%";
      
      editedPdfBytes = await saveEditedPDF(originalPdfBytes, annotations, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });
      
      if (editedPdfUrl) URL.revokeObjectURL(editedPdfUrl);
      const blob = new Blob([editedPdfBytes], { type: 'application/pdf' });
      editedPdfUrl = URL.createObjectURL(blob);
      
      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnClear.disabled = false;
    } catch (err) {
      alert(`Save failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });
  
  btnDownload.addEventListener('click', () => {
    if (editedPdfUrl) {
      const link = document.createElement('a');
      link.href = editedPdfUrl;
      link.download = outputNameInput.value || 'Signed_Document.pdf';
      link.click();
    }
  });
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
  const btnBrowseSecurity = document.getElementById('btn-browse-security');
  if (btnBrowseSecurity) {
    btnBrowseSecurity.addEventListener('click', () => fileInput.click());
  }

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.target.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.dataTransfer.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
  });

  async function loadFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
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

    const wordModeGroup = document.getElementById('conv-word-mode-group');
    if (wordModeGroup) {
      wordModeGroup.style.display = type === 'pdf-to-word' ? 'block' : 'none';
    }

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
  const btnBrowseConv = document.getElementById('btn-browse-conv');
  if (btnBrowseConv) {
    btnBrowseConv.addEventListener('click', () => fileInput.click());
  }

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.target.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
    fileInput.value = '';
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      try {
        const processedFile = await getOrDecryptFile(e.dataTransfer.files[0]);
        loadFile(processedFile);
      } catch (err) {
        console.warn(err.message);
      }
    }
  });

  async function loadFile(file) {
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    
    // Validate correct format based on mode
    if (currentConvType === 'word-to-pdf') {
      if (!file.name.toLowerCase().endsWith('.docx')) {
        alert("Please upload a valid Microsoft Word (.docx) file.");
        return;
      }
    } else {
      if (!isPdf) {
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
    
    if (isPdf) {
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
        const wordModeSelect = document.getElementById('conv-word-mode');
        const wordMode = wordModeSelect ? wordModeSelect.value : 'layout';
        resultBlob = await pdfToWord(convFile, wordMode, (progress, message) => {
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

