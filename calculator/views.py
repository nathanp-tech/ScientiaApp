# calculator/views.py

import os
from django.conf import settings
from django.http import Http404, JsonResponse # JsonResponse pour l'API
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

CALCULATOR_FILES_SUBDIR = os.path.join('TI-Nspire', 'html_files')
CALCULATOR_FILES_DIR = os.path.join(settings.BASE_DIR, 'calculator', CALCULATOR_FILES_SUBDIR)

@login_required
def calculator_interactive_view(request, filename=None):
    """
    Affiche la page principale du manuel de la calculatrice,
    avec la possibilité de charger dynamiquement le contenu d'un fichier HTML.
    """
    initial_html_for_js = ""  # Contenu HTML brut pour le JavaScript (peut être le contenu du fichier ou un message d'erreur)
    effective_current_page_title = "Calculator Manual"  # Titre par défaut pour le sous-titre

    if filename:
        # Sécurité basique et validation du nom de fichier
        if ".." in filename or filename.startswith("/") or not filename.endswith(".html"):
            initial_html_for_js = "<p class='text-danger text-center'>Chemin de fichier invalide ou type de fichier non autorisé spécifié dans l'URL.</p>"
            effective_current_page_title = "Erreur de Fichier"
        else:
            file_path = os.path.join(CALCULATOR_FILES_DIR, filename)
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    initial_html_for_js = f.read()
                effective_current_page_title = filename.replace('_', ' ').replace('.html', '').capitalize()
            except FileNotFoundError:
                initial_html_for_js = f"<p class='text-danger text-center'>La page demandée '{filename}' n'a pas été trouvée.</p>"
                effective_current_page_title = "Fichier Non Trouvé"
            except Exception as e:
                print(f"Error reading file {filename} for initial load: {e}") # Log pour le serveur
                initial_html_for_js = "<p class='text-danger text-center'>Une erreur est survenue lors du chargement du contenu initial.</p>"
                effective_current_page_title = "Erreur de Chargement"
    else:
        # Aucun nom de fichier dans l'URL, c'est la page d'index interactive principale.
        # effective_current_page_title reste "Calculator Manual"
        # initial_html_for_js reste une chaîne vide, le JS affichera le placeholder.
        pass

    context = {
        'page_title': "TI-Nspire CX Manual",  # Titre général de la section pour la balise <title> et potentiellement H1
        'initial_html_content_for_js': initial_html_for_js,
        'initial_page_filename_for_js': filename,
        'current_page_title_for_subtitle': effective_current_page_title  # Utilisé pour le sous-titre "Currently viewing: ..."
    }
    return render(request, 'calculator/calculator_interactive_index.html', context)

@login_required
def get_calculator_page_content_api(request, filename):
    """
    API endpoint pour récupérer le contenu HTML brut d'une page de calculatrice.
    Utilisé par JavaScript pour les chargements dynamiques.
    """
    if ".." in filename or filename.startswith("/"): #
        return JsonResponse({'error': 'Invalid path'}, status=404) #
    if not filename.endswith(".html"): #
        return JsonResponse({'error': 'File must be an HTML file'}, status=400) #

    file_path = os.path.join(CALCULATOR_FILES_DIR, filename) #
    try:
        with open(file_path, 'r', encoding='utf-8') as f: #
            content = f.read() #
        # Le titre est également renvoyé pour mettre à jour le sous-titre dynamiquement
        title = filename.replace('_', ' ').replace('.html', '').capitalize() #
        return JsonResponse({'html_content': content, 'title': title}) #
    except FileNotFoundError:
        return JsonResponse({'error': 'File not found'}, status=404) #
    except Exception as e:
        print(f"Error serving API content for {filename}: {e}") #
        return JsonResponse({'error': 'Server error while fetching content'}, status=500) #