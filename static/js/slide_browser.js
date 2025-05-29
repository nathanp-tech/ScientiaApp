/**
 * @file slide_browser.js
 * @description Handles the slide browser page: filtering, listing, and displaying slideshows.
 */
document.addEventListener('DOMContentLoaded', function() {

    // --- 1. Get Initial Data and DOM Elements ---
    const initialData = JSON.parse(document.getElementById('initial-data-for-filters-json').textContent);
    const apiUrls = JSON.parse(document.getElementById('api-urls-for-js-json').textContent);
    const logoPath = initialData.logo_path || '/static/img/logo.png';

    const curriculumSelect = document.getElementById('curriculum-select');
    const languageSelect = document.getElementById('language-select');
    const subjectSelect = document.getElementById('subject-select');
    const topicSelect = document.getElementById('topic-select');

    const slideshowListContainer = document.getElementById('slideshow-list-container');
    const slideshowPlayerContainer = document.getElementById('slideshow-player-container');
    const slideDisplayAreaWrapper = document.getElementById('slide-display-area-wrapper'); 
    const slideDisplayArea = document.getElementById('slide-display-area');
    const slideshowTitleDisplay = document.getElementById('slideshow-title-display');
    const slideshowControls = document.getElementById('slideshow-controls');
    const prevSlideBtn = document.getElementById('prev-slide-btn');
    const nextSlideBtn = document.getElementById('next-slide-btn');
    const slideCounter = document.getElementById('slide-counter');
    const loadingSpinnerList = document.getElementById('loading-spinner-list');
    const loadingSpinnerPlayer = document.getElementById('loading-spinner-player');
    const fullscreenBtn = document.getElementById('fullscreen-btn'); 

    let currentSlideshow = null;
    let currentSlideIndex = 0;
    let debounceTimeout;

    // --- 2. Dependent Filter Logic ---
    function updateSubjectOptions() {
        const curriculumId = curriculumSelect.value;
        const languageId = languageSelect.value;
        const previousValue = subjectSelect.value;
        subjectSelect.innerHTML = '<option value="">All Subjects</option>'; 
        subjectSelect.disabled = !(curriculumId && languageId);

        if (curriculumId && languageId) {
            initialData.subjects.forEach(subject => {
                if (String(subject.curriculum_id) === curriculumId && String(subject.language_id) === languageId) {
                    const option = new Option(`${subject.name} (${subject.level === 1 ? 'SL' : 'HL'})`, subject.id);
                    subjectSelect.add(option);
                }
            });
            subjectSelect.value = previousValue;
        }
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
            topicSelect.value = previousValue;
        }
    }

    // --- 3. Fetching and Displaying Slideshow List ---
    async function fetchAndDisplaySlideshowList() {
        loadingSpinnerList.style.display = 'inline-block';
        slideshowListContainer.innerHTML = '<p class="text-muted p-3">Loading slideshows...</p>';

        const params = new URLSearchParams({
            curriculum: curriculumSelect.value,
            language: languageSelect.value,
            subject: subjectSelect.value,
            topic: topicSelect.value,
        });
        for (let [key, value] of params.entries()) {
            if (!value) params.delete(key);
        }

        try {
            const response = await fetch(`${apiUrls.slideshows_api}?${params.toString()}`);
            if (!response.ok) throw new Error(`Network response was not ok: ${response.statusText}`);
            const slideshows = await response.json();
            renderSlideshowList(slideshows);
        } catch (error) {
            console.error('Error fetching slideshow list:', error);
            slideshowListContainer.innerHTML = '<p class="text-danger p-3">Failed to load slideshows. Please try again.</p>';
        } finally {
            loadingSpinnerList.style.display = 'none';
        }
    }

    function renderSlideshowList(slideshows) {
        slideshowListContainer.innerHTML = ''; 
        if (slideshows.length === 0) {
            slideshowListContainer.innerHTML = '<p class="text-muted p-3">No slideshows match the current filters.</p>';
            return;
        }
        slideshows.forEach(slideshow => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'list-group-item list-group-item-action';
            item.textContent = slideshow.title || `Slideshow ID: ${slideshow.id}`;
            item.dataset.slideshowId = slideshow.id;
            item.addEventListener('click', () => loadAndDisplaySlideshow(slideshow.id));
            slideshowListContainer.appendChild(item);
        });
    }

    // --- 4. Loading and Displaying a Single Slideshow ---
    async function loadAndDisplaySlideshow(slideshowId) {
        if (!slideshowId) return;
        loadingSpinnerPlayer.style.display = 'inline-block';
        slideDisplayArea.innerHTML = '<p class="text-muted text-center p-5">Loading slideshow...</p>';
        slideshowControls.style.display = 'none';
        slideshowTitleDisplay.textContent = 'Loading...';

        slideshowListContainer.querySelectorAll('.list-group-item-action').forEach(btn => {
            btn.classList.remove('active');
            if (btn.dataset.slideshowId === String(slideshowId)) {
                btn.classList.add('active');
            }
        });

        try {
            const detailUrl = `${apiUrls.slideshow_detail_api_base}${slideshowId}/`;
            const response = await fetch(detailUrl);
            if (!response.ok) throw new Error(`Network response for slideshow detail was not ok: ${response.statusText}`);
            currentSlideshow = await response.json();
            
            if (currentSlideshow && currentSlideshow.blocks && currentSlideshow.blocks.length > 0) {
                currentSlideshow.blocks.sort((a, b) => a.order - b.order); 
                currentSlideIndex = 0;
                displayCurrentSlide();
                slideshowTitleDisplay.textContent = currentSlideshow.title || 'Untitled Slideshow';
                slideshowControls.style.display = 'flex'; 
                if(fullscreenBtn) fullscreenBtn.style.display = 'inline-block'; 
            } else {
                slideDisplayArea.innerHTML = '<p class="text-danger text-center p-5">This slideshow has no content or could not be loaded.</p>';
                slideshowTitleDisplay.textContent = 'Error';
                 if(fullscreenBtn) fullscreenBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading slideshow detail:', error);
            slideDisplayArea.innerHTML = '<p class="text-danger text-center p-5">Failed to load slideshow. Please try again.</p>';
            slideshowTitleDisplay.textContent = 'Error Loading';
            if(fullscreenBtn) fullscreenBtn.style.display = 'none';
        } finally {
            loadingSpinnerPlayer.style.display = 'none';
        }
    }

    function displayCurrentSlide() {
        if (!currentSlideshow || !currentSlideshow.blocks || currentSlideshow.blocks.length === 0) {
            slideDisplayArea.innerHTML = '<p class="text-muted text-center p-5">No slides to display.</p>';
            slideshowControls.style.display = 'none';
            if(fullscreenBtn) fullscreenBtn.style.display = 'none';
            return;
        }

        const slideBlock = currentSlideshow.blocks[currentSlideIndex];
        slideDisplayArea.innerHTML = slideBlock.content_html; 

        // --- MATHJAX UPDATE ---
        // Ensure MathJax is ready before attempting to typeset
        if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            // If MathJax is already loaded and typesetPromise is available
            window.MathJax.typesetPromise([slideDisplayArea]).catch((err) => console.error('MathJax typesetting error (direct):', err));
        } else if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
            // If MathJax is still starting up, wait for its promise
            window.MathJax.startup.promise.then(() => {
                if (typeof window.MathJax.typesetPromise === 'function') {
                    window.MathJax.typesetPromise([slideDisplayArea]).catch((err) => console.error('MathJax typesetting error (startup.promise):', err));
                } else {
                    console.error('MathJax loaded, but typesetPromise is not a function after startup.');
                }
            }).catch(err => console.error('MathJax startup promise error:', err));
        } else {
            // MathJax not found or not configured as expected
            // console.warn('MathJax not available or not configured for typesetting.');
        }
        // --- END MATHJAX UPDATE ---

        const slideElement = slideDisplayArea.querySelector('.slide'); 
        if (slideElement && slideElement.classList.contains('quiz-slide')) {
            setupQuizInteraction(slideElement); 
        }
        
        updateSlideControls();
    }

    function updateSlideControls() {
        if (!currentSlideshow || currentSlideshow.blocks.length === 0) return;
        slideCounter.textContent = `Slide ${currentSlideIndex + 1} of ${currentSlideshow.blocks.length}`;
        prevSlideBtn.disabled = currentSlideIndex === 0;
        nextSlideBtn.disabled = currentSlideIndex === currentSlideshow.blocks.length - 1;
    }

    // --- 5. Quiz Interaction Logic ---
    function setupQuizInteraction(quizSlideElement) {
        const options = quizSlideElement.querySelectorAll('.option');
        let submitBtn = quizSlideElement.querySelector('.submit-quiz-btn'); // Use let for re-assignment after cloning
        let retakeBtn = quizSlideElement.querySelector('.retake-quiz-btn'); // Use let for re-assignment
        const feedback = quizSlideElement.querySelector('.feedback');

        if (!options.length || !submitBtn || !feedback) {
            return;
        }

        function resetQuizState() {
            quizSlideElement.querySelectorAll('.option').forEach(o => o.classList.remove('selected', 'correct', 'incorrect'));
            feedback.textContent = '';
            feedback.className = 'feedback'; 
            
            const currentSubmitBtn = quizSlideElement.querySelector('.submit-quiz-btn'); // Re-select in case it was cloned
            const currentRetakeBtn = quizSlideElement.querySelector('.retake-quiz-btn'); // Re-select

            if (currentSubmitBtn) currentSubmitBtn.style.display = 'inline-block';
            if (currentRetakeBtn) currentRetakeBtn.style.display = 'none'; 
            quizSlideElement.classList.remove('submitted');
        }
        resetQuizState(); 

        const clonedOptions = [];
        options.forEach(opt => {
            const newOpt = opt.cloneNode(true);
            opt.parentNode.replaceChild(newOpt, opt);
            newOpt.addEventListener('click', () => {
                if (!quizSlideElement.classList.contains('submitted')) {
                    newOpt.classList.toggle('selected');
                }
            });
            clonedOptions.push(newOpt);
        });
        
        const newSubmitBtn = submitBtn.cloneNode(true);
        submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
        submitBtn = newSubmitBtn; // Update reference

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

            // Handle retake button
            const currentRetakeBtnInScope = quizSlideElement.querySelector('.retake-quiz-btn');
            if (currentRetakeBtnInScope) { // Check if retake button exists in the template
                const newRetakeBtn = currentRetakeBtnInScope.cloneNode(true);
                currentRetakeBtnInScope.parentNode.replaceChild(newRetakeBtn, currentRetakeBtnInScope);
                retakeBtn = newRetakeBtn; // Update reference
                
                retakeBtn.style.display = 'inline-block';
                retakeBtn.addEventListener('click', resetQuizState); 
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

    // --- 6. Fullscreen Functionality ---
    function toggleFullscreen() {
        const elemToFullscreen = slideshowPlayerContainer; 

        if (!document.fullscreenElement &&    
            !document.mozFullScreenElement && 
            !document.webkitFullscreenElement && 
            !document.msFullscreenElement) {  
            if (elemToFullscreen.requestFullscreen) {
                elemToFullscreen.requestFullscreen();
            } else if (elemToFullscreen.mozRequestFullScreen) { 
                elemToFullscreen.mozRequestFullScreen();
            } else if (elemToFullscreen.webkitRequestFullscreen) { 
                elemToFullscreen.webkitRequestFullscreen();
            } else if (elemToFullscreen.msRequestFullscreen) { 
                elemToFullscreen.msRequestFullscreen();
            }
            fullscreenBtn.innerHTML = '<i class="bi bi-fullscreen-exit"></i>';
            fullscreenBtn.title = 'Exit Fullscreen';
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.mozCancelFullScreen) { 
                document.mozCancelFullScreen();
            } else if (document.webkitExitFullscreen) { 
                document.webkitExitFullscreen();
            } else if (document.msExitFullscreen) { 
                document.msExitFullscreen();
            }
            fullscreenBtn.innerHTML = '<i class="bi bi-fullscreen"></i>';
            fullscreenBtn.title = 'Toggle Fullscreen';
        }
    }
    
    // --- 7. Event Listeners ---
    [curriculumSelect, languageSelect, subjectSelect, topicSelect].forEach(select => {
        select.addEventListener('change', () => {
            if (select === curriculumSelect || select === languageSelect) updateSubjectOptions();
            if (select === subjectSelect) updateTopicOptions();
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(fetchAndDisplaySlideshowList, 300);
        });
    });

    prevSlideBtn.addEventListener('click', () => {
        if (currentSlideIndex > 0) { currentSlideIndex--; displayCurrentSlide(); }
    });
    nextSlideBtn.addEventListener('click', () => {
        if (currentSlideshow && currentSlideIndex < currentSlideshow.blocks.length - 1) {
            currentSlideIndex++; displayCurrentSlide();
        }
    });
    if(fullscreenBtn) { 
        fullscreenBtn.addEventListener('click', toggleFullscreen);
        fullscreenBtn.style.display = 'none'; 
    }

    // --- 8. Initialization ---
    updateSubjectOptions(); 
    fetchAndDisplaySlideshowList(); 
});
