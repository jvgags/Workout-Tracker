/* ========== WORKOUT TRACKER APP.JS ========== */

// Global Variables
let workouts = [];
let exercises = [];
let measurements = [];
let settings = {
    weekStartMonday: false,
    autoAddExercises: true,
    weightUnit: 'lbs',
    theme: 'default',
    manualStreakWeeks: 0
};

// Calendar state
let currentCalendarMonth = new Date().getMonth();
let currentCalendarYear = new Date().getFullYear();
let selectedDate = null;

let wtEncryptionKey = localStorage.getItem('wtEncryptionKey');

// IndexedDB Setup
const DB_NAME = 'WorkoutTrackerDB';
const DB_VERSION = 1;
const STORE_NAME = 'data';
let db;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (e) => {
            db = e.target.result;
            resolve(db);
        };

        request.onerror = (e) => {
            console.error('IndexedDB error:', e.target.error);
            showToast('Database error. Data may not save.');
            reject(e);
        };
    });
}

async function saveToDB(id, data) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put({ id, value: data });
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e);
    });
}

async function loadFromDB(id) {
    if (!db) await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result ? request.result.value : null);
        request.onerror = (e) => reject(e);
    });
}

/* ========== INITIALIZATION ========== */

window.onload = async function() {
    // Check encryption key
    if (!wtEncryptionKey || wtEncryptionKey === 'null') {
        if (wtEncryptionKey === 'null') {
            localStorage.removeItem('wtEncryptionKey');
            wtEncryptionKey = null;
        }
        document.getElementById('encryptionKeyModal').style.display = 'flex';
        document.getElementById('encryptionKeyInput').focus();
        return;
    }

    try {
        await openDB();
        await loadData();
    } catch (e) {
        showToast('Failed to open database.');
    }

    // Set today's date
    document.getElementById('workoutDate').valueAsDate = new Date();
    document.getElementById('measurementDate').valueAsDate = new Date();

    // Update workout title with day of week
    updateWorkoutTitle();

    // Add first exercise row
    addExerciseRow();

    // Update UI
    updateWeekStreak();
    updateStats();
    updateHistory();
    updateExerciseLibrary();
    updateMeasurementHistory();
    updatePersonalRecords();
    renderCalendar();

    // Menu toggle
    document.getElementById('hamburger').addEventListener('click', toggleMenu);
    document.getElementById('menuOverlay').addEventListener('click', closeMenu);

    // Allow Enter key on encryption input
    document.getElementById('encryptionKeyInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            setEncryptionKey();
        }
    });

    // Update subcategory dropdown when main category changes
    document.getElementById('newExerciseCategory').addEventListener('change', updateSubcategoryOptions);
    updateSubcategoryOptions();
};

/* ========== ENCRYPTION KEY ========== */

function setEncryptionKey() {
    const input = document.getElementById('encryptionKeyInput');
    const key = input.value.trim();
    
    if (!key) {
        alert('Please enter a valid encryption key');
        input.focus();
        return;
    }
    
    if (key.length < 4) {
        alert('Please use at least 4 characters for security');
        input.focus();
        return;
    }
    
    wtEncryptionKey = key;
    localStorage.setItem('wtEncryptionKey', wtEncryptionKey);
    document.getElementById('encryptionKeyModal').style.display = 'none';
    showToast('Encryption key set successfully!');

    setTimeout(() => {
        window.location.reload();
    }, 500);
}

/* ========== DATA PERSISTENCE ========== */

async function autoSave() {
    const data = {
        workouts,
        exercises,
        measurements,
        settings
    };
    const encrypted = CryptoJS.AES.encrypt(JSON.stringify(data), wtEncryptionKey).toString();
    try {
        await saveToDB('workoutTrackerData', encrypted);
    } catch (e) {
        showToast('Auto-save failed.');
    }
}

async function loadData() {
    let encrypted = null;
    try {
        encrypted = await loadFromDB('workoutTrackerData');
    } catch (e) {
        console.error('Load failed:', e);
    }

    let savedData = null;
    if (encrypted) {
        try {
            const decrypted = CryptoJS.AES.decrypt(encrypted, wtEncryptionKey).toString(CryptoJS.enc.Utf8);
            savedData = JSON.parse(decrypted);
        } catch (e) {
            showToast('Wrong key or corrupted data. Starting fresh.');
        }
    }

    // Restore data
    workouts = savedData?.workouts || [];
    exercises = savedData?.exercises || getDefaultExercises();
    measurements = savedData?.measurements || [];
    settings = savedData?.settings || settings;

    // Apply settings
    document.getElementById('weekStartMonday').checked = settings.weekStartMonday;
    document.getElementById('autoAddExercises').checked = settings.autoAddExercises;
    document.getElementById('weightUnit').value = settings.weightUnit;
    document.getElementById('themeSelect').value = settings.theme || 'default';
    document.getElementById('manualStreakWeeks').value = settings.manualStreakWeeks || 0;
    applyTheme(settings.theme || 'default');
}

