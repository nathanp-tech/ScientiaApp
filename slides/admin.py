from django.contrib import admin
from .models import Slide, SlideBlock

class SlideInline(admin.TabularInline):
    model = SlideBlock
    extra = 1
    fields = ('order', 'template_name', 'content_html')

@admin.register(Slide)
class SlideAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'subject', 'updated_at')
    list_filter = ('subject__curriculum', 'language', 'author')
    search_fields = ('title', 'blocks__content_html')
    inlines = [SlideInline]