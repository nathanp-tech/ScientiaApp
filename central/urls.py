# central/urls.py

"""
Central URL Configuration

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/stable/topics/http/urls/
Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))
"""
from django.contrib import admin
from django.urls import path, include
from django.contrib.auth import views as auth_views
from core import views as core_views

urlpatterns = [
    # Django admin site
    path('admin/', admin.site.urls),

    # --- Authentication URLs ---
    # We use Django's built-in views for login and logout.
    # The 'login' URL will render the template we create in the next step.
    path('accounts/login/', auth_views.LoginView.as_view(template_name='registration/login.html'), name='login'),
    # The 'logout' URL will log the user out and redirect them to the homepage.
    path('accounts/logout/', auth_views.LogoutView.as_view(next_page='/'), name='logout'),


    # --- API URLs ---
    # We prefix each group of API URLs with the name of its application.
    path('api/recipes/', include('recipes.urls_api')),
    path('api/slides/', include('slides.urls_api')),
    path('api/planner/', include('planner.urls_api')),
    path('api/core/', include('core.urls_api')),


    # --- Frontend Page URLs ---
    path('recipes/', include('recipes.urls_pages')),
    path('slides/', include('slides.urls_pages')),
    path('planner/', include('planner.urls_pages')),


    # --- Core URL (Homepage) ---
    # This now points to your landing page and is named 'home'.
    # We will protect the view associated with this path (`landing_page_view`)
    # to enforce login.
    path('', core_views.landing_page_view, name='home'),
]