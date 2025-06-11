from django.contrib import admin
from .models import Recipe, RecipeBlock

class RecipeBlockInline(admin.TabularInline):
    model = RecipeBlock
    extra = 1
    fields = ('order', 'template_name', 'content_html')

@admin.register(Recipe)
class RecipeAdmin(admin.ModelAdmin):
    # --- ADD 'status' TO list_display and list_filter ---
    list_display = ('title', 'author', 'subject', 'status', 'updated_at')
    list_filter = ('subject__curriculum', 'language', 'author', 'status')
    search_fields = ('title', 'blocks__content_html')
    inlines = [RecipeBlockInline]