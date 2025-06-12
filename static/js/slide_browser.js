// static/js/recipe_browser.js
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. Get Data and DOM Elements ---
    const initialData = JSON.parse(document.getElementById('initial-data-json').textContent);
    const apiUrls = JSON.parse(document.getElementById('api-urls-json').textContent);
    const userIsStaff = JSON.parse(document.getElementById('user-is-staff-json').textContent); // Get user status

    const curriculumSelect = document.getElementById('curriculum-select');
    const languageSelect = document.getElementById('language-select');
    const subjectSelect = document.getElementById('subject-select');
    const topicSelect = document.getElementById('topic-select');
    
    const recipeListContainer = document.getElementById('recipe-list-container');
    const loadingSpinner = document.getElementById('loading-spinner');

    // Modal elements for deletion
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmationModal'));
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    let recipeIdToDelete = null;

    let debounceTimeout;

    // --- 2. Dependent Filter Logic (No changes here) ---

    function updateSubjectOptions() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        const previousValue = subjectSelect.value;
        subjectSelect.innerHTML = '<option value="">All Subjects</option>';
        subjectSelect.disabled = !curriculumId || !languageId;

        if (curriculumId && languageId) {
            initialData.subjects.forEach(subject => {
                if (String(subject.curriculum_id) === curriculumId && String(subject.language_id) === languageId) {
                    const option = new Option(`${subject.name} (${subject.level === 1 ? 'SL' : 'HL'})`, subject.id);
                    subjectSelect.add(option);
                }
            });
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
            initialData.labels.forEach(label => {
                if (String(label.subject_id) === subjectId) {
                    topicSelect.add(new Option(label.description, label.id));
                }
            });
        }
        topicSelect.value = previousValue;
    }

    // --- 3. Data Fetching and Display Logic ---

    async function fetchAndDisplayRecipes() {
        loadingSpinner.style.display = 'block';
        const params = new URLSearchParams({
            curriculum: curriculumSelect.value,
            language: languageSelect.value,
            subject: subjectSelect.value,
            topic: topicSelect.value
        });
        
        for (let [key, value] of params.entries()) {
            if (!value) params.delete(key);
        }

        try {
            const response = await fetch(`${apiUrls.recipes}?${params.toString()}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const recipes = await response.json();
            renderRecipeList(recipes);
        } catch (error) {
            console.error('Error fetching recipes:', error);
            recipeListContainer.innerHTML = '<p class="text-danger">Failed to load recipes.</p>';
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

    function renderRecipeList(recipes) {
        recipeListContainer.innerHTML = '';
        if (recipes.length === 0) {
            recipeListContainer.innerHTML = '<p class="text-muted p-3">No recipes match the current filters.</p>';
            return;
        }

        recipes.forEach(recipe => {
            const recipeElementWrapper = document.createElement('div');
            recipeElementWrapper.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            recipeElementWrapper.setAttribute('data-recipe-id', recipe.id); // Add ID for easier removal

            const author = recipe.author_name || 'N/A';
            const subject = recipe.subject_name || 'N/A';
            const statusBadge = getStatusBadge(recipe.status);

            // Staff-only delete button
            const deleteButtonHTML = userIsStaff ? `
                <button class="delete-recipe-btn" data-recipe-id="${recipe.id}" title="Delete Recipe">
                    <i class="bi bi-trash-fill"></i>
                </button>
            ` : '';
            
            recipeElementWrapper.innerHTML = `
                <a href="/recipes/${recipe.id}/" class="text-decoration-none text-dark flex-grow-1">
                    <div>
                        <strong>${recipe.title}</strong>
                        <div class="text-muted small mt-1">
                            Subject: ${subject} | Author: ${author}
                        </div>
                    </div>
                </a>
                <div class="d-flex align-items-center">
                    <div class="d-flex flex-column align-items-end me-3">
                        ${statusBadge}
                        <span class="badge bg-primary rounded-pill mt-1">View</span>
                    </div>
                    ${deleteButtonHTML}
                </div>
            `;
            recipeListContainer.appendChild(recipeElementWrapper);
        });
    }
    
    // --- 4. Deletion Logic ---

    // Function to handle the actual deletion via API
    async function handleDeleteRecipe() {
        if (!recipeIdToDelete) return;

        // Note: You need a way to get the CSRF token for POST/DELETE requests in Django
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]')?.value;

        try {
            // Assumes your API URL for deletion is like /api/recipes/<id>/delete/
            // Ensure this URL is provided in `api_urls` from your Django view.
            const response = await fetch(`${apiUrls.recipe_delete.replace('0', recipeIdToDelete)}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': csrfToken,
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                // Remove the recipe from the list on success
                const elementToRemove = recipeListContainer.querySelector(`[data-recipe-id='${recipeIdToDelete}']`);
                if (elementToRemove) {
                    elementToRemove.remove();
                }
            } else {
                throw new Error('Failed to delete the recipe.');
            }
        } catch (error) {
            console.error('Deletion error:', error);
            alert(error.message); // Simple error feedback
        } finally {
            deleteModal.hide();
            recipeIdToDelete = null;
        }
    }

    // --- 5. Add Event Listeners ---

    [curriculumSelect, languageSelect, subjectSelect, topicSelect].forEach(select => {
        select.addEventListener('change', () => {
            if (select === curriculumSelect || select === languageSelect) updateSubjectOptions();
            if (select === subjectSelect) updateTopicOptions();
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(fetchAndDisplayRecipes, 300);
        });
    });
    
    // Event delegation for delete buttons
    recipeListContainer.addEventListener('click', function(event) {
        const deleteButton = event.target.closest('.delete-recipe-btn');
        if (deleteButton) {
            event.preventDefault(); // Stop navigation if the parent is a link
            event.stopPropagation();
            recipeIdToDelete = deleteButton.dataset.recipeId;
            deleteModal.show();
        }
    });

    confirmDeleteBtn.addEventListener('click', handleDeleteRecipe);


    // --- 6. Initialization ---
    updateSubjectOptions();
    fetchAndDisplayRecipes();
});