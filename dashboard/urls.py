# dashboard/urls.py
from django.urls import path
from . import views

app_name = 'dashboard'

urlpatterns = [
    # URL for the main dashboard page, e.g., /dashboard/
    path('', views.dashboard_home_view, name='home'),
    
    # URL for the API that provides chart data, e.g., /dashboard/api/chart-data/
    path('api/chart-data/', views.ChartDataAPIView.as_view(), name='api_chart_data'),
]
