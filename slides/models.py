from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone 

from core.models import Subject, Label, Language, Curriculum

class Slide(models.Model):
    title = models.CharField(max_length=255, default="Unknown Slideshow Title") # Changed default
    author = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    subject = models.ForeignKey(Subject, on_delete=models.SET_NULL, null=True, blank=True)
    topic = models.ForeignKey(Label, on_delete=models.SET_NULL, null=True, blank=True) # 'topic' is the FK to Label
    language = models.ForeignKey(Language, on_delete=models.SET_NULL, null=True, blank=True)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(default=timezone.now) # Use timezone.now for default
    updated_at = models.DateTimeField(auto_now=True)

    # =========================================================================
    # ADD THIS META CLASS
    # =========================================================================
    class Meta:
        # This ensures that no two slides can have the same combination
        # of these four fields at the database level.
        # Ensure these field names match your Slide model exactly.
        unique_together = ['language', 'curriculum', 'subject', 'topic']
        verbose_name = "Slideshow" # Added for clarity in admin
        verbose_name_plural = "Slideshows" # Added for clarity in admin


    def __str__(self):
        return self.title if self.title else f"Slideshow {self.id}"

class SlideBlock(models.Model):
    # No changes needed for SlideBlock for this feature
    slide = models.ForeignKey(Slide, on_delete=models.CASCADE, related_name='blocks')
    order = models.PositiveIntegerField(help_text="Order of the block in the slideshow")
    template_name = models.CharField(max_length=50, help_text="e.g., 'basic', 'two-column'")
    content_html = models.TextField(blank=True)

    class Meta:
        ordering = ['order']
        unique_together = ('slide', 'order')
        verbose_name = "Slide Block"
        verbose_name_plural = "Slide Blocks"
