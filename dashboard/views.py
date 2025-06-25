# dashboard/views.py
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Count
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from recipes.models import Recipe
from slides.models import Slide
from core.models import Label, Subject, Curriculum, Language

import re

# View to render the main HTML page for the dashboard
@login_required
@user_passes_test(lambda u: u.is_staff)
def dashboard_home_view(request):
    """
    Renders the main dashboard page and provides filter data.
    """
    curriculums = Curriculum.objects.all().order_by('name')
    languages = Language.objects.all().order_by('name')
    context = {
        'curriculums': curriculums,
        'languages': languages,
    }
    return render(request, 'dashboard/home.html', context)

# API View to provide aggregated data for our chart
class ChartDataAPIView(APIView):
    """
    API endpoint for chart data. All display logic is in English.
    Handles completion percentages and counts for recipes, and counts for other models.
    Applies filters for curriculum, language, and status.
    """
    permission_classes = [permissions.IsAdminUser]

    def _get_label_hierarchy(self, subject_name_filter):
        """
        Fetches all labels for a given subject filter and organizes them into a tree-like structure.
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

    def _calculate_completion_recursive(self, label, content_topic_ids):
        """
        Recursively calculates the completion percentage for a given label.
        """
        # Memoization to avoid re-calculating for the same label instance.
        if hasattr(label, 'completion_percentage'):
            return label.completion_percentage

        # Base case: if a label has no children, its completion depends on whether it has content.
        if not hasattr(label, 'children_list') or not label.children_list:
            percentage = 100.0 if label.id in content_topic_ids else 0.0
            label.completion_percentage = percentage
            return percentage

        # Recursive step: a parent's completion is the average of its children's.
        child_percentages = [self._calculate_completion_recursive(child, content_topic_ids) for child in label.children_list]
        percentage = sum(child_percentages) / len(child_percentages) if child_percentages else 0.0
        label.completion_percentage = percentage
        return percentage

    def get(self, request, *args, **kwargs):
        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_name = request.query_params.get('subject_name')
        topic_id = request.query_params.get('topic_id')
        
        # All filters
        status = request.query_params.get('status')
        curriculum_id = request.query_params.get('curriculum')
        language_id = request.query_params.get('language')

        ContentModel = Recipe if model_type == 'recipe' else Slide
        
        # Start with a base queryset and apply filters progressively
        base_queryset = ContentModel.objects.all()
        if curriculum_id and curriculum_id != 'ALL':
            base_queryset = base_queryset.filter(curriculum_id=curriculum_id)
        if language_id and language_id != 'ALL':
            base_queryset = base_queryset.filter(language_id=language_id)

        if group_by == 'subject':
            # Get a list of subjects that are relevant after filtering
            subject_names_qs = base_queryset.values_list('subject__name', flat=True).distinct()
            base_subject_names = sorted(list(set(re.split(r'\s+(HL|SL)$', name, 1)[0].strip() for name in subject_names_qs if name)))

            if model_type == 'recipe':
                # 1. Completion is calculated on the filtered set (curriculum, language), but ignores 'status'
                completion_queryset = base_queryset.filter(topic_id__isnull=False)
                content_topic_ids = set(completion_queryset.values_list('topic_id', flat=True))
                
                subject_completion_data = {}
                for base_name in base_subject_names:
                    labels_by_id, root_nodes = self._get_label_hierarchy(base_name)
                    if not root_nodes:
                        subject_completion_data[base_name] = 0.0
                        continue
                    
                    topic_completions = [self._calculate_completion_recursive(root_topic, content_topic_ids) for root_topic in root_nodes]
                    overall_completion = sum(topic_completions) / len(topic_completions) if topic_completions else 0.0
                    subject_completion_data[base_name] = overall_completion

                # 2. Counts are calculated based on all filters, including 'status'
                counting_queryset = base_queryset
                if status and status != 'ALL':
                    counting_queryset = counting_queryset.filter(status=status)
                
                aggregation = counting_queryset.values('subject__name').annotate(count=Count('id'))
                subject_counts = {base_name: 0 for base_name in base_subject_names}
                for item in aggregation:
                    full_name = item['subject__name']
                    if not full_name: continue
                    base_name = re.split(r'\s+(HL|SL)$', full_name, 1)[0].strip()
                    if base_name in subject_counts:
                        subject_counts[base_name] += item['count']
                
                # 3. Combine and sort the data for the response
                labels = base_subject_names
                percentages = [subject_completion_data.get(name, 0.0) for name in labels]
                counts = [subject_counts.get(name, 0) for name in labels]
                
                zipped_data = sorted(zip(labels, percentages, counts), key=lambda x: (-x[1], x[0]))
                sorted_labels, sorted_percentages, sorted_counts = zip(*zipped_data) if zipped_data else ([], [], [])

                return Response({
                    'labels': list(sorted_labels), 'data': list(sorted_percentages), 
                    'counts': list(sorted_counts), 'ids': list(sorted_labels), 
                    'dataType': 'percentage_and_count'
                })

            else: # For Slides or other models, we only need to calculate counts
                counting_queryset = base_queryset
                if status and status != 'ALL':
                    counting_queryset = counting_queryset.filter(status=status)

                aggregation = counting_queryset.values('subject__name').annotate(count=Count('id'))
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

        # Topic Drilldown logic (respects all base filters)
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)
            
            counting_queryset = base_queryset
            if status and status != 'ALL':
                counting_queryset = counting_queryset.filter(status=status)

            # The existing logic for topic drilldown is preserved here but operates on the filtered queryset
            all_labels = Label.objects.filter(subject__name__startswith=subject_name).select_related('parent')
            content_counts_qs = counting_queryset.filter(subject__name__startswith=subject_name)\
                                              .values('topic_id')\
                                              .annotate(count=Count('id'))
            content_counts = {item['topic_id']: item['count'] for item in content_counts_qs}
            labels_by_id, root_nodes = self._get_label_hierarchy(subject_name)
            
            for label in labels_by_id.values():
                label.own_count = content_counts.get(label.id, 0)

            memo = {}
            def calculate_total_counts(label):
                if label.id in memo: return memo[label.id]
                total = label.own_count
                for child in getattr(label, 'children_list', []):
                    total += calculate_total_counts(child)
                memo[label.id] = total
                label.total_count = total
                return total

            for label in root_nodes:
                calculate_total_counts(label)

            parent_id_filter = int(topic_id) if topic_id else None
            level_labels = [l for l in labels_by_id.values() if l.parent_id == parent_id_filter]
            
            response_data = []
            for label in level_labels:
                final_label = f"{label.numbering}: {label.description}" if label.numbering else label.description
                response_data.append({'id': label.id, 'label': final_label, 'count': getattr(label, 'total_count', 0)})
            
            response_data.sort(key=lambda item: [int(n) for n in re.findall(r'\d+', item['label'].split(':')[0])])
            labels = [item['label'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data = [item['count'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'ids': ids, 'dataType': 'count'})
            
        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
