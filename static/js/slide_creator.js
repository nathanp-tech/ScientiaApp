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

    /**
     * Initializes a CodeMirror editor instance with a robust overlay.
     * This overlay highlights plain text content AND LaTeX formulas ($...$ and $$...$$).
     * @param {string} textareaId - The ID of the textarea to replace.
     * @param {string} internalBlockId - The client-side ID for the block.
     */
    function initializeCodeMirror(textareaId, internalBlockId) {
        const textarea = document.getElementById(textareaId);
        if (!textarea) return null;

        // Define the robust overlay for editable text and LaTeX
        const editableTextOverlay = {
            token: function(stream) {
                // First, try to match LaTeX patterns as they are more specific.
                // Pattern for block LaTeX: $$...$$
                if (stream.match("$$")) {
                    stream.skipTo("$$") || stream.skipToEnd();
                    stream.match("$$");
                    return "editable-text";
                }
                
                // Pattern for inline LaTeX: $...$
                if (stream.match("$") && stream.peek() !== "$") {
                    stream.skipTo("$") || stream.skipToEnd();
                    stream.match("$");
                    return "editable-text";
                }

                // If no LaTeX is found, handle the general text content between tags.
                if (stream.sol() || stream.string.charAt(stream.start - 1) === '>') {
                    let contentFound = stream.eatWhile(/[^<$]/);
                    if (contentFound) {
                        return "editable-text";
                    }
                }

                // If no patterns matched, advance the stream by one character.
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

        // Add the overlay mode on top of the 'htmlmixed' mode.
        editor.addOverlay(editableTextOverlay);

        const previewEl = document.getElementById(`preview-${internalBlockId}`);
        let debounceTimeout;

        // This event handler contains logic specific to the slide creator (MathJax, Quiz)
        editor.on("change", (cm) => {
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                const content = cm.getValue();
                previewEl.innerHTML = content;
                
                if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                    window.MathJax.typesetPromise([previewEl]).catch((err) => console.error('MathJax typesetting error in preview (direct):', err));
                } else if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
                    window.MathJax.startup.promise.then(() => {
                         if (typeof window.MathJax.typesetPromise === 'function') {
                            window.MathJax.typesetPromise([previewEl]).catch((err) => console.error('MathJax typesetting error in preview (startup.promise):', err));
                         } else {
                            console.error('MathJax loaded, but typesetPromise is not a function after startup (preview).');
                         }
                    }).catch(err => console.error('MathJax startup promise error (preview):', err));
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
        
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            window.MathJax.typesetPromise([previewEl]).catch((err) => console.error('MathJax typesetting error on addBlockToUI (direct):', err));
        } else if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
            window.MathJax.startup.promise.then(() => {
                if (typeof window.MathJax.typesetPromise === 'function') {
                    window.MathJax.typesetPromise([previewEl]).catch((err) => console.error('MathJax typesetting error on addBlockToUI (startup.promise):', err));
                } else {
                    console.error('MathJax loaded, but typesetPromise is not a function after startup (addBlockToUI).');
                }
            }).catch(err => console.error('MathJax startup promise error (addBlockToUI):', err));
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
            const nextSibling = blockElement.nextElementSibling; 
            blocksContainer.insertBefore(blockElement, nextSibling.nextElementSibling); 
        }
        updateBlockOrderInUI(); 
    }

    function updateBlockOrderInUI() {
        blocksContainer.querySelectorAll('.block-edit-section').forEach((el, index) => { 
            el.dataset.order = index; 
            const blockNumberSpan = el.querySelector('.block-number'); 
            if (blockNumberSpan) { 
                blockNumberSpan.textContent = `Slide ${index + 1}`; 
            }
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
        slideshowState.blocks = newBlocks; 
    }


    // =========================================================================
    // 5. API COMMUNICATION
    // =========================================================================
    async function saveSlideshow() {
        updateStateFromUI();
        if (!slideshowState.title) {
            alert("Please give your slideshow a title (via the metadata modal).");
            metadataModal.show();
            return;
        }
        const url = API_URLS.slideshows; 
        const method = 'POST'; 

        saveSlideshowBtn.disabled = true;
        saveSlideshowBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Saving...';

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                body: JSON.stringify(slideshowState)
            });
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.detail || JSON.stringify(errorData);
                throw new Error(errorMessage);
            }
            const savedSlideshow = await response.json();
            slideshowState = savedSlideshow; 
            renderUIFromState(); 
            alert('Slideshow saved successfully!');
        } catch (error) {
            console.error("Save error:", error);
            if (error instanceof SyntaxError) { 
                 alert('A server error occurred. Check the browser console and Django server logs for details.');
            } else {
                 alert(`Save error: ${error.message}`);
            }
        } finally {
            saveSlideshowBtn.disabled = false;
            saveSlideshowBtn.innerHTML = '<i class="bi bi-save-fill"></i> Save Slideshow';
        }
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
            console.error("Error loading slideshow list:", error); 
            alert(`Could not load the list: ${error.message}`); 
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
            console.error("Error loading slideshow details:", error); 
            alert(`Could not load the slideshow: ${error.message}`); 
        }
    }

    // =========================================================================
    // 6. METADATA & DROPDOWN LOGIC
    // =========================================================================
    function filterSubjects() {
        const curriculumId = curriculumSelect.value; 
        const languageId = languageSelect.value; 
        const currentSubjectId = subjectSelect.value; 
        subjectSelect.innerHTML = '<option value="">-- Select Subject --</option>'; 
        subjectSelect.disabled = !curriculumId || !languageId; 

        if (curriculumId && languageId) { 
            INITIAL_DATA.subjects.forEach(subject => { 
                if (String(subject.curriculum_id) === String(curriculumId) && String(subject.language_id) === String(languageId)) { 
                    const option = new Option(`${subject.name} (${subject.level === 1 ? 'SL' : 'HL'})`, subject.id); 
                    subjectSelect.add(option); 
                }
            });
            subjectSelect.value = currentSubjectId; 
        }
        updateTopics(); 
    }

    function updateTopics() {
        const subjectId = subjectSelect.value; 
        const currentTopicId = topicsSelect.value; 
        topicsSelect.innerHTML = '<option value="">-- Select Topic --</option>'; 
        topicsSelect.disabled = !subjectId; 

        if (subjectId) { 
            INITIAL_DATA.labels.forEach(label => { 
                if (String(label.subject_id) === String(subjectId)) { 
                    topicsSelect.add(new Option(label.description, label.id)); 
                }
            });
            topicsSelect.value = currentTopicId; 
        }
    }
    
    // =========================================================================
    // 7. QUIZ INTERACTION LOGIC (Updated for consistency and robustness)
    // =========================================================================
    function setupQuizInteraction(quizSlideElement) {
        // Ensure we are working with fresh elements within the current quizSlideElement
        const options = quizSlideElement.querySelectorAll('.option');
        let submitBtn = quizSlideElement.querySelector('.submit-quiz-btn'); // Use let for reassignment after cloning
        let retakeBtn = quizSlideElement.querySelector('.retake-quiz-btn'); // Use let for reassignment
        const feedback = quizSlideElement.querySelector('.feedback');
        
        if (!options.length || !submitBtn || !feedback) {
            // console.warn("Required quiz elements not found in slide preview:", quizSlideElement);
            return;
        }

        function resetQuizState() {
            // Use the live `options` NodeList from the current `quizSlideElement`
            quizSlideElement.querySelectorAll('.option').forEach(o => o.classList.remove('selected', 'correct', 'incorrect'));
            feedback.textContent = '';
            feedback.className = 'feedback'; 
            // Ensure submitBtn and retakeBtn refer to the current buttons in the DOM
            const currentSubmitBtn = quizSlideElement.querySelector('.submit-quiz-btn');
            const currentRetakeBtn = quizSlideElement.querySelector('.retake-quiz-btn');
            if (currentSubmitBtn) currentSubmitBtn.style.display = 'inline-block';
            if (currentRetakeBtn) currentRetakeBtn.style.display = 'none'; 
            quizSlideElement.classList.remove('submitted');
        }
        
        resetQuizState(); // Initial reset

        // Clone options to safely attach/re-attach event listeners
        const clonedOptions = [];
        options.forEach(opt => {
            const newOpt = opt.cloneNode(true); // Clone the option
            opt.parentNode.replaceChild(newOpt, opt); // Replace old option with cloned one
            newOpt.addEventListener('click', () => { // Add listener to the new option
                if (!quizSlideElement.classList.contains('submitted')) {
                    newOpt.classList.toggle('selected');
                }
            });
            clonedOptions.push(newOpt); // Work with the array of cloned options
        });
        
        // Clone submit button and add event listener
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        submitBtn = newSubmitBtn; // Update reference to the new button

        submitBtn.addEventListener('click', () => {
            let allCorrectOptionsDefined = 0, userSelectedCorrect = 0, userSelectedIncorrect = 0, userMadeSelection = false;
            
            clonedOptions.forEach(opt => { 
                const isCorrectDefined = opt.dataset.correct === 'true';
                const isSelectedByUser = opt.classList.contains('selected');
                if (isSelectedByUser) userMadeSelection = true;
                if (isCorrectDefined) { allCorrectOptionsDefined++; if (isSelectedByUser) userSelectedCorrect++; } 
                else { if (isSelectedByUser) userSelectedIncorrect++; }
            });

            if (!userMadeSelection) {
                feedback.textContent = 'Please select at least one answer.';
                feedback.className = 'feedback'; 
                return;
            }
            quizSlideElement.classList.add('submitted');
            feedback.className = 'feedback'; 

            if (userSelectedIncorrect > 0) { feedback.textContent = 'Some of your selections are incorrect.'; feedback.classList.add('incorrect'); } 
            else if (userSelectedCorrect === allCorrectOptionsDefined && allCorrectOptionsDefined > 0) { feedback.textContent = 'Correct! All your selections are right.'; feedback.classList.add('correct'); } 
            else if (userSelectedCorrect > 0 && userSelectedCorrect < allCorrectOptionsDefined) { feedback.textContent = 'Partially correct.'; feedback.classList.add('partial'); } 
            else if (allCorrectOptionsDefined === 0 && userSelectedIncorrect === 0) { feedback.textContent = 'Answer saved.'; } 
            else { feedback.textContent = 'Incorrect.'; feedback.classList.add('incorrect'); }

            clonedOptions.forEach(opt => { 
                if (opt.dataset.correct === 'true') opt.classList.add('correct');
                else if (opt.classList.contains('selected')) opt.classList.add('incorrect');
            });

            submitBtn.style.display = 'none'; // Hide the (new) submit button

            if (retakeBtn) { // If retake button exists in the template
                 const currentRetakeBtnInScope = quizSlideElement.querySelector('.retake-quiz-btn'); // Get it again
                 if (currentRetakeBtnInScope) {
                    const newRetakeBtn = currentRetakeBtnInScope.cloneNode(true);
                    currentRetakeBtnInScope.parentNode.replaceChild(newRetakeBtn, currentRetakeBtnInScope);
                    retakeBtn = newRetakeBtn; // Update reference
                    
                    retakeBtn.style.display = 'inline-block';
                    retakeBtn.addEventListener('click', resetQuizState); // Add listener to the new retake button
                 }
            }
        });
         
        // Initial setup for retake button if it exists (clone and add listener)
        if (retakeBtn) { 
            const newRetakeBtn = retakeBtn.cloneNode(true);
            retakeBtn.parentNode.replaceChild(newRetakeBtn, retakeBtn);
            retakeBtn = newRetakeBtn; // Update reference
            
            retakeBtn.addEventListener('click', resetQuizState);
            if (!quizSlideElement.classList.contains('submitted')) { 
                 retakeBtn.style.display = 'none';
            }
        }
    }

    // =========================================================================
    // 8. EVENT LISTENERS 
    // =========================================================================
    saveSlideshowBtn.addEventListener('click', saveSlideshow); 
    loadSlideshowBtn.addEventListener('click', loadSlideshowList); 
    confirmLoadSlideshowBtn.addEventListener('click', () => loadSlideshowDetail(slideshowSelectorDropdown.value)); 

    metadataBtn.addEventListener('click', () => metadataModal.show()); 
    saveMetadataBtn.addEventListener('click', () => { 
        updateStateFromUI(); 
        metadataModal.hide(); 
        const slideshowStatusDiv = document.getElementById('slideshow-status'); 
        if (slideshowStatusDiv) { 
             slideshowStatusDiv.textContent = slideshowState.id ? `Slideshow #${slideshowState.id} - ${slideshowState.title}` : `New Slideshow - ${slideshowState.title}`; 
        }
    });

    addBlockBtn.addEventListener('click', () => { 
        document.querySelectorAll('#slideTemplateSelectionModal .template-card').forEach(c => c.classList.remove('selected')); 
        confirmTemplateBtn.disabled = true; 
        slideTemplateSelectionModal.show(); 
    });

    if (slideTemplateSelectionModalEl) { 
        slideTemplateSelectionModalEl.querySelectorAll('.template-card').forEach(card => { 
            card.addEventListener('click', (e) => { 
                slideTemplateSelectionModalEl.querySelectorAll('.template-card').forEach(c => c.classList.remove('selected')); 
                e.currentTarget.classList.add('selected'); 
                confirmTemplateBtn.disabled = false; 
            });
        });
    }

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