from django.contrib import admin
from .models import Flashcard

@admin.register(Flashcard)
class FlashcardAdmin(admin.ModelAdmin):
    list_display = ('__str__', 'author', 'subject', 'status', 'updated_at')
    list_filter = ('status', 'subject', 'language', 'curriculum', 'study_skills')
    search_fields = ('question', 'answer')
    
    # Use filter_horizontal for a better ManyToManyField user experience in the admin
    filter_horizontal = ('study_skills',)
