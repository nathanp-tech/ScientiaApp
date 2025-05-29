# calculator/urls.py

from django.urls import path
from . import views

app_name = 'calculator' # Namespace for the app's URLs

urlpatterns = [
    # URL for the list of calculator pages
    path('', views.calculator_index_view, name='index'),
    
    # URL for displaying a specific calculator HTML file
    # Example: /calculator/amortization.html/
    path('<str:filename>/', views.serve_calculator_html_view, name='page'),
]
