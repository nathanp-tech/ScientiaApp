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

@login_required
def recipe_browser_view(request):
    """
    Renders the recipe browser page and provides the necessary data
    for the frontend filters and API calls.
    """
    initial_data = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name', 'code')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id'))
    }
    
    # Provides the frontend with the URLs it needs for API requests.
    api_urls = {
        'recipes': reverse('recipe-list'),
        'recipe_delete': reverse('recipe-detail', args=[0]) # The URL for deleting a recipe
    }
    
    context = {
        'initial_data': initial_data,
        'api_urls': api_urls,
    }
    return render(request, 'recipes/recipe_browser.html', context)


@login_required
@user_passes_test(lambda u: u.is_staff, login_url='/')
def recipe_creator_view(request):
    """
    Renders the recipe creator page for staff members.
    """
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
    """
    Renders the detail page for a single recipe.
    """
    recipe = get_object_or_404(Recipe, pk=pk)
    return render(request, 'recipes/recipe_detail.html', {'recipe': recipe})


# --- API ViewSet ---
class RecipeViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows recipes to be viewed, created, edited, or deleted.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return RecipeListSerializer
        return RecipeDetailSerializer

    def get_queryset(self):
        """
        This view should return a list of all the recipes,
        filtered by the query parameters provided in the request.
        """
        queryset = Recipe.objects.all().order_by('-updated_at')
        
        curriculum_id = self.request.query_params.get('curriculum')
        language_id = self.request.query_params.get('language')
        subject_id = self.request.query_params.get('subject')
        topic_id = self.request.query_params.get('topic')
        
        if curriculum_id: 
            queryset = queryset.filter(curriculum_id=curriculum_id)
        if language_id: 
            queryset = queryset.filter(language_id=language_id)
        if topic_id: 
            queryset = queryset.filter(topic_id=topic_id)

        # --- NEW FLEXIBLE SUBJECT FILTERING LOGIC ---
        if subject_id:
            try:
                # 1. Get the selected subject (e.g., "Maths AA (HL)")
                selected_subject = Subject.objects.get(pk=subject_id)
                
                # 2. Extract the base name (e.g., "Maths AA")
                base_name = selected_subject.name.split('(')[0].strip()
                
                # 3. Find all subjects with that base name (e.g., "Maths AA (SL)" and "Maths AA (HL)")
                sibling_subjects = Subject.objects.filter(
                    name__startswith=base_name,
                    curriculum_id=selected_subject.curriculum_id
                )
                
                # 4. Get the IDs of all found subjects
                sibling_subject_ids = list(sibling_subjects.values_list('id', flat=True))
                
                # 5. Filter recipes that belong to any of these subjects
                queryset = queryset.filter(subject_id__in=sibling_subject_ids)

            except Subject.DoesNotExist:
                # If a non-existent subject_id is provided, return an empty list
                return queryset.none()
        
        return queryset

    def create(self, request, *args, **kwargs):
        """
        Custom create method to implement "upsert" (update or insert) logic.
        If a recipe with the unique metadata exists, it's updated.
        Otherwise, a new recipe is created.
        """
        language_id = request.data.get('language')
        curriculum_id = request.data.get('curriculum')
        subject_id = request.data.get('subject')
        topic_id = request.data.get('topic')
        filters = {
            'language_id': language_id,
            'curriculum_id': curriculum_id,
            'subject_id': subject_id,
            'topic_id': topic_id,
        }

        existing_recipe = Recipe.objects.filter(**filters).first()

        if existing_recipe:
            # If recipe exists, update it
            serializer = self.get_serializer(instance=existing_recipe, data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data, status=status.HTTP_200_OK)
        else:
            # If not, create a new one
            return super().create(request, *args, **kwargs)

    def perform_update(self, serializer):
        """
        Called during an update. Ensures the author is correctly set.
        """
        serializer.save(author=self.request.user)

    def destroy(self, request, *args, **kwargs):
        """
        Overrides the default destroy action to restrict it to staff members.
        """
        if not request.user.is_staff:
            return Response(
                {"detail": "You do not have permission to perform this action."},
                status=status.HTTP_403_FORBIDDEN
            )
        # If the user is staff, proceed with the standard deletion
        return super().destroy(request, *args, **kwargs)