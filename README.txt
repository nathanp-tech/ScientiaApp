==================================
 Scientia Educational Platform
==================================

--------------------
1. Overview
--------------------
Scientia is a comprehensive web-based platform designed for creating dynamic educational content and facilitating intelligent study planning. It empowers educators and content creators with tools to build structured "recipes" (lessons/exercises) and engaging slideshow presentations. For students, it offers a personalized study planner that automates schedule generation based on their subjects, availability, and exam timelines.

The platform is built with a modular Django backend, a RESTful API for seamless frontend-backend communication, and interactive JavaScript-driven user interfaces.

--------------------
2. Core Technologies
--------------------
* **Backend:** Django (Python web framework)
* **API:** Django REST Framework (DRF) for building Web APIs.
* **Frontend:**
    * HTML5 (Django Templates)
    * CSS3 (Bootstrap 5, custom stylesheets)
    * JavaScript (Vanilla JS, asynchronous operations, DOM manipulation)
* **Key JavaScript Libraries:**
    * **CodeMirror:** For in-browser HTML code editing in creator modules.
    * **MathJax:** For rendering mathematical formulas (LaTeX) in recipes and slides.
* **PDF Generation:** Pyppeteer (Python port of Puppeteer) for converting HTML content to PDF (specifically for recipes).
* **Database:** SQLite (default development database, configured in `central/settings.py`).
* **Web Server Gateway Interface:** ASGI and WSGI for deploying the Django application.

--------------------
3. Project Structure
--------------------
The project is organized into several Django applications and top-level directories:

* **`manage.py`**: Django's command-line utility for administrative tasks.
* **`db.sqlite3`**: The SQLite database file (for development).

* **Django Applications (Apps):**
    * **`central`**:
        * Role: Core project configuration.
        * Contains `settings.py` (project-wide settings like `INSTALLED_APPS`, `MIDDLEWARE`, database config, static files, DRF settings, etc.).
        * Contains `urls.py` (main URL routing for the project, including admin, auth, API endpoints, and app-specific page URLs).
        * Contains `asgi.py` and `wsgi.py` (entry points for ASGI/WSGI compatible web servers).
    * **`core`**:
        * Role: Manages fundamental, shared data models and basic site views.
        * Models: `Curriculum`, `Language`, `Subject` (with levels like SL/HL), `Label` (for hierarchical topics within subjects).
        * Admin: Custom admin interfaces for these models.
        * API: Read-only ViewSets (`CurriculumViewSet`, `LanguageViewSet`, `SubjectViewSet`, `LabelViewSet`) to expose this data to other applications.
        * Views: Includes the main landing page view (`landing_page_view` at `/`).
    * **`recipes`**:
        * Role: Handles the creation, management, Browse, and display of educational "recipes" (lessons, exercises).
        * Models: `Recipe` (metadata) and `RecipeBlock` (ordered HTML content blocks).
        * Features: Recipe creator, recipe browser, recipe detail view, and PDF export functionality.
    * **`slides`**:
        * Role: Manages the creation, management, Browse, and display of slideshow presentations.
        * Models: `Slide` (slideshow metadata) and `SlideBlock` (individual slide content as HTML).
        * Features: Slide creator, slide browser, and an interactive slideshow player with quiz capabilities.
    * **`planner`**:
        * Role: Provides student-specific study planning and schedule generation.
        * Models: `StudyPlan` (stores student, plan name, JSON configuration for subjects/availability) and `ScheduledSession` (individual study sessions).
        * Features: Subject configuration, weekly availability setting, automated schedule generation, and schedule export.

* **Top-Level Directories:**
    * **`static/`**: Contains static assets for the frontend.
        * `css/`: Stylesheets (`base.css`, `creator.css`, `planner.css`, `recipe_browser.css`, `slide_browser.css`, `slide_styles.css`, `styles.css`).
        * `js/`: JavaScript files (`recipe_browser.js`, `recipe_creator.js`, `slide_browser.js`, `slide_creator.js`, `student_planner.js`).
        * `img/`: Image files (e.g., logos).
    * **`templates/`**: Contains Django HTML templates.
        * `base.html`: The main site-wide base template.
        * `index.html`: The homepage template.
        * App-specific subdirectories (`planner/`, `recipes/`, `slides/`) for their respective page templates and partials (e.g., `_modals.html`).
        * `registration/login.html`: Custom login page template.
    * **`init/`**: Contains JSON fixture files (e.g., `curriculum.json`, `language.json`, `subject.json`) for populating initial data into the database. This directory is listed in `FIXTURE_DIRS` in `settings.py`.
    * **`calculator/`**: Contains HTML files and a Python script related to TI-Nspire calculator functionalities. This seems to be a separate utility or a component that can be integrated.
    * **`.vscode/`**, **`.codegpt/`**, **`.gitignore`**: Development-related configuration files.

