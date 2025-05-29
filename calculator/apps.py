# calculator/apps.py

from django.apps import AppConfig

class CalculatorConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'calculator'
    verbose_name = 'Calculator Tools' # Nom plus descriptif pour l'admin
