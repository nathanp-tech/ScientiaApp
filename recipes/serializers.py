# recipes/serializers.py

from rest_framework import serializers
from .models import Recipe, RecipeBlock
from core.models import Subject, Label, Language, Curriculum

class RecipeBlockSerializer(serializers.ModelSerializer):
    class Meta:
        model = RecipeBlock
        fields = ['id', 'order', 'template_name', 'content_html']

class RecipeListSerializer(serializers.ModelSerializer):
    subject_name = serializers.CharField(source='subject.name', read_only=True, allow_null=True)
    author_name = serializers.CharField(source='author.username', read_only=True, allow_null=True)

    class Meta:
        model = Recipe
        fields = ['id', 'title', 'subject_name', 'author_name', 'status', 'updated_at']

class RecipeDetailSerializer(serializers.ModelSerializer):
    blocks = RecipeBlockSerializer(many=True)

    class Meta:
        model = Recipe
        fields = [
            'id', 'title', 'author', 'subject', 'topic', 'language',
            'curriculum', 'status', 'blocks', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at']

    def create(self, validated_data):
        blocks_data = validated_data.pop('blocks')
        # The new unique title constraint will be enforced by the database here
        recipe = Recipe.objects.create(**validated_data)
        for block_data in blocks_data:
            RecipeBlock.objects.create(recipe=recipe, **block_data)
        return recipe

    def update(self, instance, validated_data):
        blocks_data = validated_data.pop('blocks', None)

        # The unique check on title also happens on update
        instance.title = validated_data.get('title', instance.title)
        instance.author = validated_data.get('author', instance.author)
        instance.subject = validated_data.get('subject', instance.subject)
        instance.topic = validated_data.get('topic', instance.topic)
        instance.language = validated_data.get('language', instance.language)
        instance.curriculum = validated_data.get('curriculum', instance.curriculum)
        instance.status = validated_data.get('status', instance.status)
        instance.save()

        if blocks_data is not None:
            instance.blocks.all().delete()
            for block_data in blocks_data:
                RecipeBlock.objects.create(recipe=instance, **block_data)
        return instance