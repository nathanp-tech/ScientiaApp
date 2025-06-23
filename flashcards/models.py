from django.db import models
from django.conf import settings
from core.models import Subject, Label, Language, Curriculum, StudySkill

class Flashcard(models.Model):
    """
    Represents a single flashcard with a question and an answer side.
    """
    STATUS_CHOICES = (
        ('in_progress', 'In Progress'),
        ('pending_review', 'Pending Review'),
        ('completed', 'Completed'),
    )

    # Core Content
    question = models.TextField(help_text="The question or front side of the flashcard.")
    answer = models.TextField(help_text="The answer or back side of the flashcard.")

    # Metadata and Classification (reusing core models)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='flashcards'
    )
    subject = models.ForeignKey(
        Subject,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    topic = models.ForeignKey(
        Label,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        help_text="The specific topic or chapter this flashcard covers."
    )
    language = models.ForeignKey(
        Language,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    curriculum = models.ForeignKey(
        Curriculum,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )
    study_skills = models.ManyToManyField(
        StudySkill,
        blank=True,
        related_name='flashcards',
        help_text="Associate this flashcard with one or more study skills."
    )
    
    # Workflow
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='in_progress'
    )
    
    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        # Return the first 50 characters of the question for a readable representation.
        return (self.question[:50] + '...') if len(self.question) > 50 else self.question