function getDefaultExercises() {
    return [
        { name: 'Bench Press', category: 'Chest', subcategory: 'Upper Chest', videoLink: '', disabled: false },
        { name: 'Incline Dumbbell Press', category: 'Chest', subcategory: 'Upper Chest', videoLink: '', disabled: false },
        { name: 'Cable Flyes', category: 'Chest', subcategory: 'Lower Chest', videoLink: '', disabled: false },
        { name: 'Squat', category: 'Legs', subcategory: 'Quadriceps', videoLink: '', disabled: false },
        { name: 'Leg Press', category: 'Legs', subcategory: 'Quadriceps', videoLink: '', disabled: false },
        { name: 'Romanian Deadlift', category: 'Legs', subcategory: 'Hamstrings', videoLink: '', disabled: false },
        { name: 'Leg Curls', category: 'Legs', subcategory: 'Hamstrings', videoLink: '', disabled: false },
        { name: 'Calf Raises', category: 'Legs', subcategory: 'Calves', videoLink: '', disabled: false },
        { name: 'Deadlift', category: 'Back', subcategory: 'Lower Back', videoLink: '', disabled: false },
        { name: 'Barbell Row', category: 'Back', subcategory: 'Mid Back', videoLink: '', disabled: false },
        { name: 'Pull-ups', category: 'Back', subcategory: 'Lats', videoLink: '', disabled: false },
        { name: 'Lat Pulldown', category: 'Back', subcategory: 'Lats', videoLink: '', disabled: false },
        { name: 'Overhead Press', category: 'Shoulders', subcategory: 'Front Delts', videoLink: '', disabled: false },
        { name: 'Lateral Raises', category: 'Shoulders', subcategory: 'Side Delts', videoLink: '', disabled: false },
        { name: 'Face Pulls', category: 'Shoulders', subcategory: 'Rear Delts', videoLink: '', disabled: false },
        { name: 'Barbell Curl', category: 'Arms', subcategory: 'Biceps', videoLink: '', disabled: false },
        { name: 'Hammer Curls', category: 'Arms', subcategory: 'Biceps', videoLink: '', disabled: false },
        { name: 'Tricep Dips', category: 'Arms', subcategory: 'Triceps', videoLink: '', disabled: false },
        { name: 'Tricep Pushdown', category: 'Arms', subcategory: 'Triceps', videoLink: '', disabled: false },
        { name: 'Planks', category: 'Core', subcategory: 'Abs', videoLink: '', disabled: false },
        { name: 'Russian Twists', category: 'Core', subcategory: 'Obliques', videoLink: '', disabled: false },
        { name: 'Running', category: 'Cardio', subcategory: 'Running', videoLink: '', disabled: false },
        { name: 'Cycling', category: 'Cardio', subcategory: 'Cycling', videoLink: '', disabled: false }
    ];
}

// Define category structure with subcategories
function getCategoryStructure() {
    return {
        'Chest': ['Upper Chest', 'Mid Chest', 'Lower Chest', 'General'],
        'Back': ['Lats', 'Mid Back', 'Lower Back', 'Traps', 'General'],
        'Legs': ['Quadriceps', 'Hamstrings', 'Glutes', 'Calves', 'General'],
        'Shoulders': ['Front Delts', 'Side Delts', 'Rear Delts', 'General'],
        'Arms': ['Biceps', 'Triceps', 'Forearms', 'General'],
        'Core': ['Abs', 'Obliques', 'Lower Back', 'General'],
        'Cardio': ['Running', 'Cycling', 'Swimming', 'Rowing', 'General'],
        'Other': ['General']
    };
}

/* ========== BACKUP & RESTORE ========== */

async function createBackup() {
    try {
        const data = {
            workouts,
            exercises,
            measurements,
            settings,
            version: '1.0',
            timestamp: new Date().toISOString()
        };

        const json = JSON.stringify(data, null, 2);
        const encrypted = CryptoJS.AES.encrypt(json, wtEncryptionKey).toString();

        const blob = new Blob([encrypted], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        const date = new Date().toISOString().slice(0, 10);
        a.download = `WorkoutTracker_Backup_${date}.workoutbackup`;
        
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Backup created successfully!');
    } catch (err) {
        console.error('Backup failed:', err);
        showToast('Backup failed. Check console.');
    }
}

async function restoreFromBackup(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const encrypted = e.target.result;
            const decrypted = CryptoJS.AES.decrypt(encrypted, wtEncryptionKey).toString(CryptoJS.enc.Utf8);
            
            if (!decrypted || decrypted.length < 10) {
                showToast('Wrong password or corrupted file.');
                return;
            }

            const data = JSON.parse(decrypted);

            // Restore everything
            workouts = data.workouts || [];
            exercises = data.exercises || [];
            measurements = data.measurements || [];
            settings = data.settings || settings;

            await autoSave();

            // Refresh UI
            updateWeekStreak();
            updateStats();
            updateHistory();
            updateExerciseLibrary();
            updateMeasurementHistory();
            updatePersonalRecords();
            
            // Apply restored theme
            document.getElementById('themeSelect').value = settings.theme || 'default';
            applyTheme(settings.theme || 'default');

            showToast('Restore complete!');
            closeMenu();
        } catch (err) {
            console.error('Restore failed:', err);
            showToast('Restore failed. Wrong key or invalid file.');
        }
    };

    reader.readAsText(file);
}

/* ========== WEEK STREAK CALCULATION ========== */

