# videos/views.py

from django.shortcuts import render
from core.models import Subject

def video_home_view(request):
    """
    This view displays the feature's homepage with a dropdown to select a subject.
    """
    # We fetch all subjects to populate the dropdown.
    subjects = Subject.objects.all()
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