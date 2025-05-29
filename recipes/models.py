# recipes/models.py

from django.db import models
from django.contrib.auth.models import User
from core.models import Subject, Label, Language, Curriculum

class Recipe(models.Model):
    title = models.CharField(max_length=255)
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.SET_NULL, null=True, blank=True)
    topic = models.ForeignKey(Label, on_delete=models.SET_NULL, null=True, blank=True)
    language = models.ForeignKey(Language, on_delete=models.SET_NULL, null=True, blank=True)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # =========================================================================
    # ADD THIS META CLASS
    # =========================================================================
    class Meta:
        # This ensures that no two recipes can have the same combination
        # of these four fields at the database level.
        unique_together = ['language', 'curriculum', 'subject', 'topic']

    def __str__(self):
        return self.title

class RecipeBlock(models.Model):
    # ... no changes to RecipeBlock
    recipe = models.ForeignKey(Recipe, on_delete=models.CASCADE, related_name='blocks')
    order = models.PositiveIntegerField(help_text="Ordre du bloc dans la recette")
    template_name = models.CharField(max_length=50, help_text="ex: 'enonce', 'step'")
    content_html = models.TextField(blank=True)

    class Meta:
        ordering = ['order']
        unique_together = ('recipe', 'order')