function calculateWeekStreak() {
    if (workouts.length === 0) return { current: 0, best: 0 };

    // Sort workouts by date (newest first)
    const sorted = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Get week number for a date
    function getWeekNumber(date) {
        const d = new Date(date);
        const startDay = settings.weekStartMonday ? 1 : 0; // Monday = 1, Sunday = 0
        
        // Adjust to week start
        const dayOfWeek = d.getDay();
        const diff = dayOfWeek - startDay;
        const adjustedDiff = diff < 0 ? diff + 7 : diff;
        
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - adjustedDiff);
        weekStart.setHours(0, 0, 0, 0);
        
        return weekStart.getTime();
    }

    // Get unique weeks with workouts
    const weeksWithWorkouts = new Set();
    sorted.forEach(workout => {
        const weekKey = getWeekNumber(workout.date);
        weeksWithWorkouts.add(weekKey);
    });

    const uniqueWeeks = Array.from(weeksWithWorkouts).sort((a, b) => b - a);

    // Calculate current streak
    let currentStreak = 0;
    const today = new Date();
    let checkWeek = getWeekNumber(today);

    for (let i = 0; i < uniqueWeeks.length; i++) {
        if (uniqueWeeks[i] === checkWeek) {
            currentStreak++;
            checkWeek -= 7 * 24 * 60 * 60 * 1000; // Previous week
        } else if (uniqueWeeks[i] < checkWeek) {
            // Gap found
            break;
        }
    }

    // Calculate best streak
    let bestStreak = 0;
    let tempStreak = 1;

    for (let i = 1; i < uniqueWeeks.length; i++) {
        const weekDiff = (uniqueWeeks[i - 1] - uniqueWeeks[i]) / (7 * 24 * 60 * 60 * 1000);
        
        if (weekDiff === 1) {
            tempStreak++;
            bestStreak = Math.max(bestStreak, tempStreak);
        } else {
            tempStreak = 1;
        }
    }

    bestStreak = Math.max(bestStreak, tempStreak, currentStreak);

    return { current: currentStreak, best: bestStreak };
}

function updateWeekStreak() {
    const streak = calculateWeekStreak();
    
    // Use manual override if set, otherwise use calculated streak
    const displayStreak = settings.manualStreakWeeks > 0 ? settings.manualStreakWeeks : streak.current;
    
    document.getElementById('weekStreak').textContent = displayStreak;
}

/* ========== WORKOUT LOGGING ========== */

function updateWorkoutTitle() {
    const dateInput = document.getElementById('workoutDate');
    const title = document.getElementById('workoutTitle');
    const date = new Date(dateInput.value + 'T00:00:00');
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayName = days[date.getDay()];
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);
    
    if (selectedDate.getTime() === today.getTime()) {
        title.textContent = `Log Today's Workout (${dayName})`;
    } else {
        title.textContent = `Log Workout for ${dayName}`;
    }
}

function addExerciseRow() {
    const container = document.getElementById('exercisesList');
    const previousRow = container.lastElementChild;
    
    const row = document.createElement('div');
    row.className = 'exercise-row';
    
    // Get all unique subcategories from enabled exercises only
    const subcategories = [...new Set(exercises.filter(e => !e.disabled).map(e => e.subcategory || 'General'))].sort();
    
    // Get values from previous row if it exists
    let prevGroup = '';
    let prevExercise = '';
    let prevSetNumber = 1;
    
    if (previousRow) {
        prevGroup = previousRow.querySelector('.group-select')?.value || '';
        prevExercise = previousRow.querySelector('.exercise-select')?.value || '';
        const prevSet = parseInt(previousRow.querySelector('.set-number')?.value) || 0;
        
        // Only increment set number if same exercise is selected
        if (prevExercise && prevGroup) {
            prevSetNumber = prevSet + 1;
        }
    }
    
    row.innerHTML = `
        <div class="input-wrapper">
            <label>Group:</label>
            <select class="group-select" onchange="updateExerciseDropdown(this); resetSetNumber(this);" required>
                <option value="">Select Group</option>
                ${subcategories.map(sub => 
                    `<option value="${sub}" ${sub === prevGroup ? 'selected' : ''}>${sub}</option>`
                ).join('')}
            </select>
        </div>
        <div class="input-wrapper">
            <label>Exercise:</label>
            <select class="exercise-select" onchange="resetSetNumber(this);" required ${!prevGroup ? 'disabled' : ''}>
                <option value="">Select Group First</option>
            </select>
        </div>
        <div class="input-wrapper">
            <label class="supersetHeader-label">Superset:</label>
            <label class="superset-label">
                <input type="checkbox" class="superset-checkbox">
            </label>
        </div>
        <div class="input-wrapper">
            <label>Set No.:</label>
            <input type="number" class="set-number" placeholder="1" min="1" value="${prevSetNumber}" required>
        </div>
        <div class="input-wrapper">
            <label>Weight:</label>
            <input type="number" class="weight-input" placeholder="0" step="0.5" min="0">
        </div>
        <div class="input-wrapper">
            <label>Reps/Seconds:</label>
            <input type="number" class="reps-input" placeholder="0" min="1" required>
        </div>
        <div class="input-wrapper">
            <label>&nbsp;</label>
            <button type="button" class="remove-btn" onclick="removeExerciseRow(this)">×</button>
        </div>
    `;
    
    container.appendChild(row);
    
    // If previous row had values, populate exercise dropdown and select it
    if (prevGroup) {
        const groupSelect = row.querySelector('.group-select');
        updateExerciseDropdown(groupSelect);
        
        if (prevExercise) {
            const exerciseSelect = row.querySelector('.exercise-select');
            exerciseSelect.value = prevExercise;
        }
    }
    
    // Add tab listener to reps input for auto-adding next set
    const repsInput = row.querySelector('.reps-input');
    repsInput.addEventListener('keydown', handleRepsTab);
    
    // Focus first empty field
    if (!prevGroup) {
        row.querySelector('.group-select').focus();
    } else if (!prevExercise) {
        row.querySelector('.exercise-select').focus();
    } else {
        row.querySelector('.weight-input').focus();
    }
}

