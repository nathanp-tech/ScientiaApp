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
    _memoization_caches = {}

    def _clear_memos(self):
        """Clears all memoization caches for a new request."""
        self._memoization_caches = {
            'completion': {},
            'count': {},
            'leaves': {}
        }

    def _get_all_descendant_leaf_nodes(self, label, labels_by_id):
        """
        Recursively finds all leaf nodes (labels with no children) under a given label.
        """
        if label.id in self._memoization_caches['leaves']:
            return self._memoization_caches['leaves'][label.id]

        leaf_nodes = []
        if not label.children_list:
            leaf_nodes.append(label)
        else:
            for child in label.children_list:
                leaf_nodes.extend(self._get_all_descendant_leaf_nodes(child, labels_by_id))
        
        self._memoization_caches['leaves'][label.id] = leaf_nodes
        return leaf_nodes

    def _calculate_completion_recursive(self, label, content_topic_ids, labels_by_id):
        """
        Calculates completion for a label based on the percentage of its leaf node 
        descendants that have content.
        """
        if label.id in self._memoization_caches['completion']:
            return self._memoization_caches['completion'][label.id]

        all_leaves = self._get_all_descendant_leaf_nodes(label, labels_by_id)
        if not all_leaves:
            return 0

        completed_leaves_count = sum(1 for leaf in all_leaves if leaf.id in content_topic_ids)
        percentage = (completed_leaves_count / len(all_leaves)) * 100
        self._memoization_caches['completion'][label.id] = round(percentage)
        return self._memoization_caches['completion'][label.id]

    def _calculate_total_counts_recursive(self, label, content_counts):
        """
        Recursively calculates the total count of content items for a label and all its children.
        """
        if label.id in self._memoization_caches['count']:
            return self._memoization_caches['count'][label.id]

        total = content_counts.get(label.id, 0)
        for child in getattr(label, 'children_list', []):
            total += self._calculate_total_counts_recursive(child, content_counts)
        
        self._memoization_caches['count'][label.id] = total
        return total
    
    def _build_label_hierarchy(self, subject_name_filter):
        """
        Builds the label hierarchy for a given subject name pattern.
        """
        labels = Label.objects.filter(subject__name__startswith=subject_name_filter).select_related('parent')
        labels_by_id = {l.id: l for l in labels}
        for l in labels_by_id.values():
            l.children_list = []
        for l in labels_by_id.values():
            if l.parent_id in labels_by_id:
                labels_by_id[l.parent_id].children_list.append(l)
        return labels_by_id

    def get(self, request, *args, **kwargs):
        self._clear_memos()

        model_type = request.query_params.get('model', 'recipe')
        group_by = request.query_params.get('group_by', 'subject')
        subject_name = request.query_params.get('subject_name')
        topic_id = request.query_params.get('topic_id')
        status = request.query_params.get('status')
        curriculum_id = request.query_params.get('curriculum')
        language_id = request.query_params.get('language')

        ContentModel = Recipe if model_type == 'recipe' else Slide
        
        base_content_queryset = ContentModel.objects.all()
        if curriculum_id and curriculum_id != 'ALL':
            base_content_queryset = base_content_queryset.filter(curriculum_id=curriculum_id)
        if language_id and language_id != 'ALL':
            base_content_queryset = base_content_queryset.filter(language_id=language_id)

        counting_queryset = base_content_queryset
        if status and status != 'ALL':
            counting_queryset = counting_queryset.filter(status=status)

        if group_by == 'subject':
            subjects_qs = Subject.objects.all()
            if curriculum_id and curriculum_id != 'ALL':
                subjects_qs = subjects_qs.filter(curriculum_id=curriculum_id)
            
            all_base_subject_names = sorted(list(set(re.split(r'\s+(HL|SL)$', s.name, 1)[0].strip() for s in subjects_qs)))
            
            content_topic_ids = set(base_content_queryset.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
            aggregation = counting_queryset.values('subject__name').annotate(count=Count('id'))
            subject_counts = defaultdict(int)
            for item in aggregation:
                base_name = re.split(r'\s+(HL|SL)$', item['subject__name'], 1)[0].strip()
                subject_counts[base_name] += item['count']

            response_data = []
            for base_name in all_base_subject_names:
                labels_by_id = self._build_label_hierarchy(base_name)
                root_nodes = [l for l in labels_by_id.values() if l.parent_id is None]
                
                topic_completions = [self._calculate_completion_recursive(topic, content_topic_ids, labels_by_id) for topic in root_nodes]
                overall_completion = round(sum(topic_completions) / len(topic_completions)) if topic_completions else 0
                
                response_data.append({'label': base_name, 'percentage': overall_completion, 'count': subject_counts.get(base_name, 0)})

            response_data.sort(key=lambda x: (-x['percentage'], x['label']))
            
            labels = [item['label'] for item in response_data]
            data = [item['percentage'] if model_type == 'recipe' else item['count'] for item in response_data]
            counts = [item['count'] for item in response_data]
            dataType = 'percentage_and_count' if model_type == 'recipe' else 'count'
            
            return Response({'labels': labels, 'data': data, 'counts': counts, 'ids': labels, 'dataType': dataType})

        if group_by == 'topic':
            labels_by_id = self._build_label_hierarchy(subject_name)
            content_topic_ids = set(base_content_queryset.filter(topic_id__isnull=False).values_list('topic_id', flat=True))
            content_counts_qs = counting_queryset.filter(subject__name__startswith=subject_name).values('topic_id').annotate(count=Count('id'))
            content_counts = {item['topic_id']: item['count'] for item in content_counts_qs}
            
            parent_id_filter = int(topic_id) if topic_id else None
            level_labels = [l for l in labels_by_id.values() if l.parent_id == parent_id_filter]
            grouped_level_labels = defaultdict(list)
            for label in level_labels:
                key = (label.numbering or label.description or str(label.id)).strip()
                grouped_level_labels[key].append(label)

            response_data = []
            for _, labels_in_group in grouped_level_labels.items():
                rep_label = labels_in_group[0]
                
                group_percentages = [self._calculate_completion_recursive(l, content_topic_ids, labels_by_id) for l in labels_in_group]
                combined_percentage = round(sum(group_percentages) / len(group_percentages)) if group_percentages else 0
                
                combined_count = sum(self._calculate_total_counts_recursive(l, content_counts) for l in labels_in_group)
                
                clean_desc = re.sub(rf'^{re.escape(rep_label.numbering or "")}\s*[:\s]*', '', rep_label.description)
                final_label = f"{rep_label.numbering}: {clean_desc}" if rep_label.numbering else clean_desc
                
                response_data.append({'id': rep_label.id, 'label': final_label, 'percentage': combined_percentage, 'count': combined_count})
            
            response_data.sort(key=lambda item: [int(n) for n in re.findall(r'\d+', item['label'].split(':')[0])] or [item['label']])

            labels = [item['label'] for item in response_data]
            data = [item['percentage'] if model_type == 'recipe' else item['count'] for item in response_data]
            counts = [item['count'] for item in response_data]
            ids = [item['id'] for item in response_data]
            dataType = 'percentage_and_count' if model_type == 'recipe' else 'count'

            return Response({'labels': labels, 'data': data, 'counts': counts, 'ids': ids, 'dataType': dataType})

        return Response({"error": "Invalid 'group_by' parameter."}, status=400)
