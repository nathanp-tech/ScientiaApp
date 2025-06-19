# central/urls.py (UPDATED)
from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views
from core import views as core_views
from django.conf import settings
from django.conf.urls.static import static

urlpatterns = [
    path('admin/', admin.site.urls),
    path('accounts/login/', auth_views.LoginView.as_view(template_name='registration/login.html'), name='login'),
    path('accounts/logout/', auth_views.LogoutView.as_view(next_page='/'), name='logout'),

    # API URLs
    path('api/recipes/', include('recipes.urls_api')),
    path('api/slides/', include('slides.urls_api')),
    path('api/planner/', include('planner.urls_api')),
    path('api/core/', include('core.urls_api')),

    # Frontend Page URLs
    path('recipes/', include('recipes.urls_pages')),
    path('slides/', include('slides.urls_pages')),
    path('planner/', include('planner.urls_pages')),
    path('calculator/', include(('calculator.urls', 'calculator'), namespace='calculator')),
    path('videos/', include(('videos.urls', 'videos'), namespace='videos')),
    
    path('dashboard/', include('dashboard.urls', namespace='dashboard')),

    # Core URL (Homepage)
    path('', core_views.landing_page_view, name='home'),
]

# --- NEW: SERVE MEDIA FILES DURING DEVELOPMENT ---
if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)