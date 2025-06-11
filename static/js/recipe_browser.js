// static/js/recipe_browser.js
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. Get Data and DOM Elements ---
    const initialData = JSON.parse(document.getElementById('initial-data-json').textContent);
    const apiUrls = JSON.parse(document.getElementById('api-urls-json').textContent);

    const curriculumSelect = document.getElementById('curriculum-select');
    const languageSelect = document.getElementById('language-select');
    const subjectSelect = document.getElementById('subject-select');
    const topicSelect = document.getElementById('topic-select');
    
    const recipeListContainer = document.getElementById('recipe-list-container');
    const loadingSpinner = document.getElementById('loading-spinner');

    let debounceTimeout;

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
        subjectSelect.value = previousValue; // Attempt to restore previous selection
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
        
        // Clean up empty parameters
        for (let [key, value] of params.entries()) {
            if (!value) {
                params.delete(key);
            }
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
            const recipeElement = document.createElement('a');
            recipeElement.href = `/recipes/${recipe.id}/`; // Link to the detail page
            recipeElement.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
            
            const author = recipe.author_name || 'N/A';
            const subject = recipe.subject_name || 'N/A';

            // Assuming API returns a `status` field, e.g., 'in_progress'
            const statusBadge = getStatusBadge(recipe.status);

            recipeElement.innerHTML = `
                <div>
                    <strong>${recipe.title}</strong>
                    <div class="text-muted small mt-1">
                        Subject: ${subject} | Author: ${author}
                    </div>
                </div>
                <div class="d-flex flex-column align-items-end">
                    ${statusBadge}
                    <span class="badge bg-primary rounded-pill mt-1">View</span>
                </div>
            `;
            recipeListContainer.appendChild(recipeElement);
        });
    }

    // --- 4. Add Event Listeners ---

    [curriculumSelect, languageSelect, subjectSelect, topicSelect].forEach(select => {
        select.addEventListener('change', () => {
             // Trigger dependent dropdown updates if needed
            if (select === curriculumSelect || select === languageSelect) {
                updateSubjectOptions();
            }
            if (select === subjectSelect) {
                updateTopicOptions();
            }
            // Use a debounce to avoid flooding the API while the user is selecting
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(fetchAndDisplayRecipes, 300);
        });
    });

    // --- 5. Initialization ---
    updateSubjectOptions();
    fetchAndDisplayRecipes(); // Load initial recipes (unfiltered)
});