from django.db import models
from django.contrib.auth.models import User
# Curriculum is not directly on StudyPlan, but through Subject in config

class StudyPlan(models.Model):
    # student field is now unique, ensuring one plan per student.
    student = models.OneToOneField(
        User, 
        on_delete=models.CASCADE, 
        related_name='study_plan_planner', # Unique related_name
        primary_key=False # student is not the PK, id (auto-created) is.
                          # If you want student to be PK, set primary_key=True and remove default id.
                          # For simplicity with DRF, default id is fine, unique=True on student handles the logic.
    )
    name = models.CharField(
        max_length=255, 
        default="My Study Plan",
        help_text="Descriptive name for the plan, e.g., 'Spring Term Revisions'"
    )
    
    # config will store:
    # {
    #   "subjects": [ { "localId": 0, "pk": "1", "name": "Math HL", "examDate": "2025-05-20", "priority": "high", "color": "#3498db", "level_display": "HL" }, ... ],
    #   "availability": { "Monday": { "07:00": false, ... }, ... }
    # }
    config = models.JSONField(default=dict, help_text="Configuration of subjects, exam dates, priorities, availability...")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    # No unique_together needed if student field itself is unique.
    # class Meta:
    #     unique_together = ('student', 'name') # Removed, as student is now unique

    def __str__(self):
        return f"Study Plan for {self.student.username}"

class ScheduledSession(models.Model):
    study_plan = models.ForeignKey(StudyPlan, on_delete=models.CASCADE, related_name='sessions')
    subject_name = models.CharField(max_length=200) 
    subject_color = models.CharField(max_length=7, default='#808080') 
    start_time = models.DateTimeField()
    end_time = models.DateTimeField()
    subject_local_id = models.IntegerField(null=True, blank=True, help_text="Links to localId in config.subjects")

    class Meta:
        ordering = ['start_time']
        verbose_name = "Scheduled Session"
        verbose_name_plural = "Scheduled Sessions"

    def __str__(self):
        return f"{self.subject_name} for {self.study_plan.student.username} at {self.start_time.strftime('%Y-%m-%d %H:%M')}"
