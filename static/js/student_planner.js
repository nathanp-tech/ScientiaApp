/**
 * @file student_planner.js
 * @description Logic for the student study planner.
 * Handles subject configuration, availability, schedule generation,
 * and saving/loading plans to/from the server. Each student has one main plan.
 */
document.addEventListener('DOMContentLoaded', function() {

    // =========================================================================
    // 1. CONFIGURATION & INITIAL SETUP
    // =========================================================================
    const apiConfigEl = document.getElementById('api-config-json');
    if (!apiConfigEl) { console.error("CRITICAL: #api-config-json missing."); alert("API Config Error."); return; }
    const API_CONFIG = JSON.parse(apiConfigEl.textContent);
    const API_URLS = API_CONFIG.urls; // Expects API_URLS.study_plans_base
    const CSRF_TOKEN = API_CONFIG.csrf_token;
    const CURRENT_USER_ID = API_CONFIG.current_user_id ? String(API_CONFIG.current_user_id) : null;
    const IS_STAFF = API_CONFIG.is_staff || false;


    const initialDataEl = document.getElementById('initial-data-json');
    if (!initialDataEl) { console.error("CRITICAL: #initial-data-json missing."); alert("Initial Data Error."); return; }
    const INITIAL_DATA = JSON.parse(initialDataEl.textContent);

    // =========================================================================
    // 2. CONSTANTS & STATE
    // =========================================================================
    const MAX_SUBJECTS = 6;
    const HOURS_IN_DAY = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`); // 7 AM to 10 PM
    const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const DEFAULT_SUBJECT_COLORS = ['#3498db', '#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#7f8c8d'];
    // Define actual vacation periods here if needed for client-side generation logic.
    // Example: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" } or "YYYY-MM-DD"
    const SCHOOL_VACATIONS = [ 
        // Example: "2025-09-11", { start: "2025-10-20", end: "2025-10-24" } 
    ]; 
    const PRIORITY_VALUES = { "high": 30, "medium": 20, "low": 10, "none": 0 };

    // This object holds the entire state for the current study plan.
    let planState = {
        id: null,       // DB ID of the StudyPlan, if loaded/saved
        name: '',       // Name of the plan
        student: null,  // Student ID (string)
        config: {
            subjects: [], // Array of { localId, pk, name, examDate, priority, color, curriculum_name, language_code, level_display }
            availability: {} // { Monday: {"07:00": true, ...}, ... }
        },
        schedule: []    // Array of { start_time, end_time, subject_name, subject_color, subject_local_id }
    };

    let currentEditingSlot = null; // For the edit slot modal
    let allServerSubjects = []; // Cache of all subjects available for selection, processed from INITIAL_DATA

    // =========================================================================
    // 3. DOM REFERENCES (Simplified buttons)
    // =========================================================================
    const loadingOverlay = document.querySelector('.loading-overlay');
    const studentSelector = document.getElementById('studentSelector');
    const planNameInput = document.getElementById('planNameInput');
    const subjectsSelectionContainer = document.getElementById('subjects-selection-container');
    const availabilityGridDiv = document.getElementById('availability-grid');
    const scheduleSectionDiv = document.getElementById('schedule-section');
    const scheduleCalendarContainer = document.getElementById('schedule-calendar-container');
    const actionButtonsContainer = document.getElementById('action-buttons-container');
    
    const viewGenerateScheduleBtn = document.getElementById('view-generate-schedule-btn');
    const savePlanBtn = document.getElementById('save-plan-btn');
    const exportScheduleHtmlBtn = document.getElementById('export-schedule-html-btn');
    
    const editSlotModalEl = document.getElementById('editSlotModal');
    const editSlotModal = new bootstrap.Modal(editSlotModalEl);
    const slotModalDate = document.getElementById('slot-modal-date');
    const slotModalTime = document.getElementById('slot-modal-time');
    const slotSubjectSelect = document.getElementById('slot-subject-select');
    const saveSlotChangesBtn = document.getElementById('save-slot-changes-btn');
    const generationInfoAlert = document.getElementById('generation-info');

    // =========================================================================
    // 4. UI RENDERING & MANAGEMENT
    // =========================================================================
    function showLoading(show) { 
        if (loadingOverlay) loadingOverlay.style.display = show ? 'flex' : 'none'; 
    }

    function setDefaultWeeklyAvailability() {
        planState.config.availability = {};
        DAYS_OF_WEEK.forEach(dayKey => {
            planState.config.availability[dayKey] = {};
            HOURS_IN_DAY.forEach(hour => {
                const hourNum = parseInt(hour.split(':')[0]);
                // Default: available weekends 9am-12pm, weekdays 4pm-7pm
                planState.config.availability[dayKey][hour] = (['Saturday', 'Sunday'].includes(dayKey) && hourNum >= 9 && hourNum < 12) ||
                                                            (!['Saturday', 'Sunday'].includes(dayKey) && hourNum >= 16 && hourNum < 19);
            });
        });
    }
    
    /**
     * Resets the planState to a default for a given student ID.
     * @param {string} forStudentId - The ID of the student for whom to reset/initialize the plan.
     * @param {string} [planName="My Study Plan"] - Default name for a new plan.
     */
    function resetPlanState(forStudentId, planName) {
        const defaultPlanName = planName || (forStudentId ? `Study Plan for Student ${forStudentId}` : "New Study Plan");
        planState = {
            id: null, 
            name: defaultPlanName, 
            student: forStudentId, 
            config: { subjects: [], availability: {} },
            schedule: []
        };
        setDefaultWeeklyAvailability(); // Apply default availability
        if (planNameInput) planNameInput.value = planState.name; // Update plan name input
        console.log("Plan state reset for student:", forStudentId, JSON.parse(JSON.stringify(planState)));
    }

    /**
     * Renders the entire UI based on the current planState.
     */
    function renderUIFromState() {
        console.log("Rendering UI. Plan ID:", planState.id, "Student:", planState.student, "Name:", planState.name);
        if (planNameInput) planNameInput.value = planState.name || '';
        if (studentSelector) studentSelector.value = planState.student || (IS_STAFF ? "" : CURRENT_USER_ID);

        renderSubjectSelectionUI();
        renderAvailabilityGrid();
        renderScheduleCalendar(); // This will display the loaded or generated schedule

        // Show action buttons only if a student is selected
        if (actionButtonsContainer) actionButtonsContainer.style.display = planState.student ? 'block' : 'none';
        if (generationInfoAlert) generationInfoAlert.className = 'alert d-none'; // Hide alert by default
    }

    /**
     * Renders the subject selection inputs based on planState.config.subjects.
     */
    function renderSubjectSelectionUI() {
        subjectsSelectionContainer.innerHTML = '';
        for (let i = 0; i < MAX_SUBJECTS; i++) {
            const subjectConfig = planState.config.subjects.find(s => s.localId === i) || 
                                  { localId: i, color: DEFAULT_SUBJECT_COLORS[i % DEFAULT_SUBJECT_COLORS.length], priority: "medium", pk: '', examDate: '' };
            
            const entryDiv = document.createElement('div');
            entryDiv.className = 'row mb-2 subject-entry align-items-center gx-2';
            // Ensure data-local-id is set for all inputs to correctly link them on update
            entryDiv.innerHTML = `
                <div class="col-lg-4 col-md-12 mb-1 mb-lg-0">
                    <select class="form-select form-select-sm subject-select" data-local-id="${i}"><option value="">-- Subject ${i + 1} --</option></select>
                </div>
                <div class="col-lg-3 col-md-4 mb-1 mb-md-0">
                    <input type="date" class="form-control form-control-sm exam-date-input" data-local-id="${i}" value="${subjectConfig.examDate || ''}">
                </div>
                <div class="col-lg-3 col-md-4 mb-1 mb-md-0">
                    <select class="form-select form-select-sm priority-select" data-local-id="${i}">
                        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="none">None (Manual)</option>
                    </select>
                </div>
                <div class="col-lg-2 col-md-4 text-center">
                    <input type="color" class="form-control form-control-color color-input" data-local-id="${i}" value="${subjectConfig.color || DEFAULT_SUBJECT_COLORS[i % DEFAULT_SUBJECT_COLORS.length]}">
                </div>`;
            subjectsSelectionContainer.appendChild(entryDiv);

            const subjectSelectEl = entryDiv.querySelector('.subject-select');
            allServerSubjects.forEach(subject => {
                // Construct display text: "Subject Name SL/HL"
                const levelDisplayText = (subject.level_display && subject.level_display !== 'Other') ? ` ${subject.level_display}` : '';
                const optionText = `${subject.name}${levelDisplayText}`;
                subjectSelectEl.add(new Option(optionText.trim(), String(subject.pk)));
            });
            subjectSelectEl.value = subjectConfig.pk || '';
            entryDiv.querySelector('.priority-select').value = subjectConfig.priority || "medium";
        }
        addSubjectSelectionListeners();
    }

    /**
     * Renders the weekly availability grid based on planState.config.availability.
     */
    function renderAvailabilityGrid() {
        let tableHTML = '<table class="table table-bordered table-sm availability-grid-table text-center"><thead><tr><th>Hour</th>';
        DAYS_OF_WEEK.forEach(dayDisplay => tableHTML += `<th>${dayDisplay.substring(0,3)}</th>`);
        tableHTML += '</tr></thead><tbody>';
        HOURS_IN_DAY.forEach(hour => {
            tableHTML += `<tr><td>${hour}</td>`;
            DAYS_OF_WEEK.forEach(dayKey => { 
                const dayAvailability = planState.config.availability[dayKey] || {};
                const isAvailable = dayAvailability[hour] || false;
                tableHTML += `<td data-day="${dayKey}" data-hour="${hour}" class="${isAvailable ? 'available bg-success-subtle' : 'bg-light-subtle'}"></td>`;
            });
            tableHTML += '</tr>';
        });
        tableHTML += '</tbody></table>';
        availabilityGridDiv.innerHTML = tableHTML;
        availabilityGridDiv.querySelectorAll('td[data-day]').forEach(cell => {
            cell.addEventListener('click', handleAvailabilityToggle);
        });
    }

    /**
     * Renders the generated schedule calendar based on planState.schedule.
     */
    function renderScheduleCalendar() {
        console.log("Rendering schedule from planState.schedule:", JSON.parse(JSON.stringify(planState.schedule)));
        scheduleCalendarContainer.innerHTML = '';

        if (!planState.schedule || planState.schedule.length === 0) {
            scheduleCalendarContainer.innerHTML = "<p class='text-center text-muted p-3'>No schedule generated or loaded. Configure and click 'View / Generate Schedule'.</p>";
            if (scheduleSectionDiv) scheduleSectionDiv.style.display = 'none';
            return;
        }
        if (scheduleSectionDiv) scheduleSectionDiv.style.display = 'block';

        const scheduleByDate = planState.schedule.reduce((acc, slot) => {
            if (!slot || !slot.start_time) { console.warn("Invalid slot in schedule:", slot); return acc; }
            const datePart = slot.start_time.split('T')[0];
            (acc[datePart] = acc[datePart] || []).push(slot);
            return acc;
        }, {});
        
        const scheduledDates = Object.keys(scheduleByDate).sort((a, b) => new Date(a) - new Date(b));
        if (scheduledDates.length === 0) {
            scheduleCalendarContainer.innerHTML = "<p class='text-center text-muted p-3'>No sessions planned in the loaded schedule.</p>";
            return;
        }

        let tableHTML = `<table class="table table-sm table-bordered schedule-calendar-table"><thead><tr><th>Date</th>`;
        HOURS_IN_DAY.forEach(hour => tableHTML += `<th>${hour.substring(0,2)}h</th>`);
        tableHTML += '</tr></thead><tbody>';
        
        // Ensure dates are valid before creating Date objects
        const validScheduledDates = scheduledDates.filter(dateStr => !isNaN(new Date(dateStr).getTime()));
        if (validScheduledDates.length === 0) {
             scheduleCalendarContainer.innerHTML = "<p class='text-center text-danger p-3'>Error processing schedule dates.</p>";
            return;
        }

        const firstDateCal = new Date(validScheduledDates[0] + "T00:00:00Z");
        const lastDateCal = new Date(validScheduledDates[validScheduledDates.length - 1] + "T00:00:00Z");
        
        let previousDateIterCal = null;
        let currentDateIterCal = new Date(firstDateCal);
        
        while (currentDateIterCal <= lastDateCal) {
            const dateStr = currentDateIterCal.toISOString().split('T')[0];
            const dayIndex = currentDateIterCal.getUTCDay(); 
            const dayNameDisplay = DAYS_OF_WEEK[dayIndex === 0 ? 6 : dayIndex - 1]; // Monday is 0 in array, 1 in getUTCDay
            const weekIsEntirelyVacation = isEntireWeekVacation(currentDateIterCal, SCHOOL_VACATIONS);

            if (previousDateIterCal && dayIndex === 1 && previousDateIterCal.getUTCDay() !== 1) { // Start of a new week (Monday)
                tableHTML += `<tr class="week-separator"><td colspan="${HOURS_IN_DAY.length + 1}"></td></tr>`;
            }

            tableHTML += `<tr class="${weekIsEntirelyVacation ? 'vacation-week-indicator' : ''}"><td>${dateStr.substring(5)} <small class='text-muted'>(${dayNameDisplay.substring(0,3)})</small></td>`;
            
            const daySlots = scheduleByDate[dateStr] || [];
            const dayKeyForAvailability = DAYS_OF_WEEK[dayIndex === 0 ? 6 : dayIndex - 1];
            const currentDayAvailabilityConfig = planState.config.availability[dayKeyForAvailability] || {};
            const isCurrentDayVacation = isDateInVacationPeriod(currentDateIterCal, SCHOOL_VACATIONS);

            HOURS_IN_DAY.forEach(hour => {
                const formattedHour = hour;
                const slotData = daySlots.find(s => s.start_time && s.start_time.includes(`T${formattedHour}`));
                let cellClass = "", cellContent = "", cellStyle = "";
                
                if (slotData) {
                    cellClass = "scheduled";
                    cellContent = slotData.subject_name || "N/A"; // Use subject_name from session
                    cellStyle = `background-color:${slotData.subject_color || '#808080'}; color:white;`;
                } else { // Slot is not scheduled
                    if (isCurrentDayVacation) {
                        const hourNumDisplay = parseInt(hour.split(':')[0]);
                        // Default vacation study times
                        if ((hourNumDisplay >= 9 && hourNumDisplay < 12) || (hourNumDisplay >= 14 && hourNumDisplay < 17)) {
                            cellClass = "vacation-available-empty"; // Available for manual assignment during vacation
                        } else {
                            cellClass = "vacation"; // General vacation slot, not typically for study
                        }
                    } else if (currentDayAvailabilityConfig[formattedHour]) {
                        cellClass = "available-empty"; // Available based on user's grid
                    } else {
                        cellClass = "unavailable"; // Not available based on user's grid
                    }
                }
                tableHTML += `<td data-date="${dateStr}" data-time="${formattedHour}" class="${cellClass}" style="${cellStyle}">${cellContent}</td>`;
            });
            tableHTML += '</tr>';
            
            previousDateIterCal = new Date(currentDateIterCal);
            currentDateIterCal.setUTCDate(currentDateIterCal.getUTCDate() + 1);
        }
        tableHTML += '</tbody></table>';
        scheduleCalendarContainer.innerHTML = tableHTML;
        // Add event listeners to newly rendered cells
        scheduleCalendarContainer.querySelectorAll('td.scheduled, td.available-empty, td.vacation-available-empty').forEach(cell => {
            cell.addEventListener('click', handleSlotClickForEdit);
        });
    }
    
    // --- 5. EVENT HANDLERS & STATE UPDATES ---
    function handleAvailabilityToggle(event) {
        const cell = event.target;
        const dayKey = cell.dataset.day;
        const hour = cell.dataset.hour;
        if (!dayKey || !hour) return;
        if (!planState.config.availability[dayKey]) {
            planState.config.availability[dayKey] = {};
        }
        planState.config.availability[dayKey][hour] = !planState.config.availability[dayKey][hour];
        cell.classList.toggle('available', planState.config.availability[dayKey][hour]);
        cell.classList.toggle('bg-success-subtle', planState.config.availability[dayKey][hour]);
        cell.classList.toggle('bg-light-subtle', !planState.config.availability[dayKey][hour]);
    }
    
    function updateStateFromSubjectInputs() {
        const newSubjects = [];
        subjectsSelectionContainer.querySelectorAll('.subject-entry').forEach((entry) => {
            const localId = parseInt(entry.querySelector('.subject-select').dataset.localId, 10);
            const pk = entry.querySelector('.subject-select').value;
            const examDate = entry.querySelector('.exam-date-input').value;
            const priority = entry.querySelector('.priority-select').value;
            const color = entry.querySelector('.color-input').value;
            
            if (pk) { 
                const subjectDetails = allServerSubjects.find(s => s.pk === pk);
                newSubjects.push({
                    localId: localId, 
                    pk: pk,
                    name: subjectDetails ? subjectDetails.name : 'Unknown', 
                    examDate: examDate,
                    priority: priority,
                    color: color,
                    curriculum_name: subjectDetails ? subjectDetails.curriculum__name : '',
                    language_code: subjectDetails ? subjectDetails.language__code : '',
                    level: subjectDetails ? subjectDetails.level : null, 
                    level_display: subjectDetails ? subjectDetails.level_display : '' 
                });
            }
        });
        planState.config.subjects = newSubjects;
        console.log("Updated planState.config.subjects:", JSON.parse(JSON.stringify(planState.config.subjects)));
    }
    
    function addSubjectSelectionListeners() {
        subjectsSelectionContainer.querySelectorAll('.subject-select, .exam-date-input, .priority-select, .color-input').forEach(el => {
            el.addEventListener('change', updateStateFromSubjectInputs);
        });
    }
    
    function handleSlotClickForEdit(event) {
        const cell = event.currentTarget;
        currentEditingSlot = { date: cell.dataset.date, time: cell.dataset.time };
        slotModalDate.textContent = currentEditingSlot.date;
        slotModalTime.textContent = currentEditingSlot.time;
        
        slotSubjectSelect.innerHTML = '<option value="">-- Free / Break --</option>';
        planState.config.subjects.forEach(s => {
            if (s.pk && s.name) {
                const levelDisplayText = (s.level_display && s.level_display !== 'Other') ? ` ${s.level_display}` : '';
                const optionText = `${s.name}${levelDisplayText}`;
                slotSubjectSelect.add(new Option(optionText.trim(), String(s.localId)));
            }
        });
        
        const slotIdentifier = currentEditingSlot.date + 'T' + currentEditingSlot.time;
        const entry = planState.schedule.find(s => s.start_time && s.start_time.startsWith(slotIdentifier));
        slotSubjectSelect.value = entry ? String(entry.subject_local_id) : "";
        
        editSlotModal.show();
    }
    
    saveSlotChangesBtn.addEventListener('click', () => {
        if (!currentEditingSlot) return;
        const newSubLocalIdStr = slotSubjectSelect.value;
        const { date, time } = currentEditingSlot;
        const slotIdentifier = date + 'T' + time;
        
        planState.schedule = planState.schedule.filter(s => !(s.start_time && s.start_time.startsWith(slotIdentifier)));
        
        if (newSubLocalIdStr) {
            const subjectConfig = planState.config.subjects.find(s => String(s.localId) === newSubLocalIdStr);
            if (subjectConfig) {
                planState.schedule.push({
                    start_time: `${date}T${time}:00Z`, // Ensure Z for UTC if backend expects it
                    end_time: `${date}T${String(parseInt(time.split(':')[0], 10) + 1).padStart(2, '0')}:00:00Z`,
                    subject_name: subjectConfig.name, 
                    subject_color: subjectConfig.color,
                    subject_local_id: parseInt(subjectConfig.localId, 10)
                });
            }
        }
        renderScheduleCalendar(); // Re-render to show changes
        editSlotModal.hide();
        currentEditingSlot = null;
    });
    
    exportScheduleHtmlBtn.addEventListener('click', () => {
        const tableHTMLToExport = scheduleCalendarContainer.querySelector('table')?.outerHTML || "<p>No schedule to export.</p>";
        const exportTitle = planNameInput.value.trim() || `Study Plan`;
        const fullExportHtml = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${exportTitle}</title>
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css" rel="stylesheet">
        <style>body{font-family:system-ui,sans-serif;margin:20px;} h1{margin-bottom:1rem;}
            .schedule-calendar-table{border-collapse:collapse;width:100%;font-size:0.8rem;}
            .schedule-calendar-table th,.schedule-calendar-table td{border:1px solid #dee2e6;padding:0.4rem;text-align:center;vertical-align:middle;height:45px;}
            .schedule-calendar-table th{background-color:#f8f9fa;} .scheduled{color:white;font-weight:500;} 
            .unavailable{background-color:#e9ecef;color:#adb5bd;} .available-empty{background-color:#fff;} 
            .week-separator td{height:10px!important;background-color:#f8f9fa!important;border:none!important;}
            .vacation{background-color: #fff3cd !important;} 
            .vacation-available-empty{background-color: #d1e7dd !important;} 
        </style></head><body><div class="container-fluid"><h1>${exportTitle}</h1>${tableHTMLToExport}</div></body></html>`;
        
        const blob = new Blob([fullExportHtml], { type: "text/html" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = (exportTitle.replace(/\W+/g, "_").toLowerCase() || "study_plan") + ".html";
        link.click();
        URL.revokeObjectURL(link.href);
        link.remove();
    });

    // --- 6. CLIENT-SIDE SCHEDULE GENERATION ---
    // (Keep your existing clientSideGenerateSchedule and related helper functions:
    // isDateInVacationPeriod, getMondayOfWeek, isEntireWeekVacation.
    // Ensure they are correctly defined and used.)
    function isDateInVacationPeriod(dateObj, vacationPeriods) { 
        const dateStr = dateObj.toISOString().split('T')[0];
        for (const period of vacationPeriods) {
            if (typeof period === 'string') {
                if (period === dateStr) return true;
            } else if (typeof period === 'object' && period.start && period.end) {
                if (dateStr >= period.start && dateStr <= period.end) return true;
            }
        }
        return false; 
    }
    function getMondayOfWeek(d) {  
        d = new Date(d); d.setUTCHours(0,0,0,0); 
        let day = d.getUTCDay(), diff = d.getUTCDate() - day + (day === 0 ? -6:1); 
        return new Date(d.setUTCDate(diff)); 
    }
    function isEntireWeekVacation(dateInWeek, vacationPeriods) { 
        const monday = getMondayOfWeek(dateInWeek);
        for (let i = 0; i < 7; i++) {
            let dayToCheck = new Date(monday);
            dayToCheck.setUTCDate(monday.getUTCDate() + i);
            if (!isDateInVacationPeriod(dayToCheck, vacationPeriods)) return false;
        }
        return true; 
    }

    function clientSideGenerateSchedule() {
        console.log("Client-side schedule generation initiated.");
        showLoading(true);
        if (generationInfoAlert) { generationInfoAlert.className = 'alert d-none'; generationInfoAlert.textContent = ""; }
        
        updateStateFromSubjectInputs(); 

        const subjectsToPlan = planState.config.subjects.filter(s => s.pk && s.priority !== "none");
        if (subjectsToPlan.length === 0) {
            alert("Please select at least one subject with a priority other than 'None'.");
            showLoading(false);
            return;
        }
        let subjectsWithoutDates = subjectsToPlan.filter(s => !s.examDate).map(s => s.name);
        if (subjectsWithoutDates.length > 0) {
            alert(`Please enter an exam date for: ${subjectsWithoutDates.join(', ')}.`);
            showLoading(false);
            return;
        }

        const totalPriorityValue = subjectsToPlan.reduce((sum, s) => sum + (PRIORITY_VALUES[s.priority] || 0), 0);
        if (totalPriorityValue === 0 && subjectsToPlan.some(s => s.priority !== "none")) { // Check if any subject has a non-"none" priority
            alert("The total priority weight is 0, but subjects with priorities are selected. Please assign valid priorities (Low, Medium, or High).");
            showLoading(false);
            return;
        }
        
        setTimeout(() => { 
            planState.schedule = []; 
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            
            const examDates = subjectsToPlan.map(s => new Date(s.examDate + "T00:00:00Z"));
            const validExamDates = examDates.filter(d => !isNaN(d.getTime()));
            if (validExamDates.length === 0 && subjectsToPlan.length > 0) {
                 alert("No valid exam dates found for subjects with priority. Please check all exam dates.");
                 showLoading(false);
                 return;
            }
            const lastExamDate = new Date(Math.max(...validExamDates)); 
            
            if (isNaN(lastExamDate.getTime())) {
                alert("Invalid exam date setup. Cannot determine the last exam date.");
                showLoading(false);
                return;
            }
            lastExamDate.setUTCHours(23, 59, 59, 999);

            let allAvailableSlotsList = [];
            let tempDateIter = new Date(today);
            while (tempDateIter <= lastExamDate) {
                const dayKey = DAYS_OF_WEEK[tempDateIter.getUTCDay() === 0 ? 6 : tempDateIter.getUTCDay() - 1];
                const isVacation = isDateInVacationPeriod(tempDateIter, SCHOOL_VACATIONS);
                if (isVacation) {
                    HOURS_IN_DAY.forEach(hour => {
                        const hourNum = parseInt(hour.split(':')[0]);
                        if ((hourNum >= 9 && hourNum < 12) || (hourNum >= 14 && hourNum < 17)) { 
                            allAvailableSlotsList.push({ date: new Date(tempDateIter), dateString: tempDateIter.toISOString().split('T')[0], time: hour, dayKey: dayKey, isVacationSlot: true });
                        }
                    });
                } else {
                    if (planState.config.availability[dayKey]) {
                        HOURS_IN_DAY.forEach(hour => {
                            if (planState.config.availability[dayKey][hour]) {
                                allAvailableSlotsList.push({ date: new Date(tempDateIter), dateString: tempDateIter.toISOString().split('T')[0], time: hour, dayKey: dayKey, isVacationSlot: false });
                            }
                        });
                    }
                }
                tempDateIter.setUTCDate(tempDateIter.getUTCDate() + 1);
            }

            if (allAvailableSlotsList.length === 0) {
                if(generationInfoAlert) {generationInfoAlert.textContent = "No available study slots found based on your configuration and exam dates."; generationInfoAlert.className = 'alert alert-warning d-block';}
                showLoading(false);
                return;
            }

            let subjectWorkData = subjectsToPlan.map(s => ({
                ...s,
                targetSlots: Math.max(0, Math.floor(((PRIORITY_VALUES[s.priority] || 0) / (totalPriorityValue || 1)) * allAvailableSlotsList.length)),
                assignedSlots: 0,
                consecutiveHours: 0,
                examDateObj: new Date(s.examDate + "T00:00:00Z")
            }));
            
            for (const slot of allAvailableSlotsList) {
                let eligibleSubjects = subjectWorkData.filter(s => s.assignedSlots < s.targetSlots && slot.date <= s.examDateObj);
                if (eligibleSubjects.length === 0) {
                    subjectWorkData.forEach(s => s.consecutiveHours = 0); 
                    continue;
                }
                
                eligibleSubjects.sort((a, b) => {
                    const urgencyA = (a.examDateObj - slot.date) / (1000 * 60 * 60 * 24); 
                    const urgencyB = (b.examDateObj - slot.date) / (1000 * 60 * 60 * 24);
                    const remainingRatioA = (a.targetSlots - a.assignedSlots) / (a.targetSlots || 1); 
                    const remainingRatioB = (b.targetSlots - b.assignedSlots) / (b.targetSlots || 1);
                    
                    if (urgencyA < 7 && urgencyB >= 7) return -1; if (urgencyB < 7 && urgencyA >= 7) return 1;
                    if (urgencyA !== urgencyB) return urgencyA - urgencyB;
                    if (remainingRatioB !== remainingRatioA) return remainingRatioB - remainingRatioA;
                    return a.consecutiveHours - b.consecutiveHours;
                });
                
                let chosen = eligibleSubjects.find(sub => sub.consecutiveHours < 2) || eligibleSubjects[0];
                
                if (chosen) {
                    planState.schedule.push({
                        start_time: `${slot.dateString}T${slot.time}:00Z`,
                        end_time: `${slot.dateString}T${String(parseInt(slot.time.split(':')[0]) + 1).padStart(2, '0')}:00:00Z`,
                        subject_name: chosen.name,
                        subject_color: chosen.color,
                        subject_local_id: chosen.localId,
                        isVacationSlot: slot.isVacationSlot
                    });
                    chosen.assignedSlots++;
                    subjectWorkData.forEach(s => s.localId === chosen.localId ? s.consecutiveHours++ : s.consecutiveHours = 0);
                } else {
                    subjectWorkData.forEach(s => s.consecutiveHours = 0);
                }
            }
            renderScheduleCalendar();
            if(generationInfoAlert) {generationInfoAlert.textContent = `Schedule generated: ${planState.schedule.length} sessions planned.`; generationInfoAlert.className = 'alert alert-success d-block';}
            showLoading(false);
        }, 50);
    }


    // =========================================================================
    // 7. API COMMUNICATION (Save/Load Plan)
    // =========================================================================
    async function loadPlanFromServer(studentIdToLoad) {
        if (!studentIdToLoad) { 
            resetPlanState(""); 
            renderUIFromState();
            if (actionButtonsContainer) actionButtonsContainer.style.display = 'none'; 
            return;
        }
        showLoading(true);
        if (generationInfoAlert) { generationInfoAlert.className = 'alert d-none'; generationInfoAlert.textContent = ""; }
        console.log(`Loading plan for student ID: ${studentIdToLoad}`);
        
        try {
            const response = await fetch(`${API_URLS.study_plans_base}?student_id=${studentIdToLoad}`);
            
            if (response.status === 404) { 
                console.log("No plan found on server for student:", studentIdToLoad, ". Initializing new.");
                const studentOption = Array.from(studentSelector.options).find(opt => opt.value === studentIdToLoad);
                const studentName = studentOption ? studentOption.text.split('(')[0].trim() : 'selected student';
                resetPlanState(studentIdToLoad, `Plan for ${studentName}`);
                if(generationInfoAlert) {generationInfoAlert.textContent = `No saved plan found for ${studentName}. You can create and save a new one.`; generationInfoAlert.className = 'alert alert-secondary d-block';}
            } else if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Error loading plan: ${response.statusText} - ${errText}`);
            } else {
                const loadedPlan = await response.json(); 
                planState.id = loadedPlan.id;
                planState.name = loadedPlan.name || `Plan for ${studentSelector.options[studentSelector.selectedIndex]?.text.split('(')[0].trim() || 'selected student'}`;
                planState.student = String(loadedPlan.student); 
                planState.config = loadedPlan.config || { subjects: [], availability: {} };
                planState.schedule = loadedPlan.sessions || [];

                if (!planState.config.availability || Object.keys(planState.config.availability).length === 0) {
                    setDefaultWeeklyAvailability();
                } else { 
                     DAYS_OF_WEEK.forEach(dayKey => {
                        if (!planState.config.availability[dayKey]) planState.config.availability[dayKey] = {};
                        HOURS_IN_DAY.forEach(hour => {
                            if (planState.config.availability[dayKey][hour] === undefined) {
                                const hourNum = parseInt(hour.split(':')[0]);
                                planState.config.availability[dayKey][hour] = (['Saturday', 'Sunday'].includes(dayKey) && hourNum >= 9 && hourNum < 12) ||
                                                                          (!['Saturday', 'Sunday'].includes(dayKey) && hourNum >= 16 && hourNum < 19);
                            }
                        });
                    });
                }
                console.log("Plan loaded from server:", JSON.parse(JSON.stringify(planState)));
                if(generationInfoAlert) {
                    generationInfoAlert.textContent = planState.schedule.length > 0 ? `Schedule loaded for "${planState.name}".` : `Configuration loaded for "${planState.name}".`;
                    generationInfoAlert.className = `alert ${planState.schedule.length > 0 ? 'alert-info' : 'alert-secondary'} d-block`;
                }
            }
            localStorage.setItem('lastSelectedPlannerStudent', studentIdToLoad);
            renderUIFromState();
        } catch (error) {
            console.error("Error in loadPlanFromServer:", error);
            alert(`Error loading plan: ${error.message}`);
            const studentOption = Array.from(studentSelector.options).find(opt => opt.value === studentIdToLoad);
            const studentName = studentOption ? studentOption.text.split('(')[0].trim() : 'selected student';
            resetPlanState(studentIdToLoad, `Plan for ${studentName}`); 
            renderUIFromState();
        } finally {
            showLoading(false);
        }
    }
    
    async function savePlanToServer() {
        if (!planState.student) {
            alert("Please select a student first.");
            return;
        }
        updateStateFromSubjectInputs(); 
        planState.name = planNameInput.value.trim() || `Plan for ${studentSelector.options[studentSelector.selectedIndex]?.text.split('(')[0].trim() || 'selected student'}`;

        const payload = {
            name: planState.name,
            student: planState.student, 
            config: planState.config, 
            sessions: planState.schedule 
        };
        
        // Backend's create method handles "get or create/update" logic based on student ID
        const url = API_URLS.study_plans_base;
        const method = 'POST'; // Always POST, backend handles upsert

        showLoading(true);
        console.log(`Saving plan to server. Method: ${method}, URL: ${url}`);
        console.log("Payload:", JSON.parse(JSON.stringify(payload)));
        
        try {
            const response = await fetch(url, { 
                method: method,
                headers: { 'Content-Type': 'application/json', 'X-CSRFToken': CSRF_TOKEN },
                body: JSON.stringify(payload) 
            });

            if (!response.ok) {
                const errData = await response.json();
                console.error("Server save error data:", errData);
                throw new Error(JSON.stringify(errData.detail || errData.student || errData.name || errData));
            }
            const savedPlan = await response.json();
            console.log("Plan saved/updated on server, response:", savedPlan);
            
            planState.id = savedPlan.id; 
            planState.name = savedPlan.name;
            planState.config = savedPlan.config;
            planState.schedule = savedPlan.sessions || []; 
            
            alert(`Plan "${planState.name}" saved successfully!`);
            renderUIFromState(); 
        } catch (error) {
            console.error("Error saving plan to server:", error);
            alert(`Save failed: ${error.message}`);
        } finally {
            showLoading(false);
        }
    }

    // =========================================================================
    // 8. EVENT LISTENERS & INITIALIZATION
    // =========================================================================
    studentSelector.addEventListener('change', async (e) => {
        const selectedStudentId = e.target.value;
        if (IS_STAFF && selectedStudentId) { // Only save preference for staff
            localStorage.setItem('lastSelectedPlannerStudent', selectedStudentId);
        } else if (IS_STAFF && !selectedStudentId) { 
            localStorage.removeItem('lastSelectedPlannerStudent');
        }
        await loadPlanFromServer(selectedStudentId);
    });

    if(planNameInput) planNameInput.addEventListener('change', (e) => { planState.name = e.target.value; });
    if(viewGenerateScheduleBtn) viewGenerateScheduleBtn.addEventListener('click', clientSideGenerateSchedule);
    if(savePlanBtn) savePlanBtn.addEventListener('click', savePlanToServer);
    if(exportScheduleHtmlBtn) exportScheduleHtmlBtn.addEventListener('click', exportScheduleHtmlBtn); // Corrected this line
    
    function populateInitialDropdowns() {
        if (INITIAL_DATA.users && studentSelector) {
            INITIAL_DATA.users.forEach(user => {
                const option = new Option(`${user.first_name || ''} ${user.last_name || ''} (${user.username})`.trim(), String(user.id));
                studentSelector.add(option);
            });
        }
        if (INITIAL_DATA.subjects) {
            allServerSubjects = INITIAL_DATA.subjects.map(s => ({
                pk: String(s.pk), name: s.name, level: s.level, 
                curriculum__name: s.curriculum__name, language__code: s.language__code,
                // Determine display level (SL/HL) based on the 'level' field
                level_display: s.level === 1 ? 'SL' : (s.level === 2 ? 'HL' : 'Other') 
            }));
        }
    }
    
    async function initializePage() {
        showLoading(true);
        populateInitialDropdowns();
        
        if (!IS_STAFF && CURRENT_USER_ID) {
            studentSelector.value = CURRENT_USER_ID;
            studentSelector.disabled = true; 
            await loadPlanFromServer(CURRENT_USER_ID);
        } else if (IS_STAFF) { 
            const lastStudent = localStorage.getItem('lastSelectedPlannerStudent');
            if (lastStudent && Array.from(studentSelector.options).some(opt => opt.value === lastStudent)) {
                studentSelector.value = lastStudent;
                await loadPlanFromServer(lastStudent);
            } else {
                resetPlanState(""); 
                renderUIFromState(); 
                if (actionButtonsContainer) actionButtonsContainer.style.display = 'none'; 
            }
        } else { 
            resetPlanState("");
            renderUIFromState();
            if (actionButtonsContainer) actionButtonsContainer.style.display = 'none';
        }
        showLoading(false);
    }

    initializePage();
});
