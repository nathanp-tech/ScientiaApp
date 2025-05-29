# planner/services.py
import datetime

class ScheduleGenerator:
    """
    Logique métier pour la génération d'un planning d'étude.
    """
    def __init__(self, plan_config, vacation_periods):
        self.config = plan_config
        self.vacations = vacation_periods

    def is_date_in_vacation(self, date_obj):
        date_str = date_obj.strftime('%Y-%m-%d')
        for period in self.vacations:
            if isinstance(period, str) and period == date_str:
                return True
            if isinstance(period, dict) and period['start'] <= date_str <= period['end']:
                return True
        return False

    def generate(self):
        """
        Génère une liste de sessions d'étude basées sur la configuration.
        Retourne une liste de dictionnaires.
        """
        subjects_config = self.config.get('subjects', [])
        availability = self.config.get('availability', {})
        days_of_week = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

        if not subjects_config:
            return []

        # 1. Déterminer la période de planification
        exam_dates = [datetime.datetime.strptime(s['examDate'], '%Y-%m-%d').date() for s in subjects_config if s.get('examDate')]
        if not exam_dates:
            return []
        
        start_date = datetime.date.today()
        end_date = max(exam_dates)

        # 2. Collecter tous les créneaux disponibles
        available_slots = []
        current_date = start_date
        while current_date <= end_date:
            day_name = days_of_week[current_date.weekday()]
            is_vacation = self.is_date_in_vacation(current_date)
            
            if is_vacation:
                # Logique pour les vacances (ex: 9h-12h, 14h-17h)
                for hour in range(9, 12):
                    available_slots.append({'date': current_date, 'time': f"{hour:02d}:00"})
                for hour in range(14, 17):
                    available_slots.append({'date': current_date, 'time': f"{hour:02d}:00"})
            else:
                # Logique pour la disponibilité standard
                day_availability = availability.get(day_name, {})
                for hour, is_available in day_availability.items():
                    if is_available:
                        available_slots.append({'date': current_date, 'time': hour})
            
            current_date += datetime.timedelta(days=1)
        
        # 3. Distribuer les sujets dans les créneaux (logique simplifiée)
        total_weight = sum(s.get('weight', 0) for s in subjects_config)
        if total_weight == 0:
            return [] # ou gérer autrement

        subject_slots_needed = {
            s['localId']: round(len(available_slots) * s.get('weight', 0) / total_weight)
            for s in subjects_config
        }
        subject_slots_assigned = {s['localId']: 0 for s in subjects_config}
        
        schedule = []
        subjects_by_id = {s['localId']: s for s in subjects_config}

        # Logique de distribution à améliorer (priorité, urgence, etc.)
        # Pour l'instant, on remplit simplement
        slot_index = 0
        while slot_index < len(available_slots):
            for sub_id, slots_needed in subject_slots_needed.items():
                if slot_index >= len(available_slots): break
                if subject_slots_assigned[sub_id] < slots_needed:
                    slot = available_slots[slot_index]
                    subject_info = subjects_by_id[sub_id]

                    start_time = datetime.datetime.combine(
                        slot['date'],
                        datetime.datetime.strptime(slot['time'], '%H:%M').time()
                    )
                    
                    schedule.append({
                        'subject_name': subject_info['name'],
                        'subject_color': subject_info['color'],
                        'subject_local_id': sub_id,
                        'start_time': start_time,
                        'end_time': start_time + datetime.timedelta(hours=1)
                    })
                    subject_slots_assigned[sub_id] += 1
                    slot_index += 1
        
        return schedule