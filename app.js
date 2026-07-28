// Main Application Router & Controller

// Set PDF.js Worker globally ONCE for zero-overhead background parsing
if (typeof pdfjsLib !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

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
 * Premium mouse hover glow effects on dashboard cards (throttled with rAF for 60fps smoothness)
 */
function initGlobalCardEffects() {
  document.querySelectorAll('.tool-card').forEach(card => {
    let ticking = false;
    card.addEventListener('mousemove', e => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const rect = card.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;
          card.style.setProperty('--x', `${x}px`);
          card.style.setProperty('--y', `${y}px`);
          ticking = false;
        });
        ticking = true;
      }
    }, { passive: true });
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
    const validItems = [];

    for (let i = 0; i < fileList.length; i++) {
      const file = fileList[i];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        validItems.push({
          id: crypto.randomUUID(),
          file: file
        });
      }
    }

    if (validItems.length > 0) {
      mergeQueue.push(...validItems);
      renderQueue();
    }
  }

  function renderQueue() {
    fileListContainer.innerHTML = '';
    btnRun.disabled = mergeQueue.length < 2;
    btnClearMerge.style.display = mergeQueue.length > 0 ? 'block' : 'none';

    const fragment = document.createDocumentFragment();

    mergeQueue.forEach((item, index) => {
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
          <span class="file-thumbnail-icon">PDF</span>
        </div>
        <div class="file-info">
          <div class="file-name">${item.file.name}</div>
          <div class="file-meta">
            <span>${formatBytes(item.file.size)}</span>
            <span>PDF Document</span>
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

      fragment.appendChild(itemEl);
    });

    fileListContainer.appendChild(fragment);
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
  let resizeQueue = [];
  let resultBlobUrl = null;
  let resultBlob = null;
  let isZipOutput = false;
  
  const dropzone = document.getElementById('resize-dropzone');
  const fileInput = document.getElementById('resize-file-input');
  const infoBlock = document.getElementById('resize-file-info');
  const fileListContainer = document.getElementById('resize-file-list');
  const queueCountLabel = document.getElementById('resize-queue-count');
  const previewContainer = document.getElementById('resize-canvas-preview');
  const btnRun = document.getElementById('btn-run-resize');
  
  const btnAddMore = document.getElementById('btn-add-more-resize');
  const btnClearAll = document.getElementById('btn-clear-all-resize');

  // Options inputs
  const sizeSelect = document.getElementById('resize-target-format');
  const orientationSelect = document.getElementById('resize-orientation');
  const scaleModeSelect = document.getElementById('resize-scaling-mode');
  const outputNameInput = document.getElementById('resize-output-name');
  const batchModeGroup = document.getElementById('resize-batch-mode-group');
  const batchModeSelect = document.getElementById('resize-batch-mode');

  const progressContainer = document.getElementById('resize-progress');
  const progressBar = document.getElementById('resize-progress-bar');
  const progressPercent = document.getElementById('resize-progress-percent');
  const progressMsg = document.getElementById('resize-progress-msg');
  
  const successCard = document.getElementById('resize-success');
  const successTitle = document.getElementById('resize-success-title');
  const btnDownload = document.getElementById('btn-download-resize');

  dropzone.addEventListener('click', () => fileInput.click());
  const btnBrowseResize = document.getElementById('btn-browse-resize');
  if (btnBrowseResize) {
    btnBrowseResize.addEventListener('click', () => fileInput.click());
  }

  if (btnAddMore) {
    btnAddMore.addEventListener('click', () => fileInput.click());
  }

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files.length > 0) {
      await loadFiles(Array.from(e.target.files));
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
      await loadFiles(Array.from(e.dataTransfer.files));
    }
  });

  async function loadFiles(fileList) {
    for (const f of fileList) {
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
      if (!isPdf) continue;
      
      try {
        const processedFile = await getOrDecryptFile(f);
        let numPages = '--';
        try {
          const arrayBuffer = await fileToArrayBuffer(processedFile);
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
          numPages = pdf.numPages;
        } catch (pErr) {
          console.warn("Could not parse page count:", pErr);
        }

        resizeQueue.push({
          id: 'res_' + Math.random().toString(36).substr(2, 9),
          file: processedFile,
          name: processedFile.name,
          size: processedFile.size,
          pages: numPages
        });
      } catch (err) {
        console.warn(err.message);
      }
    }
    renderResizeQueue();
  }

  function renderResizeQueue() {
    successCard.style.display = 'none';
    
    if (resizeQueue.length === 0) {
      dropzone.style.display = 'flex';
      infoBlock.style.display = 'none';
      previewContainer.style.display = 'none';
      if (batchModeGroup) batchModeGroup.style.display = 'none';
      btnRun.disabled = true;
      return;
    }

    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    previewContainer.style.display = 'flex';
    btnRun.disabled = false;
    
    if (batchModeGroup) {
      batchModeGroup.style.display = resizeQueue.length > 1 ? 'block' : 'none';
    }

    if (queueCountLabel) {
      queueCountLabel.textContent = `${resizeQueue.length} PDF File${resizeQueue.length > 1 ? 's' : ''} Loaded`;
    }

    fileListContainer.innerHTML = '';
    resizeQueue.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'file-item';
      el.dataset.id = item.id;
      el.innerHTML = `
        <div class="file-thumbnail"><span class="file-thumbnail-icon" style="color: var(--warning)">PDF</span></div>
        <div class="file-info">
          <div class="file-name">${item.name}</div>
          <div class="file-meta"><span>${formatBytes(item.size)}</span><span>Pages: ${item.pages}</span></div>
        </div>
        <div class="file-actions">
          ${index > 0 ? `<button class="file-btn" onclick="moveResizeItem(${index}, -1)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"/></svg></button>` : ''}
          ${index < resizeQueue.length - 1 ? `<button class="file-btn" onclick="moveResizeItem(${index}, 1)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg></button>` : ''}
          <button class="file-btn delete" onclick="deleteResizeItem('${item.id}')"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
        </div>
      `;
      fileListContainer.appendChild(el);
    });

    renderFirstPagePreview();
  }

  async function renderFirstPagePreview() {
    if (resizeQueue.length === 0) return;
    previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Rendering live page format preview...</span>';

    try {
      const firstItem = resizeQueue[0];
      const arrayBuffer = await fileToArrayBuffer(firstItem.file);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
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
      previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Preview unavailable</span>';
    }
  }

  window.deleteResizeItem = (id) => {
    resizeQueue = resizeQueue.filter(item => item.id !== id);
    renderResizeQueue();
  };

  window.moveResizeItem = (index, direction) => {
    const targetIdx = index + direction;
    if (targetIdx >= 0 && targetIdx < resizeQueue.length) {
      const temp = resizeQueue[index];
      resizeQueue[index] = resizeQueue[targetIdx];
      resizeQueue[targetIdx] = temp;
      renderResizeQueue();
    }
  };

  if (btnClearAll) {
    btnClearAll.addEventListener('click', () => {
      resizeQueue = [];
      renderResizeQueue();
    });
  }

  btnRun.addEventListener('click', async () => {
    if (resizeQueue.length === 0) return;
    
    btnRun.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';

    try {
      const options = {
        targetSize: sizeSelect.value,
        orientation: orientationSelect.value,
        scalingMode: scaleModeSelect.value
      };

      const isBatch = resizeQueue.length > 1;
      const batchMode = batchModeSelect ? batchModeSelect.value : 'combine';
      
      if (isBatch && batchMode === 'zip' && typeof JSZip !== 'undefined') {
        isZipOutput = true;
        const zip = new JSZip();
        
        for (let i = 0; i < resizeQueue.length; i++) {
          const item = resizeQueue[i];
          const progressStep = (i / resizeQueue.length);
          progressMsg.textContent = `Resizing PDF ${i + 1} of ${resizeQueue.length}: ${item.name}`;
          
          const resizedBytes = await resizePDF(item.file, options, (p, msg) => {
            const overall = progressStep + (p / resizeQueue.length);
            progressBar.style.width = `${overall * 100}%`;
            progressPercent.textContent = `${Math.round(overall * 100)}%`;
          });
          
          const outFileName = item.name.replace(/\.pdf$/i, '') + '_Resized.pdf';
          zip.file(outFileName, resizedBytes);
        }
        
        progressMsg.textContent = "Compressing resized files into ZIP archive...";
        resultBlob = await zip.generateAsync({ type: 'blob' });
        if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
        resultBlobUrl = URL.createObjectURL(resultBlob);
        
        if (successTitle) successTitle.textContent = "Batch Resizing Complete! (ZIP Archive)";
        btnDownload.textContent = "Download ZIP Archive";
      } else {
        isZipOutput = false;
        if (isBatch) {
          // Resize each file and combine into a single merged PDF document
          const resizedByteList = [];
          for (let i = 0; i < resizeQueue.length; i++) {
            const item = resizeQueue[i];
            const progressStep = (i / resizeQueue.length);
            progressMsg.textContent = `Resizing PDF ${i + 1} of ${resizeQueue.length}: ${item.name}`;
            
            const bytes = await resizePDF(item.file, options, (p, msg) => {
              const overall = progressStep + (p / resizeQueue.length);
              progressBar.style.width = `${overall * 100}%`;
              progressPercent.textContent = `${Math.round(overall * 100)}%`;
            });
            resizedByteList.push(bytes);
          }

          progressMsg.textContent = "Combining resized PDF documents...";
          const combinedDoc = await PDFLib.PDFDocument.create();
          for (const b of resizedByteList) {
            const doc = await PDFLib.PDFDocument.load(b);
            const copiedPages = await combinedDoc.copyPages(doc, doc.getPageIndices());
            copiedPages.forEach(p => combinedDoc.addPage(p));
          }
          const combinedBytes = await combinedDoc.save();
          resultBlob = new Blob([combinedBytes], { type: 'application/pdf' });
          if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
          resultBlobUrl = URL.createObjectURL(resultBlob);
          
          if (successTitle) successTitle.textContent = `Batch Resizing Complete! (${resizeQueue.length} Files)`;
          btnDownload.textContent = "Download Combined PDF";
        } else {
          // Single file resize
          const item = resizeQueue[0];
          const bytes = await resizePDF(item.file, options, (progress, message) => {
            progressBar.style.width = `${progress * 100}%`;
            progressPercent.textContent = `${Math.round(progress * 100)}%`;
            progressMsg.textContent = message;
          });

          resultBlob = new Blob([bytes], { type: 'application/pdf' });
          if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
          resultBlobUrl = URL.createObjectURL(resultBlob);
          
          if (successTitle) successTitle.textContent = "Resizing Complete!";
          btnDownload.textContent = "Download PDF";
        }
      }

      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnRun.disabled = false;
    } catch (err) {
      alert(`Error resizing PDF(s): ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
    }
  });

  btnDownload.addEventListener('click', () => {
    if (resultBlobUrl) {
      const link = document.createElement('a');
      link.href = resultBlobUrl;
      if (isZipOutput) {
        link.download = (outputNameInput.value || 'Resized_Documents').replace(/\.pdf$/i, '') + '.zip';
      } else {
        link.download = outputNameInput.value || 'Resized_Document.pdf';
      }
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
  
  const encrypted = await fastCheckIsPDFFileEncrypted(file);
  if (!encrypted) return file;
  
  const arrayBuffer = await fileToArrayBuffer(file);
  
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
  const btnBrowseSecurity = document.getElementById('btn-browse-security');
  if (btnBrowseSecurity) {
    btnBrowseSecurity.addEventListener('click', () => fileInput.click());
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
      passwordLabel.textContent = "Opening Password (User Password)";
      passwordInput.placeholder = "Enter password required to open document...";
      outputNameInput.value = securityFile ? securityFile.name.replace('.pdf', '_Protected.pdf') : 'Protected_Document.pdf';
    } else {
      passwordLabel.textContent = "Current Opening Password (to Decrypt)";
      passwordInput.placeholder = "Enter current document password...";
      outputNameInput.value = securityFile ? securityFile.name.replace('.pdf', '_Unlocked.pdf') : 'Unlocked_Document.pdf';
    }
  });
  
  async function loadFile(file) {
    securityFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    btnRun.disabled = false;
    successCard.style.display = 'none';
    if (passwordInput) passwordInput.style.borderColor = '';
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "PDF Document";
    
    outputNameInput.value = modeSelect.value === 'encrypt' ? file.name.replace('.pdf', '_Protected.pdf') : file.name.replace('.pdf', '_Unlocked.pdf');
    
    if (previewContainer) {
      previewContainer.style.display = 'flex';
      previewContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Document Loaded</span>';
    }
    
    try {
      const arrayBuffer = await fileToArrayBuffer(file);
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      
      const pwd = passwordInput ? passwordInput.value : '';
      let pdf;
      try {
        pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      } catch (noPwdErr) {
        if (pwd) {
          try {
            pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0), password: pwd }).promise;
          } catch (wErr) {
            filePagesLabel.textContent = "Pages: Encrypted PDF";
            if (previewContainer) {
              previewContainer.innerHTML = `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; gap: 0.5rem; text-align: center;">
                  <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                  <span style="color: var(--text-main); font-weight: 600; font-size: 0.9rem;">Password Protected Document</span>
                  <span style="color: var(--text-muted); font-size: 0.75rem;">Enter password in the sidebar to decrypt document</span>
                </div>
              `;
            }
            return;
          }
        } else {
          filePagesLabel.textContent = "Pages: Encrypted PDF";
          if (previewContainer) {
            previewContainer.innerHTML = `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 1.5rem; gap: 0.5rem; text-align: center;">
                <svg xmlns="http://www.w3.org/2000/svg" width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                <span style="color: var(--text-main); font-weight: 600; font-size: 0.9rem;">Password Protected Document</span>
                <span style="color: var(--text-muted); font-size: 0.75rem;">Enter password in the sidebar to decrypt document</span>
              </div>
            `;
          }
          return;
        }
      }

      filePagesLabel.textContent = `Pages: ${pdf.numPages}`;
      
      if (previewContainer) {
        const page = await pdf.getPage(1);
        const origViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = Math.min(280, Math.max(200, (previewContainer.clientWidth || 300) - 30));
        const scaleFactor = targetWidth / origViewport.width;
        const viewport = page.getViewport({ scale: scaleFactor });

        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.backgroundColor = '#ffffff';
        canvas.style.borderRadius = '6px';
        canvas.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
        canvas.style.display = 'block';

        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        previewContainer.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.style.display = 'flex';
        wrap.style.justifyContent = 'center';
        wrap.style.alignItems = 'center';
        wrap.style.padding = '0.75rem';
        wrap.style.width = '100%';
        wrap.appendChild(canvas);
        previewContainer.appendChild(wrap);
        
        await page.render({ canvasContext: context, viewport: viewport }).promise;
      }
    } catch (e) {
      console.warn("Security preview fallback:", e);
      filePagesLabel.textContent = "Pages: Ready";
    }
  }

  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !btnRun.disabled) {
        e.preventDefault();
        btnRun.click();
      }
    });
  }

  btnClear.addEventListener('click', resetSecurityTab);
  
  function resetSecurityTab() {
    securityFile = null;
    dropzone.style.display = 'flex';
    infoBlock.style.display = 'none';
    previewContainer.style.display = 'none';
    btnRun.disabled = true;
    successCard.style.display = 'none';
    if (passwordInput) { passwordInput.value = ''; passwordInput.style.borderColor = ''; }
  }
  
  btnRun.addEventListener('click', async () => {
    if (!securityFile) {
      alert("Please select a PDF document first.");
      return;
    }

    const password = passwordInput ? passwordInput.value : '';
    if (!password && modeSelect.value === 'encrypt') {
      if (passwordInput) {
        passwordInput.style.borderColor = 'var(--error)';
        passwordInput.focus();
      }
      alert("Please enter a password to encrypt your PDF document.");
      return;
    }

    btnRun.disabled = true;
    btnClear.disabled = true;
    progressContainer.style.display = 'block';
    successCard.style.display = 'none';
    
    try {
      const fileBytes = await fileToArrayBuffer(securityFile);
      
      if (modeSelect.value === 'encrypt') {
        progressMsg.textContent = "Encrypting file stream with AES-256 password protection...";
        progressBar.style.width = "40%";
        progressPercent.textContent = "40%";
        
        securedPdfBytes = await encryptPDFFile(fileBytes, password);
        
        progressBar.style.width = "100%";
        progressPercent.textContent = "100%";
        progressMsg.textContent = "Encryption finished! Password Protection Active.";
        successTitle.textContent = "PDF Password Security Applied!";
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
      let rawName = (outputNameInput && outputNameInput.value) ? outputNameInput.value.trim() : 'Protected_Document.pdf';
      if (!rawName.toLowerCase().endsWith('.pdf')) {
        rawName += '.pdf';
      }
      const link = document.createElement('a');
      link.href = securedPdfUrl;
      link.download = rawName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
  const btnBrowseSplit = document.getElementById('btn-browse-split');
  if (btnBrowseSplit) {
    btnBrowseSplit.addEventListener('click', () => fileInput.click());
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
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
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
  
  [wmText, wmFontSize, wmColor, wmRotation, wmOpacity, wmPosition, wmType, wmImgScale].forEach(el => {
    if (el) {
      el.addEventListener('input', updateWatermarkPreview);
      el.addEventListener('change', updateWatermarkPreview);
    }
  });
  
  if (wmImgFileInput) {
    wmImgFileInput.addEventListener('change', updateWatermarkPreview);
  }

  wmType.addEventListener('change', () => {
    if (wmType.value === 'text') {
      textOptions.style.display = 'block';
      imageOptions.style.display = 'none';
    } else {
      textOptions.style.display = 'none';
      imageOptions.style.display = 'block';
    }
    updateWatermarkPreview();
  });

  async function updateWatermarkPreview() {
    if (!watermarkFile) return;
    try {
      const arrayBuffer = await fileToArrayBuffer(watermarkFile);
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      const page = await pdf.getPage(1);
      const scale = 0.5;
      const viewport = page.getViewport({ scale: scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport: viewport }).promise;

      const rawOpacity = parseFloat(wmOpacity.value);
      const opacity = (isNaN(rawOpacity) ? 30 : rawOpacity) / 100.0;
      ctx.save();
      ctx.globalAlpha = Math.max(0.05, Math.min(1.0, opacity));

      const pos = wmPosition.value || 'center';
      let posX = viewport.width / 2;
      let posY = viewport.height / 2;
      if (pos === 'top' || pos === 'top-center') posY = 40;
      else if (pos === 'bottom' || pos === 'bottom-center') posY = viewport.height - 40;
      else if (pos === 'top-left') { posX = 70; posY = 40; }
      else if (pos === 'top-right') { posX = viewport.width - 70; posY = 40; }
      else if (pos === 'bottom-left') { posX = 70; posY = viewport.height - 40; }
      else if (pos === 'bottom-right') { posX = viewport.width - 70; posY = viewport.height - 40; }

      if (wmType.value === 'text') {
        const text = wmText.value || 'CONFIDENTIAL';
        const fontSize = (parseInt(wmFontSize.value) || 60) * scale;
        const color = wmColor.value || '#ef4444';
        const rotationDeg = parseInt(wmRotation.value);
        const rotation = (isNaN(rotationDeg) ? -45 : rotationDeg) * Math.PI / 180;

        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        ctx.translate(posX, posY);
        ctx.rotate(rotation);
        ctx.fillText(text, 0, 0);
      } else if (wmType.value === 'image' && wmImgFileInput.files && wmImgFileInput.files[0]) {
        const imgFile = wmImgFileInput.files[0];
        const imgScalePct = (parseInt(wmImgScale.value) || 30) / 100.0;
        const img = new Image();
        const imgUrl = URL.createObjectURL(imgFile);
        
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = imgUrl;
        });

        const maxDim = Math.min(viewport.width, viewport.height) * imgScalePct;
        let w = img.width || 100;
        let h = img.height || 100;
        if (w > h) {
          h = (h / w) * maxDim;
          w = maxDim;
        } else {
          w = (w / h) * maxDim;
          h = maxDim;
        }

        ctx.drawImage(img, posX - w / 2, posY - h / 2, w, h);
        URL.revokeObjectURL(imgUrl);
      }
      ctx.restore();

      previewContainer.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'canvas-page-wrapper';
      wrap.appendChild(canvas);
      previewContainer.appendChild(wrap);
    } catch (e) {
      console.error("Watermark preview error:", e);
    }
  }

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
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      filePagesLabel.textContent = `Pages: ${pdf.numPages}`;
      await updateWatermarkPreview();
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
  
  let pdfDocumentInstance = null;
  let savedPageNodes = {}; // Cache added annotations per page: { pageIndex: [HTMLNodeClones] }

  const btnLoadLayout = document.getElementById('btn-load-edit-layout');
  if (btnLoadLayout) {
    btnLoadLayout.addEventListener('click', () => {
      if (pdfDocumentInstance) renderWorkspace();
    });
  }

  function saveCurrentPageNodes(pageIndex) {
    const overlay = document.getElementById(`editor-overlay-${pageIndex}`);
    if (!overlay) return;
    savedPageNodes[pageIndex] = Array.from(overlay.children).map(child => child.cloneNode(true));
  }

  async function renderWorkspace() {
    if (!pdfDocumentInstance) return;
    workspace.style.display = 'flex';
    workspace.innerHTML = '';

    const maxPagesToRender = Math.min(totalPages, 50);

    for (let pageNum = 1; pageNum <= maxPagesToRender; pageNum++) {
      const pageIndex = pageNum - 1;
      try {
        const page = await pdfDocumentInstance.getPage(pageNum);
        const origViewport = page.getViewport({ scale: 1.0 });
        const targetWidth = Math.min(720, Math.max(320, workspace.clientWidth - 60 || 700));
        const scaleFactor = targetWidth / origViewport.width;
        const viewport = page.getViewport({ scale: scaleFactor });

        const frame = document.createElement('div');
        frame.className = 'editor-page-frame';
        frame.id = `editor-page-${pageIndex}`;
        frame.style.width = `${viewport.width}px`;
        frame.style.height = `${viewport.height}px`;
        frame.style.borderColor = pageIndex === activePageIndex ? 'var(--secondary)' : 'rgba(255,255,255,0.15)';
        frame.style.position = 'relative';
        frame.style.marginBottom = '2rem';
        frame.style.background = '#ffffff';
        frame.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.4)';

        // Page Header Label Badge
        const badge = document.createElement('div');
        badge.style.position = 'absolute';
        badge.style.top = '-24px';
        badge.style.left = '0';
        badge.style.fontSize = '0.75rem';
        badge.style.fontWeight = '600';
        badge.style.color = 'var(--text-muted)';
        badge.textContent = `Page ${pageNum} of ${totalPages}`;
        frame.appendChild(badge);

        const canvas = document.createElement('canvas');
        canvas.className = 'editor-canvas';
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d', { alpha: false });

        const overlay = document.createElement('div');
        overlay.className = 'editor-overlay';
        overlay.id = `editor-overlay-${pageIndex}`;

        // Restore previously saved annotations for this page
        if (savedPageNodes[pageIndex]) {
          savedPageNodes[pageIndex].forEach(clonedChild => {
            const rehydrated = clonedChild.cloneNode(true);
            overlay.appendChild(rehydrated);
            const delBtn = rehydrated.querySelector('.editor-node-delete-btn');
            const resizeHandle = rehydrated.querySelector('.editor-node-resize-handle');
            makeElementDraggable(rehydrated, overlay);
            if (resizeHandle) makeElementResizable(rehydrated, resizeHandle);
            if (delBtn) {
              delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                rehydrated.remove();
              });
            }
          });
        }

        frame.appendChild(canvas);
        frame.appendChild(overlay);
        workspace.appendChild(frame);

        requestAnimationFrame(async () => {
          try {
            await page.render({ canvasContext: context, viewport: viewport }).promise;
          } catch (rErr) {
            console.warn(`Render page ${pageNum} fallback warning:`, rErr);
          }
        });

        frame.addEventListener('click', () => {
          activePageIndex = pageIndex;
          document.querySelectorAll('.editor-page-frame').forEach(f => f.style.borderColor = 'rgba(255,255,255,0.15)');
          frame.style.borderColor = 'var(--secondary)';
        });
      } catch (pErr) {
        console.warn(`Failed rendering page ${pageNum}:`, pErr);
      }
    }
  }

  async function loadFile(file) {
    editFile = file;
    dropzone.style.display = 'none';
    infoBlock.style.display = 'block';
    if (btnLoadLayout) btnLoadLayout.style.display = 'inline-flex';
    btnRun.disabled = false;
    successCard.style.display = 'none';
    annotations = [];
    savedPageNodes = {};
    activePageIndex = 0;
    
    fileNameLabel.textContent = file.name;
    fileSizeLabel.textContent = formatBytes(file.size);
    filePagesLabel.textContent = "Loading pages...";
    outputNameInput.value = file.name.replace('.pdf', '_Signed.pdf');
    
    workspace.style.display = 'flex';
    workspace.innerHTML = '<span style="color: var(--text-muted); font-size: 0.9rem;">Rendering visual editor layout...</span>';
    
    try {
      originalPdfBytes = await fileToArrayBuffer(file);
      if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      }
      const dataCopy = new Uint8Array(originalPdfBytes.slice(0));
      pdfDocumentInstance = await pdfjsLib.getDocument({ data: dataCopy }).promise;
      totalPages = pdfDocumentInstance.numPages;
      filePagesLabel.textContent = `Pages: ${totalPages}`;
      
      await renderWorkspace();
      
      btnAddText.disabled = false;
      btnAddDrawSig.disabled = false;
      btnAddImgSig.disabled = false;
    } catch (err) {
      console.error("Visual editor document load error:", err);
      filePagesLabel.textContent = "Pages: Ready";
      // Provide clean fallback editor frame
      workspace.innerHTML = `
        <div class="editor-page-frame" id="editor-page-0" style="width: 100%; max-width: 750px; height: 950px; position: relative; border-color: var(--secondary);">
          <div style="position: absolute; top: 10px; left: 15px; font-size: 0.8rem; color: var(--text-muted);">Visual Document Workspace</div>
          <div class="editor-overlay" id="editor-overlay-0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></div>
        </div>
      `;
      btnAddText.disabled = false;
      btnAddDrawSig.disabled = false;
      btnAddImgSig.disabled = false;
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
    sigPadCanvas.width = sigPadCanvas.offsetWidth || 400;
    sigPadCanvas.height = sigPadCanvas.offsetHeight || 180;
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
  
  function makeImageBackgroundTransparent(dataUrl, maxDim = 800, threshold = 215) {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        
        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          if (r >= threshold && g >= threshold && b >= threshold) {
            data[i + 3] = 0; // Make white/light background transparent
          }
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  btnAddImgSig.addEventListener('click', () => editLogoInput.click());
  editLogoInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = async (event) => {
        let imgDataUrl = event.target.result;
        const transparentCheck = document.getElementById('edit-transparent-logo');
        if (transparentCheck && transparentCheck.checked) {
          imgDataUrl = await makeImageBackgroundTransparent(imgDataUrl);
        } else {
          imgDataUrl = await makeImageBackgroundTransparent(imgDataUrl, 800, 256); // Downscale only
        }
        insertImageAnnotation(imgDataUrl);
      };
      reader.readAsDataURL(file);
    }
    editLogoInput.value = '';
  });
  
  function insertImageAnnotation(src) {
    let overlay = document.getElementById(`editor-overlay-${activePageIndex}`);
    if (!overlay) {
      overlay = document.querySelector('.editor-overlay');
    }
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
      saveCurrentPageNodes(activePageIndex);
      annotations = [];
      
      for (let pIdx = 0; pIdx < totalPages; pIdx++) {
        let nodeElements = [];
        const overlay = document.getElementById(`editor-overlay-${pIdx}`);
        if (overlay) {
          nodeElements = Array.from(overlay.children);
        } else if (savedPageNodes[pIdx]) {
          nodeElements = savedPageNodes[pIdx];
        }

        if (!nodeElements || nodeElements.length === 0) continue;

        const frameW = (overlay && overlay.offsetWidth) ? overlay.offsetWidth : 700;
        const frameH = (overlay && overlay.offsetHeight) ? overlay.offsetHeight : 990;
        
        nodeElements.forEach(node => {
          if (node.classList.contains('editor-text-node')) {
            const clone = node.cloneNode(true);
            const delBtn = clone.querySelector('.editor-node-delete-btn');
            if (delBtn) delBtn.remove();
            const cleanText = clone.textContent;
            if (cleanText.trim() === 'Type notes...' || !cleanText.trim()) return;
            
            const leftPx = parseFloat(node.style.left) || node.offsetLeft || 50;
            const topPx = parseFloat(node.style.top) || node.offsetTop || 50;
            
            annotations.push({
              type: 'text',
              pageIndex: pIdx,
              x: leftPx / frameW,
              y: topPx / frameH,
              text: cleanText.trim(),
              fontSize: 16
            });
          } else if (node.classList.contains('editor-img-node')) {
            const imgEl = node.querySelector('img');
            if (!imgEl) return;
            
            const leftPx = parseFloat(node.style.left) || node.offsetLeft || 80;
            const topPx = parseFloat(node.style.top) || node.offsetTop || 80;
            const widthPx = parseFloat(node.style.width) || node.offsetWidth || 160;
            const heightPx = parseFloat(node.style.height) || node.offsetHeight || 70;

            annotations.push({
              type: 'image',
              pageIndex: pIdx,
              x: leftPx / frameW,
              y: topPx / frameH,
              width: widthPx / frameW,
              height: heightPx / frameH,
              imageSrc: imgEl.src
            });
          }
        });
      }
      
      progressMsg.textContent = "Writing overlay streams...";
      progressBar.style.width = "40%";
      progressPercent.textContent = "40%";
      
      const applyAllCheck = document.getElementById('edit-apply-all-pages');
      const applyAll = applyAllCheck ? applyAllCheck.checked : false;

      const safePdfBytes = originalPdfBytes ? originalPdfBytes.slice(0) : new ArrayBuffer(0);
      editedPdfBytes = await saveEditedPDF(safePdfBytes, annotations, applyAll, (progress, message) => {
        progressBar.style.width = `${progress * 100}%`;
        progressPercent.textContent = `${Math.round(progress * 100)}%`;
        progressMsg.textContent = message;
      });
      
      if (editedPdfUrl) URL.revokeObjectURL(editedPdfUrl);
      const blob = new Blob([editedPdfBytes], { type: 'application/pdf' });
      editedPdfUrl = URL.createObjectURL(blob);
      
      progressContainer.style.display = 'none';
      successCard.style.display = 'flex';
      btnRun.disabled = false;
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
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
      filePagesLabel.textContent = `Pages: ${pdf.numPages}`;
      
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.35 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.backgroundColor = '#ffffff';
      canvas.style.borderRadius = '6px';
      canvas.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      
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
  const btnBrowseConv = document.getElementById('btn-browse-conv');
  if (btnBrowseConv) {
    btnBrowseConv.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
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
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer.slice(0) }).promise;
        
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.backgroundColor = '#ffffff';
        canvas.style.borderRadius = '6px';
        canvas.style.boxShadow = '0 6px 20px rgba(0, 0, 0, 0.4)';
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
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
        resultBlob = await pdfToWord(convFile, 'layout', {}, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
      } else if (currentConvType === 'pdf-to-pptx') {
        resultBlob = await pdfToPPTX(convFile, outName, {}, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
      } else if (currentConvType === 'word-to-pdf') {
        resultBlob = await wordToPDF(convFile, outName, {}, (progress, message) => {
          progressBar.style.width = `${progress * 100}%`;
          progressPercent.textContent = `${Math.round(progress * 100)}%`;
          progressMsg.textContent = message;
        });
      }
      
      if (resultBlob) {
        if (resultBlobUrl) URL.revokeObjectURL(resultBlobUrl);
        resultBlobUrl = URL.createObjectURL(resultBlob);
        
        progressContainer.style.display = 'none';
        successCard.style.display = 'flex';
      } else {
        progressContainer.style.display = 'none';
      }
      
      btnRun.disabled = false;
      btnClear.disabled = false;
    } catch (err) {
      alert(`Conversion failed: ${err.message}`);
      progressContainer.style.display = 'none';
      btnRun.disabled = false;
      btnClear.disabled = false;
    }
  });

  btnDownload.addEventListener('click', () => {
    if (resultBlobUrl) {
      let defaultName = 'Converted_Document.docx';
      if (currentConvType === 'pdf-to-pptx') defaultName = 'Presentation.pptx';
      if (currentConvType === 'word-to-pdf') defaultName = 'Document.pdf';
      
      const link = document.createElement('a');
      link.href = resultBlobUrl;
      link.download = outputNameInput.value || defaultName;
      link.click();
    }
  });
}
