# core/admin.py (UPDATED)

from django.contrib import admin
from .models import Curriculum, Language, Subject, Label, StudySkillCategory, StudySkill

@admin.register(Curriculum)
class CurriculumAdmin(admin.ModelAdmin):
    list_display = ('name',)

@admin.register(Language)
class LanguageAdmin(admin.ModelAdmin):
    list_display = ('name', 'code')

@admin.register(Subject)
class SubjectAdmin(admin.ModelAdmin):
    list_display = ('name', 'level', 'language', 'curriculum')
    list_filter = ('curriculum', 'language', 'level')
    search_fields = ('name',)

@admin.register(Label)
class LabelAdmin(admin.ModelAdmin):
    list_display = ('description', 'subject', 'parent')
    list_filter = ('subject__curriculum', 'subject__language')
    search_fields = ('description',)


class StudySkillInline(admin.TabularInline):
    """Allows editing skills directly within their category."""
    model = StudySkill
    extra = 1
    ordering = ['order']

@admin.register(StudySkillCategory)
class StudySkillCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'order', 'description')
    inlines = [StudySkillInline]

@admin.register(StudySkill)
class StudySkillAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'order')
    list_filter = ('category',)
    search_fields = ('name', 'description')