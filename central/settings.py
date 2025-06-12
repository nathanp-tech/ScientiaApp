# File: central/settings.py

from pathlib import Path
import os
import dotenv          # Import the dotenv library
import dj_database_url # Import the dj_database-url library

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# --- ENVIRONMENT VARIABLE LOADING ---
# This line looks for a .env file at the project root
# and loads its variables. This is essential for local development.
dotenv.load_dotenv(os.path.join(BASE_DIR, '.env'))
# ---

# --- DYNAMIC SECURITY CONFIGURATION ---

# SECURITY WARNING: keep the secret key used in production secret!
# Retrieves the secret key from the environment variables.
# If it's not set, the program will crash (which is a good thing in production).
SECRET_KEY = os.environ.get('SECRET_KEY')

# SECURITY WARNING: don't run with debug turned on in production!
# DEBUG mode is True ONLY if the DEBUG environment variable is explicitly set to 'True'.
DEBUG = os.environ.get('DEBUG') == 'True'

# Retrieves the allowed hosts from the environment as a string
# and transforms it into a Python list.
allowed_hosts_str = os.environ.get('ALLOWED_HOSTS')
if allowed_hosts_str:
    ALLOWED_HOSTS = [host.strip() for host in allowed_hosts_str.split(',')]
else:
    ALLOWED_HOSTS = []
# ---

# Application definition
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party apps
    'rest_framework',

    # Our apps
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
        'DIRS': [BASE_DIR / 'templates'], # Global templates directory
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


# --- DYNAMIC DATABASE CONFIGURATION ---
# Reads the DATABASE_URL variable to configure the database.
# If not found, it defaults to a local SQLite database.
default_db_url = 'sqlite:///' + os.path.join(BASE_DIR, 'db.sqlite3')
DATABASES = {
    'default': dj_database_url.config(default=os.environ.get('DATABASE_URL', default_db_url))
}
# ---

# Password validation
# https://docs.djangoproject.com/en/4.1/ref/settings/#auth-password-validators
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/4.1/topics/i18n/
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/4.1/howto/static-files/
STATIC_URL = 'static/'
STATICFILES_DIRS = [
    os.path.join(BASE_DIR, 'static'),
]
STATIC_ROOT = os.path.join(BASE_DIR, 'staticfiles')


# Default primary key field type
# https://docs.djangoproject.com/en/4.1/ref/settings/#default-auto-field
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Django Rest Framework settings
REST_FRAMEWORK = {
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
}


# Fixture directories for initial data
FIXTURE_DIRS = [
    os.path.join(BASE_DIR, 'init'),
]


# ==============================================================================
# AUTHENTICATION CONFIGURATION
# ==============================================================================
LOGIN_REDIRECT_URL = '/'
LOGIN_URL = 'login'