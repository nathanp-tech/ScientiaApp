from rest_framework import serializers
from .models import Slide, SlideBlock
from core.models import Subject, Label, Language, Curriculum

# Renommé pour plus de clarté, car il sérialise le modèle SlideBlock.
class SlideBlockSerializer(serializers.ModelSerializer):
    """Sérialiseur pour un seul bloc de contenu (une slide)."""
    class Meta:
        model = SlideBlock
        fields = ['id', 'order', 'template_name', 'content_html']
        read_only_fields = ['id']


# --- DÉBUT DE LA CORRECTION ---
class SlideshowListSerializer(serializers.ModelSerializer):
    """Sérialiseur simplifié pour afficher une liste de présentations."""
    
    # On utilise un SerializerMethodField pour gérer le cas où l'auteur est None
    author_name = serializers.SerializerMethodField()

    class Meta:
        model = Slide
        fields = ['id', 'title', 'author_name', 'updated_at']

    def get_author_name(self, obj):
        """
        Cette fonction retourne le nom de l'auteur s'il existe,
        sinon elle retourne None pour éviter une erreur.
        """
        if obj.author:
            return obj.author.username
        return None
# --- FIN DE LA CORRECTION ---


class SlideshowDetailSerializer(serializers.ModelSerializer):
    """
    Sérialiseur détaillé pour une présentation complète, incluant tous ses blocs.
    """
    blocks = SlideBlockSerializer(many=True)

    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), allow_null=True)
    topic = serializers.PrimaryKeyRelatedField(queryset=Label.objects.all(), allow_null=True)
    language = serializers.PrimaryKeyRelatedField(queryset=Language.objects.all(), allow_null=True)
    curriculum = serializers.PrimaryKeyRelatedField(queryset=Curriculum.objects.all(), allow_null=True)

    class Meta:
        model = Slide
        fields = [
            'id', 'title', 'author', 'subject', 'topic', 'language',
            'curriculum', 'blocks', 'created_at', 'updated_at'
        ]
        read_only_fields = ['author', 'created_at', 'updated_at']


    def create(self, validated_data):
        blocks_data = validated_data.pop('blocks')
        slideshow = Slide.objects.create(**validated_data)
        
        for block_data in blocks_data:
            SlideBlock.objects.create(slide=slideshow, **block_data)
            
        return slideshow


    def update(self, instance, validated_data):
        blocks_data = validated_data.pop('blocks', None)
        
        instance.title = validated_data.get('title', instance.title)
        instance.subject = validated_data.get('subject', instance.subject)
        instance.topic = validated_data.get('topic', instance.topic)
        instance.language = validated_data.get('language', instance.language)
        instance.curriculum = validated_data.get('curriculum', instance.curriculum)
        instance.save()

        if blocks_data is not None:
            instance.blocks.all().delete()
            for block_data in blocks_data:
                SlideBlock.objects.create(slide=instance, **block_data)
                
        return instance