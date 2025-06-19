# recipes/serializers.py (UPDATED)

from rest_framework import serializers
from .models import Recipe, RecipeBlock
from core.models import Subject, Label, Language, Curriculum

class RecipeBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeBlock
        # --- MODIFIED: Add 'image' to fields ---
        fields = ['id', 'order', 'template_name', 'content_html', 'image']


class RecipeListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True, allow_null=True)
    author_name = serializers.CharField(source='author.username', read_only=True, allow_null=True)

    class Meta:
        model = Recipe
        fields = ['id', 'title', 'subject_name', 'author_name', 'status', 'updated_at']


class RecipeDetailSerializer(serializers.ModelSerializer):
    blocks = RecipeBlockSerializer(many=True, read_only=True) # Blocks are created/updated in the view

    class Meta:
        model = Recipe
        fields = [
            'id', 'title', 'author', 'subject', 'topic', 'language',
            'curriculum', 'status', 'blocks', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at', 'author']