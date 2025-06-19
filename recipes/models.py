# recipes/models.py (UPDATED)

from django.db import models
from django.conf import settings
from core.models import Subject, Label, Language, Curriculum

class Recipe(models.Model):
    """
    Represents a single recipe, which is a collection of content blocks.
    The title is the unique identifier for a recipe.
    """
    STATUS_CHOICES = (
        ('in_progress', 'In Progress'),
        ('pending_review', 'Pending Review'),
        ('completed', 'Completed'),
    )

    title = models.CharField(max_length=255, unique=True, help_text="The unique title of the recipe.")

    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='recipes'
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
        help_text="The specific topic or chapter this recipe covers."
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
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='in_progress'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title


class RecipeBlock(models.Model):
    """
    A content block within a Recipe. Each block has a specific order and can contain
    either HTML content or an image.
    """
    recipe = models.ForeignKey(
        Recipe,
        on_delete=models.CASCADE,
        related_name='blocks'
    )
    order = models.PositiveIntegerField()
    template_name = models.CharField(max_length=100)
    
    # Text content for non-image blocks
    content_html = models.TextField(blank=True)

    # --- NEW FIELD ---
    # Image field for image blocks
    image = models.ImageField(upload_to='recipe_images/', null=True, blank=True)

    class Meta:
        ordering = ['order']
        unique_together = ('recipe', 'order')

    def __str__(self):
        return f"{self.recipe.title} - Block {self.order} ({self.template_name})"