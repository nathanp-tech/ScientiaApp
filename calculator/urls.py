# calculator/urls.py

from django.urls import path
from . import views

app_name = 'calculator'

urlpatterns = [
    # Main homepage for the calculator section
    path('', views.calculator_homepage_view, name='homepage'),

    # TI-Nspire Manual Pages
    # Base URL for the interactive index
    path('ti-nspire/', views.ti_nspire_manual_view, name='ti_nspire_index'),
    
    # URL for loading a specific page initially
    # e.g., /calculator/ti-nspire/amortization.html
    path('ti-nspire/<str:filename>/', views.ti_nspire_manual_view, name='ti_nspire_index_with_file'),
    
    # API endpoint to get page content via JavaScript
    # e.g., /calculator/api/ti-nspire/get-page/amortization.html/
    path('api/ti-nspire/get-page/<str:filename>/', views.get_calculator_page_content_api, name='api_get_ti_nspire_page_content'),
]