# core/models.py

from django.db import models
from django.contrib.auth.models import User

# --- Vos modèles existants (inchangés) ---

class Curriculum(models.Model):
    name = models.CharField(max_length=100, unique=True)
    def __str__(self):
        return self.name

class Language(models.Model):
    name = models.CharField(max_length=50, unique=True)
    code = models.CharField(max_length=10, unique=True, help_text="ex: 'fr', 'en-US'")
    def __str__(self):
        return self.name

class Subject(models.Model):
    class Level(models.IntegerChoices):
        SL = 1, 'SL'
        HL = 2, 'HL'
        OTHER = 3, 'Autre'

    name = models.CharField(max_length=200)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.CASCADE, related_name='subjects')
    language = models.ForeignKey(Language, on_delete=models.CASCADE, related_name='subjects')
    level = models.IntegerField(choices=Level.choices)
    class Meta:
        unique_together = ('name', 'curriculum', 'language', 'level')
    def __str__(self):
        return f"{self.name} ({self.get_level_display()}) - {self.curriculum.name}"

class Label(models.Model):
    description = models.CharField(max_length=255)
    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='labels')
    parent = models.ForeignKey('self', null=True, blank=True, on_delete=models.CASCADE, related_name='children')
    numbering = models.CharField(max_length=50, blank=True, null=True)
    def __str__(self):
        return f"{self.numbering} {self.description}"

class StudySkillCategory(models.Model):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True, help_text="A brief explanation of the category.")
    order = models.PositiveIntegerField(default=0, help_text="Order for display (e.g., 1 for 'Content', 2 for 'Exam Management').")

    class Meta:
        ordering = ['order']
        verbose_name_plural = "Study Skill Categories"

    def __str__(self):
        return self.name

class StudySkill(models.Model):
    category = models.ForeignKey(StudySkillCategory, on_delete=models.CASCADE, related_name='skills')
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, help_text="A brief explanation of the skill.")
    order = models.PositiveIntegerField(default=0, help_text="Order for display within the category.")
    
    class Meta:
        ordering = ['category__order', 'order']
        unique_together = ('category', 'name')

    def __str__(self):
        return f"{self.category.name} - {self.name}"


def get_initial_data_for_filters():
    """
    Fetches and structures the initial data needed for filter dropdowns
    across different creator/browser pages. This avoids repeating the same
    queries in multiple views.
    """
    # Note: We convert querysets to lists to make them JSON serializable
    # and to execute the database queries only once.
    data = {
        'curriculums': list(Curriculum.objects.values('id', 'name')),
        'languages': list(Language.objects.values('id', 'name')),
        'subjects': list(Subject.objects.values('id', 'name', 'level', 'curriculum_id', 'language_id')),
        'labels': list(Label.objects.values('id', 'description', 'subject_id')),
        'study_skill_categories': list(StudySkillCategory.objects.prefetch_related('skills').values(
            'name', 'skills__id', 'skills__name'
        ))
    }
    return data