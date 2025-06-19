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
    API endpoint for chart data. All display logic is in English.
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

        # --- Subject Grouping Logic ---
        if group_by == 'subject':
            # This logic correctly groups subjects (like Chemistry HL/SL) and shows all of them.
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

        # --- FINAL REVISED Topic Hierarchy Logic ---
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)

            # This queryset is for counting content.
            queryset = base_queryset.filter(subject__name__startswith=subject_name)
            
            # Determine the parent level for the topics we want to display.
            parent_id_filter = topic_id if topic_id else None

            # Get all potential labels for the subject group (e.g., Chemistry HL & SL) at the current level.
            # This is the key change: We fetch ALL labels from the curriculum first.
            potential_labels = Label.objects.filter(
                subject__name__startswith=subject_name,
                parent_id=parent_id_filter
            ).order_by('numbering')
            
            # Group these labels by their numbering (e.g., 'S1', '1.1') to merge HL/SL versions.
            grouped_topics = {}
            for label in potential_labels:
                numbering = label.numbering
                if numbering not in grouped_topics:
                    # Store the first label we see for this numbering group. It will be our "representative".
                    grouped_topics[numbering] = {
                        'representative_label': label,
                        'total_count': 0
                    }

            # Now, calculate the total count for each group of topics.
            for numbering, data in grouped_topics.items():
                # Find all labels that match this numbering (e.g., 'S1' from both HL and SL).
                labels_in_group = potential_labels.filter(numbering=numbering)
                
                total_count_for_group = 0
                for label_instance in labels_in_group:
                    # For each label in the group (e.g., the HL one), get its children recursively.
                    descendant_ids = self._get_all_children_ids(label_instance)
                    all_ids_to_count = [label_instance.id] + descendant_ids
                    # Add the count from this branch (e.g., HL branch) to the group's total.
                    total_count_for_group += queryset.filter(topic_id__in=all_ids_to_count).count()
                
                data['total_count'] = total_count_for_group

            # Format the data for the API response.
            response_data = []
            for numbering, data in grouped_topics.items():
                # ** FIX ** No longer filtering by count. All topics are included.
                label_obj = data['representative_label']
                
                # Clean up the label description to prevent duplicated numbering.
                clean_description = re.sub(rf'^{re.escape(label_obj.numbering)}\s*[:\s]*', '', label_obj.description)
                final_label = f"{label_obj.numbering}: {clean_description}"
                if re.match(r'^S\d+', label_obj.description):
                    final_label = label_obj.description.strip()

                response_data.append({
                    'id': label_obj.id, # Use the representative ID for the next drill-down.
                    'label': final_label,
                    'count': data['total_count']
                })
            
            # Sort by the numeric part of the numbering for correct order.
            response_data.sort(key=lambda x: [int(i) for i in x['label'].split(':')[0].replace('S','').split('.') if i.isdigit()])

            labels = [item['label'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data = [item['count'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'ids': ids})
            
        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
