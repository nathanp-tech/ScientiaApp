// static/js/flashcard_browser.js
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. Get Data and DOM Elements ---
    const initialData = JSON.parse(document.getElementById('initial-data-json').textContent);
    const apiUrls = JSON.parse(document.getElementById('api-urls-json').textContent);
    const userIsStaff = JSON.parse(document.getElementById('user-is-staff-json').textContent);

    const curriculumSelect = document.getElementById('curriculum-select');
    const languageSelect = document.getElementById('language-select');
    const subjectSelect = document.getElementById('subject-select');
    const topicSelect = document.getElementById('topic-select');
    const listContainer = document.getElementById('flashcard-list-container');
    const loadingSpinner = document.getElementById('loading-spinner');
    
    // REMOVED: skillSelect variable is gone.

    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmationModal'));
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    let itemToDeleteId = null;
    let debounceTimeout;

    // --- 2. Filter & Display Logic ---
    function populateFilters() {
        populateSelect(curriculumSelect, initialData.curriculums, 'All Curriculums', 'id', 'name');
        populateSelect(languageSelect, initialData.languages, 'All Languages', 'id', 'name');
        // REMOVED: Population of skillSelect is gone.
    }

    function populateSelect(selectEl, items, defaultOptionText, valueKey, textKey) {
        selectEl.innerHTML = `<option value="">${defaultOptionText}</option>`;
        if (items && Array.isArray(items)) {
            items.forEach(item => {
                selectEl.add(new Option(item[textKey], item[valueKey]));
            });
        }
    }

    function updateSubjectOptions() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        const previousValue = subjectSelect.value;
        subjectSelect.innerHTML = '<option value="">All Subjects</option>';
        subjectSelect.disabled = !curriculumId || !languageId;

        if (curriculumId && languageId) {
            populateSelect(subjectSelect, initialData.subjects.filter(s => s.curriculum_id == curriculumId && s.language_id == languageId), 'All Subjects', 'id', 'name');
        }
        subjectSelect.value = previousValue;
        updateTopicOptions();
    }

    function updateTopicOptions() {
        const subjectId = subjectSelect.value;
        const previousValue = topicSelect.value;
        topicSelect.innerHTML = '<option value="">All Topics</option>';
        topicSelect.disabled = !subjectId;

        if (subjectId) {
            populateSelect(topicSelect, initialData.labels.filter(l => l.subject_id == subjectId), 'All Topics', 'id', 'description');
        }
        topicSelect.value = previousValue;
    }

    async function fetchAndDisplayFlashcards() {
        loadingSpinner.style.display = 'block';
        console.log("Fetching flashcards with current filters...");

        const params = new URLSearchParams({
            curriculum: curriculumSelect.value,
            language: languageSelect.value,
            subject: subjectSelect.value,
            topic: topicSelect.value,
            // REMOVED: study_skill parameter is gone.
        });
        
        const filteredParams = new URLSearchParams(Array.from(params.entries()).filter(([key, value]) => value));
        
        try {
            const response = await fetch(`${apiUrls.flashcards}?${filteredParams.toString()}`);
            const data = await response.json();
            renderFlashcardList(data);
        } catch (error) {
            console.error('Error fetching flashcards:', error);
            listContainer.innerHTML = '<p class="text-danger p-3">Failed to load flashcards.</p>';
        } finally {
            loadingSpinner.style.display = 'none';
        }
    }

    function getStatusBadge(status) {
        const statuses = {
            'in_progress': { name: 'In Progress', class: 'bg-secondary' },
            'pending_review': { name: 'Pending Review', class: 'bg-warning text-dark' },
            'completed': { name: 'Completed', class: 'bg-success' }
        };
        const statusInfo = statuses[status] || { name: 'Unknown', class: 'bg-light text-dark' };
        return `<span class="badge ${statusInfo.class}">${statusInfo.name}</span>`;
    }

    function renderFlashcardList(flashcards) {
        listContainer.innerHTML = '';
        if (flashcards.length === 0) {
            listContainer.innerHTML = '<p class="text-muted p-3">No flashcards match the current filters.</p>';
            return;
        }

        flashcards.forEach(card => {
            const cardElement = document.createElement('div');
            cardElement.className = 'list-group-item list-group-item-action';
            cardElement.dataset.cardId = card.id;
            
            const questionPreview = `Q: ${card.question_text || 'No question text'}`;
            
            let detailsHTML = `<div class="text-muted small mt-1">Subject: ${card.subject_name || 'N/A'}</div>`;
            let adminAndStatusHTML = '';

            if (userIsStaff) {
                const author = card.author_name || 'N/A';
                detailsHTML = `<div class="text-muted small mt-1">Subject: ${card.subject_name || 'N/A'} | Author: ${author}</div>`;
                
                const statusBadge = getStatusBadge(card.status);
                adminAndStatusHTML = `
                    <div class="admin-actions">
                        ${statusBadge}
                        <a href="/flashcards/create/?id=${card.id}" class="edit-flashcard-btn" title="Edit Flashcard">
                            <i class="bi bi-pencil-fill"></i>
                        </a>
                        <button class="delete-flashcard-btn" data-card-id="${card.id}" title="Delete Flashcard">
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                `;
            }

            cardElement.innerHTML = `
                <div class="d-flex w-100 justify-content-between align-items-center">
                    <a href="/flashcards/${card.id}/" class="text-decoration-none text-dark flex-grow-1 me-3">
                        <div>
                            <strong>${questionPreview}</strong>
                            ${detailsHTML}
                        </div>
                    </a>
                    ${adminAndStatusHTML}
                </div>
            `;
            listContainer.appendChild(cardElement);
        });
    }

    // --- 3. Deletion Logic ---
    async function handleDelete() {
        if (!itemToDeleteId) return;
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
        
        await fetch(apiUrls.flashcard_delete.replace('0', itemToDeleteId), {
            method: 'DELETE',
            headers: { 'X-CSRFToken': csrfToken },
        });
        deleteModal.hide();
        fetchAndDisplayFlashcards();
    }

    // --- 4. Event Listeners ---
    listContainer.addEventListener('click', e => {
        const deleteButton = e.target.closest('.delete-flashcard-btn');
        if (deleteButton) {
            itemToDeleteId = deleteButton.dataset.cardId;
            deleteModal.show();
        }
    });

    confirmDeleteBtn.addEventListener('click', handleDelete);

    // FIXED: Simplified and corrected event listener logic for filters.
    const filters = [curriculumSelect, languageSelect, subjectSelect, topicSelect];
    filters.forEach(selectElement => {
        selectElement.addEventListener('change', (event) => {
            console.log(`Filter changed: ${event.target.id}`);
            
            // Update dependent dropdowns first
            if (event.target.id === 'curriculum-select' || event.target.id === 'language-select') {
                updateSubjectOptions();
            } else if (event.target.id === 'subject-select') {
                updateTopicOptions();
            }

            // Then, fetch new data with a debounce to avoid too many requests
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(fetchAndDisplayFlashcards, 300);
        });
    });
    
    // --- 5. Initialization ---
    populateFilters();
    updateSubjectOptions();
    fetchAndDisplayFlashcards();
});