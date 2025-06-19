# dashboard/views.py
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from recipes.models import Recipe
from slides.models import Slide
from core.models import Label, Subject # Make sure to import Subject

import re

# View to render the main HTML page for the dashboard
@login_required
@user_passes_test(lambda u: u.is_staff)
def dashboard_home_view(request):
    """Renders the main dashboard page."""
    return render(request, 'dashboard/home.html')

# API View to provide aggregated data for our chart
class ChartDataAPIView(APIView):
    """
    API endpoint for chart data.
    Query Parameters:
    - `model`: 'recipe' or 'slide'
    - `group_by`: 'subject' or 'topic'
    - `subject_name`: (optional) Name of a subject to filter by. Used for drill-down.
    - `topic_id`: (optional) ID of a parent topic to get its children. Used for drill-down.
    """
    permission_classes = [permissions.IsAdminUser]

    def get(self, request, *args, **kwargs):
        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_name = request.query_params.get('subject_name')
        topic_id = request.query_params.get('topic_id')

        # Determine the model for queryset
        if model_type == 'recipe':
            base_queryset = Recipe.objects.all()
        elif model_type == 'slide':
            base_queryset = Slide.objects.all()
        else:
            return Response({"error": "Invalid model type specified."}, status=400)

        # --- MODIFIED Subject Grouping Logic ---
        if group_by == 'subject':
            # 1. Get all unique subject names from the Subject model to ensure all are represented.
            all_subject_names = Subject.objects.values_list('name', flat=True).distinct()
            
            # 2. Process all names to get a unique set of base names, initialized to 0.
            # This regex now ONLY groups by HL/SL, leaving others like AA/AI intact.
            processed_subjects = {}
            for name in all_subject_names:
                base_name = re.split(r'\s+(HL|SL)$', name, 1)[0].strip()
                processed_subjects[base_name] = 0

            # 3. Get the actual counts from the content models (Recipe/Slide).
            aggregation = base_queryset.values('subject__name').annotate(count=Count('id'))
            
            # 4. Populate the counts for subjects that have content.
            for item in aggregation:
                full_name = item['subject__name']
                if not full_name:
                    continue
                # Use the same regex to find the correct base name to aggregate into.
                base_name = re.split(r'\s+(HL|SL)$', full_name, 1)[0].strip()
                if base_name in processed_subjects:
                    processed_subjects[base_name] += item['count']

            # Sort the grouped subjects by count (desc) and then by name (asc)
            sorted_subjects = sorted(processed_subjects.items(), key=lambda x: (-x[1], x[0]))
            
            labels = [item[0] for item in sorted_subjects]
            data = [item[1] for item in sorted_subjects]
            ids = labels  # The ID for drill-down is the subject base name

            return Response({'labels': labels, 'data': data, 'ids': ids})

        # --- Topic Hierarchy Logic (remains the same) ---
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)
            
            # Since subjects are grouped (e.g., Chemistry), we filter using startswith.
            # For subjects that were not grouped (e.g., Maths AA), this will find the exact match.
            queryset = base_queryset.filter(subject__name__startswith=subject_name)
            
            topic_ids_in_use = queryset.values_list('topic_id', flat=True).distinct()
            labels_queryset = Label.objects.filter(id__in=topic_ids_in_use)

            if topic_id:
                labels_queryset = labels_queryset.filter(parent_id=topic_id)
            else:
                labels_queryset = labels_queryset.filter(parent_id__isnull=True)

            response_data = []
            for label in labels_queryset.order_by('numbering'):
                count = queryset.filter(topic=label).count()
                if count > 0:
                    response_data.append({
                        'id': label.id,
                        'label': f"{label.numbering} {label.description}",
                        'count': count
                    })
            
            response_data.sort(key=lambda x: [int(i) for i in x['label'].split(' ')[0].split('.') if i])

            labels = [item['label'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data = [item['count'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'ids': ids})
            
        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
