from rest_framework import viewsets, permissions
from .models import Curriculum, Language, Subject, Label
from .serializers import CurriculumSerializer, LanguageSerializer, SubjectSerializer, LabelSerializer

# On utilise des ViewSets en lecture seule car ces données sont généralement
# gérées via l'interface d'administration Django.

class CurriculumViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Curriculum.objects.all()
    serializer_class = CurriculumSerializer
    permission_classes = [permissions.IsAuthenticated]

class LanguageViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Language.objects.all()
    serializer_class = LanguageSerializer
    permission_classes = [permissions.IsAuthenticated]

class SubjectViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Subject.objects.select_related('curriculum', 'language').all()
    serializer_class = SubjectSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Activer le filtrage si nécessaire
    # filterset_fields = ['curriculum', 'language']

class LabelViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Label.objects.all()
    serializer_class = LabelSerializer
    permission_classes = [permissions.IsAuthenticated]
    # filterset_fields = ['subject']