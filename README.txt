# RecipesApp - Scientia

RecipesApp est une application web Django conçue pour la création de contenu éducatif, incluant des recettes pédagogiques, des présentations interactives et des plannings d'étude pour étudiants.

## Fonctionnalités

Le projet est structuré autour de trois modules principaux :

1.  **Recipes** : Un outil pour créer des "recettes" de leçons ou d'exercices, composées de blocs de contenu (énoncés, étapes, etc.).
2.  **Slides** : Un créateur de présentations (slideshows) avec différents types de diapositives (titre, quiz, deux colonnes...).
3.  **Planner** : Un générateur de planning d'étude personnalisé pour les étudiants, basé sur leurs matières, leurs disponibilités et leurs dates d'examen.

## Architecture

L'application utilise une architecture modulaire :

* **Backend** : Django & Django Rest Framework (DRF) pour la gestion des données et la création d'une API RESTful.
* **Frontend** : Templates Django avec HTML, CSS (Bootstrap) et JavaScript. La logique complexe est gérée côté client et communique avec le backend via l'API.
* **Base de données** : SQLite (par défaut), configurable pour PostgreSQL ou autre en production.

## Installation

1.  **Cloner le dépôt**
    ```bash
    git clone <your-repo-url>
    cd RecipesApp-main
    ```

2.  **Créer un environnement virtuel**
    ```bash
    python -m venv venv
    source venv/bin/activate  # Sur Windows: venv\Scripts\activate
    ```

3.  **Installer les dépendances**
    ```bash
    pip install -r requirements.txt
    ```

4.  **Appliquer les migrations**
    ```bash
    python manage.py migrate
    ```

5.  **Créer un superutilisateur**
    ```bash
    python manage.py createsuperuser
    ```

6.  **Lancer le serveur de développement**
    ```bash
    python manage.py runserver
    ```

L'application sera accessible à l'adresse `http://127.0.0.1:8000`.