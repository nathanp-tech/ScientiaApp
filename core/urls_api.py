from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views_api

# Créer un routeur séparé pour les vues d'API de 'core'
router = DefaultRouter()
router.register(r'curriculums', views_api.CurriculumViewSet)
router.register(r'languages', views_api.LanguageViewSet)
router.register(r'subjects', views_api.SubjectViewSet)
router.register(r'labels', views_api.LabelViewSet)

urlpatterns = [
    path('', include(router.urls)),
]