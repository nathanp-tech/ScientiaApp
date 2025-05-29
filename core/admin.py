from django.contrib import admin

from django.contrib import admin
from .models import Curriculum, Language, Subject, Label

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