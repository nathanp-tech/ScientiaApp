
from django.urls import path
from . import views

app_name = 'flashcards'

urlpatterns = [
    path('create/', views.flashcard_creator_view, name='creator'),
    path('browser/', views.flashcard_browser_view, name='browser'),
    path('<int:pk>/', views.flashcard_detail_view, name='detail'), 
]