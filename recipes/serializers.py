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
        fields = ['id', 'title', 'subject_name', 'author_name', 'updated_at']

class RecipeDetailSerializer(serializers.ModelSerializer):
    blocks = RecipeBlockSerializer(many=True)
    # Vous pouvez aussi ajouter des champs _name pour les clés étrangères pour un meilleur affichage
    # au retour, mais ce n'est pas lié à l'erreur actuelle.

    class Meta:
        model = Recipe
        fields = [
            'id', 'title', 'author', 'subject', 'topic', 'language', 
            'curriculum', 'blocks', 'created_at', 'updated_at'
        ]
        read_only_fields = ['created_at', 'updated_at'] # <--- AJOUTEZ CETTE LIGNE

    def create(self, validated_data):
        blocks_data = validated_data.pop('blocks')
        # L'auteur est géré par la vue via perform_create
        recipe = Recipe.objects.create(**validated_data)
        for block_data in blocks_data:
            RecipeBlock.objects.create(recipe=recipe, **block_data)
        return recipe

    def update(self, instance, validated_data):
        blocks_data = validated_data.pop('blocks', None)
        
        # Mettre à jour les champs simples de la recette
        instance.title = validated_data.get('title', instance.title)
        instance.author = validated_data.get('author', instance.author) # L'auteur peut être modifié
        instance.subject = validated_data.get('subject', instance.subject)
        instance.topic = validated_data.get('topic', instance.topic)
        instance.language = validated_data.get('language', instance.language)
        instance.curriculum = validated_data.get('curriculum', instance.curriculum)
        instance.save() # Sauvegarde les champs de l'instance Recipe

        # Mettre à jour, créer ou supprimer des blocs
        if blocks_data is not None:
            # Approche : Supprimer les anciens blocs et recréer les nouveaux.
            # C'est simple mais peut être inefficace pour de grosses mises à jour.
            # Une approche plus fine consisterait à matcher les IDs des blocs.
            instance.blocks.all().delete()
            for block_data in blocks_data:
                RecipeBlock.objects.create(recipe=instance, **block_data)
        return instance 