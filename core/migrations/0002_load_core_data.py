
from django.db import migrations, IntegrityError
import json
from pathlib import Path

# Chemins vers vos fichiers JSON (ajustez si nécessaire)
BASE_DIR = Path(__file__).resolve().parent.parent.parent # Racine du projet Django
CURRICULUM_JSON_PATH = BASE_DIR / 'init' / 'curriculum.json'
LANGUAGE_JSON_PATH = BASE_DIR / 'init' / 'language.json'
SUBJECT_JSON_PATH = BASE_DIR / 'init' / 'subject.json'
LABEL_JSON_PATH = BASE_DIR / 'init' / 'label.json'


def load_curriculums(apps, schema_editor):
    Curriculum = apps.get_model('core', 'Curriculum')
    if not CURRICULUM_JSON_PATH.exists():
        print(f"Curriculum JSON not found at {CURRICULUM_JSON_PATH}, skipping.")
        return
    with open(CURRICULUM_JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    for entry in data:
        Curriculum.objects.update_or_create(
            pk=entry['pk'],
            defaults=entry['fields']
        )
        print(f"Loaded/Updated Curriculum: {entry['fields']['name']}")

def load_languages(apps, schema_editor):
    Language = apps.get_model('core', 'Language')
    if not LANGUAGE_JSON_PATH.exists():
        print(f"Language JSON not found at {LANGUAGE_JSON_PATH}, skipping.")
        return
    with open(LANGUAGE_JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    for entry in data:
        # 'code' est un nouveau champ, essayez de le déduire ou mettez une valeur par défaut
        defaults = entry['fields']
        if 'code' not in defaults:
            defaults['code'] = entry['fields']['name'][:2].lower() # ex: "Français" -> "fr"

        Language.objects.update_or_create(
            pk=entry['pk'],
            defaults=defaults
        )
        print(f"Loaded/Updated Language: {entry['fields']['name']}")

def load_subjects(apps, schema_editor):
    Subject = apps.get_model('core', 'Subject')
    if not SUBJECT_JSON_PATH.exists():
        print(f"Subject JSON not found at {SUBJECT_JSON_PATH}, skipping.")
        return
    with open(SUBJECT_JSON_PATH, 'r', encoding='utf-8') as f:
        data = json.load(f)
    for entry in data:
        fields = entry['fields']
        # Le modèle 'subjects.Subject' de votre JSON est maintenant 'core.Subject'
        # Les champs ForeignKey curriculum, language, level sont des IDs.
        Subject.objects.update_or_create(
            pk=entry['pk'],
            defaults={
                'name': fields['name'],
                'curriculum_id': fields.get('curriculum'), # curriculum est l'ID
                'language_id': fields.get('language'),   # language est l'ID
                'level': fields.get('level'),
            }
        )
        print(f"Loaded/Updated Subject: {fields['name']}")

def load_labels(apps, schema_editor):
    Label = apps.get_model('core', 'Label')
    Subject = apps.get_model('core', 'Subject')
    db_alias = schema_editor.connection.alias # Utilisé pour les messages

    print("\n--- Starting Label Migration ---")

    if not LABEL_JSON_PATH.exists():
        print(f"Label JSON file not found at {LABEL_JSON_PATH}, skipping label migration.")
        return
    
    with open(LABEL_JSON_PATH, 'r', encoding='utf-8') as f:
        try:
            label_data_from_json = json.load(f)
        except json.JSONDecodeError as e:
            print(f"Error decoding JSON from {LABEL_JSON_PATH}: {e}")
            return

    if not isinstance(label_data_from_json, list):
        print(f"Error: Expected a list of labels in {LABEL_JSON_PATH}, got {type(label_data_from_json)}.")
        return

    print(f"Found {len(label_data_from_json)} entries in label.json")

    # Séparer les labels de premier niveau (parent=0 ou parent=None)
    # et les labels enfants pour les traiter en deux passes.
    top_level_labels = []
    child_labels = []

    for entry in label_data_from_json:
        if not isinstance(entry, dict):
            print(f"Skipping non-dictionary entry: {entry}")
            continue
        
        pk = entry.get('pk')
        fields = entry.get('fields')

        if pk is None or fields is None or not isinstance(fields, dict):
            print(f"Skipping entry with missing 'pk' or 'fields': {entry}")
            continue
        
        parent_pk_json = fields.get('parent')
        if parent_pk_json == 0 or parent_pk_json is None:
            top_level_labels.append(entry)
        else:
            child_labels.append(entry)
            
    print(f"Processing {len(top_level_labels)} top-level labels and {len(child_labels)} child labels.")

    # Passe 1: Charger les labels de premier niveau
    print("\n--- Pass 1: Loading top-level labels (parent is 0 or null) ---")
    created_pks = set() # Garder une trace des PKs créés avec succès

    for entry in top_level_labels:
        pk = entry['pk']
        fields = entry['fields']
        description_text = fields.get('description')
        subject_pk = fields.get('subject')
        numbering_text = fields.get('label') # Le champ "label" de votre JSON devient "numbering"

        if not description_text or subject_pk is None:
            print(f"  [PK:{pk}] Skipping: Missing description or subject_pk.")
            continue

        try:
            subject_instance = Subject.objects.using(db_alias).get(pk=subject_pk)
        except Subject.DoesNotExist:
            print(f"  [PK:{pk}] Skipping Label '{description_text}': Subject with PK {subject_pk} does not exist.")
            continue

        defaults_dict = {
            'description': description_text,
            'subject': subject_instance,
            'parent': None, # Explicitement None pour les parents de haut niveau
            'numbering': numbering_text # Si vous avez ajouté ce champ au modèle
        }
        
        try:
            label_obj, created = Label.objects.using(db_alias).update_or_create(
                pk=pk,
                defaults=defaults_dict
            )
            action = "Created" if created else "Updated"
            print(f"  [PK:{pk}] {action} top-level Label: '{description_text}' (Numbering: {numbering_text})")
            created_pks.add(pk)
        except IntegrityError as e:
            print(f"  [PK:{pk}] IntegrityError for Label '{description_text}': {e}")
        except Exception as e:
            print(f"  [PK:{pk}] Unexpected error for Label '{description_text}': {e}")


    # Passe 2: Charger les labels enfants
    print("\n--- Pass 2: Loading child labels ---")
    children_processed_in_pass = -1 # Pour détecter les boucles infinies de dépendances
    
    while len(child_labels) > 0 and children_processed_in_pass != 0 :
        children_processed_in_pass = 0
        remaining_children = []

        for entry in child_labels:
            pk = entry['pk']
            fields = entry['fields']
            description_text = fields.get('description')
            subject_pk = fields.get('subject')
            parent_pk_json = fields.get('parent') # Ne sera ni 0 ni None ici
            numbering_text = fields.get('label')

            if not description_text or subject_pk is None or parent_pk_json is None:
                print(f"  [PK:{pk}] Skipping child: Missing description, subject_pk, or parent_pk_json.")
                continue

            try:
                subject_instance = Subject.objects.using(db_alias).get(pk=subject_pk)
            except Subject.DoesNotExist:
                print(f"  [PK:{pk}] Skipping child Label '{description_text}': Subject with PK {subject_pk} does not exist.")
                continue
            
            try:
                parent_instance = Label.objects.using(db_alias).get(pk=parent_pk_json)
                 # Vérifier aussi si le parent a bien été traité/créé dans `created_pks` est une bonne idée,
                 # mais .get() devrait suffire si la PK existe.
            except Label.DoesNotExist:
                # Le parent n'existe pas encore, on réessaiera au prochain tour de boucle
                remaining_children.append(entry)
                print(f"  [PK:{pk}] Deferring child Label '{description_text}': Parent Label with PK {parent_pk_json} not yet created.")
                continue # Passer au suivant pour cette passe

            defaults_dict = {
                'description': description_text,
                'subject': subject_instance,
                'parent': parent_instance,
                'numbering': numbering_text # Si vous avez ajouté ce champ
            }
            
            try:
                label_obj, created = Label.objects.using(db_alias).update_or_create(
                    pk=pk,
                    defaults=defaults_dict
                )
                action = "Created" if created else "Updated"
                print(f"  [PK:{pk}] {action} child Label: '{description_text}' (Parent PK: {parent_pk_json}, Numbering: {numbering_text})")
                created_pks.add(pk)
                children_processed_in_pass +=1
            except IntegrityError as e:
                print(f"  [PK:{pk}] IntegrityError for child Label '{description_text}': {e}")
            except Exception as e:
                print(f"  [PK:{pk}] Unexpected error for child Label '{description_text}': {e}")

        child_labels = remaining_children # Garder ceux qui n'ont pas pu être traités
        if len(child_labels) > 0 and children_processed_in_pass == 0:
            print(f"\nWarning: Could not process {len(child_labels)} child labels due to missing parents (circular dependency or missing parent PKs):")
            for entry in child_labels:
                 print(f"  - PK: {entry['pk']}, Description: {entry['fields']['description']}, Expected Parent PK: {entry['fields']['parent']}")
            break # Sortir de la boucle while pour éviter une boucle infinie

    print("--- Finished Label Migration ---")



class Migration(migrations.Migration):
    dependencies = [
        ('core', '0001_initial'), # Remplacez par le nom de votre migration initiale de 'core'
    ]
    operations = [
        migrations.RunPython(load_curriculums),
        migrations.RunPython(load_languages),
        migrations.RunPython(load_subjects), # Dépend de curriculum et language
        migrations.RunPython(load_labels),   # Dépend de subject
    ]