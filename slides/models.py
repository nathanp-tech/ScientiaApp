# slides/models.py

from django.db import models
from django.contrib.auth.models import User
from core.models import Curriculum, Language, Subject, Label

class Slide(models.Model):
    """
    Represents a full slideshow presentation, which acts as a container for individual slide blocks.
    Note: The class is named 'Slide' but it represents the entire 'Slideshow'.
    """
    title = models.CharField(max_length=200)
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='slides')
    
    # Fields for categorization and filtering
    subject = models.ForeignKey(Subject, on_delete=models.SET_NULL, null=True, blank=True)
    topic = models.ForeignKey(Label, on_delete=models.SET_NULL, null=True, blank=True, help_text="Specific topic within the subject")
    language = models.ForeignKey(Language, on_delete=models.SET_NULL, null=True, blank=True)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.SET_NULL, null=True, blank=True)
    
    # Workflow status
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('pending_review', 'Pending Review'),
        ('completed', 'Completed'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name = "Slideshow"
        verbose_name_plural = "Slideshows"

    def __str__(self):
        return self.title

class SlideBlock(models.Model):
    """
    Represents a single slide (a content block) within a Slideshow.
    """
    slide = models.ForeignKey(Slide, on_delete=models.CASCADE, related_name='blocks')
    order = models.PositiveIntegerField(help_text="The order of the slide in the presentation.")
    template_name = models.CharField(max_length=50, help_text="The name of the template used for this slide.")
    content_html = models.TextField(help_text="The raw HTML content of the slide.")

    class Meta:
        ordering = ['slide', 'order']

    def __str__(self):
        return f"Block {self.order} for Slideshow: {self.slide.title}"