# core/views.py

from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required
def landing_page_view(request):
    """
    View for the main landing page. [cite: 1]

    The @login_required decorator protects this view, ensuring that only
    authenticated users can access it. If a user is not logged in, they
    will be automatically redirected to the URL specified by LOGIN_URL in
    the project's settings.
    """
    return render(request, 'index.html')