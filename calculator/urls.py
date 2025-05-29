# calculator/urls.py

from django.urls import path
from . import views

app_name = 'calculator'

urlpatterns = [
    # Page principale du manuel, peut afficher un fichier par défaut ou une intro
    path('', views.calculator_interactive_view, name='interactive_index'),
    
    # URL pour charger une page spécifique directement au chargement initial de l'index
    # Ex: /calculator/amortization.html
    path('<str:filename>/', views.calculator_interactive_view, name='interactive_index_with_file'),
    
    # API endpoint pour récupérer le contenu d'une page HTML via JavaScript
    # Ex: /calculator/api/get-page/amortization.html/
    path('api/get-page/<str:filename>/', views.get_calculator_page_content_api, name='api_get_page_content'),
]
