/**
 * @file recipe_creator.js
 * @description Logic for the recipe creator interface, with image upload and resizing support.
 */
document.addEventListener('DOMContentLoaded', function() {

    // =========================================================================
    // 1. INITIAL SETUP & CONFIGURATION
    // =========================================================================
    const apiConfigEl = document.getElementById('api-config-json');
    if (!apiConfigEl) {
        console.error("Critical error: API config not found.");
        return;
    }
    const API_CONFIG = JSON.parse(apiConfigEl.textContent);
    const API_URLS = API_CONFIG.urls;
    const CSRF_TOKEN = API_CONFIG.csrf_token;

    const initialDataEl = document.getElementById('initial-data-json');
    if (!initialDataEl) {
        console.error("Critical error: Initial data not found.");
        return;
    }
    const INITIAL_DATA = JSON.parse(initialDataEl.textContent);

    // =========================================================================
    // 2. STATE MANAGEMENT
    // =========================================================================
    let recipeState = {
        id: null, title: '', author: null, subject: null, topic: null,
        language: null, curriculum: null, status: 'in_progress', blocks: [],
    };
    let editors = {};
    let nextBlockId = 1;

    // =========================================================================
    // 3. DOM ELEMENT REFERENCES
    // =========================================================================
    const blocksContainer = document.getElementById('blocks-container');
    const saveRecipeBtn = document.getElementById('save-recipe-server-btn');
    const addBlockBtn = document.getElementById('add-block-floating-btn');
    const metadataBtn = document.getElementById('metadata-btn');
    const confirmTemplateBtn = document.getElementById('confirm-template-btn');
    const saveMetadataBtn = document.getElementById('save-metadata-btn');
    const recipeTitleInput = document.getElementById('projectTitle');
    const curriculumSelect = document.getElementById('curriculum');
    const languageSelect = document.getElementById('language');
    const subjectSelect = document.getElementById('subject');
    const topicsSelect = document.getElementById('topic');
    const confirmStatusAndSaveBtn = document.getElementById('confirm-status-and-save-btn');
    const helpBtn = document.getElementById('help-btn');
    
    const recipeTemplateSelectionModalEl = document.getElementById('recipeTemplateSelectionModal');
    const metadataModalEl = document.getElementById('metadataSelectionModal');
    const statusModalEl = document.getElementById('statusSelectionModal');
    const helpModalEl = document.getElementById('helpModal');

    const recipeTemplateSelectionModal = new bootstrap.Modal(recipeTemplateSelectionModalEl);
    const metadataModal = new bootstrap.Modal(metadataModalEl);
    const statusSelectionModal = new bootstrap.Modal(statusModalEl);

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
        
        const editor = CodeMirror.fromTextArea(textarea, {
            mode: "htmlmixed", lineNumbers: true, theme: "monokai",
            autoCloseTags: true, lineWrapping: true
        });
        
        editor.addOverlay(editableTextOverlay);
        
        const previewEl = document.getElementById(`preview-${internalBlockId}`);
        let debounceTimeout;
        editor.on("change", (cm) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const content = cm.getValue();
                previewEl.innerHTML = content;
                if (window.MathJax) {
                    MathJax.typesetPromise([previewEl]).catch(err => console.error('MathJax error:', err));
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

        const contentContainer = document.createElement('div');
        if (block.template_name === 'image') {
            const initialHtml = block.content_html || `<img src="https://via.placeholder.com/800x400.png?text=Select+an+image" alt="Image preview" class="img-fluid" style="height: auto; width: 50%;">`;
            contentContainer.innerHTML = `
                <div class="d-flex justify-content-center align-items-center" style="min-height: 150px;">
                    <div class="resizable-image-wrapper" id="wrapper-${previewId}">
                        ${initialHtml}
                    </div>
                </div>
                <hr>
                <label for="${editorId}" class="form-label small fw-bold">Replace Image:</label>
                <input type="file" id="${editorId}" class="form-control form-control-sm" accept="image/*">
            `;
            const fileInput = contentContainer.querySelector(`#${editorId}`);
            const imageWrapper = contentContainer.querySelector(`#wrapper-${previewId}`);
            fileInput.addEventListener('change', () => {
                if (fileInput.files && fileInput.files[0]) {
                    const newImg = document.createElement('img');
                    newImg.src = URL.createObjectURL(fileInput.files[0]);
                    newImg.className = "img-fluid";
                    newImg.style.height = "auto";
                    imageWrapper.innerHTML = '';
                    imageWrapper.appendChild(newImg);
                }
            });
        } else {
            contentContainer.innerHTML = `<div class="editor-preview-container"><div class="editor-column"><textarea id="${editorId}"></textarea></div><div class="preview-column"><div id="${previewId}" class="block-preview"></div></div></div>`;
        }
        
        blockWrapper.innerHTML = `<div class="d-flex justify-content-between align-items-center mb-2"><span class="badge bg-secondary block-number">Block ${parseInt(block.order, 10) + 1}</span><div class="block-actions"><button class="btn btn-sm btn-outline-secondary move-block-up" title="Move Up"><i class="bi bi-arrow-up"></i></button><button class="btn btn-sm btn-outline-secondary move-block-down" title="Move Down"><i class="bi bi-arrow-down"></i></button><button class="btn btn-sm btn-danger delete-block" title="Delete"><i class="bi bi-trash"></i></button></div></div>`;
        blockWrapper.appendChild(contentContainer);
        blocksContainer.appendChild(blockWrapper);

        if (block.template_name !== 'image') {
            document.getElementById(editorId).value = block.content_html || '';
            initializeCodeMirror(editorId, internalBlockId);
            document.getElementById(previewId).innerHTML = block.content_html || '';
            if (window.MathJax) MathJax.typesetPromise();
        }

        blockWrapper.querySelector('.delete-block').addEventListener('click', () => { if (confirm("Are you sure?")) { blockWrapper.remove(); delete editors[internalBlockId]; updateBlockOrderInUI(); } });
        blockWrapper.querySelector('.move-block-up').addEventListener('click', () => moveBlock(blockWrapper, 'up'));
        blockWrapper.querySelector('.move-block-down').addEventListener('click', () => moveBlock(blockWrapper, 'down'));
        updateBlockOrderInUI();
    }
    
    function moveBlock(blockElement, direction) {
        if (direction === 'up' && blockElement.previousElementSibling) { blocksContainer.insertBefore(blockElement, blockElement.previousElementSibling); } 
        else if (direction === 'down' && blockElement.nextElementSibling) { blocksContainer.insertBefore(blockElement.nextElementSibling, blockElement); }
        updateBlockOrderInUI();
    }

    function updateBlockOrderInUI() {
        document.querySelectorAll('.block-edit-section').forEach((el, index) => {
            el.dataset.order = index;
            el.querySelector('.block-number').textContent = `Block ${index + 1}`;
        });
        updateEmptyState();
    }

    function renderUIFromState(serverState) {
        blocksContainer.innerHTML = ''; editors = {}; nextBlockId = 1;
        recipeState = serverState;
        recipeTitleInput.value = recipeState.title || '';
        document.getElementById('recipe-status').textContent = recipeState.id ? `Editing Recipe #${recipeState.id}` : 'New Recipe';
        curriculumSelect.value = recipeState.curriculum || '';
        languageSelect.value = recipeState.language || '';
        filterSubjects();
        subjectSelect.value = recipeState.subject || '';
        updateTopics();
        topicsSelect.value = recipeState.topic || '';
        recipeState.blocks.sort((a, b) => a.order - b.order).forEach((block, index) => {
            block.order = index; addBlockToUI(block);
        });
        updateEmptyState();
    }
    
    // =========================================================================
    // 5. API COMMUNICATION
    // =========================================================================
    async function executeSave() {
        const selectedStatusCard = document.querySelector('#statusSelectionModal .status-card.selected');
        if (!selectedStatusCard) { alert('Please select a status.'); return; }
        
        const formData = new FormData();
        if (recipeState.id) formData.append('id', recipeState.id);
        formData.append('title', recipeTitleInput.value);
        formData.append('status', selectedStatusCard.dataset.status);
        if (curriculumSelect.value) formData.append('curriculum', curriculumSelect.value);
        if (languageSelect.value) formData.append('language', languageSelect.value);
        if (subjectSelect.value) formData.append('subject', subjectSelect.value);
        if (topicsSelect.value) formData.append('topic', topicsSelect.value);

        const blocksForJson = [];
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el, index) => {
            el.dataset.order = index;
            const templateName = el.dataset.template;
            let finalHtml = '';
            if (templateName === 'image') {
                const wrapper = el.querySelector('.resizable-image-wrapper');
                const imageEl = wrapper ? wrapper.querySelector('img') : null;
                if (imageEl) {
                    imageEl.classList.remove('img-fluid');
                    imageEl.style.width = wrapper.style.width;
                    imageEl.style.height = 'auto';
                    imageEl.style.maxWidth = '100%';
                    finalHtml = `<div style="text-align: center;">${imageEl.outerHTML}</div>`;
                }
                const fileInput = el.querySelector('input[type="file"]');
                if (fileInput && fileInput.files[0]) {
                    formData.append(`block_image_${index}`, fileInput.files[0]);
                }
            } else {
                const editor = editors[el.id];
                finalHtml = editor ? editor.getValue() : '';
            }
            blocksForJson.push({ template_name: templateName, content_html: finalHtml });
        });
        
        formData.append('blocks', JSON.stringify(blocksForJson));
        
        confirmStatusAndSaveBtn.disabled = true;
        confirmStatusAndSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        saveRecipeBtn.disabled = true;

        try {
            const response = await fetch(API_URLS.recipes, {
                method: 'POST', headers: { 'X-CSRFToken': CSRF_TOKEN }, body: formData,
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || JSON.stringify(errorData));
            }
            const savedData = await response.json();
            renderUIFromState(savedData);
            alert('Recipe saved successfully!');
        } catch (error) {
            console.error("Save error:", error);
            alert(`Save error: ${error.message}`);
        } finally {
            confirmStatusAndSaveBtn.disabled = false;
            confirmStatusAndSaveBtn.innerHTML = 'Confirm & Save';
            saveRecipeBtn.disabled = false;
            statusSelectionModal.hide();
        }
    }

    function handleSaveButtonClick() {
        if (!recipeTitleInput.value) {
            alert("Please give your recipe a title (via the metadata modal).");
            metadataModal.show();
            return;
        }
        document.querySelectorAll('#statusSelectionModal .status-card').forEach(c => c.classList.remove('selected'));
        confirmStatusAndSaveBtn.disabled = true;
        statusSelectionModal.show();
    }

    async function loadRecipeDetail(recipeId) {
        document.getElementById('recipe-status').textContent = `Loading Recipe #${recipeId}...`;
        try {
            const response = await fetch(`${API_URLS.recipes}${recipeId}/`);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const data = await response.json();
            renderUIFromState(data);
        } catch (error) {
            console.error("Error loading recipe details:", error);
            alert(`Could not load the recipe: ${error.message}`);
            document.getElementById('recipe-status').textContent = 'Error loading recipe.';
        }
    }
    
    // =========================================================================
    // 6. METADATA & DROPDOWN LOGIC
    // =========================================================================
    function filterSubjects() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        const currentSubjectId = recipeState.subject;
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        subjectSelect.disabled = !curriculumId || !languageId;
        if (curriculumId && languageId) {
            INITIAL_DATA.subjects.forEach(subject => {
                if (String(subject.curriculum_id) === String(curriculumId) && String(subject.language_id) === String(languageId)) {
                    subjectSelect.add(new Option(`${subject.name} (${subject.level === 1 ? 'SL' : 'HL'})`, subject.id));
                }
            });
            if (currentSubjectId) subjectSelect.value = currentSubjectId;
        }
        updateTopics();
    }

    function updateTopics() {
        const subjectId = subjectSelect.value;
        const currentTopicId = recipeState.topic;
        topicsSelect.innerHTML = '<option value="">-- Select Topic --</option>';
        topicsSelect.disabled = !subjectId;
        if (subjectId) {
            INITIAL_DATA.labels.forEach(label => {
                if (String(label.subject_id) === String(subjectId)) {
                    topicsSelect.add(new Option(label.description, label.id));
                }
            });
            if (currentTopicId) topicsSelect.value = currentTopicId;
        }
    }

    // =========================================================================
    // 7. EVENT LISTENERS
    // =========================================================================
    saveRecipeBtn.addEventListener('click', handleSaveButtonClick);
    metadataBtn.addEventListener('click', () => metadataModal.show());
    saveMetadataBtn.addEventListener('click', () => { metadataModal.hide(); });
    addBlockBtn.addEventListener('click', () => {
        document.querySelectorAll('#recipeTemplateSelectionModal .template-card').forEach(c => c.classList.remove('selected'));
        confirmTemplateBtn.disabled = true;
        recipeTemplateSelectionModal.show();
    });
    
    if(recipeTemplateSelectionModalEl) {
        recipeTemplateSelectionModalEl.addEventListener('click', (e) => {
            const card = e.target.closest('.template-card');
            if (card) {
                recipeTemplateSelectionModalEl.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmTemplateBtn.disabled = false;
            }
        });
    }

    if (statusModalEl) {
        statusModalEl.addEventListener('click', (e) => {
            const card = e.target.closest('.status-card');
            if (card) {
                statusModalEl.querySelectorAll('.status-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                confirmStatusAndSaveBtn.disabled = false;
            }
        });
    }

    confirmStatusAndSaveBtn.addEventListener('click', executeSave);
    
    confirmTemplateBtn.addEventListener('click', () => {
        const selected = document.querySelector('#recipeTemplateSelectionModal .template-card.selected');
        if (!selected) return;
        const template = selected.dataset.template;
        let blockData = { order: blocksContainer.children.length, template_name: template, content_html: '' };
        
        if (template !== 'image') {
            const templates = {
            'statement': `
<div class="recipe-block recipe-statement">
    <h2>Recipe Title</h2>
    <p>Provide an overview of the recipe, its purpose, or list key ingredients here. You can include inline LaTeX like this: $x^2 + y^2 = z^2$.</p>
    <p>Or display equations like this:</p>
    $$ \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} $$
    <ul>
        <li>Ingredient 1</li>
        <li>Ingredient 2</li>
    </ul>
</div>`,
            'step': `
<div class="recipe-block recipe-step">
    <h3>1. Step Title (e.g., Preparation)</h3>
    <p>You can include inline LaTeX like this: $x^2 + y^2 = z^2$.</p>
    <p class="text-center"> You can center text like this </p>
    <p>You can also display subsequent calculations:</p>
    $$
    \\begin{align}
    f'(x) = (e^x)' \\cos x + e^x (\\cos x)' \\\\
    f'(x) = e^x \\cos x - e^x \\sin x
    \\end{align}
    $$
    <p>If you want them perfectly aligned:</p>
    $$
    \\begin{align}
    f'(x) &= (e^x)' \\cos x + e^x (\\cos x)' \\\\
           &= e^x \\cos x - e^x \\sin x
    \\end{align}
    $$
</div>`,
            'aligned-math': `
<p>Here, you can detail a multi-line calculation:</p>
$$
\\begin{align}
% Write your first line of calculation here. Use & to align.
f'(x) &= (e^x)' \\cos x + e^x (\\cos x)' \\\\
% Use \\\\ to jump to the next line
&= e^x \\cos x - e^x \\sin x
\\end{align}
$$
`
        };
            blockData.content_html = templates[template] || '<p>New block.</p>';
        }
        
        addBlockToUI(blockData);
        recipeTemplateSelectionModal.hide();
    });

    curriculumSelect.addEventListener('change', filterSubjects);
    languageSelect.addEventListener('change', filterSubjects);
    subjectSelect.addEventListener('change', updateTopics);
    if (helpBtn && helpModalEl) {
        const helpModal = new bootstrap.Modal(helpModalEl);
        helpBtn.addEventListener('click', () => { helpModal.show(); });
    }

    // =========================================================================
    // 8. INITIALIZATION
    // =========================================================================
    function initializePage() {
        const urlParams = new URLSearchParams(window.location.search);
        const recipeIdToLoad = urlParams.get('id');
        if (recipeIdToLoad) {
            loadRecipeDetail(recipeIdToLoad);
        } else {
            renderUIFromState({
                id: null, title: '', author: null, subject: null, topic: null,
                language: null, curriculum: null, status: 'in_progress', blocks: []
            });
        }
    }
    initializePage();
});