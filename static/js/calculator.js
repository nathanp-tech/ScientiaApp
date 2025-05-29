// Wait for the DOM to be fully loaded and parsed
document.addEventListener('DOMContentLoaded', function () {
    console.log("DOM fully loaded. Initializing calculator script.");

    const dataContainer = document.getElementById('calculator-data-container');
    const contentDisplay = document.getElementById('calculator-content-display');
    const pageSubtitle = document.getElementById('calculator-page-subtitle');
    const loadingIndicator = document.getElementById('loading-indicator');
    const initialPlaceholder = document.getElementById('initial-placeholder');
    
    const initialHtmlTemplate = document.getElementById('initial-html-content-template');
    const initialHtmlContentPassed = initialHtmlTemplate ? initialHtmlTemplate.innerHTML : "";
    
    if (!dataContainer) {
        console.error("CRITICAL ERROR: calculator-data-container not found. Script cannot proceed.");
        if(contentDisplay) contentDisplay.innerHTML = "<p class='text-danger text-center'>Configuration error: Data container missing. Please contact support.</p>";
        return;
    }

    const initialFilename = dataContainer.dataset.initialFilename;
    const currentPageTitleForSubtitle = dataContainer.dataset.currentPageTitleForSubtitle;
    const basePageTitle = dataContainer.dataset.pageTitle || "Calculator Manual";
    const djangoStaticUrl = dataContainer.dataset.staticUrl || "/static/"; 
    // This is the path from STATIC_URL to the root of where "calc_screen", "keys" etc. are.
    // From HTML: data-calculator-image-base-path="img/calculator_pics/"
    const calculatorSpecificImageBasePath = dataContainer.dataset.calculatorImageBasePath || "img/calculator_pics/"; 
    
    console.log("Django Static URL:", djangoStaticUrl);
    console.log("Calculator Specific Image Base Path (from static URL):", calculatorSpecificImageBasePath);

    const apiBaseUrl = dataContainer.dataset.apiBaseUrl;
    const interactiveIndexBaseUrl = dataContainer.dataset.interactiveIndexBaseUrl;
    const interactiveIndexWithFileBaseUrl = dataContainer.dataset.interactiveIndexWithFileBaseUrl;

    if (!apiBaseUrl || !interactiveIndexBaseUrl || !interactiveIndexWithFileBaseUrl) {
        console.error("CRITICAL ERROR: API or navigation base URLs not found. Script cannot proceed.");
        if(contentDisplay) contentDisplay.innerHTML = "<p class='text-danger text-center'>Configuration error: Essential URLs missing. Please contact support.</p>";
        return;
    }

    let mathJaxIsReady = false;

    document.addEventListener('mathJaxReadyForCalculator', () => {
        console.log('MathJax is confirmed ready by custom event.');
        mathJaxIsReady = true;
        if (contentDisplay && contentDisplay.innerHTML && contentDisplay.dataset.mathjaxProcessed === 'false') {
            console.log("MathJax ready event: Typesetting pending initial content.");
            typesetMath(contentDisplay);
            contentDisplay.dataset.mathjaxProcessed = 'true';
        }
    });
    
    function extractAndCleanBodyContent(htmlString) {
        if (!htmlString || typeof htmlString !== 'string') {
            console.warn("extractAndCleanBodyContent: input is not a valid string or is empty.");
            return "";
        }
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlString, 'text/html');
        const body = doc.body;

        if (body) {
            const images = body.querySelectorAll('img');
            console.log(`Found ${images.length} images in fetched content.`);
            images.forEach((img, index) => {
                let src = img.getAttribute('src');
                console.log(`Image ${index + 1} original src: "${src}"`);
                if (src && src.startsWith('../pics/')) {
                    // Original src is like: ../pics/keys/enter_key.png
                    // We need to get the part after ../pics/, which is "keys/enter_key.png"
                    const imageRelativePath = src.substring('../pics/'.length);
                    
                    // Construct the new path: STATIC_URL + calculatorSpecificImageBasePath + imageRelativePath
                    // e.g., /static/ + img/calculator_pics/ + keys/enter_key.png
                    // Ensure no double slashes
                    let newSrc = (djangoStaticUrl.endsWith('/') ? djangoStaticUrl : djangoStaticUrl + '/') +
                                 (calculatorSpecificImageBasePath.endsWith('/') ? calculatorSpecificImageBasePath : calculatorSpecificImageBasePath + '/') +
                                 imageRelativePath;
                    
                    // Remove any potential double slashes between segments if any part was empty or just a slash
                    newSrc = newSrc.replace(/\/\//g, '/');

                    img.setAttribute('src', newSrc);
                    console.log(`Rewrote image src from "${src}" to "${newSrc}"`);
                } else if (src) {
                    console.log(`Image src "${src}" not starting with "../pics/", not rewritten by this rule.`);
                }
            });

            const selectorsToRemove = [
                '.banner', 'nav.navbar:not(#calculatorSubNav)', 
                'body > nav.navbar.navbar-perso', 'footer.footer', '.section-title',
                '.button-container', 'script', 'style', 'link[rel="stylesheet"]', 'head'
            ];
            selectorsToRemove.forEach(selector => {
                body.querySelectorAll(selector).forEach(el => el.remove());
            });
            return body.innerHTML.trim();
        }
        console.warn("extractAndCleanBodyContent: No <body> tag found in the parsed HTML string.");
        return "";
    }

    function typesetMath(element) {
        if (!element || !element.innerHTML.trim()) {
            console.log("typesetMath: Element is null or empty, skipping.");
            return;
        }
        if (mathJaxIsReady && window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
            console.log("MathJax: Queuing typeset for element:", element);
            if (typeof window.MathJax.texReset === 'function') { 
                window.MathJax.texReset(); 
            }
            if(typeof window.MathJax.typesetClear === 'function'){
                 window.MathJax.typesetClear([element]);
            }
            window.MathJax.typesetPromise([element])
                .then(() => console.log("MathJax typesetting completed for element."))
                .catch((err) => console.error('MathJax typesetting error:', err));
        } else if (!mathJaxIsReady) {
             console.warn("MathJax not ready yet for typesetting.");
        } else {
            console.warn("MathJax.typesetPromise is not available.");
        }
    }
    
    function handleInitialContentDisplay() {
        console.log("Handling initial content display.");
        if (initialPlaceholder) initialPlaceholder.style.display = 'none';
        let processedContent = "";

        if (initialFilename && initialHtmlContentPassed && initialHtmlContentPassed.trim() !== '') {
            console.log(`Initial content found for filename: ${initialFilename}`);
            if (initialHtmlContentPassed.trim().startsWith("<p class='text-danger text-center'>")) {
                processedContent = initialHtmlContentPassed; 
            } else {
                processedContent = extractAndCleanBodyContent(initialHtmlContentPassed);
            }
            contentDisplay.innerHTML = processedContent;
            contentDisplay.dataset.mathjaxProcessed = 'false'; 

            if (pageSubtitle) pageSubtitle.innerHTML = `Currently viewing: <strong>${currentPageTitleForSubtitle || initialFilename}</strong>`;
            document.title = `${currentPageTitleForSubtitle || initialFilename} - ${basePageTitle}`;
            
            if (mathJaxIsReady && !initialHtmlContentPassed.trim().startsWith("<p class='text-danger text-center'>")) {
                console.log("MathJax is ready, typesetting initial content immediately.");
                typesetMath(contentDisplay);
                contentDisplay.dataset.mathjaxProcessed = 'true';
            } else if (!initialHtmlContentPassed.trim().startsWith("<p class='text-danger text-center'>")) {
                console.log("MathJax not ready at initial display, math will be typeset when 'mathJaxReadyForCalculator' event fires.");
            }
        } else if (initialFilename) {
            contentDisplay.innerHTML = `<p class='text-danger text-center'>Content for "${initialFilename}" was not provided or was empty.</p>`;
            if (pageSubtitle) pageSubtitle.innerHTML = `Error: <strong>${initialFilename}</strong>`;
            document.title = `Error - ${basePageTitle}`;
        } else {
            if (initialPlaceholder) initialPlaceholder.style.display = 'block';
            if (pageSubtitle) pageSubtitle.innerHTML = 'Select a topic from the navigation below.';
            document.title = basePageTitle;
        }
    }

    async function loadContent(filename, newPageTitleFromLink) {
        console.log(`Loading dynamic content for: ${filename}`);
        if (!filename) {
            if (initialPlaceholder && contentDisplay) {
                contentDisplay.innerHTML = ''; 
                initialPlaceholder.style.display = 'block';
                contentDisplay.appendChild(initialPlaceholder);
            } else if (contentDisplay) {
                contentDisplay.innerHTML = '<p id="initial-placeholder" class="text-center text-muted p-5">Select a topic from the menu above to display its content.</p>';
            }
            if (pageSubtitle) pageSubtitle.innerHTML = 'Select a topic from the navigation below.';
            history.pushState(null, basePageTitle, interactiveIndexBaseUrl);
            document.title = basePageTitle;
            return;
        }

        if (initialPlaceholder) initialPlaceholder.style.display = 'none';
        if (loadingIndicator) loadingIndicator.style.display = 'block';
        if (contentDisplay) contentDisplay.innerHTML = '';

        try {
            const apiUrlResolved = apiBaseUrl.replace('PLACEHOLDER_FILENAME', filename);
            const response = await fetch(apiUrlResolved);

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP error! Status: ${response.status}, URL: ${apiUrlResolved}, Response: ${errorText}`);
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            
            if (data.html_content) {
                const cleanedContent = extractAndCleanBodyContent(data.html_content);
                contentDisplay.innerHTML = cleanedContent;
                contentDisplay.dataset.mathjaxProcessed = 'false';
                
                const effectiveTitle = data.title || newPageTitleFromLink;
                if (pageSubtitle) pageSubtitle.innerHTML = `Currently viewing: <strong>${effectiveTitle}</strong>`;
                
                const newUrl = interactiveIndexWithFileBaseUrl.replace('PLACEHOLDER_FILENAME', filename);
                history.pushState({ filename: filename, title: effectiveTitle }, `${effectiveTitle} - ${basePageTitle}`, newUrl);
                document.title = `${effectiveTitle} - ${basePageTitle}`;
                
                typesetMath(contentDisplay); 
                contentDisplay.dataset.mathjaxProcessed = 'true';

            } else if (data.error) {
                contentDisplay.innerHTML = `<p class="text-danger text-center">${data.error}</p>`;
                if (pageSubtitle) pageSubtitle.innerHTML = `Error loading: <strong>${newPageTitleFromLink || filename}</strong>`;
                document.title = `Error - ${basePageTitle}`;
            }
        } catch (error) {
            console.error('Error in loadContent:', error);
            if (contentDisplay) contentDisplay.innerHTML = `<p class="text-danger text-center">Failed to load content for ${filename}. Check console for details.</p>`;
            if (pageSubtitle) pageSubtitle.innerHTML = `Error loading content.`;
            document.title = `Error - ${basePageTitle}`;
        } finally {
            if (loadingIndicator) loadingIndicator.style.display = 'none';
        }
    }

    function attachNavEventListeners() {
        console.log("Attaching navigation event listeners...");
        const navLinks = document.querySelectorAll('.calculator-nav-link');
        navLinks.forEach(link => {
            if (link.dataset.listenerAttached === 'true') return;
            link.addEventListener('click', function (event) {
                event.preventDefault();
                const filename = this.dataset.filename;
                const pageTitleFromLink = this.textContent || filename;
                console.log(`Nav link clicked: ${filename}`);
                loadContent(filename, pageTitleFromLink);

                const parentDropdownMenu = this.closest('.dropdown-menu');
                if (parentDropdownMenu) {
                    const dropdownToggler = parentDropdownMenu.previousElementSibling;
                    if (dropdownToggler && typeof bootstrap !== 'undefined' && bootstrap.Dropdown && bootstrap.Dropdown.getInstance(dropdownToggler)) {
                        bootstrap.Dropdown.getInstance(dropdownToggler).hide();
                    }
                }
                const mainNavbarCollapseEl = document.getElementById('calculatorSubNav');
                if (mainNavbarCollapseEl && mainNavbarCollapseEl.classList.contains('show')) {
                     if (typeof bootstrap !== 'undefined' && bootstrap.Collapse && bootstrap.Collapse.getInstance(mainNavbarCollapseEl)){
                        bootstrap.Collapse.getInstance(mainNavbarCollapseEl).hide();
                     }
                }
            });
            link.dataset.listenerAttached = 'true'; 
        });
        console.log(`Attached listeners to ${navLinks.length} links.`);
    }

    // --- Initialization Sequence ---
    console.log("Starting initialization sequence...");
    attachNavEventListeners();
    handleInitialContentDisplay();

    window.onpopstate = function(event) {
        console.log("onpopstate triggered:", event.state);
        if (event.state && event.state.filename) {
            loadContent(event.state.filename, event.state.title);
        } else {
            if (initialPlaceholder && contentDisplay) {
                contentDisplay.innerHTML = ''; 
                initialPlaceholder.style.display = 'block';
                contentDisplay.appendChild(initialPlaceholder);
            }
            if (pageSubtitle) pageSubtitle.innerHTML = 'Select a topic from the navigation below.';
            document.title = basePageTitle;
        }
    };
    console.log("Calculator script initialization complete.");
});
