# core/views.py

from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test


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

@login_required
@user_passes_test(lambda u: u.is_staff)
def admin_dashboard_view(request):
    """
    Displays the custom admin dashboard page.
    """
    context = {} # Vous pouvez ajouter des statistiques ou d'autres données ici plus tard
    return render(request, 'admin/index.html', context)