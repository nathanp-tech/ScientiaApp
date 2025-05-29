
from django.contrib import admin
from .models import Recipe, RecipeBlock

class RecipeBlockInline(admin.TabularInline):
    model = RecipeBlock
    extra = 1
    fields = ('order', 'template_name', 'content_html')

@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    list_display = ('title', 'author', 'subject', 'updated_at')
    list_filter = ('subject__curriculum', 'language', 'author')
    search_fields = ('title', 'blocks__content_html')
    inlines = [RecipeBlockInline]