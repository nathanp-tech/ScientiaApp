# calculator/views.py

import os
from django.conf import settings
from django.http import Http404 # HttpResponse a été retiré car nous utilisons render
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

# Define the base directory where your calculator HTML files are stored.
CALCULATOR_FILES_SUBDIR = os.path.join('TI-Nspire', 'html_files')
CALCULATOR_FILES_DIR = os.path.join(settings.BASE_DIR, 'calculator', CALCULATOR_FILES_SUBDIR)

@login_required
def calculator_index_view(request):
    """
    Lists all available HTML calculator pages.
    """
    html_files = []
    if os.path.exists(CALCULATOR_FILES_DIR) and os.path.isdir(CALCULATOR_FILES_DIR):
        for f_name in os.listdir(CALCULATOR_FILES_DIR):
            if f_name.endswith(".html"):
                display_name = f_name.replace('_', ' ').replace('.html', '').capitalize()
                html_files.append({'filename': f_name, 'display_name': display_name})
    else:
        # Gérer le cas où le répertoire n'existe pas
        # Vous pouvez ajouter un log ici côté serveur
        pass 

    html_files.sort(key=lambda x: x['display_name'])

    context = {
        'calculator_pages': html_files,
        'page_title': 'Calculator Tools'
    }
    return render(request, 'calculator/calculator_index.html', context)

@login_required
def serve_calculator_html_view(request, filename):
    """
    Serves a specific HTML calculator page by rendering it within a Django template.
    """
    if ".." in filename or filename.startswith("/"):
        raise Http404("File not found (invalid path).")

    file_path = os.path.join(CALCULATOR_FILES_DIR, filename)

    if not filename.endswith(".html"):
        raise Http404("File not found (must be an HTML file).")

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # Nom pour l'affichage dans le titre de la page
        page_specific_title = filename.replace('_', ' ').replace('.html', '').capitalize()
        
        context = {
            'html_content': content,
            'page_title': page_specific_title, # Titre spécifique de la page du calculateur
            'calculator_filename': filename # Pour référence, si nécessaire dans le template
        }
        # Utilise le nouveau template 'calculator_display.html' pour envelopper le contenu
        return render(request, 'calculator/calculator_display.html', context)
    except FileNotFoundError:
        raise Http404(f"The file '{filename}' was not found in the calculator directory.")
    except Exception as e:
        print(f"Error serving file {filename}: {e}")
        raise Http404("An error occurred while trying to serve the file.")
