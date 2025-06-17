/**
 * @file recipe_creator.js
 * @description Logic for the recipe creator interface.
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

    // =========================================================================
    // 2. STATE MANAGEMENT
    // =========================================================================

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

    // =========================================================================
    // 3. DOM ELEMENT REFERENCES
    // =========================================================================

    const blocksContainer = document.getElementById('blocks-container');
    const saveRecipeBtn = document.getElementById('save-recipe-server-btn');
    // REMOVED: The "Load" button is no longer on this page.
    // const loadRecipeBtn = document.getElementById('load-recipe-server-btn'); 
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
    const helpModalEl = document.getElementById('helpModal');

    const recipeTemplateSelectionModal = new bootstrap.Modal(document.getElementById('recipeTemplateSelectionModal'));
    const metadataModal = new bootstrap.Modal(document.getElementById('metadataSelectionModal'));
    // REMOVED: The "Load" modal is no longer needed.
    // const loadRecipeModal = new bootstrap.Modal(document.getElementById('loadProjectModal'));
    const statusSelectionModal = new bootstrap.Modal(document.getElementById('statusSelectionModal'));


    // =========================================================================
    // 4. CORE UI & EDITOR FUNCTIONS
    // =========================================================================

    function updateEmptyState() {
        blocksContainer.classList.toggle('empty', blocksContainer.children.length === 0);
    }

    function generateInternalBlockId() {
        return `client-block-${nextBlockId++}`;
    }

    /**
     * Initializes a CodeMirror editor instance with a robust overlay.
     * This overlay highlights plain text content AND LaTeX formulas ($...$ and $$...$$).
     * @param {string} textareaId - The ID of the textarea to replace.
     *_SIDE* @param {string} internalBlockId - The client-side ID for the block.
     */
    function initializeCodeMirror(textareaId, internalBlockId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return null;

        // START: This is the new, more robust overlay logic
        const editableTextOverlay = {
            token: function(stream) {
                // For block math $$...$$
                if (stream.match("$$")) {
                    stream.skipTo("$$") || stream.skipToEnd();
                    stream.match("$$");
                    return "editable-text";
                }
                // For inline math $...$ (but not $$)
                if (stream.match("$") && stream.peek() !== "$") {
                    stream.skipTo("$") || stream.skipToEnd();
                    stream.match("$");
                    return "editable-text";
                }
                // For plain text content between tags
                if (stream.sol() || stream.string.charAt(stream.start - 1) === '>') {
                    // Eat characters until the next tag or math delimiter
                    if (stream.eatWhile(/[^<$]/)) {
                        return "editable-text";
                    }
                }
                // If no rule matches, advance the stream
                stream.next();
                return null;
            }
        };
        // END: New overlay logic

        const editor = CodeMirror.fromTextArea(textarea, {
            mode: "htmlmixed",
            lineNumbers: true,
            theme: "monokai",
            autoCloseTags: true,
            lineWrapping: true,
        });

        // Apply the overlay to the editor instance
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


    /**
     * Creates and adds a new block editor/preview section to the UI.
     * NOW WITH UNDO/REDO BUTTONS.
     * @param {object} block - The block data object.
     */
    function addBlockToUI(block) {
        const internalBlockId = generateInternalBlockId();
        const editorId = `editor-${internalBlockId}`;
        const previewId = `preview-${internalBlockId}`;

        const blockWrapper = document.createElement('div');
        blockWrapper.className = 'block-edit-section mb-4';
        blockWrapper.id = internalBlockId;
        blockWrapper.dataset.order = block.order;
        blockWrapper.dataset.template = block.template_name;

        // START: HTML for buttons has been updated here
        blockWrapper.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <span class="badge bg-secondary block-number">Block ${parseInt(block.order, 10) + 1}</span>
                <div class="block-actions">
                    <button class="btn btn-sm btn-outline-secondary undo-btn" title="Undo">
                        <i class="bi bi-arrow-counterclockwise"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary redo-btn" title="Redo">
                        <i class="bi bi-arrow-clockwise"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary move-block-up" title="Move Up">
                        <i class="bi bi-arrow-up"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-secondary move-block-down" title="Move Down">
                        <i class="bi bi-arrow-down"></i>
                    </button>
                    <button class="btn btn-sm btn-danger delete-block" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
            <div class="editor-preview-container">
                <div class="editor-column"><textarea id="${editorId}"></textarea></div>
                <div class="preview-column"><div id="${previewId}" class="block-preview"></div></div>
            </div>`;
        // END: HTML for buttons has been updated here

        blocksContainer.appendChild(blockWrapper);
        document.getElementById(editorId).value = block.content_html;

        initializeCodeMirror(editorId, internalBlockId);

        const previewEl = document.getElementById(previewId);
        previewEl.innerHTML = block.content_html;
        if (window.MathJax) MathJax.typesetPromise([previewEl]);

        updateEmptyState();

        // --- Event listeners for existing buttons ---
        blockWrapper.querySelector('.delete-block').addEventListener('click', () => {
            if (confirm("Are you sure you want to delete this block?")) {
                blockWrapper.remove();
                delete editors[internalBlockId];
                updateBlockOrderInUI();
            }
        });
        blockWrapper.querySelector('.move-block-up').addEventListener('click', () => moveBlock(blockWrapper, 'up'));
        blockWrapper.querySelector('.move-block-down').addEventListener('click', () => moveBlock(blockWrapper, 'down'));

        // --- START: Add event listeners for new Undo/Redo buttons ---
        blockWrapper.querySelector('.undo-btn').addEventListener('click', () => {
            const editor = editors[internalBlockId];
            if (editor) {
                editor.undo(); // CodeMirror's built-in undo function
            }
        });

        blockWrapper.querySelector('.redo-btn').addEventListener('click', () => {
            const editor = editors[internalBlockId];
            if (editor) {
                editor.redo(); // CodeMirror's built-in redo function
            }
        });
        // --- END: Add event listeners for new Undo/Redo buttons ---
    }

    function moveBlock(blockElement, direction) {
        if (direction === 'up' && blockElement.previousElementSibling) {
            blocksContainer.insertBefore(blockElement, blockElement.previousElementSibling);
        } else if (direction === 'down' && blockElement.nextElementSibling) {
            const nextSibling = blockElement.nextElementSibling;
            if (nextSibling.nextElementSibling) {
                blocksContainer.insertBefore(blockElement, nextSibling.nextElementSibling);
            } else {
                blocksContainer.appendChild(blockElement);
            }
        }
        updateBlockOrderInUI();
    }

    function updateBlockOrderInUI() {
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el, index) => {
            el.dataset.order = index;
            const blockNumberSpan = el.querySelector('.block-number');
            if (blockNumberSpan) {
                blockNumberSpan.textContent = `Block ${index + 1}`;
            }
        });
    }

    function renderUIFromState() {
        blocksContainer.innerHTML = '';
        editors = {};
        nextBlockId = 1;

        recipeTitleInput.value = recipeState.title || '';
        // Update the status title based on whether we are editing or creating
        document.getElementById('recipe-status').textContent = recipeState.id ? `Editing Recipe #${recipeState.id}` : 'New Recipe';

        curriculumSelect.value = recipeState.curriculum || '';
        languageSelect.value = recipeState.language || '';
        
        filterSubjects();
        subjectSelect.value = recipeState.subject || '';

        updateTopics();
        topicsSelect.value = recipeState.topic || '';

        recipeState.blocks.sort((a, b) => a.order - b.order);
        recipeState.blocks.forEach((block, index) => {
            block.order = index;
            addBlockToUI(block);
        });
        updateEmptyState();
    }

    function updateStateFromUI() {
        // The ID is part of the state and should not be reset here
        recipeState.title = recipeTitleInput.value;
        recipeState.curriculum = curriculumSelect.value || null;
        recipeState.language = languageSelect.value || null;
        recipeState.subject = subjectSelect.value || null;
        recipeState.topic = topicsSelect.value || null;

        const newBlocks = [];
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el) => {
            const currentOrder = parseInt(el.dataset.order, 10);
            const editor = editors[el.id];
            if (editor) {
                newBlocks.push({
                    order: currentOrder,
                    template_name: el.dataset.template,
                    content_html: editor.getValue()
                });
            }
        });
        newBlocks.sort((a, b) => a.order - b.order);
        recipeState.blocks = newBlocks;
    }

    // =========================================================================
    // 5. API COMMUNICATION
    // =========================================================================

    async function executeSave() {
        const selectedStatusCard = document.querySelector('#statusSelectionModal .status-card.selected');
        if (selectedStatusCard) {
            recipeState.status = selectedStatusCard.dataset.status;
        } else {
            alert('Please select a status before saving.');
            return;
        }

        updateStateFromUI(); 
        
        const url = API_URLS.recipes;
        const method = 'POST';

        confirmStatusAndSaveBtn.disabled = true;
        confirmStatusAndSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';
        saveRecipeBtn.disabled = true;

        try {
            const response = await fetch(url, {
                method: method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': CSRF_TOKEN,
                },
                body: JSON.stringify(recipeState),
            });
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.detail || JSON.stringify(errorData);
                throw new Error(errorMessage);
            }
            
            const savedRecipe = await response.json();
            
            recipeState = savedRecipe; 
            
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

    async function loadRecipeDetail(recipeId) {
        if (!recipeId) return;
        document.getElementById('recipe-status').textContent = `Loading Recipe #${recipeId}...`;
        try {
            const response = await fetch(`${API_URLS.recipes}${recipeId}/`);
            if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
            recipeState = await response.json();
            renderUIFromState();
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
        topicsSelect.innerHTML = '<option value="">-- Select Topic --</option>';
        topicsSelect.disabled = !subjectId;

        if (!subjectId) return;

        INITIAL_DATA.labels.forEach(label => {
            if (String(label.subject_id) === String(subjectId)) {
                topicsSelect.add(new Option(label.description, label.id));
            }
        });
    }

    // =========================================================================
    // 7. EVENT LISTENERS
    // =========================================================================

    saveRecipeBtn.addEventListener('click', handleSaveButtonClick);

    metadataBtn.addEventListener('click', () => metadataModal.show());
    saveMetadataBtn.addEventListener('click', () => {
        updateStateFromUI();
        metadataModal.hide();
    });

    addBlockBtn.addEventListener('click', () => {
        document.querySelectorAll('#recipeTemplateSelectionModal .template-card').forEach(c => c.classList.remove('selected'));
        confirmTemplateBtn.disabled = true;
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
            if (!card) return;
            statusModalEl.querySelectorAll('.status-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            confirmStatusAndSaveBtn.disabled = false;
        });
    }

    confirmStatusAndSaveBtn.addEventListener('click', executeSave);

    confirmTemplateBtn.addEventListener('click', () => {
        const selected = document.querySelector('#recipeTemplateSelectionModal .template-card.selected');
        if (!selected) return;

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

    // =========================================================================
    // 8. INITIALIZATION
    // =========================================================================

    /**
     * This function runs when the page loads.
     * It checks if an 'id' is present in the URL.
     * If so, it loads the corresponding recipe for editing.
     * If not, it presents a blank slate for a new recipe.
     */
    function initializePage() {
        const urlParams = new URLSearchParams(window.location.search);
        const recipeIdToLoad = urlParams.get('id');

        if (recipeIdToLoad) {
            loadRecipeDetail(recipeIdToLoad);
        } else {
            renderUIFromState(); // Renders a blank new recipe form
        }
    }

    initializePage(); // Execute the initialization logic
    
    if (helpBtn && helpModalEl) {
        const helpModal = new bootstrap.Modal(helpModalEl);
        helpBtn.addEventListener('click', () => {
            helpModal.show();
        });
    }
});