# recipes/urls_pages.py

from django.urls import path
from . import views # Make sure views.recipe_detail_view is defined in your recipes/views.py

app_name = 'recipes'

urlpatterns = [
    # URL for the recipe creator page
    path('create/', views.recipe_creator_view, name='creator'),
    
    # URL for the recipe browser page
    path('browser/', views.recipe_browser_view, name='browser'),
    
    # URL for displaying a specific recipe (e.g., /recipes/6/)
    # This was the missing pattern.
    path('<int:pk>/', views.recipe_detail_view, name='detail'), 
]