function updateExerciseDropdown(groupSelect) {
    const row = groupSelect.closest('.exercise-row');
    const exerciseSelect = row.querySelector('.exercise-select');
    const selectedGroup = groupSelect.value;
    
    if (!selectedGroup) {
        exerciseSelect.disabled = true;
        exerciseSelect.innerHTML = '<option value="">Select Group First</option>';
        return;
    }
    
    // Filter exercises by subcategory and exclude disabled ones
    const filteredExercises = exercises
        .filter(e => (e.subcategory || 'General') === selectedGroup && !e.disabled)
        .sort((a, b) => a.name.localeCompare(b.name));
    
    exerciseSelect.disabled = false;
    exerciseSelect.innerHTML = `
        <option value="">Select Exercise</option>
        ${filteredExercises.map(ex => 
            `<option value="${ex.name}">${ex.name}</option>`
        ).join('')}
    `;
}

function resetSetNumber(selectElement) {
    const row = selectElement.closest('.exercise-row');
    const container = document.getElementById('exercisesList');
    const allRows = Array.from(container.children);
    const currentIndex = allRows.indexOf(row);
    
    // Get current exercise selection
    const currentExercise = row.querySelector('.exercise-select').value;
    
    if (!currentExercise) return;
    
    // Look at previous rows to determine set number
    let setNumber = 1;
    for (let i = currentIndex - 1; i >= 0; i--) {
        const prevRow = allRows[i];
        const prevExercise = prevRow.querySelector('.exercise-select').value;
        
        if (prevExercise === currentExercise) {
            const prevSetNumber = parseInt(prevRow.querySelector('.set-number').value) || 0;
            setNumber = prevSetNumber + 1;
            break;
        }
    }
    
    row.querySelector('.set-number').value = setNumber;
}

function handleRepsTab(event) {
    // Check if Tab key was pressed (without Shift)
    if (event.key === 'Tab' && !event.shiftKey) {
        const row = event.target.closest('.exercise-row');
        const container = document.getElementById('exercisesList');
        const allRows = Array.from(container.children);
        const isLastRow = allRows[allRows.length - 1] === row;
        
        // Only auto-add if this is the last row
        if (!isLastRow) return;
        
        // Check if all required fields are filled
        const groupSelect = row.querySelector('.group-select');
        const exerciseSelect = row.querySelector('.exercise-select');
        const setNumberInput = row.querySelector('.set-number');
        const repsInput = row.querySelector('.reps-input');
        
        const isComplete = groupSelect.value && 
                          exerciseSelect.value && 
                          setNumberInput.value && 
                          repsInput.value;
        
        if (isComplete) {
            event.preventDefault(); // Prevent default tab behavior
            addExerciseRow();
        }
    }
}

function removeExerciseRow(btn) {
    const container = document.getElementById('exercisesList');
    if (container.children.length > 1) {
        btn.closest('.exercise-row').remove();
    } else {
        showToast('At least one exercise is required');
    }
}

function addWorkout(event) {
    event.preventDefault();

    const date = document.getElementById('workoutDate').value + "T00:00:00";
    const name = document.getElementById('workoutName').value.trim();
    const notes = document.getElementById('workoutNotes').value.trim();
    const editingId = document.getElementById('workoutForm').dataset.editingId;

    const exerciseRows = document.querySelectorAll('.exercise-row');
    const exerciseList = [];

    exerciseRows.forEach(row => {
        const exerciseName = row.querySelector('.exercise-select').value;
        const setNumber = parseInt(row.querySelector('.set-number').value);
        const reps = parseInt(row.querySelector('.reps-input').value);
        const weight = parseFloat(row.querySelector('.weight-input').value) || 0;
        const isSuperset = row.querySelector('.superset-checkbox').checked;

        if (exerciseName && setNumber && reps) {
            exerciseList.push({ 
                exerciseName, 
                setNumber, 
                reps, 
                weight,
                isSuperset 
            });

            // Auto-add to library if enabled
            if (settings.autoAddExercises) {
                if (!exercises.find(e => e.name === exerciseName)) {
                    exercises.push({ name: exerciseName, category: 'Other', subcategory: 'General' });
                }
            }
        }
    });

    if (exerciseList.length === 0) {
        showToast('Please add at least one exercise');
        return;
    }

    if (editingId) {
        // Update existing workout
        const workout = workouts.find(w => w.id === parseInt(editingId));
        if (workout) {
            workout.date = date;
            workout.name = name;
            workout.notes = notes;
            workout.exercises = exerciseList;
            showToast('Workout updated successfully! 💪');
        }
        delete document.getElementById('workoutForm').dataset.editingId;
        
        // Reset submit button
        const submitBtn = document.querySelector('#workoutForm button[type="submit"]');
        submitBtn.textContent = 'Save Workout';
        submitBtn.style.background = '';
        
        // Remove cancel button
        const cancelBtn = document.getElementById('cancelEditBtn');
        if (cancelBtn) cancelBtn.remove();
    } else {
        // Create new workout
        const workout = {
            id: Date.now(),
            date,
            name,
            notes,
            exercises: exerciseList
        };
        workouts.push(workout);
        showToast('Workout logged successfully! 💪');
    }

    autoSave();
    
    clearWorkoutForm();
    updateWeekStreak();
    updateStats();
    updateHistory();
    updatePersonalRecords();
    renderCalendar();
}

function clearWorkoutForm() {
    document.getElementById('workoutForm').reset();
    document.getElementById('workoutDate').valueAsDate = new Date();
    document.getElementById('exercisesList').innerHTML = '';
    addExerciseRow();
    updateWorkoutTitle();
}

