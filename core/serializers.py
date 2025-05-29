from rest_framework import serializers
from .models import Curriculum, Language, Subject, Label

class CurriculumSerializer(serializers.ModelSerializer):
    class Meta:
        model = Curriculum
        fields = ['id', 'name']

class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Language
        fields = ['id', 'name', 'code']

class SubjectSerializer(serializers.ModelSerializer):
    # Inclure des informations textuelles pour faciliter l'affichage côté client
    curriculum_name = serializers.CharField(source='curriculum.name', read_only=True)
    language_name = serializers.CharField(source='language.name', read_only=True)
    level_display = serializers.CharField(source='get_level_display', read_only=True)

    class Meta:
        model = Subject
        fields = [
            'id', 'name', 'level', 'level_display',
            'curriculum', 'curriculum_name', 
            'language', 'language_name'
        ]

class LabelSerializer(serializers.ModelSerializer):
    class Meta:
        model = Label
        fields = ['id', 'description', 'subject', 'parent']