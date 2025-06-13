// Wait for the DOM to be fully loaded and parsed
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM fully loaded. Initializing calculator script.");

    function injectDynamicStyles() {
        if (document.getElementById('custom-dynamic-styles')) return;
        
        const style = document.createElement('style');
        style.id = 'custom-dynamic-styles';
        style.innerHTML = `
            /* Spacing & Layout Styles */
            #calculator-content-display .button-container { margin-top: 1rem; margin-bottom: 2.5rem; }
            #calculator-content-display h2 { margin-top: 2.5rem; margin-bottom: 1.5rem; }
            #calculator-content-display p { margin-top: 1rem; margin-bottom: 1.25rem; line-height: 1.6; }
            #calculator-content-display .content-container:first-of-type h2:first-of-type,
            #calculator-content-display > h2:first-of-type { margin-top: 0.5rem; }
            /* Step-by-Step List Styles */
            #calculator-content-display ol.list-group-numbered { border: 0; counter-reset: list-item; padding-left: 0; }
            #calculator-content-display .list-group-item { display: flex; align-items: flex-start; margin-bottom: 1.5rem; background-color: #ffffff; border: 1px solid #dee2e6; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 2px 5px rgba(0,0,0,0.05); }
            #calculator-content-display .list-group-item:last-child { margin-bottom: 0; }
            #calculator-content-display ol.list-group-numbered > .list-group-item::before { counter-increment: list-item; content: counter(list-item); background-color: #050263; color: white; font-weight: bold; font-size: 1.25rem; border-radius: 50%; width: 45px; height: 45px; min-width: 45px; margin-right: 1.5rem; display: inline-flex; align-items: center; justify-content: center; }
            /* Wrapper for step content to ensure proper flex alignment */
            #calculator-content-display .list-group-item > div { flex: 1; }
        `;
        document.head.appendChild(style);
    }

    // --- NEW FUNCTION: Wraps step content in a div for proper alignment ---
    function structureStepContent(container) {
        if (!container) return;
        const listItems = container.querySelectorAll('ol.list-group-numbered .list-group-item');

        listItems.forEach(item => {
            // Check if this has been done already to prevent errors
            if (item.dataset.structured) return;

            const contentWrapper = document.createElement('div');
            // Move all existing children of the list item into the new wrapper
            while (item.firstChild) {
                contentWrapper.appendChild(item.firstChild);
            }
            // Append the new wrapper back to the list item
            item.appendChild(contentWrapper);
            // Mark as done
            item.dataset.structured = 'true';
        });
    }

    function attachAnchorLinkListeners(container) {
        if (!container) return;
        const anchorLinks = container.querySelectorAll('.button-container a[href^="#"]');
        
        anchorLinks.forEach(link => {
            if (link.dataset.anchorListenerAttached) return;
            link.addEventListener('click', function(event) {
                event.preventDefault();
                const targetId = this.getAttribute('href');
                try {
                    const targetElement = document.querySelector(targetId);
                    if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }
                } catch(e) { console.error("Invalid selector for anchor link: ", targetId, e); }
            });
            link.dataset.anchorListenerAttached = 'true';
        });
    }

    const dataContainer = document.getElementById('calculator-data-container');
    const contentDisplay = document.getElementById('calculator-content-display');
    const pageSubtitle = document.getElementById('calculator-page-subtitle');
    const loadingIndicator = document.getElementById('loading-indicator');
    const initialPlaceholder = document.getElementById('initial-placeholder');
    const initialHtmlTemplate = document.getElementById('initial-html-content-template');
    const initialHtmlContentPassed = initialHtmlTemplate ? initialHtmlTemplate.innerHTML : "";
    
    if (!dataContainer) {
        console.error("CRITICAL ERROR: calculator-data-container not found.");
        return;
    }
    
    const initialFilename = dataContainer.dataset.initialFilename || '';
    const currentPageTitleForSubtitle = dataContainer.dataset.currentPageTitleForSubtitle;
    const basePageTitle = dataContainer.dataset.pageTitle || "Calculator Manual";
    const djangoStaticUrl = dataContainer.dataset.staticUrl || "/static/"; 
    const calculatorSpecificImageBasePath = dataContainer.dataset.calculatorImageBasePath || "img/calculator_pics/"; 
    const apiBaseUrl = dataContainer.dataset.apiBaseUrl;
    const interactiveIndexBaseUrl = dataContainer.dataset.interactiveIndexBaseUrl;
    const interactiveIndexWithFileBaseUrl = dataContainer.dataset.interactiveIndexWithFileBaseUrl;

    let mathJaxIsReady = false;
    document.addEventListener('mathJaxReadyForCalculator', () => {
        mathJaxIsReady = true;
        if (contentDisplay && contentDisplay.innerHTML && contentDisplay.dataset.mathjaxProcessed === 'false') {
            typesetMath(contentDisplay);
            contentDisplay.dataset.mathjaxProcessed = 'true';
        }
    });
    
    function extractAndCleanBodyContent(htmlString) {
        if (!htmlString || typeof htmlString !== 'string') { return ""; }
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const body = doc.body;

        if (body) {
            const images = body.querySelectorAll('img');
            images.forEach(img => {
                let src = img.getAttribute('src');
                if (src && src.startsWith('../pics/')) {
                    const imageRelativePath = src.substring('../pics/'.length);
                    let newSrc = `${djangoStaticUrl.replace(/\/$/, '')}/${calculatorSpecificImageBasePath.replace(/\/$/, '')}/${imageRelativePath}`;
                    img.setAttribute('src', newSrc.replace(/([^:]\/)\/+/g, "$1"));
                }
            });

            const selectorsToRemove = ['.banner', 'nav.navbar:not(#calculatorSubNav)', 'footer.footer', 'script', 'style', 'link[rel="stylesheet"]', 'head' ];
            selectorsToRemove.forEach(selector => {
                body.querySelectorAll(selector).forEach(el => el.remove());
            });
            return body.innerHTML.trim();
        }
        return "";
    }

    function typesetMath(element) {
        if (!element || !element.innerHTML.trim()) return;
        if (mathJaxIsReady && window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            if (typeof window.MathJax.typesetClear === 'function') {
                window.MathJax.typesetClear([element]);
            }
            window.MathJax.typesetPromise([element]).catch((err) => console.error('MathJax typesetting error:', err));
        } else if (!mathJaxIsReady) {
            console.warn("MathJax not ready yet for typesetting. It will run when the library is loaded.");
        }
    }
    
    function handleInitialContentDisplay() {
        if (initialPlaceholder) initialPlaceholder.style.display = 'none';
        
        if (initialFilename && initialHtmlContentPassed && initialHtmlContentPassed.trim() !== '') {
            let processedContent = initialHtmlContentPassed.trim().startsWith("<p class='text-danger text-center'>") 
                ? initialHtmlContentPassed 
                : extractAndCleanBodyContent(initialHtmlContentPassed);
            
            contentDisplay.innerHTML = processedContent;
            contentDisplay.dataset.mathjaxProcessed = 'false'; 
            
            // --- Call helper functions AFTER content is loaded ---
            structureStepContent(contentDisplay);
            attachAnchorLinkListeners(contentDisplay);
            
            if (pageSubtitle) pageSubtitle.innerHTML = `Currently viewing: <strong>${currentPageTitleForSubtitle || initialFilename}</strong>`;
            document.title = `${currentPageTitleForSubtitle || initialFilename} - ${basePageTitle}`;
            if (mathJaxIsReady) {
                typesetMath(contentDisplay);
                contentDisplay.dataset.mathjaxProcessed = 'true';
            }
        } else {
             if (initialPlaceholder) initialPlaceholder.style.display = 'block';
             if (pageSubtitle) pageSubtitle.innerHTML = 'Select a topic from the navigation below.';
        }
    }

    async function loadContent(filename, newPageTitleFromLink) {
        if (!filename) return;
        if (initialPlaceholder) initialPlaceholder.style.display = 'none';
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        contentDisplay.innerHTML = '';
        try {
            const apiUrlResolved = apiBaseUrl.replace('PLACEHOLDER_FILENAME', filename);
            const response = await fetch(apiUrlResolved);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            const data = await response.json();
            
            if (data.html_content) {
                const cleanedContent = extractAndCleanBodyContent(data.html_content);
                contentDisplay.innerHTML = cleanedContent;
                contentDisplay.dataset.mathjaxProcessed = 'false';
                
                // --- Call helper functions AFTER content is loaded ---
                structureStepContent(contentDisplay);
                attachAnchorLinkListeners(contentDisplay);

                const effectiveTitle = data.title || newPageTitleFromLink;
                if (pageSubtitle) pageSubtitle.innerHTML = `Currently viewing: <strong>${effectiveTitle}</strong>`;
                
                const newUrl = interactiveIndexWithFileBaseUrl.replace('PLACEHOLDER_FILENAME', filename);
                history.pushState({ filename: filename, title: effectiveTitle }, `${effectiveTitle} - ${basePageTitle}`, newUrl);
                document.title = `${effectiveTitle} - ${basePageTitle}`;
                typesetMath(contentDisplay); 
                contentDisplay.dataset.mathjaxProcessed = 'true';

            } else if (data.error) {
                contentDisplay.innerHTML = `<p class="text-danger text-center">${data.error}</p>`;
            }
        } catch (error) {
            console.error('Error in loadContent:', error);
            contentDisplay.innerHTML = `<p class="text-danger text-center">Failed to load content for ${filename}.</p>`;
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    function attachNavEventListeners() {
        const navLinks = document.querySelectorAll('.calculator-nav-link');
        navLinks.forEach(link => {
            if (link.dataset.listenerAttached === 'true') return;
            link.addEventListener('click', function (event) {
                event.preventDefault();
                const filename = this.dataset.filename;
                const pageTitleFromLink = this.textContent || filename;
                loadContent(filename, pageTitleFromLink);
            });
            link.dataset.listenerAttached = 'true'; 
        });
    }

    // --- Initialization Sequence ---
    injectDynamicStyles();
    attachNavEventListeners();
    handleInitialContentDisplay();

    window.onpopstate = function(event) {
        if (event.state && event.state.filename) {
            loadContent(event.state.filename, event.state.title);
        } else {
            if (initialPlaceholder) {
                contentDisplay.innerHTML = ''; 
                initialPlaceholder.style.display = 'block';
                contentDisplay.appendChild(initialPlaceholder);
            }
            if (pageSubtitle) pageSubtitle.innerHTML = 'Select a topic from the navigation below.';
            document.title = basePageTitle;
        }
    };
});