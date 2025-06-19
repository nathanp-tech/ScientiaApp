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

        # --- OPTIMIZED Topic Hierarchy Logic ---
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)

            # --- Step 1: Fetch all data in bulk ---
            # Get all labels for the entire subject group (HL, SL, etc.)
            all_labels = Label.objects.filter(subject__name__startswith=subject_name).select_related('parent')
            
            # Get all content counts for this subject in a single query
            content_counts_qs = base_queryset.filter(subject__name__startswith=subject_name)\
                                              .values('topic_id')\
                                              .annotate(count=Count('id'))
            content_counts = {item['topic_id']: item['count'] for item in content_counts_qs}

            # --- Step 2: Process data in Python, not in the database ---
            # Build a dictionary for easy access and attach children lists
            labels_by_id = {label.id: label for label in all_labels}
            for label in labels_by_id.values():
                label.children_list = []
                label.own_count = content_counts.get(label.id, 0)
            
            root_nodes = []
            for label in labels_by_id.values():
                if label.parent_id and label.parent_id in labels_by_id:
                    labels_by_id[label.parent_id].children_list.append(label)
                else:
                    root_nodes.append(label)

            # In-memory recursive function to calculate total counts
            def calculate_total_counts(label):
                if hasattr(label, 'total_count'): # Avoid re-calculating (memoization)
                    return label.total_count
                
                total = label.own_count
                for child in label.children_list:
                    total += calculate_total_counts(child)
                label.total_count = total
                return total

            # Calculate totals for the entire tree
            for label in root_nodes:
                calculate_total_counts(label)

            # --- Step 3: Group by numbering and filter for the requested level ---
            parent_id_filter = int(topic_id) if topic_id else None

            # Group topics by their numbering to merge HL/SL versions
            grouped_topics = {}
            for label in labels_by_id.values():
                # We only want to display the direct children of the current level
                if label.parent_id == parent_id_filter:
                    numbering = label.numbering or ''
                    if numbering not in grouped_topics:
                        grouped_topics[numbering] = {
                            'representative_label': label,
                            'total_count': 0
                        }
            
            # Sum the total_counts for the merged HL/SL groups
            for numbering, data in grouped_topics.items():
                labels_in_group = [l for l in labels_by_id.values() if l.numbering == numbering and l.parent_id == parent_id_filter]
                data['total_count'] = sum(l.total_count for l in labels_in_group)
            
            # --- Step 4: Format and send the response ---
            response_data = []
            for numbering, data in grouped_topics.items():
                label_obj = data['representative_label']
                clean_description = re.sub(rf'^{re.escape(label_obj.numbering)}\s*[:\s]*', '', label_obj.description) if label_obj.numbering else label_obj.description
                final_label = f"{label_obj.numbering}: {clean_description}" if label_obj.numbering else clean_description
                
                if re.match(r'^S\d+', label_obj.description):
                    final_label = label_obj.description.strip()

                response_data.append({
                    'id': label_obj.id, # The ID used for the next drill-down
                    'label': final_label,
                    'count': data['total_count']
                })
            
            def sort_key(item):
                label_part = item['label'].split(':')[0]
                numbers = re.findall(r'\d+', label_part)
                return [int(n) for n in numbers]
            
            response_data.sort(key=sort_key)

            labels = [item['label'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data = [item['count'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'ids': ids})
            
        return Response({"error": "Invalid 'group_by' parameter."}, status=400)

