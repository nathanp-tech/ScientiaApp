from django.shortcuts import render
from django.urls import reverse
from django.middleware.csrf import get_token
from django.contrib.auth.models import User
from core.models import Subject 
from rest_framework import viewsets, permissions, serializers, status
from rest_framework.response import Response
from .models import StudyPlan
from .serializers import StudyPlanSerializer

def student_planner_view(request):
    active_users = User.objects.filter(is_active=True).order_by('last_name', 'first_name')
    all_subjects = Subject.objects.select_related('curriculum', 'language').all()

    initial_data = {
        'users': list(active_users.values('id', 'username', 'first_name', 'last_name')),
        'subjects': list(all_subjects.values(
            'pk', 
            'name', 
            'level', 
            'curriculum__name', 
            'language__code'  
        ))
    }

    api_config = { 
        'urls': {
            'study_plans_base': reverse('studyplan-list'), 
        },
        'csrf_token': get_token(request),
        'current_user_id': request.user.id if request.user.is_authenticated else None,
        'is_staff': request.user.is_staff if request.user.is_authenticated else False,
    }

    context = {
        'initial_data': initial_data,
        'api_config': api_config,
    }
    return render(request, 'planner/student_planner.html', context)

class StudyPlanViewSet(viewsets.ModelViewSet):
    serializer_class = StudyPlanSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        if user.is_staff:
            return StudyPlan.objects.all().order_by('-updated_at')
        return StudyPlan.objects.filter(student=user).order_by('-updated_at')

    def list(self, request, *args, **kwargs):
        student_id_param = request.query_params.get('student_id')
        user_to_fetch_for = None

        if student_id_param:
            if request.user.is_staff or str(request.user.id) == student_id_param:
                try:
                    user_to_fetch_for = User.objects.get(pk=student_id_param)
                except User.DoesNotExist:
                    return Response({"detail": "Student not found."}, status=status.HTTP_404_NOT_FOUND)
            else:
                return Response({"detail": "Not authorized to view this student's plan."}, status=status.HTTP_403_FORBIDDEN)
        elif not request.user.is_staff:
            user_to_fetch_for = request.user
        else:
             return Response({"detail": "Staff must specify a student_id query parameter to load a specific plan."}, status=status.HTTP_400_BAD_REQUEST)

        if user_to_fetch_for:
            try:
                study_plan = StudyPlan.objects.get(student=user_to_fetch_for)
                serializer = self.get_serializer(study_plan)
                return Response(serializer.data)
            except StudyPlan.DoesNotExist:
                return Response({"detail": "No study plan found for this student."}, status=status.HTTP_404_NOT_FOUND) 
        
        return Response({"detail": "Invalid request for fetching a student plan."}, status=status.HTTP_400_BAD_REQUEST)

    def create(self, request, *args, **kwargs):
        """
        Handles creation or update of a student's single study plan.
        If a plan for the student exists, it updates it. Otherwise, it creates one.
        This method is called when the frontend sends a POST request to the base endpoint.
        """
        student_id = request.data.get('student')
        
        if not student_id:
            if not request.user.is_staff:
                student_id = request.user.id
                # Add student_id to request data if it's for the current non-staff user
                # This mutable copy is necessary if request.data is an immutable QueryDict
                if not hasattr(request.data, '_mutable'):
                     request.data._mutable = True
                request.data['student'] = student_id
                if hasattr(request.data, '_mutable'): # Set it back if it was originally immutable
                    request.data._mutable = False
            else:
                return Response({"student": "Student ID is required for staff to create/update a plan."}, status=status.HTTP_400_BAD_REQUEST)
        
        if not request.user.is_staff and str(request.user.id) != str(student_id):
            return Response({"detail": "You are not authorized to manage a plan for this student."}, status=status.HTTP_403_FORBIDDEN)

        try:
            student_user = User.objects.get(pk=student_id)
        except User.DoesNotExist:
            return Response({"student": f"User with ID {student_id} not found."}, status=status.HTTP_404_NOT_FOUND)

        # Try to get an existing plan for this student
        instance = StudyPlan.objects.filter(student=student_user).first()

        if instance:
            # Plan exists, so update it
            serializer = self.get_serializer(instance, data=request.data, partial=True) # Allow partial update
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            if getattr(instance, '_prefetched_objects_cache', None):
                instance._prefetched_objects_cache = {} # Clear prefetch cache
            return Response(serializer.data)
        else:
            # Plan does not exist, create a new one
            # Ensure student field is in the data for the serializer
            if 'student' not in request.data:
                if not hasattr(request.data, '_mutable'): request.data._mutable = True
                request.data['student'] = student_user.id
                if hasattr(request.data, '_mutable'): request.data._mutable = False
            
            serializer = self.get_serializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            self.perform_create(serializer) # This will call serializer.save(student=student_user)
            headers = self.get_success_headers(serializer.data)
            return Response(serializer.data, status=status.HTTP_201_CREATED, headers=headers)

    def perform_create(self, serializer):
        # Student should already be in serializer.validated_data or passed directly
        # The view's create method ensures the student_id is correct and authorized.
        # The OneToOneField on the model will enforce uniqueness if this somehow tries to create a duplicate.
        student_id = serializer.validated_data.get('student').id if isinstance(serializer.validated_data.get('student'), User) else serializer.validated_data.get('student')

        if not student_id: # Should have been caught earlier, but as a safeguard
            raise serializers.ValidationError("Student must be provided for creation.")
        
        # The serializer.save() will now correctly create the plan.
        # The student object is already part of validated_data due to PrimaryKeyRelatedField.
        serializer.save()


    def perform_update(self, serializer):
        # The instance is already associated with the correct student.
        # The serializer's update method will handle saving fields and nested sessions.
        serializer.save()

    # The default PUT method from ModelViewSet is fine if it uses the instance's pk.
    # If client sends PUT to base URL, it should be handled by create() as upsert.
    # If client sends PUT to /api/planner/study-plans/{plan_id}/, default update is okay.
    # Given the JS always POSTs to base for save, the create method is the main one.