/* ========== EDIT WORKOUT ========== */

function editWorkout(id) {
    const workout = workouts.find(w => w.id === id);
    if (!workout) return;
    
    // Store the workout ID we're editing
    document.getElementById('workoutForm').dataset.editingId = id;
    
    // Populate the form
    document.getElementById('workoutDate').value = workout.date.split('T')[0];
    document.getElementById('workoutName').value = workout.name;
    document.getElementById('workoutNotes').value = workout.notes || '';
    
    // Clear existing exercise rows
    document.getElementById('exercisesList').innerHTML = '';
    
    // Add rows for each exercise in the workout
    workout.exercises.forEach(ex => {
        addExerciseRow();
        const rows = document.querySelectorAll('.exercise-row');
        const row = rows[rows.length - 1];
        
        // Find the exercise to get its subcategory
        const exerciseData = exercises.find(e => e.name === ex.exerciseName);
        const subcategory = exerciseData ? (exerciseData.subcategory || 'General') : 'General';
        
        // Set group (subcategory)
        const groupSelect = row.querySelector('.group-select');
        groupSelect.value = subcategory;
        
        // Update exercise dropdown and select exercise
        updateExerciseDropdown(groupSelect);
        const exerciseSelect = row.querySelector('.exercise-select');
        exerciseSelect.value = ex.exerciseName;
        
        // Set other values
        row.querySelector('.set-number').value = ex.setNumber || 1;
        row.querySelector('.weight-input').value = ex.weight || '';
        row.querySelector('.reps-input').value = ex.reps || '';
        row.querySelector('.superset-checkbox').checked = ex.isSuperset || false;
    });
    
    // Update the workout title
    updateWorkoutTitle();
    
    // Change the submit button text
    const submitBtn = document.querySelector('#workoutForm button[type="submit"]');
    submitBtn.textContent = 'Update Workout';
    submitBtn.style.background = 'var(--warning-color)';
    
    // Add a cancel button if it doesn't exist
    let cancelBtn = document.getElementById('cancelEditBtn');
    if (!cancelBtn) {
        cancelBtn = document.createElement('button');
        cancelBtn.id = 'cancelEditBtn';
        cancelBtn.type = 'button';
        cancelBtn.className = 'secondary-btn';
        cancelBtn.textContent = 'Cancel Edit';
        cancelBtn.onclick = cancelWorkoutEdit;
        document.querySelector('.form-actions').insertBefore(cancelBtn, submitBtn.nextSibling);
    }
    
    // Switch to Log tab
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
    document.querySelector('.tab-btn:first-child').classList.add('active');
    document.getElementById('log-tab').classList.add('active');
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    showToast('Editing workout - modify and click Update');
}

function cancelWorkoutEdit() {
    // Remove editing flag
    delete document.getElementById('workoutForm').dataset.editingId;
    
    // Reset form
    clearWorkoutForm();
    
    // Reset submit button
    const submitBtn = document.querySelector('#workoutForm button[type="submit"]');
    submitBtn.textContent = 'Save Workout';
    submitBtn.style.background = '';
    
    // Remove cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) cancelBtn.remove();
    
    showToast('Edit cancelled');
}

/* ========== HISTORY ========== */