--------------------------------
4. Key Features and Functionalities
--------------------------------

**4.1. Core Application (`core`)**
* **Centralized Metadata Management:** Defines and manages foundational educational entities:
    * `Curriculum`: Educational programs (e.g., IB, A-Levels).
    * `Language`: Languages for content and subjects.
    * `Subject`: Academic subjects, linked to curriculum and language, with defined levels (e.g., Standard Level, Higher Level).
    * `Label`: Hierarchical topics or categories within subjects, allowing for nested content organization.
* **API Access:** Provides read-only REST API endpoints for other applications to fetch this metadata dynamically (e.g., for populating dropdowns in creator interfaces).
* **Homepage:** Serves the main landing page (`index.html`) of the application, which is login-protected.

**4.2. Recipe Application (`recipes`)**
* **Recipe Creator (`recipes/recipe_creator.html`, `recipes/recipe_creator.js`):**
    * **Staff-Only Access:** Designed for educators/content creators.
    * **Block-Based Editing:** Recipes are composed of ordered blocks (e.g., "Statement", "Step").
    * **Rich HTML Editing:** Uses CodeMirror for editing raw HTML content of blocks, with syntax highlighting (Monokai theme) and auto-closing tags. A custom CodeMirror overlay highlights editable text content and LaTeX formulas for better usability.
    * **Live Preview:** Real-time rendering of HTML content as it's typed in the editor.
    * **MathJax Integration:** Supports LaTeX for mathematical formulas, rendered by MathJax in the preview.
    * **Metadata Management:** Allows associating recipes with a title, curriculum, language, subject, and topic via a modal.
    * **Save/Load Functionality:** Saves recipes to the server. The API implements an "upsert" logic: if a recipe with the same unique combination of (language, curriculum, subject, topic) exists, it's updated; otherwise, a new one is created. Users can load existing recipes for editing.
    * **Help Modal:** Provides a user guide for the creator interface.
* **Recipe Browser (`recipes/recipe_browser.html`, `recipes/recipe_browser.js`):**
    * **Authenticated Access:** Allows logged-in users to browse recipes.
    * **Filtering:** Users can filter recipes by curriculum, language, subject, and topic using dependent dropdowns.
    * **Dynamic List:** Fetches and displays a list of matching recipes from the API.
* **Recipe Detail View (`recipes/recipe_detail.html`):**
    * Displays the full content of a selected recipe, rendering all its HTML blocks.
    * Supports MathJax rendering.
    * Provides a link back to the browser and an edit link for staff.
* **PDF Export (`recipes/print_recipe.py`):**
    * A utility script using `pyppeteer` (headless Chrome) to convert HTML recipe content (from a URL or local file) into a formatted PDF document.
    * Injects custom CSS and JavaScript to style the PDF output, including headers, footers, page numbers, and specific styling for recipe elements.

**4.3. Slides Application (`slides`)**
* **Slide Creator (`slides/slide_creator.html`, `slides/slide_creator.js`):**
    * **Staff-Only Access.**
    * **Block-Based Slide Creation:** Slideshows are composed of ordered slide blocks.
    * **Slide Templates:** Offers various templates for new slides (e.g., Basic, Two Column, Quiz, Math, Front Page, Info Cards, Two Column Basic), each with a predefined HTML structure.
    * **Rich HTML Editing:** Utilizes CodeMirror, similar to the recipe creator, with the same custom overlay for editable text and LaTeX.
    * **Live Preview:** Real-time preview of the current slide, including MathJax rendering and interactive quiz setup.
    * **Metadata Management:** Allows setting slideshow title, curriculum, language, subject, and topic via a modal.
    * **Save/Load Functionality:** Saves slideshows with an "upsert" logic based on unique metadata (language, curriculum, subject, topic). Existing slideshows can be loaded for editing.
* **Slide Browser (`slides/slide_browser.html`, `slides/slide_browser.js`):**
    * **Authenticated Access.**
    * **Filtering:** Filter slideshows by curriculum, language, subject, and topic.
    * **Dynamic List & Player Layout:** Displays a list of slideshows on one side and a player on the other.
