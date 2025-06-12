# File: central/settings.py

from pathlib import Path
import os

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# ==============================================================================
# DYNAMIC CONFIGURATION BASED ON ENVIRONMENT
# ==============================================================================

# Check if the code is running on PythonAnywhere by looking for a specific environment variable.
IS_PRODUCTION = 'PYTHONANYWHERE_DOMAIN' in os.environ

if IS_PRODUCTION:
    # --- PRODUCTION SETTINGS (PythonAnywhere) ---
    DEBUG = False
    ALLOWED_HOSTS = ['davidscientia.eu.pythonanywhere.com']
    
    # In production, the SECRET_KEY MUST be read from an environment variable.
    # You will set this in the PythonAnywhere "Web" tab.
    SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')

else:
    # --- LOCAL DEVELOPMENT SETTINGS ---
    DEBUG = True
    ALLOWED_HOSTS = ['127.0.0.1', 'localhost']
    
    # For local development, we can use a simpler, hardcoded key.
    # This key will NOT be used in production.
    SECRET_KEY = 'django-insecure-local-key-for-scientia-project'

# ==============================================================================


# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'core.apps.CoreConfig',
    'recipes.apps.RecipesConfig',
    'slides.apps.SlidesConfig',
    'planner.apps.PlannerConfig',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'central.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'central.wsgi.application'

# Database
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# Internationalization
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images)
STATIC_URL = 'static/'
STATICFILES_DIRS = [os.path.join(BASE_DIR, 'static')]
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')

# Default primary key field type
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Django Rest Framework settings
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': ['rest_framework.permissions.IsAuthenticatedOrReadOnly'],
    'DEFAULT_AUTHENTICATION_CLASSES': ['rest_framework.authentication.SessionAuthentication'],
}

# Fixture directories for initial data
FIXTURE_DIRS = [os.path.join(BASE_DIR, 'init')]

# AUTHENTICATION CONFIGURATION
LOGIN_REDIRECT_URL = '/'
LOGIN_URL = 'login'