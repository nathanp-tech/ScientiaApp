/**
 * @file flashcards_creator.js
 * @description Logic for the flashcard creator interface.
 * @version 4.0 - Removed all "Study Skills" functionality to simplify debugging.
 */
document.addEventListener('DOMContentLoaded', function() {

    // =========================================================================
    // 1. INITIAL SETUP & CONFIGURATION
    // =========================================================================
    const API_CONFIG = JSON.parse(document.getElementById('api-config-json').textContent);
    const INITIAL_DATA = JSON.parse(document.getElementById('initial-data-json').textContent);

    // =========================================================================
    // 2. STATE MANAGEMENT
    // =========================================================================
    let flashcardState = {
        id: null,
        question: '<h3>QUESTION</h3>\n<p>Start typing the question here...</p>',
        answer: '<h3>ANSWER</h3>\n<p>Provide the corresponding answer here...</p>',
        curriculum: null,
        language: null,
        subject: null,
        topic: null,
        status: 'in_progress',
        // REMOVED: study_skills property is gone.
    };
    let editors = {}; // To hold CodeMirror instances

    // =========================================================================
    // 3. DOM ELEMENT REFERENCES
    // =========================================================================
    const saveFlashcardBtn = document.getElementById('save-flashcard-server-btn');
    const metadataBtn = document.getElementById('metadata-btn');
    const saveMetadataBtn = document.getElementById('save-metadata-btn');
    const confirmStatusAndSaveBtn = document.getElementById('confirm-status-and-save-btn');

    const curriculumSelect = document.getElementById('curriculum');
    const languageSelect = document.getElementById('language');
    const subjectSelect = document.getElementById('subject');
    const topicSelect = document.getElementById('topic');
    // REMOVED: skillsSelect DOM reference is gone.
    
    const metadataModalEl = document.getElementById('metadataModal');
    const statusModalEl = document.getElementById('statusSelectionModal');

    const metadataModal = new bootstrap.Modal(metadataModalEl);
    const statusSelectionModal = new bootstrap.Modal(statusModalEl);

    // =========================================================================
    // 4. CORE UI & EDITOR FUNCTIONS
    // =========================================================================
    function initializeCodeMirror(editorId, textareaId, previewContainerId) {
        const textarea = document.getElementById(textareaId);
        const previewContainer = document.getElementById(previewContainerId);
        if (!textarea || !previewContainer) {
            console.error(`Initialization failed for editor ${editorId}. Elements not found.`);
            return;
        }
        
        const previewEl = previewContainer.querySelector('.block-preview');

        const editableTextOverlay = {
            token: function(stream) {
                if (stream.match("$$")) { stream.skipTo("$$") || stream.skipToEnd(); stream.match("$$"); return "editable-text"; }
                if (stream.match("$") && stream.peek() !== "$") { stream.skipTo("$") || stream.skipToEnd(); stream.match("$"); return "editable-text"; }
                if (stream.sol() || stream.string.charAt(stream.start - 1) === '>') { if (stream.eatWhile(/[^<$]/)) { return "editable-text"; } }
                stream.next(); return null;
            }
        };

        const editor = CodeMirror.fromTextArea(textarea, {
            mode: "htmlmixed", lineNumbers: true, theme: "monokai", autoCloseTags: true, lineWrapping: true
        });
        
        editor.addOverlay(editableTextOverlay);

        let debounceTimeout;
        editor.on("change", (cm) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const content = cm.getValue();
                previewEl.innerHTML = `<div class="flashcard-content-wrapper">${content}</div>`;
                if (window.MathJax) {
                    MathJax.typesetPromise([previewEl]).catch(err => console.error('MathJax error:', err));
                }
            }, 300);
        });

        editors[editorId] = editor;
        setTimeout(() => {
            editor.refresh();
            editor.getDoc().setValue(editor.getValue());
        }, 100);
    }

    function renderUIFromState(state) {
        flashcardState = { ...state };
        document.getElementById('flashcard-status').textContent = state.id ? `Editing Flashcard #${state.id}` : 'New Flashcard';

        if (editors.question) { editors.question.setValue(state.question || ''); }
        if (editors.answer) { editors.answer.setValue(state.answer || ''); }

        populateSelect(curriculumSelect, INITIAL_DATA.curriculums, 'Choose...', 'id', 'name', state.curriculum);
        populateSelect(languageSelect, INITIAL_DATA.languages, 'Choose...', 'id', 'name', state.language);

        // REMOVED: The entire block for populating the study skills select is gone.

        updateSubjects();
        subjectSelect.value = state.subject || '';
        updateTopics();
        topicSelect.value = state.topic || '';
    }

    // =========================================================================
    // 5. API COMMUNICATION & SAVING
    // =========================================================================
    function handleSaveButtonClick() {
        document.querySelectorAll('#statusSelectionModal .status-card').forEach(c => c.classList.remove('selected'));
        confirmStatusAndSaveBtn.disabled = true;
        statusSelectionModal.show();
    }

    async function executeSave() {
        const selectedStatusCard = document.querySelector('#statusSelectionModal .status-card.selected');
        if (!selectedStatusCard) {
            alert('Please select a status to continue.');
            return;
        }
        flashcardState.question = editors.question.getValue();
        flashcardState.answer = editors.answer.getValue();
        flashcardState.status = selectedStatusCard.dataset.status;

        const payload = {
            id: flashcardState.id,
            question: flashcardState.question,
            answer: flashcardState.answer,
            curriculum: flashcardState.curriculum || null,
            language: flashcardState.language || null,
            subject: flashcardState.subject || null,
            topic: flashcardState.topic || null,
            status: flashcardState.status,
            // REMOVED: study_skills is no longer sent to the server.
        };
        
        confirmStatusAndSaveBtn.disabled = true;
        confirmStatusAndSaveBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

        try {
            const url = payload.id ? `${API_CONFIG.urls.flashcards}${payload.id}/` : API_CONFIG.urls.flashcards;
            const method = payload.id ? 'PUT' : 'POST';
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': API_CONFIG.csrf_token },
                body: JSON.stringify(payload)
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(JSON.stringify(errorData));
            }
            const savedData = await response.json();
            renderUIFromState(savedData);
            alert('Flashcard saved successfully!');
        } catch (error) {
            console.error("Save error:", error);
            alert(`Save error: ${error.message}`);
        } finally {
            confirmStatusAndSaveBtn.disabled = false;
            confirmStatusAndSaveBtn.innerHTML = 'Confirm & Save';
            statusSelectionModal.hide();
        }
    }

    // =========================================================================
    // 6. METADATA & DROPDOWN LOGIC
    // =========================================================================
    function populateSelect(selectEl, items, defaultText, valueKey, textKey, selectedValue) {
        selectEl.innerHTML = `<option value="">${defaultText}</option>`;
        items.forEach(item => selectEl.add(new Option(item[textKey], item[valueKey])));
        if (selectedValue) {
            selectEl.value = selectedValue;
        }
    }

    function updateSubjects() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        subjectSelect.innerHTML = '<option value="">Choose...</option>';
        subjectSelect.disabled = !curriculumId || !languageId;
        if (curriculumId && languageId) {
            INITIAL_DATA.subjects.forEach(s => {
                if (s.curriculum_id == curriculumId && s.language_id == languageId) {
                    subjectSelect.add(new Option(`${s.name} (${s.level === 1 ? 'SL' : 'HL'})`, s.id));
                }
            });
            subjectSelect.value = flashcardState.subject || '';
        }
        updateTopics();
    }
    
    function updateTopics() {
        const subjectId = subjectSelect.value;
        topicSelect.innerHTML = '<option value="">Choose...</option>';
        topicSelect.disabled = !subjectId;
        if (subjectId) {
            INITIAL_DATA.labels.forEach(l => {
                if (l.subject_id == subjectId) {
                    topicSelect.add(new Option(l.description, l.id));
                }
            });
            topicSelect.value = flashcardState.topic || '';
        }
    }

    function updateStateFromMetadataModal() {
        flashcardState.curriculum = curriculumSelect.value || null;
        flashcardState.language = languageSelect.value || null;
        flashcardState.subject = subjectSelect.value || null;
        flashcardState.topic = topicSelect.value || null;
        // REMOVED: Logic to update study_skills from the modal is gone.
        metadataModal.hide();
    }

    // =========================================================================
    // 7. EVENT LISTENERS
    // =========================================================================
    saveFlashcardBtn.addEventListener('click', handleSaveButtonClick);
    metadataBtn.addEventListener('click', () => metadataModal.show());
    saveMetadataBtn.addEventListener('click', updateStateFromMetadataModal);
    confirmStatusAndSaveBtn.addEventListener('click', executeSave);
    
    curriculumSelect.addEventListener('change', updateSubjects);
    languageSelect.addEventListener('change', updateSubjects);
    subjectSelect.addEventListener('change', updateTopics);

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

    // =========================================================================
    // 8. INITIALIZATION
    // =========================================================================
    function initializePage() {
        initializeCodeMirror('question', 'question-editor-textarea', 'question-preview-container');
        initializeCodeMirror('answer', 'answer-editor-textarea', 'answer-preview-container');
        
        renderUIFromState(flashcardState); 
    }

    initializePage();
});