* **Slideshow Player (Integrated into Slide Browser):**
    * **Interactive Viewing:** Displays the selected slideshow.
    * **Navigation:** Previous/Next slide buttons and a slide counter.
    * **MathJax Support:** Renders mathematical formulas.
    * **Interactive Quizzes:** For slides with the "quiz" template, users can select answers, submit, and receive feedback (correct/incorrect/partial). Quiz state (selected, submitted) is managed by JavaScript.
    * **Fullscreen Mode:** Allows viewing the slideshow in fullscreen.
    * **Aspect Ratio:** The slide display area maintains a 16:9 aspect ratio.

**4.4. Planner Application (`planner`)**
* **Student Study Planner (`planner/student_planner.html`, `planner/student_planner.js`):**
    * **Personalized Plans:** Each student has one primary study plan.
    * **User Roles:**
        * Non-staff users access their own plan directly.
        * Staff users can select any student to view or manage their plan. The last selected student is remembered in localStorage for staff convenience.
    * **Plan Configuration:**
        * **Subject Setup:** Users can select up to 6 subjects, specify their exam dates, assign a priority (High, Medium, Low, or None for manual planning), and choose a display color.
        * **Weekly Availability:** Users define their typical available study hours for each day of the week using a clickable grid.
    * **Automated Schedule Generation (Client-Side):**
        * The "View / Generate Schedule" button triggers a JavaScript-based algorithm.
        * The algorithm considers subject priorities (weighted), exam dates (urgency), user-defined weekly availability, and predefined school vacation periods (during which default study times like 9am-12pm & 2pm-5pm are assumed if the day is marked as vacation).
        * It distributes study slots (typically 1 hour) aiming for a balanced schedule. It also attempts to limit consecutive hours for the same subject (e.g., max 2).
    * **Schedule Display:**
        * The generated or loaded schedule is displayed in a calendar-like table, showing subjects assigned to time slots with their respective colors.
        * Distinguishes between normally available slots, vacation slots, and unavailable slots.
    * **Manual Editing:** Users can click on any scheduled slot (or an empty available slot) to open a modal and assign/change the subject or mark it as a free/break period.
    * **Save/Load Plan:**
        * The entire plan (name, student ID, configuration JSON including subjects and availability, and the array of scheduled sessions) is saved to the server via an API call.
        * The backend uses an "upsert" logic: if a plan for the student exists, it's updated; otherwise, a new one is created.
        * Plans are loaded automatically when a student is selected (or the page loads for a non-staff user).
    * **Export Schedule:** Allows exporting the displayed schedule table as a standalone HTML file.
    * **Loading Overlay:** A visual indicator is shown during server communications.

**4.5. General Platform Features**
* **User Authentication:** Uses Django's built-in authentication system for login and logout. The `LOGIN_URL` and `LOGIN_REDIRECT_URL` are configured in `central/settings.py`.
* **Admin Interface:** Leverages the Django Admin site (`/admin/`) for comprehensive data management. Custom admin views are defined in each app's `admin.py` for models like `Curriculum`, `Recipe`, `Slide`, `StudyPlan`, etc., often with inlines, filters, and custom displays.
* **Responsive Design:** Uses Bootstrap 5 for a responsive layout, adapting to different screen sizes.
* **Dynamic Frontend:** Extensive use of JavaScript to create interactive user experiences, handle API calls (fetch API), and manipulate the DOM without full page reloads.
* **Data Transfer to JS:** Django templates use the `|json_script` filter to safely pass initial data and API configurations from the backend views to frontend JavaScript.

-----------------------------
5. Setup and Installation (General Pointers)
-----------------------------
This is a standard Django project. To set it up for development:

1.  **Prerequisites:**
    * Python 3.x
    * Pip (Python package installer)
    * Node.js/npm (if any frontend build tools were used, though not explicitly shown, good to have for web dev)
2.  **Clone the Repository:**
    ```bash
    git clone <repository-url>
    cd <project-directory>
    ```
