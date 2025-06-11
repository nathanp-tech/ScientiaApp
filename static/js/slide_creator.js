/**
 * @file slide_creator.js
 * @description Logic for the slideshow creator.
 */
document.addEventListener('DOMContentLoaded', function() {

    // =========================================================================
    // 1. INITIAL SETUP & CONFIGURATION
    // =========================================================================
    const apiConfigEl = document.getElementById('api-config-json'); 
    if (!apiConfigEl) {
        console.error("Critical error: The API configuration object (#api-config-json) was not found."); 
        alert("Page configuration error (API Config). Cannot continue."); 
        return;
    }
    const API_CONFIG = JSON.parse(apiConfigEl.textContent); 
    const API_URLS = API_CONFIG.urls; 
    const CSRF_TOKEN = API_CONFIG.csrf_token; 

    const initialDataEl = document.getElementById('initial-data-json'); 
    if (!initialDataEl) {
        console.error("Critical error: The initial data (#initial-data-json) was not found."); 
        alert("Page configuration error (Initial Data). Cannot continue."); 
        return;
    }
    const INITIAL_DATA = JSON.parse(initialDataEl.textContent); 
    const logoPath = INITIAL_DATA.logo_path || '/static/img/logo_black.png'; 

    // =========================================================================
    // 2. STATE MANAGEMENT
    // =========================================================================
    let slideshowState = { 
        id: null,
        title: '',
        author: null, 
        subject: null,
        topic: null,
        language: null,
        curriculum: null,
        status: 'in_progress', // NOUVEAU : Statut par défaut
        blocks: [], 
    };
    let editors = {}; 
    let nextBlockId = 1; 

    // =========================================================================
    // 3. DOM ELEMENT REFERENCES
    // =========================================================================
    const blocksContainer = document.getElementById('blocks-container'); 
    const saveSlideshowBtn = document.getElementById('save-slideshow-server-btn'); 
    const loadSlideshowBtn = document.getElementById('load-slideshow-server-btn'); 
    const addBlockBtn = document.getElementById('add-block-floating-btn'); 
    const metadataBtn = document.getElementById('metadata-btn'); 
    const confirmTemplateBtn = document.getElementById('confirm-template-btn'); 
    const saveMetadataBtn = document.getElementById('save-metadata-btn'); 
    const confirmLoadSlideshowBtn = document.getElementById('confirm-load-slideshow-btn'); 
    const slideshowSelectorDropdown = document.getElementById('slideshowSelector'); 
    const slideshowTitleInput = document.getElementById('slideshowTitle'); 
    const curriculumSelect = document.getElementById('curriculum'); 
    const languageSelect = document.getElementById('language'); 
    const subjectSelect = document.getElementById('subject'); 
    const topicsSelect = document.getElementById('topic'); 

    // --- NOUVEAU : Références pour le modal de statut ---
    const statusSelectionModalEl = document.getElementById('statusSelectionModal');
    const statusSelectionModal = new bootstrap.Modal(statusSelectionModalEl);
    const confirmStatusAndSaveBtn = document.getElementById('confirm-status-and-save-btn');

    const slideTemplateSelectionModalEl = document.getElementById('slideTemplateSelectionModal'); 
    const slideTemplateSelectionModal = new bootstrap.Modal(slideTemplateSelectionModalEl); 
    const metadataModalEl = document.getElementById('metadataSelectionModal'); 
    const metadataModal = new bootstrap.Modal(metadataModalEl); 
    const loadSlideshowModalEl = document.getElementById('loadSlideshowModal'); 
    const loadSlideshowModal = new bootstrap.Modal(loadSlideshowModalEl); 

    // =========================================================================
    // 4. CORE UI & EDITOR FUNCTIONS
    // =========================================================================
    function updateEmptyState() {
        blocksContainer.classList.toggle('empty', blocksContainer.children.length === 0); 
    }

    function generateInternalBlockId() {
        return `client-block-${nextBlockId++}`; 
    }

    function initializeCodeMirror(textareaId, internalBlockId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return null;
        const editableTextOverlay = {
            token: function(stream) {
                if (stream.match("$$")) { stream.skipTo("$$") || stream.skipToEnd(); stream.match("$$"); return "editable-text"; }
                if (stream.match("$") && stream.peek() !== "$") { stream.skipTo("$") || stream.skipToEnd(); stream.match("$"); return "editable-text"; }
                if (stream.sol() || stream.string.charAt(stream.start - 1) === '>') { if (stream.eatWhile(/[^<$]/)) { return "editable-text"; } }
                stream.next(); return null;
            }
        };
        const editor = CodeMirror.fromTextArea(textarea, { mode: "htmlmixed", lineNumbers: true, theme: "monokai", autoCloseTags: true, lineWrapping: true });
        editor.addOverlay(editableTextOverlay);
        const previewEl = document.getElementById(`preview-${internalBlockId}`);
        let debounceTimeout;
        editor.on("change", (cm) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const content = cm.getValue();
                previewEl.innerHTML = content;
                if (window.MathJax && window.MathJax.typesetPromise) {
                    window.MathJax.typesetPromise([previewEl]).catch((err) => console.error('MathJax error:', err));
                }
                const slideElement = previewEl.querySelector('.slide');
                if (slideElement && slideElement.classList.contains('quiz-slide')) {
                    setupQuizInteraction(slideElement);
                }
            }, 300);
        });
        editors[internalBlockId] = editor;
        setTimeout(() => editor.refresh(), 100);
    }

    function addBlockToUI(block) {
        const internalBlockId = generateInternalBlockId(); 
        const editorId = `editor-${internalBlockId}`; 
        const previewId = `preview-${internalBlockId}`; 
        const blockWrapper = document.createElement('div'); 
        blockWrapper.className = 'block-edit-section mb-4'; 
        blockWrapper.id = internalBlockId; 
        blockWrapper.dataset.order = block.order; 
        blockWrapper.dataset.template = block.template_name; 

        blockWrapper.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge bg-secondary block-number">Slide ${parseInt(block.order, 10) + 1}</span>
                <div class="block-actions">
                    <button class="btn btn-sm btn-outline-secondary move-block-up" title="Move Up"><i class="bi bi-arrow-up"></i></button>
                    <button class="btn btn-sm btn-outline-secondary move-block-down" title="Move Down"><i class="bi bi-arrow-down"></i></button>
                    <button class="btn btn-sm btn-danger delete-block" title="Delete"><i class="bi bi-trash"></i></button>
                </div>
            </div>
            <div class="editor-preview-container">
                <div class="editor-column"><textarea id="${editorId}"></textarea></div>
                <div class="preview-column"><div id="${previewId}" class="block-preview"></div></div>
            </div>`; 

        blocksContainer.appendChild(blockWrapper); 
        document.getElementById(editorId).value = block.content_html; 
        initializeCodeMirror(editorId, internalBlockId); 

        const previewEl = document.getElementById(previewId); 
        previewEl.innerHTML = block.content_html; 
        
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([previewEl]).catch((err) => console.error('MathJax error:', err));
        }

        const slideElement = previewEl.querySelector('.slide'); 
        if (slideElement && slideElement.classList.contains('quiz-slide')) { 
            setupQuizInteraction(slideElement); 
        }
        updateEmptyState(); 

        blockWrapper.querySelector('.delete-block').addEventListener('click', () => { 
            if (confirm("Are you sure you want to delete this slide?")) { 
                blockWrapper.remove(); 
                delete editors[internalBlockId]; 
                updateBlockOrderInUI(); 
            }
        });
        blockWrapper.querySelector('.move-block-up').addEventListener('click', () => moveBlock(blockWrapper, 'up')); 
        blockWrapper.querySelector('.move-block-down').addEventListener('click', () => moveBlock(blockWrapper, 'down')); 
    }

    function moveBlock(blockElement, direction) {
        if (direction === 'up' && blockElement.previousElementSibling) { 
            blocksContainer.insertBefore(blockElement, blockElement.previousElementSibling); 
        } else if (direction === 'down' && blockElement.nextElementSibling) { 
            blocksContainer.insertBefore(blockElement, blockElement.nextElementSibling.nextElementSibling); 
        }
        updateBlockOrderInUI(); 
    }

    function updateBlockOrderInUI() {
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el, index) => { 
            el.dataset.order = index; 
            const blockNumberSpan = el.querySelector('.block-number'); 
            if (blockNumberSpan) blockNumberSpan.textContent = `Slide ${index + 1}`; 
        });
    }

    function renderUIFromState() {
        blocksContainer.innerHTML = ''; 
        editors = {}; 
        nextBlockId = 1; 

        slideshowTitleInput.value = slideshowState.title || ''; 
        curriculumSelect.value = slideshowState.curriculum || ''; 
        languageSelect.value = slideshowState.language || ''; 

        filterSubjects(); 
        subjectSelect.value = slideshowState.subject || ''; 
        
        updateTopics(); 
        topicsSelect.value = slideshowState.topic || ''; 

        slideshowState.blocks.sort((a, b) => a.order - b.order); 
        slideshowState.blocks.forEach((block, index) => { 
            block.order = index; 
            addBlockToUI(block); 
        });
        updateEmptyState(); 
    }

    function updateStateFromUI() {
        slideshowState.title = slideshowTitleInput.value; 
        slideshowState.curriculum = curriculumSelect.value || null; 
        slideshowState.language = languageSelect.value || null; 
        slideshowState.subject = subjectSelect.value || null; 
        slideshowState.topic = topicsSelect.value || null; 
        
        const newBlocks = []; 
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el) => { 
            const editor = editors[el.id]; 
            if (editor) { 
                newBlocks.push({ 
                    order: parseInt(el.dataset.order, 10), 
                    template_name: el.dataset.template, 
                    content_html: editor.getValue() 
                });
            }
        });
        slideshowState.blocks = newBlocks.sort((a, b) => a.order - b.order);
    }

    // =========================================================================
    // 5. API COMMUNICATION (MODIFIED FOR STATUS)
    // =========================================================================
    async function executeSave() {
        const url = API_URLS.slideshows; 
        const method = 'POST'; 
        saveSlideshowBtn.disabled = true;
        confirmStatusAndSaveBtn.disabled = true;
        confirmStatusAndSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                body: JSON.stringify(slideshowState)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || JSON.stringify(errorData));
            }
            const savedSlideshow = await response.json();
            slideshowState = savedSlideshow; 
            renderUIFromState(); 
            alert('Slideshow saved successfully!');
        } catch (error) {
            console.error("Save error:", error);
            alert(`Save error: ${error.message}`);
        } finally {
            saveSlideshowBtn.disabled = false;
            confirmStatusAndSaveBtn.disabled = false;
            confirmStatusAndSaveBtn.innerHTML = 'Confirm & Save';
            statusSelectionModal.hide();
        }
    }

    function handleSaveButtonClick() {
        updateStateFromUI();
        if (!slideshowState.title) {
            alert("Please give your slideshow a title (via the metadata modal).");
            metadataModal.show();
            return;
        }
        document.querySelectorAll('#statusSelectionModal .status-card').forEach(c => c.classList.remove('selected'));
        confirmStatusAndSaveBtn.disabled = true;
        statusSelectionModal.show();
    }
    
    async function loadSlideshowList() {
        try {
            const response = await fetch(API_URLS.slideshows); 
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`); 
            const slideshows = await response.json(); 
            slideshowSelectorDropdown.innerHTML = '<option value="">-- Choose a slideshow --</option>'; 
            slideshows.forEach(s => slideshowSelectorDropdown.add(new Option(`${s.title} (ID: ${s.id}, Author: ${s.author_name || 'N/A'})`, s.id))); 
            loadSlideshowModal.show(); 
        } catch (error) {
            console.error("Error loading list:", error); 
            alert(`Could not load list: ${error.message}`); 
        }
    }

    async function loadSlideshowDetail(slideshowId) {
        if (!slideshowId) return; 
        try {
            const response = await fetch(`${API_URLS.slideshows}${slideshowId}/`); 
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`); 
            slideshowState = await response.json(); 
            renderUIFromState(); 
            loadSlideshowModal.hide(); 
        } catch (error) {
            console.error("Error loading details:", error); 
            alert(`Could not load slideshow: ${error.message}`); 
        }
    }

    // =========================================================================
    // 6. METADATA & DROPDOWN LOGIC
    // =========================================================================
    function filterSubjects() {
        const curriculumId = curriculumSelect.value, languageId = languageSelect.value;
        const currentId = subjectSelect.value;
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>'; 
        subjectSelect.disabled = !curriculumId || !languageId; 
        if (curriculumId && languageId) { 
            INITIAL_DATA.subjects.forEach(s => { 
                if (String(s.curriculum_id) === curriculumId && String(s.language_id) === languageId) { 
                    subjectSelect.add(new Option(`${s.name} (${s.level === 1 ? 'SL' : 'HL'})`, s.id)); 
                }
            });
            subjectSelect.value = currentId; 
        }
        updateTopics(); 
    }

    function updateTopics() {
        const subjectId = subjectSelect.value;
        const currentId = topicsSelect.value;
        topicsSelect.innerHTML = '<option value="">-- Select Topic --</option>'; 
        topicsSelect.disabled = !subjectId; 
        if (subjectId) { 
            INITIAL_DATA.labels.forEach(l => { 
                if (String(l.subject_id) === subjectId) topicsSelect.add(new Option(l.description, l.id)); 
            });
            topicsSelect.value = currentId; 
        }
    }
    
    // =========================================================================
    // 7. QUIZ LOGIC (No changes needed)
    // =========================================================================
    function setupQuizInteraction(quizSlideElement) { /* ... (Logic remains the same) ... */ }

    // =========================================================================
    // 8. EVENT LISTENERS (MODIFIED FOR STATUS)
    // =========================================================================
    saveSlideshowBtn.addEventListener('click', handleSaveButtonClick); 
    loadSlideshowBtn.addEventListener('click', loadSlideshowList); 
    confirmLoadSlideshowBtn.addEventListener('click', () => loadSlideshowDetail(slideshowSelectorDropdown.value)); 
    metadataBtn.addEventListener('click', () => metadataModal.show()); 
    saveMetadataBtn.addEventListener('click', () => { 
        updateStateFromUI(); 
        metadataModal.hide(); 
    });
    addBlockBtn.addEventListener('click', () => { 
        document.querySelectorAll('#slideTemplateSelectionModal .template-card').forEach(c => c.classList.remove('selected')); 
        confirmTemplateBtn.disabled = true; 
        slideTemplateSelectionModal.show(); 
    });

    if (slideTemplateSelectionModalEl) { 
        slideTemplateSelectionModalEl.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            if (card) {
                slideTemplateSelectionModalEl.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected')); 
                card.classList.add('selected'); 
                confirmTemplateBtn.disabled = false; 
            }
        });
    }

    // --- NOUVEAU : Écouteurs pour le modal de statut ---
    if (statusSelectionModalEl) {
        statusSelectionModalEl.addEventListener('click', (e) => {
            const card = e.target.closest('.status-card');
            if (card) {
                statusSelectionModalEl.querySelectorAll('.status-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmStatusAndSaveBtn.disabled = false;
            }
        });
    }
    confirmStatusAndSaveBtn.addEventListener('click', () => {
        const selectedStatusCard = document.querySelector('#statusSelectionModal .status-card.selected');
        if (selectedStatusCard) {
            slideshowState.status = selectedStatusCard.dataset.status;
            executeSave();
        } else {
            alert('Please select a status.');
        }
    });

    confirmTemplateBtn.addEventListener('click', () => { 
        const selected = document.querySelector('#slideTemplateSelectionModal .template-card.selected'); 
        if (!selected) return; 
        const templates = { 
            'basic': `\n    <div class="slide basic-slide">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="container-fluid">\n            <h1>Slide Title</h1>\n            <div class="line"></div>\n            <ul>\n                <li>Point 1</li>\n                <li>Point 2</li>\n                <li>Point 3</li>\n            </ul>\n        </div>\n    </div>`, 
            'two-column': `\n    <div class="slide two-column">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="container-fluid">\n            <h1>Two-Column Layout</h1>\n            <div class="line"></div>\n            <div class="columns-container">\n                <div class="column">\n                    <h3>Column 1 Title</h3>\n                    <p>Content for the first column.</p>\n                    <ul><li>Point A</li><li>Point B</li></ul>\n                </div>\n                <div class="column">\n                    <h3>Column 2 Title</h3>\n                    <p>Content for the second column.</p>\n                </div>\n            </div>\n        </div>\n    </div>`, 
            'two-column-basic': `\n    <div class="slide two-column-basic">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="container-fluid">\n            <div class="title-line">\n                <h1>Concept & Explanation</h1>\n                <div class="line"></div>\n            </div>\n            <div class="row-twocol">\n                <div class="left">This is the main concept.</div>\n                <div class="right"><i>This is an explanation or an example.</i></div>\n            </div>\n            <div class="row-twocol">\n                <div class="left">Another point to develop.</div>\n                <div class="right"><i>Additional details here.</i></div>\n            </div>\n        </div>\n    </div>`, 
            'quiz': `\n    <div class="slide quiz-slide">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="quiz-content-wrapper">\n            <h1>Quiz Question (Multiple Choice)</h1>\n            <div class="question">\n                Which are object-oriented programming languages? (Select all that apply)\n            </div>\n            <ul class="options">\n                <li class="option" data-correct="true">Java</li>\n                <li class="option" data-correct="false">C</li>\n                <li class="option" data-correct="true">Python</li>\n                <li class="option" data-correct="true">C++</li>\n                <li class="option" data-correct="false">HTML</li>\n            </ul>\n            <div class="feedback"></div>\n            <div class="quiz-buttons">\n                <button class="btn btn-primary submit-quiz-btn">Submit</button>\n                <button class="btn btn-secondary retake-quiz-btn" style="display:none;">Retake</button>\n            </div>\n        </div>\n    </div>`, 
            'math': `\n    <div class="slide math-slide">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="container-fluid center-p">\n            <h1>Mathematical Equations</h1>\n            <div class="line"></div>\n            <p>The mass-energy equivalence is $E = mc^2$. The Pythagorean theorem is $a^2 + b^2 = c^2$.</p>\n            <div class="math-block">\n                $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n            </div>\n        </div>\n    </div>`, 
            'front': `\n    <div class="slide front-page">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="container-fluid">\n            <h1>Slideshow Title</h1>\n            <div class="line"></div>\n            <div class="subtitle">Subtitle or presenter's name</div>\n        </div>\n    </div>`, 
            'cards': `\n    <div class="slide cards">\n        <div class="logo">\n            <img src="${logoPath}" alt="Logo">\n        </div>\n        <div class="container-fluid">\n             <div class="title-line">\n                 <h1>Information Cards</h1>\n                 <div class="line"></div>\n             </div>\n            <div class="grid-container">\n                <div class="grid">\n                    <div class="slide-card">\n                        <h6>Card 1 Title</h6>\n                        <p>Brief information here.</p>\n                    </div>\n                    <div class="slide-card">\n                        <h6>Card 2 Title</h6>\n                        <p>Another piece of information.</p>\n                    </div>\n                    <div class="slide-card">\n                         <h6>Card 3 Title</h6>\n                        <p>Use cards to break down topics.</p>\n                    </div>\n                </div>\n            </div>\n        </div>\n    </div>` 
        };
        addBlockToUI({ 
            order: blocksContainer.children.length, 
            template_name: selected.dataset.template, 
            content_html: templates[selected.dataset.template] || '<p>New slide.</p>' 
        });
        slideTemplateSelectionModal.hide(); 
    });

    curriculumSelect.addEventListener('change', filterSubjects); 
    languageSelect.addEventListener('change', filterSubjects); 
    subjectSelect.addEventListener('change', updateTopics); 

    // =========================================================================
    // 9. INITIALIZATION
    // =========================================================================
    renderUIFromState(); 
});