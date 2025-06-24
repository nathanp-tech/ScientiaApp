# core/serializers.py

from rest_framework import serializers
# MODIFIED: Removed 'Slide' and 'SlideBlock' from this import
from .models import Curriculum, Language, Subject, Label, StudySkill, StudySkillCategory

class CurriculumSerializer(serializers.ModelSerializer):
    class Meta:
        model = Curriculum
        fields = ['id', 'name']

class LanguageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Language
        fields = ['id', 'name', 'code']

class SubjectSerializer(serializers.ModelSerializer):
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
        fields = ['id', 'description', 'subject', 'parent', 'numbering']

class StudySkillSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudySkill
        fields = ['id', 'name', 'description', 'order']

class StudySkillCategorySerializer(serializers.ModelSerializer):
    skills = StudySkillSerializer(many=True, read_only=True)

    class Meta:
        model = StudySkillCategory
        fields = ['id', 'name', 'description', 'order', 'skills']