from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.middleware.csrf import get_token
from django.templatetags.static import static
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User

from .models import Slide
from .serializers import SlideshowListSerializer, SlideshowDetailSerializer
from core.models import Curriculum, Language, Subject, Label

# --- NEW: SLIDE BROWSER PAGE VIEW ---
@login_required # Or remove if public access is desired
def slide_browser_view(request):
    """
    Displays the main slide browser page.
    Provides initial data for filter dropdowns.
    """
    # Data needed for the filter dropdowns on the browser page
    initial_data_for_filters = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name', 'code')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id')), # These are 'topics'
        'logo_path': static('img/logo.png') # For consistent slide rendering
    }
    
    # API URLs needed by the JavaScript on the browser page
    api_urls_for_js = {
        'slideshows_api': reverse('slideshow-list'), # API endpoint for fetching slideshows
         # We might need the detail view if we load full slideshows on selection
        'slideshow_detail_api_base': reverse('slideshow-list'), # Base for detail, JS will append ID
    }

    context = {
        'initial_data_for_filters': initial_data_for_filters,
        'api_urls_for_js': api_urls_for_js,
    }
    return render(request, 'slides/slide_browser.html', context)


# --- Existing HTML Page Views (slide_creator_view and slideshow_player_view) ---
@login_required
@user_passes_test(lambda u: u.is_staff, login_url='/')
def slide_creator_view(request):
    """ 
    Displays the slide creator page. 
    Access is restricted to staff members only.
    """
    initial_data = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name', 'code')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'users': list(User.objects.filter(is_active=True).values('id', 'username')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id')),
        'logo_path': static('img/logo.png')
    }
    api_config = {
        'urls': {
            'slideshows': reverse('slideshow-list'),
        },
        'csrf_token': get_token(request)
    }
    context = {
        'initial_data': initial_data,
        'api_config': api_config,
        'curriculums': Curriculum.objects.all(),
        'languages': Language.objects.all(),
    }
    return render(request, 'slides/slide_creator.html', context)

def slideshow_player_view(request, pk):
    """ 
    Displays a single slideshow directly (e.g., via a direct link).
    This is different from the browser's player but can be a fallback.
    """
    slideshow = get_object_or_404(Slide, pk=pk)
    return render(request, 'slides/slideshow_player.html', {'slideshow': slideshow})


# --- MODIFIED: ViewSet for the API (with filtering) ---
class SlideshowViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows slideshows to be viewed or edited.
    Includes filtering and "upsert" functionality.
    """
    # queryset = Slide.objects.all().order_by('-updated_at') # Replaced by get_queryset
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return SlideshowListSerializer
        return SlideshowDetailSerializer # Used for retrieve, create, update

    def get_queryset(self):
        """
        This view should return a list of all the slideshows
        for the currently authenticated user.
        MODIFIED: Add filtering based on query parameters.
        """
        queryset = Slide.objects.all().order_by('-updated_at')
        
        # Get filter parameters from the request URL
        curriculum_id = self.request.query_params.get('curriculum')
        language_id = self.request.query_params.get('language')
        subject_id = self.request.query_params.get('subject')
        topic_id = self.request.query_params.get('topic') # 'topic' is the FK to Label

        # Apply filters if they are provided
        if curriculum_id:
            queryset = queryset.filter(curriculum_id=curriculum_id)
        if language_id:
            queryset = queryset.filter(language_id=language_id)
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)
        if topic_id: # Ensure your Slide model has a 'topic' field linked to Label
            queryset = queryset.filter(topic_id=topic_id)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save(author=self.request.user)
    
    def create(self, request, *args, **kwargs):
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
        existing_slideshow = Slide.objects.filter(**filters).first()

        if existing_slideshow:
            serializer = self.get_serializer(instance=existing_slideshow, data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)
        else:
            return super().create(request, *args, **kwargs)
