const DB_NAME = 'DoItToday';
const STORE_NAME = 'tasks';

let db = null;
let currentMode = 'planning';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);

        request.onerror = () => reject(request.error);

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = event => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                const store = database.createObjectStore(STORE_NAME, {
                    keyPath: 'id',
                    autoIncrement: true
                });

                store.createIndex('column', 'column', { unique: false });
                store.createIndex('order', 'order', { unique: false });
                store.createIndex('lastEdited', 'lastEdited', { unique: false });
            }
        };
    });
}

function dbGetAllTasks() {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readonly')
            .objectStore(STORE_NAME)
            .getAll();

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbAddTask(task) {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .add(task);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbUpdateTask(task) {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .put(task);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbDeleteTask(id) {
    return new Promise((resolve, reject) => {
        const request = db
            .transaction(STORE_NAME, 'readwrite')
            .objectStore(STORE_NAME)
            .delete(id);

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function addNewTask(column) {
    const inputId = column === 'today' ? 'newTodayInput' : 'newTomorrowInput';
    const input = document.getElementById(inputId);
    const title = input.value.trim();

    if (!title) return;

    try {
        const tasks = await dbGetAllTasks();
        const columnTasks = tasks.filter(task => task.column === column);
        const maxOrder = columnTasks.reduce(
            (max, task) => Math.max(max, task.order || 0),
            0
        );

        await dbAddTask({
            title,
            column,
            completed: false,
            order: maxOrder + 1,
            lastEdited: Date.now()
        });

        input.value = '';
        await loadAndRenderTasks();
    } catch (error) {
        console.error('Failed to add task:', error);
    }
}

async function toggleComplete(id) {
    try {
        const tasks = await dbGetAllTasks();
        const task = tasks.find(item => item.id === id);

        if (!task) return;

        task.completed = !task.completed;
        await dbUpdateTask(task);
        await loadAndRenderTasks();
    } catch (error) {
        console.error('Failed to toggle complete:', error);
    }
}

async function moveTask(id) {
    try {
        const tasks = await dbGetAllTasks();
        const task = tasks.find(item => item.id === id);

        if (!task) return;

        const targetColumn = task.column === 'today' ? 'tomorrow' : 'today';
        const targetTasks = tasks.filter(item => item.column === targetColumn);
        const maxOrder = targetTasks.reduce(
            (max, item) => Math.max(max, item.order || 0),
            0
        );

        task.column = targetColumn;
        task.order = maxOrder + 1;
        task.lastEdited = Date.now();

        await dbUpdateTask(task);
        await loadAndRenderTasks();
    } catch (error) {
        console.error('Failed to move task:', error);
    }
}

async function setTaskTop(id) {
    try {
        const tasks = await dbGetAllTasks();
        const todayTasks = tasks
            .filter(task => task.column === 'today')
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const target = todayTasks.find(task => task.id === id);
        if (!target) return;

        const reorderedTasks = [
            target,
            ...todayTasks.filter(task => task.id !== id)
        ];

        for (const [index, task] of reorderedTasks.entries()) {
            task.order = index + 1;
            await dbUpdateTask(task);
        }

        await loadAndRenderTasks();
    } catch (error) {
        console.error('Failed to move task to top:', error);
    }
}

async function deleteCompletedTasks() {
    try {
        const tasks = await dbGetAllTasks();
        const completedTasks = tasks.filter(task => task.completed);

        if (completedTasks.length === 0) return;

        const confirmed = confirm(
            `Delete completed tasks: ${completedTasks.length}?`
        );

        if (!confirmed) return;

        for (const task of completedTasks) {
            await dbDeleteTask(task.id);
        }

        await loadAndRenderTasks();
    } catch (error) {
        console.error('Failed to delete task:', error);
    }
}

async function saveTaskTitle(id, input) {
    const newTitle = input.value.trim();

    if (!newTitle) {
        await loadAndRenderTasks();
        return;
    }

    try {
        const tasks = await dbGetAllTasks();
        const task = tasks.find(item => item.id === id);

        if (task && task.title !== newTitle) {
            task.title = newTitle;
            task.lastEdited = Date.now();
            await dbUpdateTask(task);
        }

        await loadAndRenderTasks();
    } catch (error) {
        console.error('Failed to change task:', error);
    }
}

function formatDate(timestamp) {
    if (!timestamp) return '';

    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');

    return `${day}.${month} ${hours}:${minutes}`;
}

function makeButton(label, title, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon-btn';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
}

function renderColumn(column, tasks) {
    const list = document.getElementById(`${column}TaskList`);
    const count = document.getElementById(`${column}Count`);

    count.textContent = `(${tasks.length})`;
    list.replaceChildren();

    if (tasks.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No tasks';
        list.appendChild(empty);
        return;
    }

    for (const task of tasks) {
        const card = document.createElement('div');
        card.className = 'task-card';

        const main = document.createElement('div');
        main.className = 'task-main';

        const title = document.createElement('div');
        title.className = task.completed
            ? 'task-title completed'
            : 'task-title';
        title.textContent = task.title;
        title.addEventListener('click', () => toggleComplete(task.id));

        const actions = document.createElement('div');
        actions.className = 'task-actions';

        if (column === 'today') {
            actions.appendChild(
                makeButton('🔝', 'Place first', () => setTaskTop(task.id))
            );
        }

        if (!task.completed) {
            actions.appendChild(
                makeButton('🖊️', 'Edit', () => {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'inline-edit-input';
                    input.value = task.title;

                    title.replaceChildren(input);
                    input.focus();
                    input.setSelectionRange(input.value.length, input.value.length);

                    input.addEventListener('keydown', event => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            input.blur();
                        } else if (event.key === 'Escape') {
                            event.preventDefault();
                            loadAndRenderTasks();
                        }
                    });

                    input.addEventListener('blur', () => {
                        saveTaskTitle(task.id, input);
                    }, { once: true });
                })
            );
        }

        if (currentMode === 'planning') {
            const movingToToday = column === 'tomorrow';

            actions.appendChild(
                makeButton(
                    movingToToday ? '⬅️' : '➡️',
                    movingToToday ? 'Move to today' : 'Move to tomorrow',
                    () => moveTask(task.id)
                )
            );
        }

        main.append(title, actions);
        card.appendChild(main);

        if (currentMode === 'planning') {
            const meta = document.createElement('div');
            meta.className = 'task-meta';

            const date = document.createElement('span');
            date.textContent = formatDate(task.lastEdited);

            meta.appendChild(date);
            card.appendChild(meta);
        }

        list.appendChild(card);
    }
}

async function loadAndRenderTasks() {
    try {
        const tasks = await dbGetAllTasks();

        const todayTasks = tasks
            .filter(task => task.column === 'today')
            .sort((a, b) => (a.order || 0) - (b.order || 0));

        const tomorrowTasks = tasks
            .filter(task => task.column === 'tomorrow')
            .sort((a, b) => (b.lastEdited || 0) - (a.lastEdited || 0));

        renderColumn('today', todayTasks);

        if (currentMode === 'planning') {
            renderColumn('tomorrow', tomorrowTasks);
        }
    } catch (error) {
        console.error('Failed to load tasks:', error);
    }
}

function switchMode(mode) {
    currentMode = mode;

    const board = document.getElementById('boardLayout');
    const todaySection = document.getElementById('todayColumnSection');
    const tomorrowSection = document.getElementById('tomorrowColumnSection');
    const planningButton = document.getElementById('btnPlanning');
    const focusButton = document.getElementById('btnFocus');

    const focusMode = mode === 'focus';

    board.classList.toggle('focus-mode', focusMode);
    todaySection.style.display = 'flex';
    tomorrowSection.style.display = focusMode ? 'none' : 'flex';
    planningButton.classList.toggle('active', !focusMode);
    focusButton.classList.toggle('active', focusMode);

    loadAndRenderTasks();
}

document.getElementById('btnPlanning')
    .addEventListener('click', () => switchMode('planning'));

document.getElementById('btnFocus')
    .addEventListener('click', () => switchMode('focus'));

document.getElementById('btnClean')
    .addEventListener('click', deleteCompletedTasks);

document.getElementById('addTodayButton')
    .addEventListener('click', () => addNewTask('today'));

document.getElementById('addTomorrowButton')
    .addEventListener('click', () => addNewTask('tomorrow'));

document.getElementById('newTodayInput')
    .addEventListener('keydown', event => {
        if (event.key === 'Enter') addNewTask('today');
    });

document.getElementById('newTomorrowInput')
    .addEventListener('keydown', event => {
        if (event.key === 'Enter') addNewTask('tomorrow');
    });

try {
    await initDB();
    await loadAndRenderTasks();
} catch (error) {
    console.error('Failed to run app:', error);
}

