# slides/views.py

from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required, user_passes_test
from django.urls import reverse
from django.middleware.csrf import get_token
from django.templatetags.static import static
from django.contrib.auth.models import User

from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.filters import SearchFilter

# Imports corrigés
from .models import Slide
from .serializers import SlideshowListSerializer, SlideshowDetailSerializer
from core.models import get_initial_data_for_filters

@login_required
@user_passes_test(lambda u: u.is_staff, login_url='/')
def slide_creator_view(request):
    """ 
    Displays the slide creator page. 
    """
    initial_data = get_initial_data_for_filters()
    initial_data['users'] = list(User.objects.filter(is_active=True).values('id', 'username'))
    initial_data['logo_path'] = static('img/logo.png')

    api_config = {
        'urls': {
            # MODIFIED: Removed namespace
            'slideshows': reverse('slideshow-list'),
        },
        'csrf_token': get_token(request)
    }
    context = {
        'initial_data': initial_data,
        'api_config': api_config,
        'curriculums': initial_data['curriculums'],
        'languages': initial_data['languages'],
    }
    return render(request, 'slides/slide_creator.html', context)

@login_required
def slide_browser_view(request):
    """
    Renders the slideshow browser page.
    """
    initial_data_for_filters = get_initial_data_for_filters()

    # --- MODIFICATION APPLIQUÉE ICI ---
    # On retire le namespace 'slides_api:' des appels à reverse()
    api_urls_for_js = {
        'slideshows': reverse('slideshow-list'),
        'slideshow_detail_base': reverse('slideshow-detail', args=[0]).replace('/0', ''),
    }
    # --- FIN DE LA MODIFICATION ---

    context = {
        'initial_data_for_filters': initial_data_for_filters,
        'api_urls_for_js': api_urls_for_js,
    }
    return render(request, 'slides/slide_browser.html', context)


@login_required
def slideshow_player_view(request, pk):
    """ 
    Displays a single slideshow directly for viewing.
    """
    slideshow = get_object_or_404(Slide, pk=pk)
    return render(request, 'slides/slideshow_player.html', {'slideshow': slideshow})


class SlideshowViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows slideshows to be viewed or edited.
    """
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [SearchFilter]
    search_fields = ['title']
    serializer_class = SlideshowDetailSerializer

    def get_serializer_class(self):
        if self.action == 'list':
            return SlideshowListSerializer
        return SlideshowDetailSerializer

    def get_queryset(self):
        queryset = Slide.objects.all().order_by('-updated_at')
        
        curriculum_id = self.request.query_params.get('curriculum')
        language_id = self.request.query_params.get('language')
        subject_id = self.request.query_params.get('subject')
        topic_id = self.request.query_params.get('topic')
        status = self.request.query_params.get('status')

        if curriculum_id:
            queryset = queryset.filter(curriculum_id=curriculum_id)
        if language_id:
            queryset = queryset.filter(language_id=language_id)
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)
        if topic_id:
            queryset = queryset.filter(topic_id=topic_id)
        if status:
            queryset = queryset.filter(status=status)
            
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
    
    def perform_update(self, serializer):
        serializer.save()
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        
        instance = serializer.instance
        detailed_serializer = SlideshowDetailSerializer(instance)
        headers = self.get_success_headers(detailed_serializer.data)
        return Response(detailed_serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)

        detailed_serializer = SlideshowDetailSerializer(instance)
        return Response(detailed_serializer.data)
    
    @login_required
    def slideshow_player_view(request, pk):
        """ 
        Affiche un seul diaporama dans une interface de type "player".
        Passe les données du diaporama au template, y compris une version JSON
        des blocs pour la logique JavaScript.
        """
        slideshow = get_object_or_404(Slide.objects.prefetch_related('blocks'), pk=pk)
        
        # Sérialiser les données pour les passer facilement au JavaScript
        slideshow_data_for_js = SlideshowDetailSerializer(slideshow).data
        
        context = {
            'slideshow': slideshow, # Pour afficher le titre, etc.
            'slideshow_data_for_js': slideshow_data_for_js # Pour l'interactivité du player
        }
        return render(request, 'slides/slideshow_player.html', context)