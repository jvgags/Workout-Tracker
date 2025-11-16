/* ========== WORKOUT TRACKER APP.JS ========== */

// Global Variables
let workouts = [];
let exercises = [];
let measurements = [];
let settings = {
    weekStartMonday: false,
    autoAddExercises: true,
    weightUnit: 'lbs'
};

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

    // Add first exercise row
    addExerciseRow();

    // Update UI
    updateWeekStreak();
    updateStats();
    updateHistory();
    updateExerciseLibrary();
    updateMeasurementHistory();
    updatePersonalRecords();

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
        settings,
        ui: {
            darkMode: document.body.classList.contains('dark')
        }
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

    // Restore UI
    if (savedData?.ui?.darkMode) {
        document.body.classList.add('dark');
    }

    // Apply settings
    document.getElementById('weekStartMonday').checked = settings.weekStartMonday;
    document.getElementById('autoAddExercises').checked = settings.autoAddExercises;
    document.getElementById('weightUnit').value = settings.weightUnit;
}

function getDefaultExercises() {
    return [
        { name: 'Bench Press', category: 'Chest' },
        { name: 'Squat', category: 'Legs' },
        { name: 'Deadlift', category: 'Back' },
        { name: 'Overhead Press', category: 'Shoulders' },
        { name: 'Barbell Row', category: 'Back' },
        { name: 'Pull-ups', category: 'Back' },
        { name: 'Bicep Curls', category: 'Arms' },
        { name: 'Tricep Dips', category: 'Arms' },
        { name: 'Leg Press', category: 'Legs' },
        { name: 'Running', category: 'Cardio' }
    ];
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
    document.getElementById('weekStreak').textContent = streak.current;
}

/* ========== WORKOUT LOGGING ========== */

function addExerciseRow() {
    const container = document.getElementById('exercisesList');
    const row = document.createElement('div');
    row.className = 'exercise-row';
    
    row.innerHTML = `
        <select class="exercise-select" required>
            <option value="">Select Exercise</option>
            ${exercises.sort((a, b) => a.name.localeCompare(b.name)).map(ex => 
                `<option value="${ex.name}">${ex.name}</option>`
            ).join('')}
        </select>
        <input type="number" class="sets-input" placeholder="Sets" min="1" required>
        <input type="number" class="reps-input" placeholder="Reps" min="1" required>
        <input type="number" class="weight-input" placeholder="Weight (${settings.weightUnit})" step="0.5" min="0">
        <button type="button" class="remove-btn" onclick="removeExerciseRow(this)">×</button>
    `;
    
    container.appendChild(row);
}

function removeExerciseRow(btn) {
    const container = document.getElementById('exercisesList');
    if (container.children.length > 1) {
        btn.parentElement.remove();
    } else {
        showToast('At least one exercise is required');
    }
}

function addWorkout(event) {
    event.preventDefault();

    const date = document.getElementById('workoutDate').value;
    const name = document.getElementById('workoutName').value.trim();
    const notes = document.getElementById('workoutNotes').value.trim();

    const exerciseRows = document.querySelectorAll('.exercise-row');
    const exerciseList = [];

    exerciseRows.forEach(row => {
        const exerciseName = row.querySelector('.exercise-select').value;
        const sets = parseInt(row.querySelector('.sets-input').value);
        const reps = parseInt(row.querySelector('.reps-input').value);
        const weight = parseFloat(row.querySelector('.weight-input').value) || 0;

        if (exerciseName && sets && reps) {
            exerciseList.push({ exerciseName, sets, reps, weight });

            // Auto-add to library if enabled
            if (settings.autoAddExercises) {
                if (!exercises.find(e => e.name === exerciseName)) {
                    exercises.push({ name: exerciseName, category: 'Other' });
                }
            }
        }
    });

    if (exerciseList.length === 0) {
        showToast('Please add at least one exercise');
        return;
    }

    const workout = {
        id: Date.now(),
        date,
        name,
        notes,
        exercises: exerciseList
    };

    workouts.push(workout);
    autoSave();
    
    clearWorkoutForm();
    updateWeekStreak();
    updateStats();
    updateHistory();
    updatePersonalRecords();
    
    showToast('Workout logged successfully! 💪');
}

function clearWorkoutForm() {
    document.getElementById('workoutForm').reset();
    document.getElementById('workoutDate').valueAsDate = new Date();
    document.getElementById('exercisesList').innerHTML = '';
    addExerciseRow();
}

/* ========== HISTORY ========== */

function updateHistory() {
    const container = document.getElementById('historyList');
    const filterValue = document.getElementById('historyFilter')?.value || 'all';
    const searchTerm = document.getElementById('historySearch')?.value.toLowerCase() || '';

    let filtered = [...workouts];

    // Apply time filter
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
        container.innerHTML = '<p style="text-align:center; color:#999; padding:40px;">No workouts found</p>';
        return;
    }

    container.innerHTML = filtered.map(workout => `
        <div class="workout-card">
            <h4>${workout.name}</h4>
            <div class="date">${new Date(workout.date).toLocaleDateString()}</div>
            ${workout.notes ? `<p style="color:#666; margin-bottom:10px;">${workout.notes}</p>` : ''}
            ${workout.exercises.map(ex => `
                <div class="exercise-item">
                    <strong>${ex.exerciseName}</strong>: ${ex.sets} sets × ${ex.reps} reps${ex.weight > 0 ? ` @ ${ex.weight} ${settings.weightUnit}` : ''}
                </div>
            `).join('')}
            <button class="secondary-btn" style="margin-top:10px;" onclick="deleteWorkout(${workout.id})">Delete</button>
        </div>
    `).join('');
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
    showToast('Workout deleted');
}

/* ========== EXERCISE LIBRARY ========== */

function addExerciseToLibrary() {
    const name = document.getElementById('newExerciseName').value.trim();
    const category = document.getElementById('newExerciseCategory').value;

    if (!name) {
        showToast('Please enter an exercise name');
        return;
    }

    if (exercises.find(e => e.name.toLowerCase() === name.toLowerCase())) {
        showToast('Exercise already exists');
        return;
    }

    exercises.push({ name, category });
    autoSave();
    updateExerciseLibrary();
    
    document.getElementById('newExerciseName').value = '';
    showToast('Exercise added to library');
}

function updateExerciseLibrary() {
    const container = document.getElementById('exerciseLibraryList');
    
    const categories = [...new Set(exercises.map(e => e.category))].sort();
    
    container.innerHTML = categories.map(category => {
        const categoryExercises = exercises.filter(e => e.category === category).sort((a, b) => a.name.localeCompare(b.name));
        
        return `
            <div class="exercise-category">
                <h4>${category}</h4>
                <div class="exercise-list">
                    ${categoryExercises.map(ex => `
                        <div class="exercise-tag">
                            ${ex.name}
                            <button onclick="deleteExercise('${ex.name}')">×</button>
                        </div>
                    `).join('')}
                </div>
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
    document.getElementById('currentStreak').textContent = `${streak.current} weeks`;
    document.getElementById('bestStreak').textContent = `${streak.best} weeks`;
    
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

function toggleDarkMode() {
    document.body.classList.toggle('dark');
    autoSave();
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
    
    autoSave();
    updateWeekStreak();
    showToast('Settings saved');
}

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}