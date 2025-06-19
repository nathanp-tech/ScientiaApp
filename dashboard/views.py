# dashboard/views.py
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from recipes.models import Recipe
from slides.models import Slide
from core.models import Label, Subject

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
    """
    permission_classes = [permissions.IsAdminUser]

    def _get_all_children_ids(self, label):
        """
        Recursively fetches all descendant IDs for a given Label object.
        """
        children = label.children.all()
        ids = list(children.values_list('id', flat=True))
        for child in children:
            ids.extend(self._get_all_children_ids(child))
        return ids

    def get(self, request, *args, **kwargs):
        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_name = request.query_params.get('subject_name')
        topic_id = request.query_params.get('topic_id')

        if model_type == 'recipe':
            base_queryset = Recipe.objects.all()
        elif model_type == 'slide':
            base_queryset = Slide.objects.all()
        else:
            return Response({"error": "Invalid model type specified."}, status=400)

        if group_by == 'subject':
            all_subject_names = Subject.objects.values_list('name', flat=True).distinct()
            processed_subjects = {}
            for name in all_subject_names:
                base_name = re.split(r'\s+(HL|SL)$', name, 1)[0].strip()
                processed_subjects[base_name] = 0

            aggregation = base_queryset.values('subject__name').annotate(count=Count('id'))
            
            for item in aggregation:
                full_name = item['subject__name']
                if not full_name: continue
                base_name = re.split(r'\s+(HL|SL)$', full_name, 1)[0].strip()
                if base_name in processed_subjects:
                    processed_subjects[base_name] += item['count']

            sorted_subjects = sorted(processed_subjects.items(), key=lambda x: (-x[1], x[0]))
            
            labels = [item[0] for item in sorted_subjects]
            data = [item[1] for item in sorted_subjects]
            ids = labels

            return Response({'labels': labels, 'data': data, 'ids': ids})

        # --- MODIFIED Topic Hierarchy Logic ---
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)

            queryset = base_queryset.filter(subject__name__startswith=subject_name)
            topic_ids_in_use = queryset.values_list('topic_id', flat=True).distinct()
            
            # Filter Label model based on whether they are in use and their parent level
            if topic_id:
                # Get children of a specific topic
                labels_queryset = Label.objects.filter(id__in=topic_ids_in_use, parent_id=topic_id)
            else:
                # Get top-level topics for the subject
                all_subject_labels = Label.objects.filter(subject__name__startswith=subject_name)
                top_level_ids = [label.id for label in all_subject_labels if label.parent is None]
                labels_queryset = Label.objects.filter(id__in=top_level_ids)

            response_data = []
            for label in labels_queryset.order_by('numbering'):
                # --- FIX: Aggregate count from self and all children ---
                descendant_ids = self._get_all_children_ids(label)
                all_topic_ids_for_count = [label.id] + descendant_ids
                count = queryset.filter(topic_id__in=all_topic_ids_for_count).count()
                
                # --- FIX: Clean up the label description ---
                # This removes duplicated numbering, e.g., "2.1 2.1:" becomes "2.1:"
                clean_description = label.description
                if clean_description.startswith(label.numbering):
                    clean_description = clean_description[len(label.numbering):].lstrip()
                    # Also, handle cases like "2.1 : " vs "2.1: "
                    if clean_description.startswith(':'):
                        clean_description = clean_description[1:].lstrip()

                final_label = f"{label.numbering}: {clean_description}"
                # Special case: If description already contains "S1", "S2", etc., just use that.
                if re.match(r'^S\d+', label.description):
                     final_label = label.description
                
                # We add the topic to the list only if it or its children have content.
                if count > 0:
                    response_data.append({
                        'id': label.id,
                        'label': final_label,
                        'count': count
                    })
            
            # Sort by the numeric part of the numbering for correct order
            response_data.sort(key=lambda x: [int(i) for i in x['label'].split(':')[0].replace('S','').split('.') if i.isdigit()])

            labels = [item['label'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data = [item['count'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'ids': ids})
            
        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
