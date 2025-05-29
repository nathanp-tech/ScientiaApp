from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'study-plans', views.StudyPlanViewSet, basename='studyplan')

urlpatterns = [
    path('', include(router.urls)),
]