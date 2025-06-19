# dashboard/views.py
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from recipes.models import Recipe
from slides.models import Slide # CORRECT: The model class is named 'Slide'

# View to render the main HTML page for the dashboard
@login_required
@user_passes_test(lambda u: u.is_staff) # Ensures only staff can access
def dashboard_home_view(request):
    """Renders the main dashboard page."""
    return render(request, 'dashboard/home.html')

# API View to provide aggregated data for our chart
class ChartDataAPIView(APIView):
    """
    API endpoint for chart data, accessible only by admin users.
    Query Parameters:
    - `model`: 'recipe' or 'slide'
    - `group_by`: 'subject', 'topic', or 'author'
    - `subject_id`: (optional) ID to filter by a specific subject for drill-down.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, *args, **kwargs):
        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_id = request.query_params.get('subject_id')

        # Determine the model and base queryset to use
        if model_type == 'recipe':
            queryset = Recipe.objects.all()
        # --- CORRECTED LOGIC ---
        elif model_type == 'slide': # This must match the string sent by the JavaScript
            queryset = Slide.objects.all()
        # --- END CORRECTION ---
        else:
            return Response({"error": "Invalid model type specified."}, status=400)

        # Apply drill-down filter if provided
        if subject_id:
            queryset = queryset.filter(subject_id=subject_id)

        # Perform aggregation
        if group_by == 'subject':
            aggregation = queryset.values('subject__id', 'subject__name').annotate(count=Count('id')).order_by('-count')
            labels = [item['subject__name'] for item in aggregation if item['subject__name']]
            ids = [item['subject__id'] for item in aggregation if item['subject__name']]
            data = [item['count'] for item in aggregation if item['subject__name']]
        elif group_by == 'topic':
            if hasattr(queryset.model, 'topic'):
                aggregation = queryset.values('topic__id', 'topic__description').annotate(count=Count('id')).order_by('-count')
                labels = [item['topic__description'] for item in aggregation if item['topic__description']]
                ids = [item['topic__id'] for item in aggregation if item['topic__description']]
                data = [item['count'] for item in aggregation if item['topic__description']]
            else:
                labels, ids, data = [], [], [] # Return empty for models without a topic
        elif group_by == 'author':
            aggregation = queryset.values('author__id', 'author__username').annotate(count=Count('id')).order_by('-count')
            labels = [item['author__username'] for item in aggregation if item['author__username']]
            ids = [item['author__id'] for item in aggregation if item['author__username']]
            data = [item['count'] for item in aggregation if item['author__username']]
        else:
            return Response({"error": "Invalid 'group_by' parameter."}, status=400)

        return Response({'labels': labels, 'data': data, 'ids': ids})
