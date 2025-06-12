# videos/views.py

from django.shortcuts import render
from core.models import Subject

def video_home_view(request):
    """
    This view displays the feature's homepage with a dropdown to select a subject.
    """
    # --- MODIFICATION ---
    # We fetch unique subject names to avoid duplicates like 'Physics' appearing twice.
    subjects = Subject.objects.order_by('name').values('name').distinct()
    
    context = {
        'subjects': subjects
    }
    return render(request, 'videos/video_home.html', context)

def physics_formulas_view(request):
    """
    This view displays the page with the physics formulas.
    """
    # This view simply renders the template.
    # The formulas are in the template itself.
    return render(request, 'videos/physics_formulas.html')