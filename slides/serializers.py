# slides/serializers.py

from rest_framework import serializers
from .models import Slide, SlideBlock
from core.models import Subject, Label, Language, Curriculum

class SlideBlockSerializer(serializers.ModelSerializer):
    """ Serializer for individual slide blocks (nested within a slideshow). """
    class Meta:
        model = SlideBlock
        fields = ['id', 'order', 'template_name', 'content_html']
        read_only_fields = ['id']

class SlideshowListSerializer(serializers.ModelSerializer):
    """
    A simplified serializer for listing slideshows in the browser.
    It uses SerializerMethodField for robustness against null relationships.
    """
    author_name = serializers.SerializerMethodField()
    subject_name = serializers.SerializerMethodField()

    class Meta:
        model = Slide
        fields = ['id', 'title', 'author_name', 'status', 'subject_name', 'updated_at']

    def get_author_name(self, obj):
        """ Safely get the author's username, or return 'N/A' if no author. """
        return obj.author.username if obj.author else 'N/A'

    def get_subject_name(self, obj):
        """ Safely get the subject's name, or return 'N/A' if no subject. """
        return obj.subject.name if obj.subject else 'N/A'


class SlideshowDetailSerializer(serializers.ModelSerializer):
    """
    A detailed serializer for creating, updating, and retrieving a single slideshow.
    """
    blocks = SlideBlockSerializer(many=True)
    
    # These fields are required for creating/updating but can be null.
    subject = serializers.PrimaryKeyRelatedField(queryset=Subject.objects.all(), allow_null=True, required=False)
    topic = serializers.PrimaryKeyRelatedField(queryset=Label.objects.all(), allow_null=True, required=False)
    language = serializers.PrimaryKeyRelatedField(queryset=Language.objects.all(), allow_null=True, required=False)
    curriculum = serializers.PrimaryKeyRelatedField(queryset=Curriculum.objects.all(), allow_null=True, required=False)

    class Meta:
        model = Slide
        fields = [
            'id', 'title', 'author', 'subject', 'topic', 'language',
            'curriculum', 'status', 'blocks', 'created_at', 'updated_at'
        ]
        read_only_fields = ['author', 'created_at', 'updated_at']

    def create(self, validated_data):
        """
        Handle creation of a slideshow and its nested slide blocks.
        """
        blocks_data = validated_data.pop('blocks', [])
        slideshow = Slide.objects.create(**validated_data)
        for block_data in blocks_data:
            SlideBlock.objects.create(slide=slideshow, **block_data)
        return slideshow

    def update(self, instance, validated_data):
        """
        Handle updating a slideshow and its nested slide blocks.
        This completely replaces the old blocks with the new set.
        """
        blocks_data = validated_data.pop('blocks', None)
        
        # Update standard fields on the Slideshow instance
        instance.title = validated_data.get('title', instance.title)
        instance.subject = validated_data.get('subject', instance.subject)
        instance.topic = validated_data.get('topic', instance.topic)
        instance.language = validated_data.get('language', instance.language)
        instance.curriculum = validated_data.get('curriculum', instance.curriculum)
        instance.status = validated_data.get('status', instance.status)
        instance.save()

        # If block data is provided, replace the existing blocks
        if blocks_data is not None:
            instance.blocks.all().delete()
            for block_data in blocks_data:
                SlideBlock.objects.create(slide=instance, **block_data)
                
        return instance