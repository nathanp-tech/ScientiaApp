from rest_framework import serializers
from .models import Flashcard

class FlashcardListSerializer(serializers.ModelSerializer):
    """
    Serializer for listing flashcards in the browser view.
    Provides read-only names for related fields for efficiency.
    """
    subject_name = serializers.CharField(source='subject.name', read_only=True, allow_null=True)
    author_name = serializers.CharField(source='author.username', read_only=True, allow_null=True)

    class Meta:
        model = Flashcard
        fields = ['id', 'question', 'subject_name', 'author_name', 'status', 'updated_at']

class FlashcardDetailSerializer(serializers.ModelSerializer):
    """
    Detailed serializer for creating, retrieving, and updating a single flashcard.
    """
    class Meta:
        model = Flashcard
        fields = [
            'id', 'question', 'answer', 'author', 'subject', 'topic', 'language',
            'curriculum', 'status', 'study_skills', 'created_at', 'updated_at'
        ]
        read_only_fields = ['author', 'created_at', 'updated_at']