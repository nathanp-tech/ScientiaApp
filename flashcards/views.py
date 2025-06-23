
from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from django.shortcuts import render, get_object_or_404
from django.urls import reverse
from django.middleware.csrf import get_token
from django.contrib.auth.decorators import login_required, user_passes_test
from django.contrib.auth.models import User
from .models import Flashcard
from .serializers import FlashcardListSerializer, FlashcardDetailSerializer
from core.models import Curriculum, Language, Subject, Label, StudySkillCategory

@login_required
def flashcard_browser_view(request):
    """
    Renders the flashcard browser page, providing initial data for filters.
    """
    initial_data = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name', 'code')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id')),
        'study_skill_categories': list(StudySkillCategory.objects.prefetch_related('skills').values('id', 'name', 'skills__id', 'skills__name'))
    }
    
    api_urls = {
        'flashcards': reverse('flashcard-list'),
        'flashcard_delete': reverse('flashcard-detail', args=[0])
    }
    
    context = {
        'initial_data': initial_data,
        'api_urls': api_urls,
        'user_is_staff': request.user.is_staff,
    }
    return render(request, 'flashcards/flashcard_browser.html', context)

@login_required
@user_passes_test(lambda u: u.is_staff, login_url='/')
def flashcard_creator_view(request):
    """
    Renders the flashcard creator page for staff members.
    """
    initial_data = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name', 'code')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id')),
        'study_skill_categories': list(StudySkillCategory.objects.prefetch_related('skills').values('id', 'name', 'skills__id', 'skills__name')),
    }
    api_config = {
        'urls': {
            'flashcards': reverse('flashcard-list'),
        },
        'csrf_token': get_token(request)
    }
    context = {
        'initial_data': initial_data,
        'api_config': api_config,
    }
    return render(request, 'flashcards/flashcard_creator.html', context)

def flashcard_detail_view(request, pk):
    """
    Renders the detail page for a single flashcard.
    """
    flashcard = get_object_or_404(Flashcard, pk=pk)
    return render(request, 'flashcards/flashcard_detail.html', {'flashcard': flashcard})

class FlashcardViewSet(viewsets.ModelViewSet):
    """
    API endpoint that allows flashcards to be viewed or edited.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action == 'list':
            return FlashcardListSerializer
        return FlashcardDetailSerializer

    def get_queryset(self):
        queryset = Flashcard.objects.select_related(
            'author', 'subject', 'topic', 'language', 'curriculum'
        ).all().order_by('-updated_at')

        # Filtering logic
        curriculum_id = self.request.query_params.get('curriculum')
        language_id = self.request.query_params.get('language')
        subject_id = self.request.query_params.get('subject')
        topic_id = self.request.query_params.get('topic')
        skill_id = self.request.query_params.get('study_skill')

        if curriculum_id: queryset = queryset.filter(curriculum_id=curriculum_id)
        if language_id: queryset = queryset.filter(language_id=language_id)
        if topic_id: queryset = queryset.filter(topic_id=topic_id)
        if skill_id: queryset = queryset.filter(study_skills__id=skill_id)

        if subject_id:
            try:
                selected_subject = Subject.objects.get(pk=subject_id)
                base_name = selected_subject.name.split('(')[0].strip()
                sibling_subjects = Subject.objects.filter(name__startswith=base_name, curriculum_id=selected_subject.curriculum_id)
                queryset = queryset.filter(subject_id__in=sibling_subjects.values_list('id', flat=True))
            except Subject.DoesNotExist:
                return queryset.none()
        
        return queryset

    def perform_create(self, serializer):
        serializer.save(author=self.request.user)
    
    def perform_update(self, serializer):
        from django.core.exceptions import PermissionDenied
        if self.request.user == serializer.instance.author or self.request.user.is_staff:
            serializer.save()
        else:
            raise PermissionDenied("You do not have permission to edit this flashcard.")

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.user == instance.author or request.user.is_staff:
            self.perform_destroy(instance)
            return Response(status=status.HTTP_204_NO_CONTENT)
        else:
            return Response(status=status.HTTP_403_FORBIDDEN)