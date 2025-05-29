from django.db import models

class Board(models.Model):

    # In the case a qualification can be awarded by different board (eg. A-Levels)

    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name
    
class Language(models.Model):

    # If an exam can be given in different languages (eg. IB)

    name = models.CharField(max_length=100)

    def __str__(self):
        return self.name
    
class Curriculum(models.Model):

    # The name for an exam. For example the IB, A-Levels, Matu, SAT
    # Board is optional information

    name = models.CharField(max_length=100)
    board = models.ForeignKey(Board, on_delete=models.CASCADE, related_name='boards', null = True)

    def __str__(self):
        return self.name
    
class Grouping(models.Model):

    # This is for how a particular Curriculum organises its subjects. So that it can be made easier to navigate (eg. Humanities, or Group 5 - Mathematics)
    # Groupings as specific to the lexicon of each Curriculum, hence why it is required to enter the Curriculum information
    
    name = models.CharField(max_length=100)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.CASCADE, related_name='groupings')
    
    def __str__(self):
        return self.name
    
class Level(models.Model):

    # The same Subject could be taught at different levels (for example Maths AA SL and Maths AA HL in the IB)
    # Again the lexicon is Curriculum specific

    name = models.CharField(max_length=20)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.CASCADE, related_name='levels')
    
    def __str__(self):
        return self.name

class Subject(models.Model):
    name = models.CharField(max_length=100)
    curriculum = models.ForeignKey(Curriculum, on_delete=models.CASCADE, related_name='subjects')
    language = models.ForeignKey(Language, on_delete=models.CASCADE)
    grouping = models.ForeignKey(Grouping, on_delete=models.CASCADE, null = True)
    level = models.ForeignKey(Level, on_delete=models.CASCADE, null = True)
    end_date = models.DateField()

    def __str__(self):
        name = self.name + " " + str(self.level)
        return name.strip()
    
    def display(self) :
        name = self.name + " " + str(self.level)
        return name.strip()

class Label(models.Model):

    # This is used to descibe the tree of concepts within a Subject
    # Labels can occur at different level, for example it can be a whole Unit (Algebra in Maths say) or a tiny concept (Finding a perpendicular slope)
    # The parent field allows the labels to be organised according to a hierarchy, the parent being a label in itself (or 0 if there is no parent)

    subject = models.ForeignKey(Subject, on_delete=models.CASCADE, related_name='labels')
    parent = models.IntegerField()
    label = models.CharField(max_length=20)
    description = models.TextField()

    def __str__(self):
        return self.description
    
    def display(self) :
        return self.label


