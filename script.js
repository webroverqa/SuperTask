document.addEventListener('DOMContentLoaded', function () {

    // Firebase Auth Elements and Logic
    const auth = firebase.auth();

    // Elements
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const userSection = document.getElementById('userSection');
    const loginBtn = document.getElementById('loginBtn');
    const signupBtn = document.getElementById('signupBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const userEmail = document.getElementById('userEmail');

    // Switch forms
    document.getElementById('showSignup').onclick = () => {
      loginForm.style.display = 'none';
      signupForm.style.display = 'block';
    };
    document.getElementById('showLogin').onclick = () => {
      signupForm.style.display = 'none';
      loginForm.style.display = 'block';
    };

    // Login
    loginBtn.onclick = () => {
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      auth.signInWithEmailAndPassword(email, password)
        .then(() => console.log("Logged in"))
        .catch(err => alert("Login failed: " + err.message));
    };

    // Signup
    signupBtn.onclick = () => {
      const email = document.getElementById('signupEmail').value;
      const password = document.getElementById('signupPassword').value;
      auth.createUserWithEmailAndPassword(email, password)
        .then(() => alert("Account created. You can log in now."))
        .catch(err => alert("Signup failed: " + err.message));
    };

    // Logout
    logoutBtn.onclick = () => auth.signOut();

    // Auth state change
    auth.onAuthStateChanged(user => {
      if (user) {
        loginForm.style.display = 'none';
        signupForm.style.display = 'none';
        userSection.style.display = 'block';
        userEmail.textContent = `Logged in as: ${user.email}`;
        loadTasks(); // 👈 Only load tasks if logged in
      } else {
        loginForm.style.display = 'block';
        signupForm.style.display = 'none';
        userSection.style.display = 'none';
        tasksContainer.innerHTML = ''; // Clear tasks if logged out
      }
    });

    // DOM Elements for tasks
    const addTaskBtn = document.getElementById('addTaskBtn');
    const taskModal = document.getElementById('taskModal');
    const closeBtn = document.querySelector('.close');
    const taskForm = document.getElementById('taskForm');
    const tasksContainer = document.getElementById('tasksContainer');
    const filterBtns = document.querySelectorAll('.filter-btn');

    let tasks = [];
    let currentFilter = 'all';

    init();

    function init() {
        setupEventListeners();
        loadTasks();
    }

    function setupEventListeners() {
        addTaskBtn.addEventListener('click', () => openModal());
        closeBtn.addEventListener('click', () => closeModal());
        window.addEventListener('click', (e) => {
            if (e.target === taskModal) closeModal();
        });

        taskForm.addEventListener('submit', handleFormSubmit);

        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                renderTasks();
            });
        });
    }

    async function loadTasks() {
        showLoading();
        try {
            const user = firebase.auth().currentUser;

            const snapshot = await db.collection('tasks')
                .where('sharedWith', 'array-contains', user.uid)
                .get();

            const ownTasksSnapshot = await db.collection('tasks')
                .where('uid', '==', user.uid)
                .get();

            const allDocs = [...snapshot.docs, ...ownTasksSnapshot.docs];
            const seen = new Set(); // Avoid duplicates
            tasks = [];

            allDocs.forEach(doc => {
                if (!seen.has(doc.id)) {
                    seen.add(doc.id);
                    const data = doc.data();
                    // Migrate old tasks to new structure
                    if (data.active !== undefined) {
                        data.status = data.active ? 'Pending' : 'Cancelled';
                        delete data.active;
                    }
                    if (data.time && !data.startTime) {
                        data.startTime = data.time;
                        delete data.time;
                    }
                    if (!data.days) {
                        data.days = 1;
                    }
                    tasks.push({ id: doc.id, ...data });
                }
            });

            if (tasks.length > 0) {
                // Sort tasks by start date (newest first) then by time
                tasks.sort((a, b) => {
                    const dateCompare = new Date(b.date) - new Date(a.date);
                    if (dateCompare === 0) {
                        return (b.startTime || '').localeCompare(a.startTime || '');
                    }
                    return dateCompare;
                });
            }
            renderTasks();
        } catch (error) {
            console.error("Error loading tasks:", error);
            showError("Error loading tasks.");
        }
    }

    function openModal(task = null) {
        const modalTitle = document.getElementById('modalTitle');

        if (task) {
            // Edit mode
            modalTitle.textContent = 'Edit Task';
            document.getElementById('taskId').value = task.id;
            document.getElementById('taskTitle').value = task.title;
            document.getElementById('taskDays').value = task.days || 1;
            document.getElementById('taskDate').value = task.date;
            document.getElementById('taskEndDate').value = task.endDate || '';
            document.getElementById('taskStartTime').value = task.startTime || '';
            document.getElementById('taskEndTime').value = task.endTime || '';
            document.getElementById('taskLocation').value = task.location || '';
            document.getElementById('taskStaff').value = task.staff || 1;
            document.getElementById('taskDescription').value = task.description || '';
            document.getElementById('taskStatus').value = task.status || 'Pending';
        } else {
            // Add mode
            modalTitle.textContent = 'Add New Task';
            taskForm.reset();
            document.getElementById('taskId').value = '';
            // Set default date to today
            const today = new Date();
            document.getElementById('taskDate').value = today.toISOString().split('T')[0];
            document.getElementById('taskDays').value = 1;
            document.getElementById('taskStatus').value = 'Pending';
        }

        taskModal.style.display = 'block';
    }

    function closeModal() {
        taskModal.style.display = 'none';
    }

    async function handleFormSubmit(e) {
        e.preventDefault();


        const taskId = document.getElementById('taskId').value;
        const days = parseInt(document.getElementById('taskDays').value) || 1;
        const startDate = document.getElementById('taskDate').value;

        // Calculate end date if not provided
        let endDate = document.getElementById('taskEndDate').value;
        if (!endDate && days > 1) {
            const end = new Date(startDate);
            end.setDate(end.getDate() + days - 1);
            endDate = end.toISOString().split('T')[0];
        }

        const user = firebase.auth().currentUser;

        const taskData = {
            uid: user.uid, // Task creator
            sharedWith: [], // Initially empty
            title: document.getElementById('taskTitle').value.trim(),
            days: days,
            date: startDate,
            endDate: endDate || '',
            startTime: document.getElementById('taskStartTime').value,
            endTime: document.getElementById('taskEndTime').value || '',
            location: document.getElementById('taskLocation').value.trim(),
            staff: parseInt(document.getElementById('taskStaff').value) || 1,
            description: document.getElementById('taskDescription').value.trim(),
            status: document.getElementById('taskStatus').value,
            createdAt: new Date().toISOString()
        };

        if (!taskData.title) {
            alert("Title is required!");
            return;
        }

        try {
            if (taskId) {
                await db.collection('tasks').doc(taskId).set(taskData);
            } else {
                await db.collection('tasks').add(taskData);
            }
            closeModal();
            loadTasks();
        } catch (error) {
            console.error("Error saving task:", error);
            showError("Error saving task.");
        }
    }

    async function deleteTask(taskId) {
        if (confirm("Delete this task?")) {
            try {
                await db.collection('tasks').doc(taskId).delete();
                loadTasks();
            } catch (error) {
                console.error("Error deleting task:", error);
                showError("Error deleting task.");
            }
        }
    }

    function renderTasks() {
        tasksContainer.innerHTML = '';

        if (tasks.length === 0) {
            showEmptyState();
            return;
        }

        // Filter tasks based on current filter
        let filteredTasks = [...tasks];

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (currentFilter === 'today') {
            filteredTasks = tasks.filter(task => {
                const taskDate = new Date(task.date);
                taskDate.setHours(0, 0, 0, 0);
                return taskDate.getTime() === today.getTime();
            });
        } else if (currentFilter === 'tomorrow') {
            filteredTasks = tasks.filter(task => {
                const taskDate = new Date(task.date);
                taskDate.setHours(0, 0, 0, 0);
                return taskDate.getTime() === tomorrow.getTime();
            });
        } else if (currentFilter === 'upcoming') {
            filteredTasks = tasks.filter(task => {
                const taskDate = new Date(task.date);
                taskDate.setHours(0, 0, 0, 0);
                return taskDate > tomorrow;
            });
        } else if (currentFilter === 'past') {
            filteredTasks = tasks.filter(task => {
                const taskDate = new Date(task.date);
                taskDate.setHours(0, 0, 0, 0);
                return taskDate < today && taskDate.getTime() !== yesterday.getTime();
            });
        }

        // Group tasks by date category
        const taskGroups = {
            yesterday: [],
            today: [],
            tomorrow: [],
            upcoming: [],
            past: []
        };

        filteredTasks.forEach(task => {
            const taskDate = new Date(task.date);
            taskDate.setHours(0, 0, 0, 0);

            if (taskDate.getTime() === yesterday.getTime()) {
                taskGroups.yesterday.push(task);
            } else if (taskDate.getTime() === today.getTime()) {
                taskGroups.today.push(task);
            } else if (taskDate.getTime() === tomorrow.getTime()) {
                taskGroups.tomorrow.push(task);
            } else if (taskDate > tomorrow) {
                taskGroups.upcoming.push(task);
            } else {
                taskGroups.past.push(task);
            }
        });

        // Sort tasks within each group by time (if available)
        Object.keys(taskGroups).forEach(group => {
            taskGroups[group].sort((a, b) => {
                if (a.date === b.date) {
                    return (a.startTime || '').localeCompare(b.startTime || '');
                }
                return new Date(a.date) - new Date(b.date);
            });
        });

        // Render tasks by group
        const groupTitles = {
            today: 'Today',
            tomorrow: 'Tomorrow',
            yesterday: 'Yesterday',
            upcoming: 'Upcoming',
            past: 'Past'
        };

        const groupOrder = ['today', 'tomorrow', 'yesterday', 'upcoming', 'past'];
        let hasTasksToShow = false;

        groupOrder.forEach(group => {
            if (taskGroups[group].length > 0) {
                hasTasksToShow = true;
                const sectionHeader = document.createElement('div');
                sectionHeader.className = 'section-header';
                sectionHeader.textContent = groupTitles[group];
                tasksContainer.appendChild(sectionHeader);

                taskGroups[group].forEach(task => {
                    tasksContainer.appendChild(createTaskElement(task));
                });
            }
        });

        if (!hasTasksToShow) {
            showEmptyState("No tasks match the current filter");
        }
    }

    function createTaskElement(task) {
        const taskDate = new Date(task.date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        taskDate.setHours(0, 0, 0, 0);

        let timeBadgeClass = '';
        let timeBadgeText = '';

        if (taskDate.getTime() === today.getTime()) {
            timeBadgeClass = 'today';
            timeBadgeText = 'Today';
        } else if (taskDate.getTime() === tomorrow.getTime()) {
            timeBadgeClass = 'tomorrow';
            timeBadgeText = 'Tomorrow';
        } else if (taskDate.getTime() === yesterday.getTime()) {
            timeBadgeClass = 'yesterday';
            timeBadgeText = 'Yesterday';
        } else if (taskDate > tomorrow) {
            timeBadgeClass = 'upcoming';
            timeBadgeText = 'Upcoming';
        } else {
            timeBadgeClass = 'past';
            timeBadgeText = 'Past';
        }

        // Format date range
        let dateDisplay = formatDate(task.date);
        if (task.endDate) {
            dateDisplay += ` - ${formatDate(task.endDate)}`;
        }

        // Format time range
        let timeDisplay = '';
        if (task.startTime) {
            timeDisplay = formatTime(task.startTime);
            if (task.endTime) {
                timeDisplay += ` - ${formatTime(task.endTime)}`;
            } else {
                timeDisplay += ' (onwards)';
            }
        }

        const taskElement = document.createElement('div');
        taskElement.className = `task-card status-${task.status.toLowerCase()}`;
        taskElement.innerHTML = `
            <div class="task-header">
                <div>
                    <div class="task-title">${task.title}</div>
                    <div class="task-date">
                        <i class="fas fa-calendar-alt"></i>
                        ${dateDisplay}
                        ${timeDisplay ? `<i class="fas fa-clock" style="margin-left: 10px;"></i> ${timeDisplay}` : ''}
                        <span class="time-badge ${timeBadgeClass}">${timeBadgeText}</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="action-btn edit-btn" data-id="${task.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn delete-btn" data-id="${task.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="task-details">
                ${task.location ? `
                <div class="detail-row">
                    <div class="detail-label">Location:</div>
                    <div class="detail-value">${task.location}</div>
                </div>` : ''}
                ${task.staff ? `
                <div class="detail-row">
                    <div class="detail-label">Staff Required:</div>
                    <div class="detail-value">${task.staff}</div>
                </div>` : ''}
                ${task.description ? `
                <div class="detail-row">
                    <div class="detail-label">Description:</div>
                    <div class="detail-value">${task.description}</div>
                </div>` : ''}
                <div class="detail-row">
                    <div class="detail-label">Duration:</div>
                    <div class="detail-value">${task.days} day${task.days > 1 ? 's' : ''}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Status:</div>
                    <div class="detail-value">${task.status}</div>
                </div>
                <div class="detail-row">
                    <div class="detail-label">Created:</div>
                    <div class="detail-value">${formatDateTime(task.createdAt)}</div>
                </div>
            </div>
        `;

        // Add click event to header to toggle details
        const header = taskElement.querySelector('.task-header');
        const details = taskElement.querySelector('.task-details');

        header.addEventListener('click', () => {
            details.classList.toggle('expanded');
        });

        // Add edit and delete events
        taskElement.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const taskToEdit = tasks.find(t => t.id === e.currentTarget.dataset.id);
            openModal(taskToEdit);
        });

        taskElement.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTask(e.currentTarget.dataset.id);
        });

        return taskElement;
    }

    function formatDate(dateString) {
        const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString).toLocaleDateString(undefined, options);
    }

    function formatTime(timeString) {
        if (!timeString) return '';
        const [hours, minutes] = timeString.split(':');
        const hour = parseInt(hours);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        return `${hour12}:${minutes} ${ampm}`;
    }

    function formatDateTime(dateTimeString) {
        const date = new Date(dateTimeString);
        return `${formatDate(dateTimeString)} at ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
    }

    function showLoading() {
        tasksContainer.innerHTML = '<div style="text-align: center; padding: 20px;">Loading tasks...</div>';
    }

    function showError(message) {
        tasksContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-triangle"></i>
                <p>${message}</p>
            </div>
        `;
    }

    function showEmptyState(message = "No tasks found. Add your first task!") {
        tasksContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-tasks"></i>
                <p>${message}</p>
            </div>
        `;
    }
});