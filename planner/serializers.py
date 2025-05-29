from rest_framework import serializers
from django.contrib.auth.models import User
from .models import StudyPlan, ScheduledSession

class ScheduledSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScheduledSession
        # Fields to include when serializing/deserializing a session
        fields = ['id', 'subject_name', 'subject_color', 'start_time', 'end_time', 'subject_local_id']
        read_only_fields = ['id'] # 'id' is auto-generated and read-only

class StudyPlanSerializer(serializers.ModelSerializer):
    # Nested serializer for sessions related to this study plan
    # 'required=False' means sessions don't have to be provided on create/update
    # 'allow_null=True' can be used if an empty list of sessions should be treated as null by the DB (not typical for JSONField)
    sessions = ScheduledSessionSerializer(many=True, required=False) 
    student_username = serializers.CharField(source='student.username', read_only=True)
    # The 'student' field itself is a PrimaryKeyRelatedField by default for ForeignKeys/OneToOneFields.
    # We will make it read-only in the serializer if it's always set by the view based on the request.user
    # or a specific student_id for staff. If the client needs to send it, it should be writable.
    # For the "one plan per student" model, 'student' is crucial for identifying the plan.
    student = serializers.PrimaryKeyRelatedField(queryset=User.objects.all())


    class Meta:
        model = StudyPlan
        fields = [
            'id', 
            'name', 
            'student', # This will be the student's ID
            'student_username', 
            'config', 
            'sessions', 
            'created_at', 
            'updated_at'
        ]
        read_only_fields = ['id', 'student_username', 'created_at', 'updated_at']

    def _handle_sessions(self, study_plan_instance, sessions_data):
        """
        Helper method to delete old sessions and create new ones.
        """
        # Clear existing sessions associated with this study plan
        study_plan_instance.sessions.all().delete()
        if sessions_data: # Check if sessions_data is provided and not empty
            for session_data in sessions_data:
                ScheduledSession.objects.create(study_plan=study_plan_instance, **session_data)

    def create(self, validated_data):
        """
        Handles creation of a new StudyPlan and its associated ScheduledSessions.
        The 'student' field is expected to be in validated_data, set by the view.
        """
        sessions_data = validated_data.pop('sessions', [])
        
        # The view's perform_create or create method should ensure the 'student' is correctly set
        # and that a plan for this student doesn't already exist (due to OneToOneField).
        # If the OneToOneField constraint is violated, the database will raise an IntegrityError.
        # The StudyPlanViewSet's create method handles the "get or create/update" logic.
        
        student = validated_data.get('student')
        if not student:
            raise serializers.ValidationError({"student": "Student is required to create a plan."})

        # Ensure plan name is provided, or default it
        plan_name = validated_data.get('name', f"Study Plan for {student.username}")
        validated_data['name'] = plan_name

        # Check if a plan already exists for this student (due to OneToOneField)
        # This check is more for clean error handling before DB hit, DB will enforce it too.
        if StudyPlan.objects.filter(student=student).exists():
            raise serializers.ValidationError({"student": "A study plan already exists for this student. Updates should be done via PUT."})

        study_plan = StudyPlan.objects.create(**validated_data)
        self._handle_sessions(study_plan, sessions_data)
        return study_plan

    def update(self, instance, validated_data):
        """
        Handles updates to an existing StudyPlan and its ScheduledSessions.
        """
        sessions_data = validated_data.pop('sessions', None) # Use None to detect if 'sessions' key was passed

        # Update StudyPlan fields from validated_data
        instance.name = validated_data.get('name', instance.name)
        instance.config = validated_data.get('config', instance.config)
        
        # The 'student' field should not be changed on an update.
        # If 'student' is in validated_data, ensure it matches the instance's student.
        if 'student' in validated_data and validated_data['student'] != instance.student:
            raise serializers.ValidationError({"student": "Cannot change the student associated with an existing plan."})
            
        instance.save()

        # Only update sessions if the 'sessions' key was explicitly provided in the request data
        if sessions_data is not None:
            self._handle_sessions(instance, sessions_data)
        
        return instance
