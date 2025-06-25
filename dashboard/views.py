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
    Handles completion percentages and counts for recipes, and counts for other models.
    """
    permission_classes = [permissions.IsAdminUser]

    def _get_label_hierarchy(self, subject_name_filter):
        """
        Fetches all labels for a given subject filter and organizes them into a tree-like structure.
        Returns a dictionary of labels by ID and a list of root nodes (topics).
        """
        all_labels = Label.objects.filter(subject__name__startswith=subject_name_filter).select_related('parent')
        
        labels_by_id = {label.id: label for label in all_labels}
        for label in labels_by_id.values():
            label.children_list = []

        root_nodes = []
        for label in labels_by_id.values():
            if label.parent_id and label.parent_id in labels_by_id:
                parent = labels_by_id[label.parent_id]
                parent.children_list.append(label)
            else:
                root_nodes.append(label)
        
        return labels_by_id, root_nodes

    def _calculate_completion_recursive(self, label, labels_by_id, content_topic_ids):
        """
        Recursively calculates the completion percentage for a given label.
        - A label's completion is the average completion of its direct children.
        - A leaf label (one with no children) is 100% complete if it has content, 0% otherwise.
        """
        if hasattr(label, 'completion_percentage'):
            return label.completion_percentage

        if not label.children_list:
            percentage = 100.0 if label.id in content_topic_ids else 0.0
            label.completion_percentage = percentage
            return percentage

        child_percentages = [
            self._calculate_completion_recursive(child, labels_by_id, content_topic_ids)
            for child in label.children_list
        ]

        if not child_percentages:
            percentage = 100.0 if label.id in content_topic_ids else 0.0
        else:
            percentage = sum(child_percentages) / len(child_percentages)
        
        label.completion_percentage = percentage
        return percentage

    def get(self, request, *args, **kwargs):
        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_name = request.query_params.get('subject_name')
        topic_id = request.query_params.get('topic_id')
        status = request.query_params.get('status')

        ContentModel = Recipe if model_type == 'recipe' else Slide

        if group_by == 'subject':
            all_subjects_qs = Subject.objects.values_list('name', flat=True).distinct()
            base_subject_names = sorted(list(set(re.split(r'\s+(HL|SL)$', name, 1)[0].strip() for name in all_subjects_qs)))

            # --- RECIPE: Percentage and Count Logic ---
            if model_type == 'recipe':
                # 1. Calculate status-independent completion percentage
                content_topic_ids = set(Recipe.objects.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
                subject_completion_data = {}
                for base_name in base_subject_names:
                    labels_by_id, root_nodes = self._get_label_hierarchy(base_name)
                    
                    if not root_nodes:
                        subject_completion_data[base_name] = 0.0
                        continue
                    
                    s_topics_exist = any(l.numbering and l.numbering.strip().upper().startswith('S') for l in root_nodes)
                    if s_topics_exist:
                         root_nodes = [l for l in root_nodes if not (l.numbering and l.numbering.strip().upper().startswith('S'))]

                    topic_completions = [self._calculate_completion_recursive(root_topic, labels_by_id, content_topic_ids) for root_topic in root_nodes]
                    overall_completion = sum(topic_completions) / len(topic_completions) if topic_completions else 0.0
                    subject_completion_data[base_name] = overall_completion

                # 2. Calculate status-dependent recipe counts
                counting_queryset = Recipe.objects.all()
                if status and status != 'ALL':
                    valid_statuses = ['in_progress', 'pending_review', 'completed']
                    if status in valid_statuses:
                        counting_queryset = counting_queryset.filter(status=status)
                
                aggregation = counting_queryset.values('subject__name').annotate(count=Count('id'))
                subject_counts = {base_name: 0 for base_name in base_subject_names}
                for item in aggregation:
                    full_name = item['subject__name']
                    if not full_name: continue
                    base_name = re.split(r'\s+(HL|SL)$', full_name, 1)[0].strip()
                    if base_name in subject_counts:
                        subject_counts[base_name] += item['count']

                # 3. Combine and sort data for response
                labels = base_subject_names
                percentages = [subject_completion_data.get(name, 0.0) for name in labels]
                counts = [subject_counts.get(name, 0) for name in labels]

                # Sort all lists together by percentage (desc), then name (asc)
                zipped_data = list(zip(labels, percentages, counts))
                zipped_data.sort(key=lambda x: (-x[1], x[0]))
                
                sorted_labels, sorted_percentages, sorted_counts = zip(*zipped_data) if zipped_data else ([], [], [])

                return Response({
                    'labels': list(sorted_labels),
                    'data': list(sorted_percentages),
                    'counts': list(sorted_counts),
                    'ids': list(sorted_labels),
                    'dataType': 'percentage_and_count'
                })

            # --- SLIDES (and other models): Count Logic ---
            else:
                base_queryset = ContentModel.objects.all()
                if status and status != 'ALL':
                    valid_statuses = ['in_progress', 'pending_review', 'completed']
                    if status in valid_statuses:
                        base_queryset = base_queryset.filter(status=status)
                
                aggregation = base_queryset.values('subject__name').annotate(count=Count('id'))
                
                subject_counts = {base_name: 0 for base_name in base_subject_names}
                for item in aggregation:
                    full_name = item['subject__name']
                    if not full_name: continue
                    base_name = re.split(r'\s+(HL|SL)$', full_name, 1)[0].strip()
                    if base_name in subject_counts:
                        subject_counts[base_name] += item['count']

                sorted_subjects = sorted(subject_counts.items(), key=lambda x: (-x[1], x[0]))
                labels = [item[0] for item in sorted_subjects]
                data = [item[1] for item in sorted_subjects]
                return Response({'labels': labels, 'data': data, 'ids': labels, 'dataType': 'count'})

        # --- Topic Drilldown Logic (remains count-based) ---
        if group_by == 'topic':
            # This part of the code for drilling down remains as it was, calculating counts.
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)

            counting_queryset = ContentModel.objects.all()
            if status and status != 'ALL':
                valid_statuses = ['in_progress', 'pending_review', 'completed']
                if status in valid_statuses:
                    counting_queryset = counting_queryset.filter(status=status)

            all_labels = Label.objects.filter(subject__name__startswith=subject_name).select_related('parent')
            content_counts_qs = counting_queryset.filter(subject__name__startswith=subject_name)\
                                              .values('topic_id')\
                                              .annotate(count=Count('id'))
            content_counts = {item['topic_id']: item['count'] for item in content_counts_qs}

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
            
            memo = {}
            def calculate_total_counts(label):
                if label.id in memo: return memo[label.id]
                total = label.own_count
                for child in label.children_list:
                    total += calculate_total_counts(child)
                memo[label.id] = total
                label.total_count = total
                return total

            for label in root_nodes:
                calculate_total_counts(label)

            parent_id_filter = int(topic_id) if topic_id else None
            level_labels = [l for l in labels_by_id.values() if l.parent_id == parent_id_filter]
            
            if parent_id_filter is None:
                s_topics_exist = any(l.numbering and l.numbering.strip().upper().startswith('S') for l in level_labels)
                if s_topics_exist:
                    level_labels = [l for l in level_labels if l.numbering and l.numbering.strip().upper().startswith('S')]
            
            grouped_topics = {}
            for label in level_labels:
                numbering = (label.numbering or '').strip().upper()
                if numbering not in grouped_topics:
                    grouped_topics[numbering] = { 'representative_label': label, 'total_count': 0 }
            
            for numbering, data in grouped_topics.items():
                labels_in_group = [l for l in level_labels if (l.numbering or '').strip().upper() == numbering]
                data['total_count'] = sum(getattr(l, 'total_count', 0) for l in labels_in_group)
            
            response_data = []
            for numbering, data in grouped_topics.items():
                label_obj = data['representative_label']
                clean_description = re.sub(rf'^{re.escape(label_obj.numbering)}\s*[:\s]*', '', label_obj.description) if label_obj.numbering else label_obj.description
                final_label = f"{label_obj.numbering}: {clean_description}" if label_obj.numbering else clean_description
                
                response_data.append({ 'id': label_obj.id, 'label': final_label, 'count': data['total_count'] })
            
            def sort_key(item):
                label_part = item['label'].split(':')[0]
                numbers = re.findall(r'\d+', label_part)
                return [int(n) for n in numbers]
            
            response_data.sort(key=sort_key)

            labels = [item['label'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data = [item['count'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'ids': ids, 'dataType': 'count'})
            
        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
