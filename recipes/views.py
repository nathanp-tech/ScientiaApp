# recipes/views.py (UPDATED)
import json
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.middleware.csrf import get_token
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from .models import Recipe, RecipeBlock
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
        'user_is_staff': request.user.is_staff
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
    parser_classes = [MultiPartParser, FormParser]

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

        if subject_id:
            try:
                selected_subject = Subject.objects.get(pk=subject_id)
                base_name = selected_subject.name.split('(')[0].strip()
                sibling_subjects = Subject.objects.filter(
                    name__startswith=base_name,
                    curriculum_id=selected_subject.curriculum_id
                )
                sibling_subject_ids = list(sibling_subjects.values_list('id', flat=True))
                queryset = queryset.filter(subject_id__in=sibling_subject_ids)
            except Subject.DoesNotExist:
                return queryset.none()
        
        return queryset

    def create(self, request, *args, **kwargs):
        recipe_id = request.data.get('id')
        
        if recipe_id:
            instance = get_object_or_404(Recipe, pk=recipe_id)
            if instance.author != request.user and not request.user.is_staff:
                return Response({"detail": "You do not have permission to edit this recipe."}, status=status.HTTP_403_FORBIDDEN)
            serializer = self.get_serializer(instance, data=request.data, partial=True)
        else:
            serializer = self.get_serializer(data=request.data)
        
        serializer.is_valid(raise_exception=True)
        # For a new recipe, set the author. For an update, the author remains.
        if not recipe_id:
            recipe = serializer.save(author=request.user)
        else:
            recipe = serializer.save()

        # Process blocks after saving the recipe instance
        self._process_blocks(request, recipe)
        
        # Return the final, serialized recipe with all its blocks
        final_serializer = self.get_serializer(recipe)
        status_code = status.HTTP_200_OK if recipe_id else status.HTTP_201_CREATED
        return Response(final_serializer.data, status=status_code)

    def _process_blocks(self, request, recipe):
        """Helper function to create/update blocks from request data."""
        blocks_str = request.data.get('blocks', '[]')
        try:
            blocks_data = json.loads(blocks_str)
        except json.JSONDecodeError:
            # If blocks data is invalid, we just ignore it.
            return

        # Clear existing blocks for a clean update
        recipe.blocks.all().delete()

        for index, block_info in enumerate(blocks_data):
            image_file = request.FILES.get(f'block_image_{index}')
            content_html = block_info.get('content_html', '')

            # If a new image is being uploaded, create its initial HTML content.
            if image_file:
                # To get a URL, the file must be associated with a saved model instance.
                # We save it here, then use its URL to create the HTML.
                block_instance = RecipeBlock.objects.create(
                    recipe=recipe,
                    order=index,
                    template_name=block_info.get('template_name', 'image'),
                    image=image_file,
                    content_html='' # Start with empty HTML
                )
                # Now that the image is saved, its URL is available.
                # We update the block's content_html with the image tag.
                block_instance.content_html = f'<img src="{block_instance.image.url}" alt="Recipe content image" class="img-fluid rounded" style="height: auto; width: 50%;">'
                block_instance.save()
            else:
                # If no new file, just save the block with the HTML from the frontend.
                RecipeBlock.objects.create(
                    recipe=recipe,
                    order=index,
                    template_name=block_info.get('template_name', ''),
                    content_html=content_html,
                    image=None # No new image file
                )

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