3.  **Create a Virtual Environment (Recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    ```
4.  **Install Dependencies:**
    * A `requirements.txt` file would typically list all Python dependencies (e.g., Django, djangorestframework, pyppeteer). Create one using `pip freeze > requirements.txt` if it doesn't exist.
    * Install with: `pip install -r requirements.txt`
5.  **Database Migrations:**
    * Apply database migrations to create the necessary tables:
        ```bash
        python manage.py migrate
        ```
6.  **Load Initial Data (Fixtures):**
    * The project is configured to look for fixtures in the `init/` directory.
    * You can load fixtures using:
        ```bash
        python manage.py loaddata curriculum.json language.json subject.json label.json ...
        ```
        (Load them in an order that respects dependencies, e.g., Curriculum and Language before Subject).
7.  **Create a Superuser (for Admin Access):**
    ```bash
    python manage.py createsuperuser
    ```
    Follow the prompts to create an admin account.
8.  **Run the Development Server:**
    ```bash
    python manage.py runserver
    ```
    The application will typically be available at `http://127.0.0.1:8000/`.

* **Important Configuration Notes:**
    * **`SECRET_KEY`**: The `SECRET_KEY` in `central/settings.py` is a placeholder. For production, replace `'django-insecure-your-secret-key-here'` with a strong, unique secret key.
    * **`DEBUG` Mode**: `DEBUG = True` in `central/settings.py` is suitable for development but MUST be set to `False` in a production environment.
    * **`ALLOWED_HOSTS`**: In production, configure `ALLOWED_HOSTS` in `central/settings.py` to include the domain(s) that will host the application.
    * **Pyppeteer/Chromium for PDF Export**: The `print_recipe.py` script requires `pyppeteer`, which in turn needs a Chromium browser instance. Ensure Chromium is installed and accessible in the environment where this script is run. Pyppeteer usually handles downloading a compatible version on first run if not found.

-----------------------------
6. API Endpoints Overview
-----------------------------
The platform uses Django REST Framework to expose several API endpoints, primarily for CRUD operations and data fetching by the frontend JavaScript. Key namespaces include:

* **`/api/core/`**: For `Curriculum`, `Language`, `Subject`, `Label` data (read-only).
    * e.g., `/api/core/subjects/`, `/api/core/labels/`
* **`/api/recipes/`**: For `Recipe` and `RecipeBlock` data. Supports listing, retrieving, creating (upsert), updating, and deleting recipes.
    * e.g., `/api/recipes/recipes/`, `/api/recipes/recipes/{id}/`
* **`/api/slides/`**: For `Slide` (slideshow) and `SlideBlock` data. Supports similar operations as recipes, with an "upsert" logic for slideshow creation.
    * e.g., `/api/slides/slideshows/`, `/api/slides/slideshows/{id}/`
* **`/api/planner/`**: For `StudyPlan` data. Supports creating (upsert based on student ID) and retrieving study plans.
    * e.g., `/api/planner/study-plans/` (POST for create/update, GET with `?student_id=` for retrieve)

These APIs are generally protected and require authentication (`permissions.IsAuthenticated` or `IsAuthenticatedOrReadOnly`). Session authentication is used.

-----------------------------
7. Frontend Details
-----------------------------
* **Django Templates:** HTML is primarily rendered using Django's templating engine. A `base.html` provides a consistent layout.
* **Data to JavaScript:** The `|json_script:"<element-id>"` template filter is used to safely pass data from Django views (Python dictionaries/lists) to frontend JavaScript. This data is then parsed by JS to initialize components or configurations.
* **Bootstrap 5:** Used extensively for styling, layout (grid system), and UI components (modals, cards, buttons, navbar, forms).
* **Custom CSS:** App-specific and component-specific styles are organized in `static/css/`.
* **JavaScript Interactivity:**
    * Vanilla JavaScript is used for DOM manipulation, event handling, and client-side logic.
    * Asynchronous JavaScript (Fetch API) is used for communicating with the backend REST APIs to load data and save changes without full page reloads.
    * State management is handled within individual JavaScript files for their respective pages/components (e.g., `planState` in `student_planner.js`).
* **CodeMirror & MathJax:** Integrated into creator interfaces for enhanced content editing and display.

-----------------------------
8. Notes & Potential Enhancements
-----------------------------
* The `calculator/` directory seems to contain separate utilities whose integration with the main platform is not fully detailed in the provided files but could be an additional feature.
* The schedule generation in the `planner` app is currently client-side. For more complex scenarios or heavier computations, moving this logic to the backend could be beneficial.
* Error handling in JavaScript API calls is present but could be further enhanced for user feedback.
* While `tests.py` files exist in apps, they are mostly empty. Adding comprehensive unit and integration tests would improve code quality and reliability.
* The project is set to `LANGUAGE_CODE = 'en-us'`. For broader use, internationalization (i18n) and localization (l10n) could be implemented.
* Consider using a more robust database system (e.g., PostgreSQL, MySQL) for production instead of SQLite.
* Environment variables should be used for sensitive settings like `SECRET_KEY` and database credentials in production.

This README provides a detailed overview based on the analyzed project files.