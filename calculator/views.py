# calculator/views.py

import os
from django.conf import settings
from django.http import Http404, JsonResponse
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

# Define the base directory for calculator HTML files
CALCULATOR_FILES_SUBDIR = os.path.join('TI-Nspire', 'html_files')
CALCULATOR_FILES_DIR = os.path.join(settings.BASE_DIR, 'calculator', CALCULATOR_FILES_SUBDIR)

@login_required
def calculator_homepage_view(request):
    """
    Renders the main calculator selection homepage.
    """
    return render(request, 'calculator/homepage.html')

@login_required
def ti_nspire_manual_view(request, filename=None):
    """
    Displays the main page for the TI-Nspire calculator manual,
    with dynamic content loading for a specific HTML file if provided.
    """
    initial_html_for_js = ""
    effective_current_page_title = "TI-Nspire CX Manual"

    if filename:
        # Basic security and validation for the filename
        if ".." in filename or filename.startswith("/") or not filename.endswith(".html"):
            initial_html_for_js = "<p class='text-danger text-center'>Invalid file path or unauthorized file type specified in the URL.</p>"
            effective_current_page_title = "File Error"
        else:
            file_path = os.path.join(CALCULATOR_FILES_DIR, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    initial_html_for_js = f.read()
                # Create a clean title from the filename
                effective_current_page_title = filename.replace('_', ' ').replace('.html', '').capitalize()
            except FileNotFoundError:
                initial_html_for_js = f"<p class='text-danger text-center'>The requested page '{filename}' was not found.</p>"
                effective_current_page_title = "File Not Found"
            except Exception as e:
                print(f"Error reading file {filename} for initial load: {e}") # Server-side log
                initial_html_for_js = "<p class='text-danger text-center'>An error occurred while loading the initial content.</p>"
                effective_current_page_title = "Loading Error"

    context = {
        'page_title': "TI-Nspire CX Manual",
        'initial_html_content_for_js': initial_html_for_js,
        'initial_page_filename_for_js': filename or '',
        'current_page_title_for_subtitle': effective_current_page_title
    }
    return render(request, 'calculator/calculator_interactive_index.html', context)

@login_required
def get_calculator_page_content_api(request, filename):
    """
    API endpoint to fetch the raw HTML content of a calculator page.
    Used by JavaScript for dynamic loading.
    """
    if ".." in filename or filename.startswith("/"):
        return JsonResponse({'error': 'Invalid path'}, status=400)
    if not filename.endswith(".html"):
        return JsonResponse({'error': 'File must be an HTML file'}, status=400)

    file_path = os.path.join(CALCULATOR_FILES_DIR, filename)
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        # The title is also returned to update the subtitle dynamically
        title = filename.replace('_', ' ').replace('.html', '').capitalize()
        return JsonResponse({'html_content': content, 'title': title})
    except FileNotFoundError:
        return JsonResponse({'error': 'File not found'}, status=404)
    except Exception as e:
        print(f"Error serving API content for {filename}: {e}") # Server-side log
        return JsonResponse({'error': 'Server error while fetching content'}, status=500)