from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone 

from core.models import Subject, Label, Language, Curriculum

class Slide(models.Model):
    # --- DÉBUT : DÉFINITION DU CHAMP STATUT ---
    STATUS_CHOICES = [
        ('in_progress', 'In Progress'),
        ('pending_review', 'Pending Review'),
        ('completed', 'Completed'),
    ]
    # --- FIN : DÉFINITION DU CHAMP STATUT ---

    title = models.CharField(max_length=255, default="Unknown Slideshow Title")
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.SET_NULL, null=True, blank=True)
    topic = models.ForeignKey(Label, on_delete=models.SET_NULL, null=True, blank=True)
    language = models.ForeignKey(Language, on_delete=models.SET_NULL, null=True, blank=True)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.SET_NULL, null=True, blank=True)
    
    # --- AJOUT DU CHAMP STATUS ---
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='in_progress')
    
    created_at = models.DateTimeField(default=timezone.now)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ['language', 'curriculum', 'subject', 'topic']
        verbose_name = "Slideshow"
        verbose_name_plural = "Slideshows"

    def __str__(self):
        return self.title if self.title else f"Slideshow {self.id}"

class SlideBlock(models.Model):
    slide = models.ForeignKey(Slide, on_delete=models.CASCADE, related_name='blocks')
    order = models.PositiveIntegerField(help_text="Order of the block in the slideshow")
    template_name = models.CharField(max_length=50, help_text="e.g., 'basic', 'two-column'")
    content_html = models.TextField(blank=True)

    class Meta:
        ordering = ['order']
        unique_together = ('slide', 'order')
        verbose_name = "Slide Block"
        verbose_name_plural = "Slide Blocks"