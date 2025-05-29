from django.urls import path
from . import views

app_name = 'slides'

urlpatterns = [
    path('create/', views.slide_creator_view, name='creator'),

    path('browser/', views.slide_browser_view, name='browser'),
]