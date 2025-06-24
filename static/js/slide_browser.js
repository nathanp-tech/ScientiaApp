// static/js/slide_browser.js
document.addEventListener('DOMContentLoaded', function() {
    
    // --- 1. Get Data and DOM Elements ---
    const initialData = JSON.parse(document.getElementById('initial-data-for-filters-json').textContent);
    const apiUrls = JSON.parse(document.getElementById('api-urls-for-js-json').textContent);
    const userIsStaff = JSON.parse(document.getElementById('user-is-staff-json').textContent);

    const curriculumSelect = document.getElementById('curriculum-select');
    const languageSelect = document.getElementById('language-select');
    const subjectSelect = document.getElementById('subject-select');
    const listContainer = document.getElementById('slideshow-list-container');
    const loadingSpinnerList = document.getElementById('loading-spinner-list');
    
    const playerContainer = document.getElementById('slideshow-player-container');
    const displayArea = document.getElementById('slide-display-area');
    const slideshowTitleDisplay = document.getElementById('slideshow-title-display');
    const prevBtn = document.getElementById('prev-slide-btn');
    const nextBtn = document.getElementById('next-slide-btn');
    const counterEl = document.getElementById('slide-counter');
    const controlsContainer = document.getElementById('slideshow-controls');
    const loadingSpinnerPlayer = document.getElementById('loading-spinner-player');
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    const fullscreenEnterIcon = document.getElementById('fullscreen-enter-icon');
    const fullscreenExitIcon = document.getElementById('fullscreen-exit-icon');
    
    const deleteModal = new bootstrap.Modal(document.getElementById('deleteConfirmationModal'));
    const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
    
    let itemToDeleteId = null;
    let debounceTimeout;
    let activeSlideshowData = null;
    let currentSlideIndex = 0;

    // --- 2. BROWSER/LIST LOGIC ---
    function populateFilters() {
        populateSelect(curriculumSelect, initialData.curriculums, 'All Curriculums', 'id', 'name');
        populateSelect(languageSelect, initialData.languages, 'All Languages', 'id', 'name');
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
        subjectSelect.innerHTML = '<option value="">All Subjects</option>';
        subjectSelect.disabled = !curriculumId || !languageId;
        if (curriculumId && languageId) {
            const filteredSubjects = initialData.subjects.filter(s => s.curriculum_id == curriculumId && s.language_id == languageId);
            populateSelect(subjectSelect, filteredSubjects, 'All Subjects', 'id', 'name');
        }
        
    }


    async function fetchAndDisplaySlideshows() {
        loadingSpinnerList.style.display = 'block';
        const params = new URLSearchParams({ curriculum: curriculumSelect.value, language: languageSelect.value, subject: subjectSelect.value });
        const filteredParams = new URLSearchParams(Array.from(params.entries()).filter(([, value]) => value));
        
        try {
            const response = await fetch(`${apiUrls.slideshows}?${filteredParams.toString()}`);
            if (!response.ok) throw new Error(`Server responded with status ${response.status}`);
            const data = await response.json();
            renderSlideshowList(data);
        } catch (error) {
            console.error('Error fetching slideshows:', error);
            listContainer.innerHTML = '<p class="text-danger p-3">Failed to load slideshows.</p>';
        } finally {
            loadingSpinnerList.style.display = 'none';
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

    function renderSlideshowList(slideshows) {
        listContainer.innerHTML = '';
        if (slideshows.length === 0) {
            listContainer.innerHTML = '<p class="text-muted p-3">No slideshows match the current filters.</p>';
            return;
        }

        slideshows.forEach(slideshow => {
            const itemElement = document.createElement('div');
            itemElement.className = 'list-group-item list-group-item-action';
            itemElement.dataset.slideshowId = slideshow.id;

            let detailsHTML = `<div class="text-muted small mt-1">Subject: ${slideshow.subject_name || 'N/A'}</div>`;
            let adminActionsHTML = '';

            if (userIsStaff) {
                const author = slideshow.author_name || 'N/A';
                detailsHTML = `<div class="text-muted small mt-1">Subject: ${slideshow.subject_name || 'N/A'} | Author: ${author}</div>`;
                const statusBadge = getStatusBadge(slideshow.status);
                adminActionsHTML = `<div class="admin-actions">${statusBadge}<a href="/slides/create/?id=${slideshow.id}" class="edit-slideshow-btn" title="Edit Slideshow"><i class="bi bi-pencil-fill"></i></a><button class="delete-slideshow-btn" data-slideshow-id="${slideshow.id}" title="Delete Slideshow"><i class="bi bi-trash-fill"></i></button></div>`;
            }

            itemElement.innerHTML = `<div class="d-flex w-100 justify-content-between align-items-center"><div><strong>${slideshow.title}</strong>${detailsHTML}</div>${adminActionsHTML}</div>`;
            listContainer.appendChild(itemElement);
        });
    }

    // --- 3. PLAYER LOGIC ---
    async function loadAndDisplaySlideshow(slideshowId) {
        loadingSpinnerPlayer.style.display = 'block';
        displayArea.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><div class="spinner-border text-light" role="status"></div></div>';
        controlsContainer.style.display = 'none';
        fullscreenBtn.style.display = 'none';
        slideshowTitleDisplay.textContent = 'Loading...';

        document.querySelectorAll('#slideshow-list-container .list-group-item').forEach(el => {
            el.classList.toggle('active', el.dataset.slideshowId === slideshowId);
        });

        try {
            const response = await fetch(`${apiUrls.slideshow_detail_base}${slideshowId}/`);
            if (!response.ok) throw new Error('Failed to load slideshow details.');
            activeSlideshowData = await response.json();
            
            slideshowTitleDisplay.textContent = activeSlideshowData.title;
            currentSlideIndex = 0;
            renderCurrentSlide();
            controlsContainer.style.display = 'flex';
            fullscreenBtn.style.display = 'inline-block';
        } catch (error) {
            console.error('Error loading slideshow:', error);
            displayArea.innerHTML = `<p class="text-danger p-3">${error.message}</p>`;
        } finally {
            loadingSpinnerPlayer.style.display = 'none';
        }
    }

    function renderCurrentSlide() {
        const slides = activeSlideshowData.blocks || [];
        if (slides.length === 0) {
            displayArea.innerHTML = '<div class="d-flex justify-content-center align-items-center h-100"><p class="text-white">This slideshow has no slides.</p></div>';
            counterEl.textContent = 'Slide 0 / 0';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }

        const currentSlide = slides[currentSlideIndex];
        displayArea.innerHTML = currentSlide.content_html;

        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([displayArea]);
        }

        counterEl.textContent = `Slide ${currentSlideIndex + 1} / ${slides.length}`;
        prevBtn.disabled = (currentSlideIndex === 0);
        nextBtn.disabled = (currentSlideIndex === slides.length - 1);
    }

    function goToNextSlide() {
        if (activeSlideshowData && currentSlideIndex < activeSlideshowData.blocks.length - 1) {
            currentSlideIndex++;
            renderCurrentSlide();
        }
    }
    
    function goToPrevSlide() {
        if (activeSlideshowData && currentSlideIndex > 0) {
            currentSlideIndex--;
            renderCurrentSlide();
        }
    }

    // --- 4. FULLSCREEN AND DELETION LOGIC ---
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            playerContainer.requestFullscreen().catch(err => {
                alert(`Error attempting to enable full-screen mode: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    function updateFullscreenIcons() {
        const isFullscreen = !!document.fullscreenElement;
        fullscreenEnterIcon.style.display = isFullscreen ? 'none' : 'inline-block';
        fullscreenExitIcon.style.display = isFullscreen ? 'inline-block' : 'none';
    }

    async function handleDelete() {
        if (!itemToDeleteId) return;
        const csrfToken = document.querySelector('[name=csrfmiddlewaretoken]').value;
        const deleteUrl = `${apiUrls.slideshow_detail_base}${itemToDeleteId}/`;
        try {
            const response = await fetch(deleteUrl, { method: 'DELETE', headers: { 'X-CSRFToken': csrfToken } });
            if (response.ok) {
                document.querySelector(`[data-slideshow-id='${itemToDeleteId}']`)?.remove();
            } else {
                alert('Failed to delete slideshow.');
            }
        } catch (error) {
            console.error('Deletion error:', error);
        } finally {
            deleteModal.hide();
            itemToDeleteId = null;
        }
    }

    // --- 5. EVENT LISTENERS ---
    confirmDeleteBtn.addEventListener('click', handleDelete);
    
    listContainer.addEventListener('click', e => {
        const deleteButton = e.target.closest('.delete-slideshow-btn');
        const slideshowItem = e.target.closest('.list-group-item');
        if (deleteButton) {
            e.preventDefault();
            e.stopPropagation();
            itemToDeleteId = deleteButton.dataset.slideshowId;
            deleteModal.show();
        } else if (slideshowItem) {
            loadAndDisplaySlideshow(slideshowItem.dataset.slideshowId);
        }
    });

    [curriculumSelect, languageSelect, subjectSelect].forEach(selectElement => {
        selectElement.addEventListener('change', (event) => {
            if (['curriculum-select', 'language-select'].includes(event.target.id)) { updateSubjectOptions(); }
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(fetchAndDisplaySlideshows, 300);
        });
    });
    
    prevBtn.addEventListener('click', goToPrevSlide);
    nextBtn.addEventListener('click', goToNextSlide);
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    document.addEventListener('fullscreenchange', updateFullscreenIcons);
    document.addEventListener('keydown', (event) => {
        if (activeSlideshowData) {
            if (event.key === 'ArrowRight') goToNextSlide();
            else if (event.key === 'ArrowLeft') goToPrevSlide();
        }
    });

    playerContainer.addEventListener('click', function(e) {
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
    // 6. QUIZ HELPER FUNCTIONS
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
    // 7. INITIALIZATION
    // =========================================================================
    populateFilters();
    updateSubjectOptions();
    fetchAndDisplaySlideshows();
});