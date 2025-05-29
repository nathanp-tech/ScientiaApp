from django.contrib import admin
from .models import StudyPlan, ScheduledSession

class ScheduledSessionInline(admin.TabularInline):
    model = ScheduledSession
    extra = 0 # Don't show empty forms by default
    # Make fields read-only in the inline view as they are derived from the plan or auto-set
    readonly_fields = ('subject_name', 'subject_color', 'start_time', 'end_time', 'subject_local_id') 
    can_delete = True # Allow deletion of individual sessions if needed
    show_change_link = False # Optional: hide change link for individual sessions from inline

@admin.register(StudyPlan)
class StudyPlanAdmin(admin.ModelAdmin):
    list_display = ('name', 'student_username_display', 'curriculum_display', 'updated_at', 'view_sessions_link')
    list_filter = ('student__username',) # Filter by student username
    search_fields = ('name', 'student__username')
    inlines = [ScheduledSessionInline]
    readonly_fields = ('created_at', 'updated_at')
    
    fieldsets = (
        (None, {
            'fields': ('name', 'student')
        }),
        ('Configuration (JSON)', {
            'classes': ('collapse',), # Make the raw JSON config collapsible
            'fields': ('config',)
        }),
        ('Timestamps', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def student_username_display(self, obj):
        return obj.student.username
    student_username_display.short_description = "Student"
    student_username_display.admin_order_field = 'student__username'


    def curriculum_display(self, obj):
        """
        Attempts to display the curriculum.
        This example assumes curriculum info might be in the first subject's config.
        Adjust logic if curriculum is stored differently or if multiple curricula are possible.
        """
        try:
            if obj.config and 'subjects' in obj.config and obj.config['subjects']:
                first_subject_with_curriculum = next(
                    (s for s in obj.config['subjects'] if s.get('curriculum_name')), 
                    None
                )
                if first_subject_with_curriculum:
                    return first_subject_with_curriculum['curriculum_name']
        except (TypeError, KeyError): # Handle cases where config might not be structured as expected
            pass
        return "N/A" # Or "Multiple", or other appropriate placeholder
    curriculum_display.short_description = "Curriculum (from Config)"

    def view_sessions_link(self, obj):
        from django.urls import reverse
        from django.utils.html import format_html
        count = obj.sessions.count()
        if count == 0:
            return "No sessions"
        # Link to the changelist of ScheduledSession, filtered by this StudyPlan
        url = (
            reverse("admin:planner_scheduledsession_changelist")
            + "?"
            + f"study_plan__id__exact={obj.id}"
        )
        return format_html('<a href="{}">{} Session(s)</a>', url, count)
    view_sessions_link.short_description = "View Sessions"


@admin.register(ScheduledSession)
class ScheduledSessionAdmin(admin.ModelAdmin):
    list_display = ('study_plan_link', 'subject_name', 'start_time', 'end_time')
    list_filter = ('study_plan__student__username', 'subject_name', 'start_time') # Filter by student via study_plan
    search_fields = ('subject_name', 'study_plan__name', 'study_plan__student__username')
    date_hierarchy = 'start_time'
    list_select_related = ('study_plan', 'study_plan__student') # Optimize queries

    def study_plan_link(self, obj):
        from django.urls import reverse
        from django.utils.html import format_html
        link = reverse("admin:planner_studyplan_change", args=[obj.study_plan.id])
        return format_html('<a href="{}">{} (for {})</a>', link, obj.study_plan.name, obj.study_plan.student.username)
    study_plan_link.short_description = 'Study Plan'
    study_plan_link.admin_order_field = 'study_plan__name'

