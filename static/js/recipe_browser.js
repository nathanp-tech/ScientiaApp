// static/js/recipe_browser.js
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. Get Data and DOM Elements ---
    const initialData = JSON.parse(document.getElementById('initial-data-json').textContent);
    const apiUrls = JSON.parse(document.getElementById('api-urls-json').textContent);
    const userIsStaff = JSON.parse(document.getElementById('user-is-staff-json').textContent);

    const curriculumSelect = document.getElementById('curriculum-select');
    const languageSelect = document.getElementById('language-select');
    const subjectSelect = document.getElementById('subject-select');
    const topicSelect = $('#topic-select'); // Using jQuery for Select2
    
    const recipeListContainer = document.getElementById('recipe-list-container');
    const loadingSpinner = document.getElementById('loading-spinner');

    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmationModal'));
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    let recipeIdToDelete = null;
    let debounceTimeout;

    // Initialize Select2 on the topic dropdown
    topicSelect.select2({
        theme: 'bootstrap-5',
        placeholder: 'Select a Topic',
        allowClear: true
    });

    // --- 2. Dependent Filter Logic ---
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
        const previousValue = topicSelect.val();
        
        topicSelect.empty();
        topicSelect.prop('disabled', !subjectId);

        if (subjectId) {
            const relevantLabels = initialData.labels
                .filter(label => String(label.subject_id) === String(subjectId))
                .sort((a, b) => a.description.localeCompare(b.description, undefined, { numeric: true }));

            const hierarchicalData = buildHierarchy(relevantLabels);

            topicSelect.select2({
                theme: 'bootstrap-5',
                placeholder: 'Select a Topic',
                allowClear: true,
                data: hierarchicalData
            });
        } else {
             topicSelect.select2({
                theme: 'bootstrap-5',
                placeholder: 'Select Subject First',
                allowClear: true,
                data: []
            });
        }
        topicSelect.val(previousValue).trigger('change');
    }
    
    function buildHierarchy(labels) {
        const tree = [];
        const map = {};

        // Add an "All Topics" node at the beginning
        tree.push({ id: '', text: 'All Topics' });

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

    // --- 3. Data Fetching and Display Logic ---
    async function fetchAndDisplayRecipes() {
        loadingSpinner.style.display = 'block';
        const params = new URLSearchParams({
            curriculum: curriculumSelect.value,
            language: languageSelect.value,
            subject: subjectSelect.value,
            topic: topicSelect.val() // Use .val() for Select2
        });
        
        for (let [key, value] of params.entries()) { if (!value) params.delete(key); }

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
            const wrapper = document.createElement('div');
            wrapper.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            wrapper.setAttribute('data-recipe-id', recipe.id);
            const author = recipe.author_name || 'N/A';
            const subject = recipe.subject_name || 'N/A';
            const statusBadge = getStatusBadge(recipe.status);
            const deleteBtn = userIsStaff ? `<button class="delete-recipe-btn" data-recipe-id="${recipe.id}" title="Delete Recipe"><i class="bi bi-trash-fill"></i></button>` : '';
            wrapper.innerHTML = `
                <a href="/recipes/${recipe.id}/" class="text-decoration-none text-dark flex-grow-1 me-3">
                    <div>
                        <strong>${recipe.title}</strong>
                        <div class="text-muted small mt-1">Subject: ${subject} | Author: ${author}</div>
                    </div>
                </a>
                <div class="d-flex flex-column align-items-end">
                    <div class="d-flex align-items-center">${statusBadge}${deleteBtn}</div>
                    <span class="badge bg-primary rounded-pill mt-1">View</span>
                </div>`;
            recipeListContainer.appendChild(wrapper);
        });
    }
    
    // --- 4. Deletion Logic ---
    async function handleDeleteRecipe() {
        if (!recipeIdToDelete) return;
        const csrfToken = document.querySelector('input[name="csrfmiddlewaretoken"]')?.value;
        try {
            const deleteUrl = apiUrls.recipe_delete.replace('0', recipeIdToDelete);
            const response = await fetch(deleteUrl, {
                method: 'DELETE',
                headers: { 'X-CSRFToken': csrfToken, 'Content-Type': 'application/json' },
            });
            if (response.ok) {
                const elementToRemove = recipeListContainer.querySelector(`[data-recipe-id='${recipeIdToDelete}']`);
                if (elementToRemove) elementToRemove.remove();
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || 'Failed to delete the recipe.');
            }
        } catch (error) {
            console.error('Deletion error:', error);
            alert(error.message);
        } finally {
            deleteModal.hide();
            recipeIdToDelete = null;
        }
    }

    // --- 5. Event Listeners ---
    curriculumSelect.addEventListener('change', updateSubjectOptions);
    languageSelect.addEventListener('change', updateSubjectOptions);
    subjectSelect.addEventListener('change', updateTopicOptions);
    topicSelect.on('change', () => {
        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(fetchAndDisplayRecipes, 300);
    });
    
    recipeListContainer.addEventListener('click', function(event) {
        const deleteButton = event.target.closest('.delete-recipe-btn');
        if (deleteButton) {
            event.preventDefault();
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