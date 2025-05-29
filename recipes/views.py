# recipes/views.py

from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.middleware.csrf import get_token
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from .models import Recipe
from .serializers import RecipeListSerializer, RecipeDetailSerializer
from core.models import Curriculum, Language, Subject, Label

# --- Recipe Browser Page View (No changes here) ---
@login_required
def recipe_browser_view(request):
    # ... (code from previous step)
    context = {
        'initial_data': {
            'curriculums': list(Curriculum.objects.values('id', 'name')),
            'languages': list(Language.objects.values('id', 'name', 'code')),
            'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
            'labels': list(Label.objects.values('id', 'description', 'subject_id'))
        },
        'api_urls': {
            'recipes': reverse('recipe-list')
        }
    }
    return render(request, 'recipes/recipe_browser.html', context)


# --- Existing HTML Page Views (No changes here) ---
@login_required
@user_passes_test(lambda u: u.is_staff, login_url='/')
def recipe_creator_view(request):
    # ... (code from previous step)
    initial_data = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name', 'code')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'users': list(User.objects.filter(is_active=True).values('id', 'username')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id'))
    }
    api_config = {
        'urls': {
            'recipes': reverse('recipe-list'),
            'subjects': reverse('subject-list'),
            'labels': reverse('label-list'),
        },
        'csrf_token': get_token(request)
    }
    context = {
        'initial_data': initial_data,
        'api_config': api_config,
        'curriculums': Curriculum.objects.all(),
        'languages': Language.objects.all(),
    }
    return render(request, 'recipes/recipe_creator.html', context)

def recipe_detail_view(request, pk):
    # ... (code from previous step)
    recipe = get_object_or_404(Recipe, pk=pk)
    return render(request, 'recipes/recipe_detail.html', {'recipe': recipe})


# --- MODIFIED: ViewSet for the API ---
class RecipeViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return RecipeListSerializer
        return RecipeDetailSerializer

    def get_queryset(self):
        # ... (filtering logic from previous step, no changes here)
        queryset = Recipe.objects.all().order_by('-updated_at')
        curriculum_id = self.request.query_params.get('curriculum')
        language_id = self.request.query_params.get('language')
        subject_id = self.request.query_params.get('subject')
        topic_id = self.request.query_params.get('topic')
        if curriculum_id: queryset = queryset.filter(curriculum_id=curriculum_id)
        if language_id: queryset = queryset.filter(language_id=language_id)
        if subject_id: queryset = queryset.filter(subject_id=subject_id)
        if topic_id: queryset = queryset.filter(topic_id=topic_id)
        return queryset

    def perform_create(self, serializer):
        # This method is called by `create`, so we just need to set the author.
        serializer.save(author=self.request.user)
    
    # =========================================================================
    # THE MAIN CHANGE IS HERE: Overriding the 'create' method
    # =========================================================================
    def create(self, request, *args, **kwargs):
        """
        This method implements the "upsert" logic.
        It checks if a recipe with the given metadata combination already exists.
        If it exists, it updates it. Otherwise, it creates a new one.
        """
        # Extract the unique identifiers from the incoming data
        language_id = request.data.get('language')
        curriculum_id = request.data.get('curriculum')
        subject_id = request.data.get('subject')
        topic_id = request.data.get('topic')

        # Check for null values, which are valid if the fields are optional
        filters = {
            'language_id': language_id,
            'curriculum_id': curriculum_id,
            'subject_id': subject_id,
            'topic_id': topic_id,
        }

        # Attempt to find an existing recipe with this exact combination
        existing_recipe = Recipe.objects.filter(**filters).first()

        if existing_recipe:
            # If a recipe exists, we perform an UPDATE.
            # We pass the existing instance to the serializer.
            serializer = self.get_serializer(instance=existing_recipe, data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer) # Use the existing update logic
            return Response(serializer.data)
        else:
            # If no recipe exists, we perform a standard CREATE.
            # This will call `perform_create` automatically.
            return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        # This is called by `update` and now also by our custom `create`.
        serializer.save(author=self.request.user)