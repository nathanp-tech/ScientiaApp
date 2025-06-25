# dashboard/views.py
from django.shortcuts import render
from django.contrib.auth.decorators import login_required, user_passes_test
from django.db.models import Count, Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import permissions
from recipes.models import Recipe
from slides.models import Slide
from core.models import Label, Subject, Curriculum, Language
import re
from collections import defaultdict

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

class ChartDataAPIView(APIView):
    """
    API endpoint for chart data. All display logic is in English.
    Handles completion percentages and counts for recipes, and counts for other models.
    Applies filters for curriculum, language, and status.
    """
    permission_classes = [permissions.IsAdminUser]
    
    # Memoization caches to speed up recursive calculations within a single request
    _completion_memo = {}
    _count_memo = {}
    _leaf_nodes_memo = {}

    def _get_all_descendant_leaf_nodes(self, label, labels_by_id):
        """
        Recursively finds all leaf nodes (labels with no children) under a given label.
        Uses memoization to avoid redundant lookups.
        """
        if label.id in self._leaf_nodes_memo:
            return self._leaf_nodes_memo[label.id]

        leaf_nodes = []
        if not label.children_list:
            leaf_nodes.append(label)
        else:
            for child in label.children_list:
                leaf_nodes.extend(self._get_all_descendant_leaf_nodes(child, labels_by_id))
        
        self._leaf_nodes_memo[label.id] = leaf_nodes
        return leaf_nodes

    def _calculate_completion_recursive(self, label, content_topic_ids, labels_by_id):
        """
        Calculates completion for a label based on its leaf node descendants.
        A label's completion is the percentage of its leaf nodes that have content.
        """
        if label.id in self._completion_memo:
            return self._completion_memo[label.id]

        all_leaves = self._get_all_descendant_leaf_nodes(label, labels_by_id)
        if not all_leaves:
            # If a label has no leaves (e.g., an empty topic), completion is 0
            return 0

        completed_leaves = sum(1 for leaf in all_leaves if leaf.id in content_topic_ids)
        
        percentage = (completed_leaves / len(all_leaves)) * 100 if all_leaves else 0
        rounded_percentage = round(percentage)
        self._completion_memo[label.id] = rounded_percentage
        return rounded_percentage

    def _calculate_total_counts_recursive(self, label, content_counts):
        """
        Recursively calculates the total count of content items for a label and its children.
        """
        if label.id in self._count_memo:
            return self._count_memo[label.id]

        total = content_counts.get(label.id, 0)
        for child in label.children_list:
            total += self._calculate_total_counts_recursive(child, content_counts)
        
        self._count_memo[label.id] = total
        return total

    def get(self, request, *args, **kwargs):
        # Clear memos for each new request
        self._completion_memo.clear()
        self._count_memo.clear()
        self._leaf_nodes_memo.clear()

        # Get all query parameters
        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_name = request.query_params.get('subject_name')
        topic_id = request.query_params.get('topic_id')
        status = request.query_params.get('status')
        curriculum_id = request.query_params.get('curriculum')
        language_id = request.query_params.get('language')

        ContentModel = Recipe if model_type == 'recipe' else Slide
        
        # --- Create a base queryset with filters that apply to ALL queries ---
        base_content_queryset = ContentModel.objects.all()
        if curriculum_id and curriculum_id != 'ALL':
            base_content_queryset = base_content_queryset.filter(curriculum_id=curriculum_id)
        if language_id and language_id != 'ALL':
            base_content_queryset = base_content_queryset.filter(language_id=language_id)

        # The queryset for counting also respects the status filter
        counting_queryset = base_content_queryset
        if status and status != 'ALL':
            counting_queryset = counting_queryset.filter(status=status)

        # --- SUBJECT-LEVEL VIEW ---
        if group_by == 'subject':
            # 1. Get ALL subjects first to ensure none are missing from the chart
            all_subjects_qs = Subject.objects.all()
            if curriculum_id and curriculum_id != 'ALL':
                all_subjects_qs = all_subjects_qs.filter(curriculum_id=curriculum_id)

            # Create a dict of all possible base subject names to ensure we show subjects with 0 recipes
            all_base_subject_names = sorted(list(set(re.split(r'\s+(HL|SL)$', name, 1)[0].strip() for name in all_subjects_qs.values_list('name', flat=True) if name)))
            
            # 2. Get data based on the filtered content
            content_topic_ids = set(base_content_queryset.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
            
            aggregation = counting_queryset.values('subject__name').annotate(count=Count('id'))
            subject_counts = defaultdict(int)
            for item in aggregation:
                base_name = re.split(r'\s+(HL|SL)$', item['subject__name'], 1)[0].strip()
                subject_counts[base_name] += item['count']

            # 3. Build the response data
            response_data = []
            for base_name in all_base_subject_names:
                labels_by_id, root_nodes = self._get_label_hierarchy(base_name)
                
                # Calculate completion
                topic_completions = [self._calculate_completion_recursive(topic, content_topic_ids, labels_by_id) for topic in root_nodes]
                overall_completion = round(sum(topic_completions) / len(topic_completions)) if topic_completions else 0
                
                response_data.append({
                    'label': base_name,
                    'percentage': overall_completion,
                    'count': subject_counts[base_name]
                })

            # Sort by percentage (desc), then by name (asc)
            response_data.sort(key=lambda x: (-x['percentage'], x['label']))
            
            labels = [item['label'] for item in response_data]
            percentages = [item['percentage'] for item in response_data]
            counts = [item['count'] for item in response_data]
            data_type = 'percentage_and_count' if model_type == 'recipe' else 'count'
            
            return Response({
                'labels': labels, 'data': percentages if data_type == 'percentage_and_count' else counts,
                'counts': counts, 'ids': labels, 'dataType': data_type
            })

        # --- TOPIC-LEVEL DRILLDOWN ---
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)

            # 1. Build the full label hierarchy for the subject
            labels_by_id, _ = self._get_label_hierarchy(subject_name)
            
            # 2. Get the necessary data from our filtered querysets
            content_topic_ids = set(base_content_queryset.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
            content_counts_qs = counting_queryset.filter(subject__name__startswith=subject_name).values('topic_id').annotate(count=Count('id'))
            content_counts = {item['topic_id']: item['count'] for item in content_counts_qs}
            
            # 3. Identify the labels to display at the current drilldown level
            parent_id_filter = int(topic_id) if topic_id else None
            level_labels = [l for l in labels_by_id.values() if l.parent_id == parent_id_filter]
            
            # 4. Group labels by numbering to combine SL/HL variants
            grouped_level_labels = defaultdict(list)
            for label in level_labels:
                grouped_level_labels[label.numbering or label.description].append(label)

            # 5. Process each group to get combined data
            response_data = []
            for _, labels_in_group in grouped_level_labels.items():
                # Use the first label in the group as the representative for display
                rep_label = labels_in_group[0]
                
                # Calculate combined completion (average of each label's completion in the group)
                group_percentages = [self._calculate_completion_recursive(l, content_topic_ids, labels_by_id) for l in labels_in_group]
                combined_percentage = round(sum(group_percentages) / len(group_percentages)) if group_percentages else 0
                
                # Calculate combined count (sum of each label's recursive count)
                combined_count = sum(self._calculate_total_counts_recursive(l, content_counts) for l in labels_in_group)
                
                # Clean up the label description for display
                clean_description = re.sub(rf'^{re.escape(rep_label.numbering)}\s*[:\s]*', '', rep_label.description) if rep_label.numbering else rep_label.description
                final_label = f"{rep_label.numbering}: {clean_description}" if rep_label.numbering else clean_description
                
                response_data.append({
                    'id': rep_label.id,  # ID is used for the next drilldown level
                    'label': final_label,
                    'percentage': combined_percentage,
                    'count': combined_count
                })

            # Sort by the numeric parts of the label numbering
            response_data.sort(key=lambda item: [int(n) for n in re.findall(r'\d+', item['label'].split(':')[0])])
            
            labels = [item['label'] for item in response_data]
            percentages = [item['percentage'] for item in response_data]
            counts = [item['count'] for item in response_data]
            ids = [item['id'] for item in response_data]
            data_type = 'percentage_and_count' if model_type == 'recipe' else 'count'

            return Response({
                'labels': labels, 'data': percentages if data_type == 'percentage_and_count' else counts,
                'counts': counts, 'ids': ids, 'dataType': data_type
            })

        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