function renderCalendar() {
    const grid = document.getElementById('calendarGrid');
    const monthYearLabel = document.getElementById('calendarMonthYear');
    
    // Update header
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    monthYearLabel.textContent = `${monthNames[currentCalendarMonth]} ${currentCalendarYear}`;
    
    // Get first day of month and number of days
    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1);
    const lastDay = new Date(currentCalendarYear, currentCalendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    // Get dates with workouts
    const workoutDates = new Set();
    workouts.forEach(workout => {
        const date = new Date(workout.date);
        
        if (date.getMonth() === currentCalendarMonth && date.getFullYear() === currentCalendarYear) {
            workoutDates.add(date.getDate());
        }
    });
    
    // Build calendar
    let html = '';
    
    // Day headers
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(day => {
        html += `<div class="calendar-day-header">${day}</div>`;
    });
    
    // Previous month days
    const prevMonthDays = new Date(currentCalendarYear, currentCalendarMonth, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
        const day = prevMonthDays - i;
        html += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    // Current month days
    const today = new Date();
    for (let day = 1; day <= daysInMonth; day++) {
        const isToday = day === today.getDate() && 
                       currentCalendarMonth === today.getMonth() && 
                       currentCalendarYear === today.getFullYear();
        const hasWorkout = workoutDates.has(day);
        const isSelected = selectedDate && 
                          selectedDate.getDate() === day &&
                          selectedDate.getMonth() === currentCalendarMonth &&
                          selectedDate.getFullYear() === currentCalendarYear;
        
        const classes = ['calendar-day'];
        if (isToday) classes.push('today');
        if (hasWorkout) classes.push('has-workout');
        if (isSelected) classes.push('selected');
        
        html += `<div class="${classes.join(' ')}" onclick="selectDate(${day})">${day}</div>`;
    }
    
    // Next month days
    const remainingCells = 42 - (startDayOfWeek + daysInMonth);
    for (let day = 1; day <= remainingCells; day++) {
        html += `<div class="calendar-day other-month">${day}</div>`;
    }
    
    grid.innerHTML = html;
}

function changeCalendarMonth(delta) {
    currentCalendarMonth += delta;
    if (currentCalendarMonth > 11) {
        currentCalendarMonth = 0;
        currentCalendarYear++;
    } else if (currentCalendarMonth < 0) {
        currentCalendarMonth = 11;
        currentCalendarYear--;
    }
    renderCalendar();
}

function goToToday() {
    const today = new Date();
    currentCalendarMonth = today.getMonth();
    currentCalendarYear = today.getFullYear();
    renderCalendar();
}

function selectDate(day) {
    selectedDate = new Date(currentCalendarYear, currentCalendarMonth, day);
    renderCalendar();
    updateHistory();
    document.getElementById('clearDateBtn').style.display = 'block';
}

function clearDateFilter() {
    selectedDate = null;
    renderCalendar();
    updateHistory();
    document.getElementById('clearDateBtn').style.display = 'none';
}

function updateHistory() {
    const container = document.getElementById('historyList');
    const filterValue = document.getElementById('historyFilter')?.value || 'all';
    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';

    let filtered = [...workouts];

    // Apply date filter from calendar if a date is selected
    if (selectedDate) {
        const selectedDateStr = selectedDate.toISOString().split('T')[0];
        filtered = filtered.filter(w => w.date === selectedDateStr);
    } else {
        // Apply time filter only if no specific date is selected
        const now = new Date();
        if (filterValue === 'week') {
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            filtered = filtered.filter(w => new Date(w.date) >= weekAgo);
        } else if (filterValue === 'month') {
            const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            filtered = filtered.filter(w => new Date(w.date) >= monthAgo);
        } else if (filterValue === 'year') {
            const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            filtered = filtered.filter(w => new Date(w.date) >= yearAgo);
        }
    }

    // Apply search filter
    if (searchTerm) {
        filtered = filtered.filter(w => 
            w.name.toLowerCase().includes(searchTerm) ||
            w.notes.toLowerCase().includes(searchTerm) ||
            w.exercises.some(e => e.exerciseName.toLowerCase().includes(searchTerm))
        );
    }

    // Sort by date (newest first)
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filtered.length === 0) {
        if (selectedDate) {
            container.innerHTML = `<p style="text-align:center; color:#999; padding:40px;">No workouts on ${selectedDate.toLocaleDateString()}</p>`;
        } else {
            container.innerHTML = '<p style="text-align:center; color:#999; padding:40px;">No workouts found</p>';
        }
        return;
    }

    container.innerHTML = filtered.map(workout => {
        // Group exercises by name and track sets
        const groupedExercises = {};
        workout.exercises.forEach(ex => {
            if (!groupedExercises[ex.exerciseName]) {
                groupedExercises[ex.exerciseName] = [];
            }
            groupedExercises[ex.exerciseName].push(ex);
        });

        return `
            <div class="workout-card">
                <div class="workout-card-header">
                    <div>
                        <h4>${workout.name}</h4>
                        <div class="date">${new Date(workout.date).toLocaleDateString()}</div>
                    </div>
                    <div class="workout-actions">
                        <button class="icon-btn edit-icon" onclick="editWorkout(${workout.id})" title="Edit Workout">✏️</button>
                        <button class="icon-btn delete-icon" onclick="deleteWorkout(${workout.id})" title="Delete Workout">🗑️</button>
                    </div>
                </div>
                ${workout.notes ? `<div class="workout-notes">${workout.notes}</div>` : ''}
                <div class="exercises-container">
                    ${Object.entries(groupedExercises).map(([exerciseName, sets]) => `
                        <div class="exercise-block">
                            <div class="exercise-name-header">${exerciseName}</div>
                            <div class="sets-grid">
                                ${sets.map(set => `
                                    <div class="set-card ${set.isSuperset ? 'superset-card' : ''}">
                                        <div class="set-label">Set ${set.setNumber || 1}</div>
                                        <div class="set-details">
                                            <span class="reps-badge">${set.reps} reps</span>
                                            ${set.weight > 0 ? `<span class="weight-badge">${set.weight} ${settings.weightUnit}</span>` : '<span class="bodyweight-badge">Bodyweight</span>'}
                                        </div>
                                        ${set.isSuperset ? '<div class="superset-indicator">Superset</div>' : ''}
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

function filterHistory() {
    updateHistory();
}

function deleteWorkout(id) {
    if (!confirm('Delete this workout?')) return;
    
    workouts = workouts.filter(w => w.id !== id);
    autoSave();
    updateWeekStreak();
    updateStats();
    updateHistory();
    updatePersonalRecords();
    renderCalendar();
    showToast('Workout deleted');
}

/* ========== EXERCISE LIBRARY ========== */

function updateSubcategoryOptions() {
    const category = document.getElementById('newExerciseCategory').value;
    const subcategorySelect = document.getElementById('newExerciseSubcategory');
    const structure = getCategoryStructure();
    
    const subcategories = structure[category] || ['General'];
    
    subcategorySelect.innerHTML = subcategories.map(sub => 
        `<option value="${sub}">${sub}</option>`
    ).join('');
}

function addExerciseToLibrary() {
    const name = document.getElementById('newExerciseName').value.trim();
    const category = document.getElementById('newExerciseCategory').value;
    const subcategory = document.getElementById('newExerciseSubcategory').value;

    if (!name) {
        showToast('Please enter an exercise name');
        return;
    }

    if (exercises.find(e => e.name.toLowerCase() === name.toLowerCase())) {
        showToast('Exercise already exists');
        return;
    }

    exercises.push({ name, category, subcategory, videoLink: '', disabled: false });
    autoSave();
    updateExerciseLibrary();
    
    document.getElementById('newExerciseName').value = '';
    showToast('Exercise added to library');
}

function openEditExerciseModal(exerciseName) {
    const exercise = exercises.find(e => e.name === exerciseName);
    if (!exercise) return;
    
    document.getElementById('editExerciseName').value = exercise.name;
    document.getElementById('editExerciseCategory').value = exercise.category;
    
    // Update subcategory options for edit modal
    const structure = getCategoryStructure();
    const subcategories = structure[exercise.category] || ['General'];
    const editSubcategorySelect = document.getElementById('editExerciseSubcategory');
    editSubcategorySelect.innerHTML = subcategories.map(sub => 
        `<option value="${sub}" ${sub === exercise.subcategory ? 'selected' : ''}>${sub}</option>`
    ).join('');
    
    document.getElementById('editExerciseVideoLink').value = exercise.videoLink || '';
    document.getElementById('editExerciseModal').dataset.originalName = exerciseName;
    document.getElementById('editExerciseModal').style.display = 'flex';
}

function closeEditExerciseModal() {
    document.getElementById('editExerciseModal').style.display = 'none';
}

function saveExerciseEdit() {
    const originalName = document.getElementById('editExerciseModal').dataset.originalName;
    const exercise = exercises.find(e => e.name === originalName);
    if (!exercise) return;
    
    const newName = document.getElementById('editExerciseName').value.trim();
    const newCategory = document.getElementById('editExerciseCategory').value;
    const newSubcategory = document.getElementById('editExerciseSubcategory').value;
    const newVideoLink = document.getElementById('editExerciseVideoLink').value.trim();
    
    if (!newName) {
        showToast('Please enter an exercise name');
        return;
    }
    
    // Check if new name conflicts with another exercise
    if (newName !== originalName && exercises.find(e => e.name.toLowerCase() === newName.toLowerCase())) {
        showToast('An exercise with this name already exists');
        return;
    }
    
    // Update exercise
    exercise.name = newName;
    exercise.category = newCategory;
    exercise.subcategory = newSubcategory;
    exercise.videoLink = newVideoLink;
    
    // Update any workouts that reference the old name
    if (newName !== originalName) {
        workouts.forEach(workout => {
            workout.exercises.forEach(ex => {
                if (ex.exerciseName === originalName) {
                    ex.exerciseName = newName;
                }
            });
        });
    }
    
    autoSave();
    updateExerciseLibrary();
    closeEditExerciseModal();
    showToast('Exercise updated');
}

function updateEditSubcategoryOptions() {
    const category = document.getElementById('editExerciseCategory').value;
    const subcategorySelect = document.getElementById('editExerciseSubcategory');
    const structure = getCategoryStructure();
    
    const subcategories = structure[category] || ['General'];
    
    subcategorySelect.innerHTML = subcategories.map(sub => 
        `<option value="${sub}">${sub}</option>`
    ).join('');
}

function toggleExerciseDisabled(exerciseName) {
    const exercise = exercises.find(e => e.name === exerciseName);
    if (!exercise) return;
    
    exercise.disabled = !exercise.disabled;
    autoSave();
    updateExerciseLibrary();
    showToast(exercise.disabled ? 'Exercise disabled' : 'Exercise enabled');
}

function updateExerciseLibrary() {
    const container = document.getElementById('exerciseLibraryList');
    
    // Group exercises by category and subcategory
    const grouped = {};
    
    exercises.forEach(ex => {
        if (!grouped[ex.category]) {
            grouped[ex.category] = {};
        }
        const subcat = ex.subcategory || 'General';
        if (!grouped[ex.category][subcat]) {
            grouped[ex.category][subcat] = [];
        }
        grouped[ex.category][subcat].push(ex);
    });
    
    // Sort categories
    const sortedCategories = Object.keys(grouped).sort();
    
    container.innerHTML = sortedCategories.map(category => {
        const subcategories = grouped[category];
        const sortedSubcategories = Object.keys(subcategories).sort();
        
        return `
            <div class="exercise-category">
                <h3 class="category-header">${category}</h3>
                ${sortedSubcategories.map(subcategory => {
                    const subcatExercises = subcategories[subcategory].sort((a, b) => a.name.localeCompare(b.name));
                    
                    return `
                        <div class="exercise-subcategory">
                            <h4 class="subcategory-header">${subcategory}</h4>
                            <div class="exercise-list">
                                ${subcatExercises.map(ex => `
                                    <div class="exercise-tag ${ex.disabled ? 'disabled' : ''}">
                                        <span class="exercise-name">${ex.name}</span>
                                        ${ex.videoLink ? `<a href="${ex.videoLink}" target="_blank" class="video-link" title="Watch video">🎥</a>` : ''}
                                        <button onclick="openEditExerciseModal('${ex.name.replace(/'/g, "\\'")}')"; class="edit-btn" title="Edit">✏️</button>
                                        <button onclick="toggleExerciseDisabled('${ex.name.replace(/'/g, "\\'")}')"; class="toggle-btn" title="${ex.disabled ? 'Enable' : 'Disable'}">${ex.disabled ? '👁️' : '🚫'}</button>
                                        <button onclick="deleteExercise('${ex.name.replace(/'/g, "\\'")}')"; class="delete-btn" title="Delete">×</button>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }).join('');
}

function deleteExercise(name) {
    if (!confirm(`Delete "${name}" from library?`)) return;
    
    exercises = exercises.filter(e => e.name !== name);
    autoSave();
    updateExerciseLibrary();
    showToast('Exercise deleted');
}

/* ========== STATS ========== */

function updateStats() {
    const streak = calculateWeekStreak();
    
    document.getElementById('totalWorkouts').textContent = workouts.length;
    
    // Use manual override for current streak if set
    const currentStreakDisplay = settings.manualStreakWeeks > 0 ? settings.manualStreakWeeks : streak.current;
    document.getElementById('currentStreak').textContent = `${currentStreakDisplay} weeks`;
    
    // Best streak should consider both calculated and manual
    const bestStreakDisplay = Math.max(streak.best, settings.manualStreakWeeks || 0);
    document.getElementById('bestStreak').textContent = `${bestStreakDisplay} weeks`;
    
    // This month workouts
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthWorkouts = workouts.filter(w => new Date(w.date) >= monthStart);
    document.getElementById('monthWorkouts').textContent = monthWorkouts.length;
}

function updatePersonalRecords() {
    const container = document.getElementById('personalRecords');
    
    // Calculate PRs for each exercise
    const prs = {};
    
    workouts.forEach(workout => {
        workout.exercises.forEach(ex => {
            if (ex.weight > 0) {
                if (!prs[ex.exerciseName] || ex.weight > prs[ex.exerciseName].weight) {
                    prs[ex.exerciseName] = {
                        weight: ex.weight,
                        reps: ex.reps,
                        date: workout.date
                    };
                }
            }
        });
    });

    const prList = Object.entries(prs).sort((a, b) => a[0].localeCompare(b[0]));

    if (prList.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">No personal records yet</p>';
        return;
    }

    container.innerHTML = `
        <table class="pr-table">
            <thead>
                <tr>
                    <th>Exercise</th>
                    <th>Weight</th>
                    <th>Reps</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
                ${prList.map(([name, pr]) => `
                    <tr>
                        <td><strong>${name}</strong></td>
                        <td>${pr.weight} ${settings.weightUnit}</td>
                        <td>${pr.reps}</td>
                        <td>${new Date(pr.date).toLocaleDateString()}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/* ========== MEASUREMENTS ========== */

function addMeasurement(event) {
    event.preventDefault();

    const measurement = {
        id: Date.now(),
        date: document.getElementById('measurementDate').value,
        weight: parseFloat(document.getElementById('bodyWeight').value) || null,
        bodyFat: parseFloat(document.getElementById('bodyFat').value) || null,
        chest: parseFloat(document.getElementById('chest').value) || null,
        waist: parseFloat(document.getElementById('waist').value) || null,
        hips: parseFloat(document.getElementById('hips').value) || null,
        biceps: parseFloat(document.getElementById('biceps').value) || null,
        thighs: parseFloat(document.getElementById('thighs').value) || null,
        calves: parseFloat(document.getElementById('calves').value) || null
    };

    measurements.push(measurement);
    autoSave();
    
    document.getElementById('measurementForm').reset();
    document.getElementById('measurementDate').valueAsDate = new Date();
    updateMeasurementHistory();
    
    showToast('Measurement saved');
}

function updateMeasurementHistory() {
    const container = document.getElementById('measurementHistory');
    
    const sorted = [...measurements].sort((a, b) => new Date(b.date) - new Date(a.date));

    if (sorted.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">No measurements yet</p>';
        return;
    }

    container.innerHTML = `
        <table class="pr-table">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Weight</th>
                    <th>Body Fat</th>
                    <th>Chest</th>
                    <th>Waist</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${sorted.map(m => `
                    <tr>
                        <td>${new Date(m.date).toLocaleDateString()}</td>
                        <td>${m.weight ? m.weight + ' lbs' : '-'}</td>
                        <td>${m.bodyFat ? m.bodyFat + '%' : '-'}</td>
                        <td>${m.chest ? m.chest + '"' : '-'}</td>
                        <td>${m.waist ? m.waist + '"' : '-'}</td>
                        <td><button class="secondary-btn" onclick="deleteMeasurement(${m.id})">Delete</button></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

function deleteMeasurement(id) {
    if (!confirm('Delete this measurement?')) return;
    
    measurements = measurements.filter(m => m.id !== id);
    autoSave();
    updateMeasurementHistory();
    showToast('Measurement deleted');
}

/* ========== UI FUNCTIONS ========== */

function switchTab(tabName) {
    // Remove active class from all tabs and content
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Add active class to selected tab
    event.target.classList.add('active');
    document.getElementById(`${tabName}-tab`).classList.add('active');
}

function toggleMenu() {
    const menu = document.getElementById('menu');
    const hamburger = document.getElementById('hamburger');
    const overlay = document.getElementById('menuOverlay');
    
    menu.classList.toggle('open');
    hamburger.classList.toggle('open');
    overlay.classList.toggle('open');
}

function closeMenu() {
    document.getElementById('menu').classList.remove('open');
    document.getElementById('hamburger').classList.remove('open');
    document.getElementById('menuOverlay').classList.remove('open');
}

function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function saveSettings() {
    settings.weekStartMonday = document.getElementById('weekStartMonday').checked;
    settings.autoAddExercises = document.getElementById('autoAddExercises').checked;
    settings.weightUnit = document.getElementById('weightUnit').value;
    settings.theme = document.getElementById('themeSelect').value;
    settings.manualStreakWeeks = parseInt(document.getElementById('manualStreakWeeks').value) || 0;
    
    applyTheme(settings.theme);
    autoSave();
    updateWeekStreak();
    showToast('Settings saved');
}

function applyTheme(themeName) {
    if (themeName === 'default') {
        document.documentElement.removeAttribute('data-theme');
    } else {
        document.documentElement.setAttribute('data-theme', themeName);
    }
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}