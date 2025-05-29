from django.db import models
from django.db import models
from django.contrib.auth.models import User

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
    numbering = models.CharField(max_length=50, blank=True, null=True) # Nouveau champ pour "label"