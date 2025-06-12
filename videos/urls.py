# videos/urls.py

from django.urls import path
from . import views

app_name = 'videos'

urlpatterns = [
    # URL for the video feature's homepage (e.g., /videos/)
    path('', views.video_home_view, name='video_home'),

    # URL for the physics formulas page (e.g., /videos/physics-formulas/)
    path('physics-formulas/', views.physics_formulas_view, name='physics_formulas'),
]