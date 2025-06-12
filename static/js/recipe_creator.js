/**
 * @file recipe_creator.js
 * @description Logic for the recipe creator interface, including state management,
 * API communication, and dynamic UI for creating recipe blocks.
 */
document.addEventListener('DOMContentLoaded', function() {

    // --- 1. INITIAL SETUP & CONFIGURATION ---
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

    // --- 2. STATE MANAGEMENT ---
    let recipeState = {
        id: null,
        title: '',
        author: null,
        subject: null,
        topic: null,
        language: null,
        curriculum: null,
        status: 'in_progress', // Default status
        blocks: [],
    };
    let editors = {};
    let nextBlockId = 1;

    // --- 3. DOM ELEMENT REFERENCES ---
    const blocksContainer = document.getElementById('blocks-container');
    const saveRecipeBtn = document.getElementById('save-recipe-server-btn');
    const loadRecipeBtn = document.getElementById('load-recipe-server-btn');
    const addBlockBtn = document.getElementById('add-block-floating-btn');
    const metadataBtn = document.getElementById('metadata-btn');
    const confirmTemplateBtn = document.getElementById('confirm-template-btn');
    const saveMetadataBtn = document.getElementById('save-metadata-btn');
    const confirmLoadBtn = document.getElementById('confirm-load-btn');
    const recipeSelectorDropdown = document.getElementById('projectSelector');
    const recipeTitleInput = document.getElementById('projectTitle');
    const curriculumSelect = document.getElementById('curriculum');
    const languageSelect = document.getElementById('language');
    const subjectSelect = document.getElementById('subject');
    const topicsSelect = $('#topic'); // Using jQuery for Select2
    const confirmStatusAndSaveBtn = document.getElementById('confirm-status-and-save-btn');
    const helpBtn = document.getElementById('help-btn');
    const helpModalEl = document.getElementById('helpModal');

    const recipeTemplateSelectionModal = new bootstrap.Modal(document.getElementById('recipeTemplateSelectionModal'));
    const metadataModal = new bootstrap.Modal(document.getElementById('metadataSelectionModal'));
    const loadRecipeModal = new bootstrap.Modal(document.getElementById('loadProjectModal'));
    const statusSelectionModal = new bootstrap.Modal(document.getElementById('statusSelectionModal'));

    // Initialize Select2 for the topics dropdown inside the modal
    topicsSelect.select2({
        theme: 'bootstrap-5',
        placeholder: 'Select a Topic',
        dropdownParent: $('#metadataSelectionModal') // Crucial for search to work in modals
    });

    // --- 4. CORE UI & EDITOR FUNCTIONS ---
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
                if (stream.match("$$")) {
                    stream.skipTo("$$") || stream.skipToEnd();
                    stream.match("$$");
                    return "editable-text";
                }
                if (stream.match("$") && stream.peek() !== "$") {
                    stream.skipTo("$") || stream.skipToEnd();
                    stream.match("$");
                    return "editable-text";
                }
                if (stream.sol() || stream.string.charAt(stream.start - 1) === '>') {
                    if (stream.eatWhile(/[^<$]/)) {
                        return "editable-text";
                    }
                }
                stream.next();
                return null;
            }
        };

        const editor = CodeMirror.fromTextArea(textarea, {
            mode: "htmlmixed",
            lineNumbers: true,
            theme: "monokai",
            autoCloseTags: true,
            lineWrapping: true,
        });

        editor.addOverlay(editableTextOverlay);

        const previewEl = document.getElementById(`preview-${internalBlockId}`);
        let debounceTimeout;

        editor.on("change", (cm) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const content = cm.getValue();
                const processedContent = content.replace(/\/\//g, '<br>');
                previewEl.innerHTML = processedContent;
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

        blockWrapper.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge bg-secondary block-number">Block ${parseInt(block.order, 10) + 1}</span>
                <div class="block-actions">
                    <button class="btn btn-sm btn-outline-secondary move-block-up" title="Move Up"><i class="bi bi-arrow-up"></i></button>
                    <button class="btn btn-sm btn-outline-secondary move-block-down" title="Move Down"><i class="bi bi-arrow-down"></i></button>
                    <button class="btn btn-sm btn-danger delete-block" title="Delete"><i class="bi bi-trash"></i></button>
                </div>
            </div>
            <div class="editor-preview-container">
                <div class="editor-column"><textarea id="${editorId}"></textarea></div>
                <div class="preview-column"><div id="${previewId}" class="recipe-block ${block.template_name}"></div></div>
            </div>`;

        blocksContainer.appendChild(blockWrapper);
        document.getElementById(editorId).value = block.content_html;
        initializeCodeMirror(editorId, internalBlockId);

        const previewEl = document.getElementById(previewId);
        previewEl.innerHTML = block.content_html; 
        if (window.MathJax) MathJax.typesetPromise([previewEl]);
        updateEmptyState();

        blockWrapper.querySelector('.delete-block').addEventListener('click', () => {
            if (confirm("Are you sure you want to delete this block?")) {
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
            blocksContainer.insertBefore(blockElement.nextElementSibling, blockElement);
        }
        updateBlockOrderInUI();
    }

    function updateBlockOrderInUI() {
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el, index) => {
            el.dataset.order = index;
            const blockNumberSpan = el.querySelector('.block-number');
            if (blockNumberSpan) blockNumberSpan.textContent = `Block ${index + 1}`;
        });
    }

    function renderUIFromState() {
        blocksContainer.innerHTML = '';
        editors = {};
        nextBlockId = 1;

        recipeTitleInput.value = recipeState.title || '';
        curriculumSelect.value = recipeState.curriculum || '';
        languageSelect.value = recipeState.language || '';
        
        filterSubjects();
        subjectSelect.value = recipeState.subject || '';
        
        updateTopics();
        topicsSelect.val(recipeState.topic || '').trigger('change');

        recipeState.blocks.sort((a, b) => a.order - b.order).forEach((block, index) => {
            block.order = index;
            addBlockToUI(block);
        });
        updateEmptyState();
    }

    function updateStateFromUI() {
        recipeState.title = recipeTitleInput.value;
        recipeState.curriculum = curriculumSelect.value || null;
        recipeState.language = languageSelect.value || null;
        recipeState.subject = subjectSelect.value || null;
        recipeState.topic = topicsSelect.val() || null;

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
        newBlocks.sort((a, b) => a.order - b.order);
        recipeState.blocks = newBlocks;
    }

    // --- 5. API COMMUNICATION ---
    async function executeSave() {
        const url = API_URLS.recipes;
        const method = 'POST';

        confirmStatusAndSaveBtn.disabled = true;
        confirmStatusAndSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        saveRecipeBtn.disabled = true;

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                body: JSON.stringify(recipeState),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || JSON.stringify(errorData));
            }
            recipeState = await response.json(); 
            renderUIFromState();
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
        updateStateFromUI();
        if (!recipeState.title) {
            alert("Please give your recipe a title (via the metadata modal).");
            metadataModal.show();
            return;
        }
        document.querySelectorAll('#statusSelectionModal .status-card').forEach(c => c.classList.remove('selected'));
        confirmStatusAndSaveBtn.disabled = true;
        statusSelectionModal.show();
    }

    async function loadRecipeList() {
        try {
            const response = await fetch(API_URLS.recipes);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            const recipes = await response.json();
            recipeSelectorDropdown.innerHTML = '<option value="">-- Choose a recipe --</option>';
            recipes.forEach(r => recipeSelectorDropdown.add(new Option(`${r.title} (ID: ${r.id}, Author: ${r.author_name || 'N/A'})`, r.id)));
            loadRecipeModal.show();
        } catch (error) {
            console.error("Error loading recipe list:", error);
            alert(`Could not load list: ${error.message}`);
        }
    }

    async function loadRecipeDetail(recipeId) {
        if (!recipeId) return;
        try {
            const response = await fetch(`${API_URLS.recipes}${recipeId}/`);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            recipeState = await response.json();
            renderUIFromState();
            loadRecipeModal.hide();
        } catch (error) {
            console.error("Error loading recipe details:", error);
            alert(`Could not load the recipe: ${error.message}`);
        }
    }

    // --- 6. METADATA & DROPDOWN LOGIC ---
    function filterSubjects() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>';
        subjectSelect.disabled = !curriculumId || !languageId;

        if (curriculumId && languageId) {
            INITIAL_DATA.subjects.forEach(subject => {
                if (String(subject.curriculum_id) === String(curriculumId) && String(subject.language_id) === String(languageId)) {
                    subjectSelect.add(new Option(`${subject.name} (${subject.level === 1 ? 'SL' : 'HL'})`, subject.id));
                }
            });
        }
        updateTopics();
    }

    function updateTopics() {
        const subjectId = subjectSelect.value;
        const previousValue = topicsSelect.val();
        topicsSelect.empty();
        topicsSelect.prop('disabled', !subjectId);

        if (subjectId) {
            const relevantLabels = INITIAL_DATA.labels
                .filter(label => String(label.subject_id) === String(subjectId))
                .sort((a, b) => a.description.localeCompare(b.description, undefined, { numeric: true }));
            const hierarchicalData = buildHierarchy(relevantLabels);
            topicsSelect.select2({
                theme: 'bootstrap-5',
                placeholder: 'Select a Topic',
                dropdownParent: $('#metadataSelectionModal'),
                data: hierarchicalData
            });
        } else {
             topicsSelect.select2({
                theme: 'bootstrap-5',
                placeholder: 'Select Subject First',
                dropdownParent: $('#metadataSelectionModal'),
                data: []
            });
        }
        topicsSelect.val(previousValue).trigger('change');
    }

    function buildHierarchy(labels) {
        const tree = [];
        const map = {};
        tree.push({ id: '', text: '' }); // Blank option for placeholder
        labels.forEach(label => {
            const number = label.description.split(' ')[0];
            map[number] = { id: label.id, text: label.description };
        });
        labels.forEach(label => {
            const number = label.description.split(' ')[0];
            const parentNumber = number.substring(0, number.lastIndexOf('.'));
            if (parentNumber && map[parentNumber]) {
                map[parentNumber].children = map[parentNumber].children || [];
                map[parentNumber].children.push(map[number]);
            } else {
                tree.push(map[number]);
            }
        });
        return tree;
    }

    // --- 7. EVENT LISTENERS ---
    saveRecipeBtn.addEventListener('click', handleSaveButtonClick);
    loadRecipeBtn.addEventListener('click', loadRecipeList);
    confirmLoadBtn.addEventListener('click', () => loadRecipeDetail(recipeSelectorDropdown.value));

    metadataBtn.addEventListener('click', () => metadataModal.show());
    saveMetadataBtn.addEventListener('click', () => {
        updateStateFromUI();
        metadataModal.hide();
        const recipeStatusDiv = document.getElementById('recipe-status');
        if (recipeStatusDiv) {
            recipeStatusDiv.textContent = recipeState.id ? `Recipe #${recipeState.id} - ${recipeState.title}` : `New Recipe - ${recipeState.title}`;
        }
    });

    addBlockBtn.addEventListener('click', () => {
        document.querySelectorAll('#recipeTemplateSelectionModal .template-card').forEach(c => c.classList.remove('selected'));
        confirmTemplateBtn.disabled = false;
        recipeTemplateSelectionModal.show();
    });

    document.querySelectorAll('#recipeTemplateSelectionModal .template-card').forEach(card => {
        card.addEventListener('click', (e) => {
            document.querySelectorAll('#recipeTemplateSelectionModal .template-card').forEach(c => c.classList.remove('selected'));
            e.currentTarget.classList.add('selected');
            confirmTemplateBtn.disabled = false;
        });
    });

    const statusModalEl = document.getElementById('statusSelectionModal');
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

    confirmStatusAndSaveBtn.addEventListener('click', () => {
        const selectedStatusCard = document.querySelector('#statusSelectionModal .status-card.selected');
        if (selectedStatusCard) {
            recipeState.status = selectedStatusCard.dataset.status;
            executeSave();
        } else {
            alert('Please select a status.');
        }
    });

    confirmTemplateBtn.addEventListener('click', () => {
        const selected = document.querySelector('#recipeTemplateSelectionModal .template-card.selected');
        if (!selected) return;
        const templates = {
            'statement': `\n<div class="recipe-block recipe-statement">\n    <h2>Recipe Title</h2>\n    <p>Provide an overview of the recipe, its purpose, or list key ingredients here. You can include inline LaTeX like this: $x^2 + y^2 = z^2$.</p>\n    <p>Or display equations like this:</p>\n    $$ \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} $$\n    <ul>\n        <li>Ingredient 1</li>\n        <li>Ingredient 2</li>\n    </ul>\n</div>`,
            'step': `\n<div class="recipe-block recipe-step">\n    <h3>1. Step Title (e.g., Preparation)</h3>\n    <p>You can include inline LaTeX like this: $x^2 + y^2 = z^2$.</p>\n    <p>Or display equations like this:</p>\n    $$ \\sum_{i=1}^{n} i = \\frac{n(n+1)}{2} $$\n    <ol>\n        <li>Sub-action 1: Another example $E=mc^2$</li>\n        <li>Sub-action 2: Fraction example: $\\frac{a}{b}$</li>\n    </ol>\n</div>`
        };
        addBlockToUI({
            order: blocksContainer.children.length,
            template_name: selected.dataset.template,
            content_html: templates[selected.dataset.template] || '<p>New block.</p>'
        });
        recipeTemplateSelectionModal.hide();
    });
    
    curriculumSelect.addEventListener('change', filterSubjects);
    languageSelect.addEventListener('change', filterSubjects);
    subjectSelect.addEventListener('change', updateTopics);

    // --- 8. INITIALIZATION ---
    renderUIFromState();
    if (helpBtn && helpModalEl) {
        const helpModal = new bootstrap.Modal(helpModalEl);
        helpBtn.addEventListener('click', () => helpModal.show());
    }
});