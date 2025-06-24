/**
 * @file slide_creator.js
 * @description Logic for the slideshow creator.
 * @version 3.3 - Unified slide templates for style consistency and added interactive quiz logic.
 */
document.addEventListener('DOMContentLoaded', function() {

    // =========================================================================
    // 1. INITIAL SETUP & CONFIGURATION
    // =========================================================================
    const apiConfigEl = document.getElementById('api-config-json');
    const initialDataEl = document.getElementById('initial-data-json');

    if (!apiConfigEl || !initialDataEl) {
        alert("A critical page configuration is missing. The application cannot start.");
        return;
    }

    const API_CONFIG = JSON.parse(apiConfigEl.textContent);
    const INITIAL_DATA = JSON.parse(initialDataEl.textContent);
    const logoPath = INITIAL_DATA.logo_path || '/static/img/logo_black.png';
    const CSRF_TOKEN = API_CONFIG.csrf_token;

    // =========================================================================
    // 2. STATE MANAGEMENT
    // =========================================================================
    let slideshowState = { 
        id: null, title: '', author: null, subject: null, 
        language: null, curriculum: null, status: 'in_progress', blocks: [], 
    };
    let editors = {}; 
    let nextBlockId = 1; 

    // =========================================================================
    // 3. DOM ELEMENT REFERENCES
    // =========================================================================
    const blocksContainer = document.getElementById('blocks-container'); 
    const saveSlideshowBtn = document.getElementById('save-slideshow-btn'); 
    const addBlockBtn = document.getElementById('add-block-floating-btn'); 
    const metadataBtn = document.getElementById('metadata-btn'); 
    const helpBtn = document.getElementById('help-btn');
    const scrollToTopBtn = document.getElementById('scroll-to-top-btn');

    const confirmTemplateBtn = document.getElementById('confirm-template-btn'); 
    const saveMetadataBtn = document.getElementById('save-metadata-btn'); 
    const confirmStatusAndSaveBtn = document.getElementById('confirm-status-and-save-btn');
    
    const slideshowTitleInput = document.getElementById('slideshowTitle'); 
    const curriculumSelect = document.getElementById('curriculum'); 
    const languageSelect = document.getElementById('language'); 
    const subjectSelect = document.getElementById('subject'); 


    const slideTemplateSelectionModalEl = document.getElementById('slideTemplateSelectionModal');
    const statusSelectionModalEl = document.getElementById('statusSelectionModal');
    const metadataModalEl = document.getElementById('metadataSelectionModal');
    const helpModalEl = document.getElementById('helpModal');

    const statusSelectionModal = new bootstrap.Modal(statusSelectionModalEl);
    const slideTemplateSelectionModal = new bootstrap.Modal(slideTemplateSelectionModalEl); 
    const metadataModal = new bootstrap.Modal(metadataModalEl); 
    const helpModal = new bootstrap.Modal(helpModalEl);

    // =========================================================================
    // 4. CORE UI & EDITOR FUNCTIONS
    // =========================================================================
    function updateEmptyState() { blocksContainer.classList.toggle('empty', blocksContainer.children.length === 0); }
    function generateInternalBlockId() { return `client-block-${nextBlockId++}`; }

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
        blockWrapper.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><span class="badge bg-secondary block-number">Slide ${parseInt(block.order, 10) + 1}</span><div class="block-actions"><button class="btn btn-sm btn-outline-secondary move-block-up" title="Move Up"><i class="bi bi-arrow-up"></i></button><button class="btn btn-sm btn-outline-secondary move-block-down" title="Move Down"><i class="bi bi-arrow-down"></i></button><button class="btn btn-sm btn-danger delete-block" title="Delete"><i class="bi bi-trash"></i></button></div></div><div class="editor-preview-container"><div class="editor-column"><textarea id="${editorId}"></textarea></div><div class="preview-column"><div id="${previewId}" class="block-preview"></div></div></div>`;
        blocksContainer.appendChild(blockWrapper);
        document.getElementById(editorId).value = block.content_html;
        initializeCodeMirror(editorId, internalBlockId);
        document.getElementById(previewId).innerHTML = block.content_html;
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([document.getElementById(previewId)]).catch(err => console.error('MathJax error:', err));
        }
        blockWrapper.querySelector('.delete-block').addEventListener('click', () => { if (confirm("Are you sure you want to delete this slide?")) { blockWrapper.remove(); delete editors[internalBlockId]; updateBlockOrderInUI(); } });
        blockWrapper.querySelector('.move-block-up').addEventListener('click', () => moveBlock(blockWrapper, 'up'));
        blockWrapper.querySelector('.move-block-down').addEventListener('click', () => moveBlock(blockWrapper, 'down'));
        updateEmptyState();
    }

    function moveBlock(blockElement, direction) {
        if (direction === 'up' && blockElement.previousElementSibling) { blocksContainer.insertBefore(blockElement, blockElement.previousElementSibling); }
        else if (direction === 'down' && blockElement.nextElementSibling) { blocksContainer.insertBefore(blockElement.nextElementSibling, blockElement); }
        updateBlockOrderInUI();
    }

    function updateBlockOrderInUI() {
        document.querySelectorAll('.block-edit-section').forEach((el, index) => {
            el.dataset.order = index;
            el.querySelector('.block-number').textContent = `Slide ${index + 1}`;
        });
        updateEmptyState();
    }

    function renderUIFromState(state) {
        slideshowState = { ...state };
        document.getElementById('slideshow-status').textContent = state.id ? `Editing Slideshow #${state.id}` : 'New Slideshow';
        blocksContainer.innerHTML = ''; 
        editors = {}; 
        nextBlockId = 1; 
        slideshowTitleInput.value = state.title || ''; 
        curriculumSelect.value = state.curriculum || ''; 
        languageSelect.value = state.language || ''; 
        filterSubjects(); 
        subjectSelect.value = state.subject || ''; 
        if (state.blocks) {
            state.blocks.sort((a, b) => a.order - b.order).forEach((block, index) => { 
                block.order = index; 
                addBlockToUI(block); 
            });
        }
        updateEmptyState();
    }

    function updateStateFromUI() {
        slideshowState.title = slideshowTitleInput.value; 
        slideshowState.curriculum = curriculumSelect.value || null; 
        slideshowState.language = languageSelect.value || null; 
        slideshowState.subject = subjectSelect.value || null; 
        const newBlocks = []; 
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el, index) => {
            el.dataset.order = index;
            const editor = editors[el.id]; 
            if (editor) { 
                newBlocks.push({ 
                    order: parseInt(el.dataset.order, 10), 
                    template_name: el.dataset.template, 
                    content_html: editor.getValue() 
                });
            }
        });
        slideshowState.blocks = newBlocks;
    }

    // =========================================================================
    // 5. API COMMUNICATION
    // =========================================================================
    function handleSaveButtonClick() {
        updateStateFromUI();
        if (!slideshowState.title) {
            alert("Please provide a title for the slideshow in the metadata modal.");
            metadataModal.show();
            return;
        }
        document.querySelectorAll('#statusSelectionModal .status-card').forEach(c => c.classList.remove('selected'));
        confirmStatusAndSaveBtn.disabled = true;
        statusSelectionModal.show();
    }

    async function executeSave() {
        const selectedStatusCard = document.querySelector('#statusSelectionModal .status-card.selected');
        if (!selectedStatusCard) {
            alert('Please select a status.');
            return;
        }
        slideshowState.status = selectedStatusCard.dataset.status;
        const url = slideshowState.id ? `${API_CONFIG.urls.slideshows}${slideshowState.id}/` : API_CONFIG.urls.slideshows;
        const method = slideshowState.id ? 'PUT' : 'POST';
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
            renderUIFromState(savedSlideshow);
            alert('Slideshow saved successfully!');
        } catch (error) {
            console.error("Save error:", error);
            alert(`Save error: ${error.message}`);
        } finally {
            confirmStatusAndSaveBtn.disabled = false;
            confirmStatusAndSaveBtn.innerHTML = 'Confirm & Save';
            statusSelectionModal.hide();
        }
    }

    async function loadSlideshowForEditing(slideshowId) {
        if (!slideshowId) return;
        document.getElementById('slideshow-status').textContent = `Loading Slideshow #${slideshowId}...`;
        try {
            const response = await fetch(`${API_CONFIG.urls.slideshows}${slideshowId}/`); 
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`); 
            const data = await response.json(); 
            renderUIFromState(data); 
        } catch (error) {
            console.error("Error loading slideshow details:", error);
            document.getElementById('slideshow-status').textContent = 'Error loading slideshow.';
            alert(`Could not load slideshow: ${error.message}`); 
        }
    }
    
    // =========================================================================
    // 6. METADATA & DROPDOWN LOGIC
    // =========================================================================
    function populateMetadataDropdowns() {
        const populate = (select, items) => {
            select.innerHTML = '<option value="">-- Select --</option>';
            if (items) { items.forEach(item => select.add(new Option(item.name, item.id))); }
        };
        populate(curriculumSelect, INITIAL_DATA.curriculums);
        populate(languageSelect, INITIAL_DATA.languages);
    }
    
    function filterSubjects() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        const currentSubjectId = slideshowState.subject;
        subjectSelect.innerHTML = '<option value="">-- Select --</option>'; 
        subjectSelect.disabled = !curriculumId || !languageId; 
        if (curriculumId && languageId) { 
            const filteredSubjects = INITIAL_DATA.subjects.filter(s => String(s.curriculum_id) === curriculumId && String(s.language_id) === languageId);
            filteredSubjects.forEach(s => subjectSelect.add(new Option(`${s.name}${s.level === 1 ? ' (SL)' : (s.level === 2 ? ' (HL)' : '')}`, s.id)));            subjectSelect.value = currentSubjectId || ''; 
        }
        
    }

    
    
    // =========================================================================
    // 7. EVENT LISTENERS
    // =========================================================================
    saveSlideshowBtn.addEventListener('click', handleSaveButtonClick); 
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
    helpBtn.addEventListener('click', () => helpModal.show());

    if (slideTemplateSelectionModalEl) {
        slideTemplateSelectionModalEl.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            if (card) {
                slideTemplateSelectionModalEl.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                if (confirmTemplateBtn) {
                    confirmTemplateBtn.disabled = false;
                }
            }
        });
    }

    if (statusSelectionModalEl) {
        statusSelectionModalEl.addEventListener('click', (e) => {
            const card = e.target.closest('.status-card');
            if (card) {
                statusSelectionModalEl.querySelectorAll('.status-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                if (confirmStatusAndSaveBtn) {
                    confirmStatusAndSaveBtn.disabled = false;
                }
            }
        });
    }
    
    if (confirmStatusAndSaveBtn) {
        confirmStatusAndSaveBtn.addEventListener('click', executeSave);
    }
    
    if (confirmTemplateBtn) {
        confirmTemplateBtn.addEventListener('click', () => { 
            const selected = document.querySelector('#slideTemplateSelectionModal .template-card.selected'); 
            if (!selected) return; 
            const templateName = selected.dataset.template;
            const templates = { 
    'front': `
<div class="slide front-page">
    <div class="logo"><img src="${logoPath}" alt="Logo"></div>
    <div class="slide-header">
        <h1>Slideshow Title</h1>
        <div class="line"></div>
        <p class="subtitle">Subtitle or presenter's name</p>
    </div>
    <div class="slide-content">
        </div>
</div>`, 

    'basic': `
<div class="slide basic-slide">
    <div class="logo"><img src="${logoPath}" alt="Logo"></div>
    <div class="slide-header">
        <h2>Basic Slide Title</h2>
        <div class="line"></div>
    </div>
    <div class="slide-content">
        <ul>
            <li>Point 1</li>
            <li>Point 2</li>
            <li>Point 3</li>
        </ul>
    </div>
</div>`, 

    'two-column': `
<div class="slide two-column-slide">
    <div class="logo"><img src="${logoPath}" alt="Logo"></div>
    <div class="slide-header">
        <h2>Two-Column Layout</h2>
        <div class="line"></div>
    </div>
    <div class="slide-content">
        <div class="columns-container">
            <div class="column">
                <h3>Column 1</h3>
                <p>Content for the first column.</p>
            </div>
            <div class="column">
                <h3>Column 2</h3>
                <p>Content for the second column.</p>
            </div>
        </div>
    </div>
</div>`,

    'cards': `
<div class="slide info-cards-slide">
    <div class="logo"><img src="${logoPath}" alt="Logo"></div>
    <div class="slide-header">
        <h2>Information Cards</h2>
        <div class="line"></div>
    </div>
    <div class="slide-content">
        <div class="grid-container">
            <div class="grid">
                <div class="slide-card"><h6>Card 1</h6><p>Brief info here.</p></div>
                <div class="slide-card"><h6>Card 2</h6><p>Another piece of info.</p></div>
                <div class="slide-card"><h6>Card 3</h6><p>Break down topics.</p></div>
            </div>
        </div>
    </div>
</div>`,

    'math': `
<div class="slide math-slide">
    <div class="logo"><img src="${logoPath}" alt="Logo"></div>
    <div class="slide-header">
        <h2>Mathematical Equations</h2>
        <div class="line"></div>
    </div>
    <div class="slide-content">
        <p style="text-align: center;">The mass-energy equivalence is $E = mc^2$.</p>
        <div class="math-block">
            $$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$
        </div>
    </div>
</div>`,

    'quiz': `
<div class="slide quiz-slide">
    <div class="logo"><img src="${logoPath}" alt="Logo"></div>
    <div class="slide-header">
        <h2>Quiz Question</h2>
        <div class="line"></div>
    </div>
    <div class="slide-content">
        <div class="quiz-content-wrapper">
            <div class="question">Which are object-oriented programming languages? (Select all that apply)</div>
            <ul class="options">
                <li class="option" data-correct="true">Java</li>
                <li class="option" data-correct="false">C</li>
                <li class="option" data-correct="true">Python</li>
                <li class="option" data-correct="true">C++</li>
                <li class="option" data-correct="false">HTML</li>
            </ul>
            <div class="feedback"></div>
            <div class="quiz-buttons">
                <button class="btn btn-primary submit-quiz-btn">Submit</button>
                <button class="btn btn-secondary retake-quiz-btn" style="display:none;">Retake</button>
            </div>
        </div>
    </div>
</div>`
};
            addBlockToUI({ 
                order: blocksContainer.children.length, 
                template_name: templateName, 
                content_html: templates[templateName] || '<div class="slide"><p>New slide.</p></div>' 
            });
            slideTemplateSelectionModal.hide(); 
        });
    }

    curriculumSelect.addEventListener('change', filterSubjects); 
    languageSelect.addEventListener('change', filterSubjects); 
    

    window.addEventListener('scroll', () => {
        scrollToTopBtn.style.display = (window.scrollY > 300) ? 'flex' : 'none';
    });
    scrollToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    blocksContainer.addEventListener('click', function(e) {
        const quizSlide = e.target.closest('.quiz-slide');
        if (!quizSlide) return;

        if (e.target.classList.contains('option')) {
            if (!quizSlide.classList.contains('quiz-submitted')) {
                e.target.classList.toggle('selected');
            }
        }
        if (e.target.classList.contains('submit-quiz-btn')) {
            handleSubmitQuiz(quizSlide);
        }
        if (e.target.classList.contains('retake-quiz-btn')) {
            handleRetakeQuiz(quizSlide);
        }
    });

    // =========================================================================
    // 8. QUIZ HELPER FUNCTIONS
    // =========================================================================
    function handleSubmitQuiz(quizSlide) {
        quizSlide.classList.add('quiz-submitted');
        const options = quizSlide.querySelectorAll('.option');
        const feedbackEl = quizSlide.querySelector('.feedback');
        const submitBtn = quizSlide.querySelector('.submit-quiz-btn');
        const retakeBtn = quizSlide.querySelector('.retake-quiz-btn');
        let score = 0;
        let totalCorrect = 0;

        options.forEach(option => {
            const isCorrect = option.dataset.correct === 'true';
            const isSelected = option.classList.contains('selected');
            if (isCorrect) {
                totalCorrect++;
                option.classList.add('correct');
                if (isSelected) {
                    score++;
                }
            } else if (isSelected) {
                option.classList.add('incorrect');
                score--;
            }
        });
        
        score = Math.max(0, score);
        if(feedbackEl) feedbackEl.textContent = `You scored ${score} out of ${totalCorrect}.`;
        if(submitBtn) submitBtn.style.display = 'none';
        if(retakeBtn) retakeBtn.style.display = 'inline-block';
    }

    function handleRetakeQuiz(quizSlide) {
        quizSlide.classList.remove('quiz-submitted');
        const options = quizSlide.querySelectorAll('.option');
        const feedbackEl = quizSlide.querySelector('.feedback');
        const submitBtn = quizSlide.querySelector('.submit-quiz-btn');
        const retakeBtn = quizSlide.querySelector('.retake-quiz-btn');

        options.forEach(option => {
            option.classList.remove('selected', 'correct', 'incorrect');
        });

        if(feedbackEl) feedbackEl.textContent = '';
        if(submitBtn) submitBtn.style.display = 'inline-block';
        if(retakeBtn) retakeBtn.style.display = 'none';
    }
    
    // =========================================================================
    // 9. INITIALIZATION
    // =========================================================================
    populateMetadataDropdowns();
    const urlParams = new URLSearchParams(window.location.search);
    const slideshowIdToEdit = urlParams.get('id');
    if (slideshowIdToEdit) {
        loadSlideshowForEditing(slideshowIdToEdit);
    } else {
        renderUIFromState(slideshowState); 
    }
});