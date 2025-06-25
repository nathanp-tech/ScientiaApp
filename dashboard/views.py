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
    Handles completion percentages and counts. Applies all filters.
    """
    permission_classes = [permissions.IsAdminUser]
    
    # Memoization caches to speed up recursive calculations within a single request
    _completion_memo = {}
    _count_memo = {}
    _leaf_nodes_memo = {}

    def _build_label_hierarchy_for_subjects(self, subjects_qs):
        """
        Efficiently builds a label hierarchy for a given queryset of subjects.
        Returns a dictionary mapping base subject names to their hierarchy.
        """
        # Fetch all labels related to the subjects in one go
        subject_names = subjects_qs.values_list('name', flat=True)
        all_labels = Label.objects.filter(subject__name__in=subject_names).select_related('parent', 'subject')
        
        # Organize labels by base subject name
        labels_by_subject = defaultdict(list)
        for label in all_labels:
            base_name = re.split(r'\s+(HL|SL)$', label.subject.name, 1)[0].strip()
            labels_by_subject[base_name].append(label)

        # Build hierarchy for each subject
        subject_hierarchies = {}
        for base_name, labels in labels_by_subject.items():
            labels_by_id = {l.id: l for l in labels}
            root_nodes = []
            for label in labels:
                label.children_list = []
            for label in labels:
                if label.parent_id and label.parent_id in labels_by_id:
                    labels_by_id[label.parent_id].children_list.append(label)
                else:
                    root_nodes.append(label)
            subject_hierarchies[base_name] = {'labels_by_id': labels_by_id, 'root_nodes': root_nodes}
            
        return subject_hierarchies

    def _get_all_descendant_leaf_nodes(self, label):
        """
        Recursively finds all leaf nodes (labels with no children) under a given label.
        """
        if label.id in self._leaf_nodes_memo:
            return self._leaf_nodes_memo[label.id]

        leaf_nodes = []
        if not hasattr(label, 'children_list') or not label.children_list:
            leaf_nodes.append(label)
        else:
            for child in label.children_list:
                leaf_nodes.extend(self._get_all_descendant_leaf_nodes(child))
        
        self._leaf_nodes_memo[label.id] = leaf_nodes
        return leaf_nodes

    def _calculate_completion_recursive(self, label, content_topic_ids):
        """
        Calculates completion for a label based on the percentage of its leaf node 
        descendants that have content.
        """
        if label.id in self._completion_memo:
            return self._completion_memo[label.id]

        all_leaves = self._get_all_descendant_leaf_nodes(label)
        if not all_leaves:
            return 0

        completed_leaves_count = sum(1 for leaf in all_leaves if leaf.id in content_topic_ids)
        percentage = (completed_leaves_count / len(all_leaves)) * 100
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
        if hasattr(label, 'children_list'):
            for child in label.children_list:
                total += self._calculate_total_counts_recursive(child, content_counts)
        
        self._count_memo[label.id] = total
        return total

    def get(self, request, *args, **kwargs):
        # Clear memos for each new request to ensure fresh calculations
        self._completion_memo.clear()
        self._count_memo.clear()
        self._leaf_nodes_memo.clear()

        # Get all query parameters from the request
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

            all_base_subject_names = sorted(list(set(re.split(r'\s+(HL|SL)$', name, 1)[0].strip() for name in all_subjects_qs.values_list('name', flat=True) if name)))
            subject_hierarchies = self._build_label_hierarchy_for_subjects(all_subjects_qs)
            
            # 2. Get data based on the filtered content
            content_topic_ids = set(base_content_queryset.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
            aggregation = counting_queryset.values('subject__name').annotate(count=Count('id'))
            subject_counts = defaultdict(int)
            for item in aggregation:
                base_name = re.split(r'\s+(HL|SL)$', item['subject__name'], 1)[0].strip()
                subject_counts[base_name] += item['count']

            # 3. Build the response data for all subjects
            response_data = []
            for base_name in all_base_subject_names:
                hierarchy = subject_hierarchies.get(base_name, {})
                root_nodes = hierarchy.get('root_nodes', [])
                
                # Calculate completion as the average of root topics' completion
                topic_completions = [self._calculate_completion_recursive(topic, content_topic_ids) for topic in root_nodes]
                overall_completion = round(sum(topic_completions) / len(topic_completions)) if topic_completions else 0
                
                response_data.append({'label': base_name, 'percentage': overall_completion, 'count': subject_counts.get(base_name, 0)})

            response_data.sort(key=lambda x: (-x['percentage'], x['label']))
            
            labels = [item['label'] for item in response_data]
            data = [item['percentage'] for item in response_data]
            counts = [item['count'] for item in response_data]
            
            return Response({'labels': labels, 'data': data, 'counts': counts, 'ids': labels, 'dataType': 'percentage_and_count'})

        # --- TOPIC-LEVEL DRILLDOWN ---
        if group_by == 'topic':
            if not subject_name:
                return Response({"error": "A 'subject_name' is required when grouping by topic."}, status=400)

            # 1. Build hierarchy for the specific subject
            subject_hierarchy = self._build_label_hierarchy_for_subjects(Subject.objects.filter(name__startswith=subject_name))
            hierarchy = subject_hierarchy.get(subject_name, {})
            labels_by_id = hierarchy.get('labels_by_id', {})

            # 2. Get filtered data
            content_topic_ids = set(base_content_queryset.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
            content_counts_qs = counting_queryset.filter(subject__name__startswith=subject_name).values('topic_id').annotate(count=Count('id'))
            content_counts = {item['topic_id']: item['count'] for item in content_counts_qs}
            
            # 3. Identify and group labels for the current drilldown level
            parent_id_filter = int(topic_id) if topic_id else None
            level_labels = [l for l in labels_by_id.values() if l.parent_id == parent_id_filter]
            grouped_level_labels = defaultdict(list)
            for label in level_labels:
                key = (label.numbering or label.description or str(label.id)).strip()
                grouped_level_labels[key].append(label)

            # 4. Process each group to get combined data
            response_data = []
            for _, labels_in_group in grouped_level_labels.items():
                rep_label = labels_in_group[0]
                
                group_percentages = [self._calculate_completion_recursive(l, content_topic_ids) for l in labels_in_group]
                combined_percentage = round(sum(group_percentages) / len(group_percentages)) if group_percentages else 0
                
                combined_count = sum(self._calculate_total_counts_recursive(l, content_counts) for l in labels_in_group)
                
                clean_desc = re.sub(rf'^{re.escape(rep_label.numbering or "")}\s*[:\s]*', '', rep_label.description)
                final_label = f"{rep_label.numbering}: {clean_desc}" if rep_label.numbering else clean_desc
                
                response_data.append({'id': rep_label.id, 'label': final_label, 'percentage': combined_percentage, 'count': combined_count})

            # 5. Safe sorting
            def sort_key_topic(item):
                label_prefix = item['label'].split(':', 1)[0]
                numbers = re.findall(r'\d+', label_prefix)
                return [int(n) for n in numbers] if numbers else [label_prefix]
            response_data.sort(key=sort_key_topic)
            
            labels = [item['label'] for item in response_data]
            data = [item['percentage'] for item in response_data]
            counts = [item['count'] for item in response_data]
            ids = [item['id'] for item in response_data]

            return Response({'labels': labels, 'data': data, 'counts': counts, 'ids': ids, 'dataType': 'percentage_and_count'})

        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
