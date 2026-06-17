document.addEventListener('DOMContentLoaded', () => {
    // Icons
    lucide.createIcons();

    // App State
    const state = {
        savedTrips: [],
        activeTrip: null,
        activeTab: 'itinerary',
        currentView: 'landing',
        mapInstance: null,
        chartInstance: null,
        timelineChartInstance: null,
        editingExpenseId: null
    };

    // DOM Elements
    const views = {
        landing: document.getElementById('view-landing'),
        wizard: document.getElementById('view-wizard'),
        loading: document.getElementById('view-loading'),
        dashboard: document.getElementById('view-dashboard')
    };

    const tabs = {
        itinerary: document.getElementById('tab-itinerary'),
        budget: document.getElementById('tab-budget'),
        map: document.getElementById('tab-map'),
        weather: document.getElementById('tab-weather'),
        chat: document.getElementById('tab-chat')
    };

    const savedTripsList = document.getElementById('saved-trips-list');
    const wizardForm = document.getElementById('wizard-form');
    const expenseForm = document.getElementById('expense-form');
    const chatForm = document.getElementById('chat-form');
    const themeToggleBtn = document.getElementById('theme-toggle');

    // Global App Object
    window.app = {
        switchView(viewName) {
            console.log("Switching view to:", viewName);
            Object.keys(views).forEach(key => {
                if (views[key]) {
                    if (key === viewName) {
                        views[key].classList.remove('hidden');
                    } else {
                        views[key].classList.add('hidden');
                    }
                }
            });
            state.currentView = viewName;
            
            // Re-layout Leaflet map if switching to dashboard
            if (viewName === 'dashboard' && state.mapInstance) {
                setTimeout(() => {
                    state.mapInstance.invalidateSize();
                }, 200);
            }
        },

        switchTab(tabName) {
            console.log("Switching tab to:", tabName);
            Object.keys(tabs).forEach(key => {
                if (tabs[key]) {
                    if (key === tabName) {
                        tabs[key].classList.remove('hidden');
                    } else {
                        tabs[key].classList.add('hidden');
                    }
                }
            });
            
            // Update Tab button active styles
            const tabButtons = document.querySelectorAll('.tab-btn');
            tabButtons.forEach(btn => {
                const text = btn.innerText.toLowerCase();
                const icon = btn.querySelector('i');
                if (text.includes(tabName)) {
                    btn.classList.add('border-brand-500', 'active');
                    btn.classList.remove('border-transparent');
                } else {
                    btn.classList.remove('border-brand-500', 'active');
                    btn.classList.add('border-transparent');
                }
            });

            state.activeTab = tabName;

            // Initialize/invalidate map size on tab switch
            if (tabName === 'map') {
                setTimeout(() => {
                    if (!state.mapInstance) {
                        this.initMap();
                    } else {
                        state.mapInstance.invalidateSize();
                    }
                }, 100);
            }
        },

        async loadSavedTrips() {
            try {
                const response = await fetch('/api/trips');
                if (response.ok) {
                    state.savedTrips = await response.json();
                    this.renderSavedTripsList();
                }
            } catch (err) {
                console.error("Failed to load saved trips:", err);
            }
        },

        renderSavedTripsList() {
            savedTripsList.innerHTML = '';
            if (state.savedTrips.length === 0) {
                savedTripsList.innerHTML = `
                    <div class="text-slate-500 text-center py-8 text-sm">
                        No trips planned yet.
                    </div>
                `;
                return;
            }

            state.savedTrips.forEach(trip => {
                const card = document.createElement('div');
                card.className = `trip-card cursor-pointer transition-all select-none ${state.activeTrip && state.activeTrip.id === trip.id ? 'active' : ''}`;
                card.onclick = () => this.selectTrip(trip.id);
                
                card.innerHTML = `
                    <div class="flex items-center justify-between gap-2">
                        <span class="font-semibold text-[var(--text-header)] text-sm truncate">${trip.destination}</span>
                        <span class="text-[10px] uppercase font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-2 py-0.5 rounded-full">${trip.style}</span>
                    </div>
                    <div class="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2">
                        <span>${trip.days} Days</span>
                        <span>₹${trip.budget.toLocaleString()}</span>
                    </div>
                `;
                savedTripsList.appendChild(card);
            });
        },

        async selectTrip(tripId) {
            console.log("Selecting trip:", tripId);
            try {
                const response = await fetch(`/api/trips/${tripId}`);
                if (!response.ok) throw new Error("Failed to fetch trip details");
                
                state.activeTrip = await response.json();
                
                // Render sidebar highlighted
                this.renderSavedTripsList();
                
                // Populate summary banner
                document.getElementById('active-destination').innerText = `${state.activeTrip.destination} Trip`;
                document.getElementById('active-style').innerText = state.activeTrip.style;
                document.getElementById('active-route').innerText = `${state.activeTrip.origin} to ${state.activeTrip.destination}`;
                document.getElementById('active-dates').innerText = `${state.activeTrip.start_date} to ${state.activeTrip.end_date}`;
                document.getElementById('active-travelers').innerText = `${state.activeTrip.travelers} Traveler(s)`;
                
                // Render contents
                this.renderItinerary();
                this.renderBudget();
                this.renderWeather();
                this.loadChatHistory();

                // Recreate map if switching
                if (state.mapInstance) {
                    state.mapInstance.remove();
                    state.mapInstance = null;
                }

                // Switch to active tab or default to itinerary
                this.switchTab('itinerary');
                this.switchView('dashboard');
                
            } catch (err) {
                alert("Error loading trip details: " + err.message);
            }
        },

        renderItinerary() {
            document.getElementById('selected-hotel-md-content').innerHTML = marked.parse(state.activeTrip.selected_hotel || "");
            document.getElementById('attractions-md-content').innerHTML = marked.parse(state.activeTrip.attractions || "");

            const itineraryContainer = document.getElementById('itinerary-md-content');
            const itineraryRaw = state.activeTrip.itinerary || "";

            // Helper to save itinerary back to server database
            const saveItinerary = async (newMarkdown) => {
                try {
                    const response = await fetch(`/api/trips/${state.activeTrip.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ itinerary: newMarkdown })
                    });
                    if (response.ok) {
                        state.activeTrip.itinerary = newMarkdown;
                        this.renderItinerary(); // Re-render timeline immediately
                    } else {
                        console.error("Failed to save itinerary updates to server");
                    }
                } catch (err) {
                    console.error("Error patching itinerary:", err);
                }
            };

            // Parse itinerary markdown into days & items
            const days = [];
            let currentDay = null;
            const lines = itineraryRaw.split('\n');

            lines.forEach(line => {
                const trimmed = line.trim();
                if (!trimmed) return;

                if (trimmed.startsWith('#') && trimmed.toLowerCase().includes('day')) {
                    const dayTitle = trimmed.replace(/^#+\s*/, '');
                    currentDay = { title: dayTitle, items: [] };
                    days.push(currentDay);
                } else if (trimmed.startsWith('-') || trimmed.startsWith('*')) {
                    if (currentDay) {
                        const itemText = trimmed.replace(/^[-*]\s*/, '');
                        currentDay.items.push(itemText);
                    }
                } else {
                    if (currentDay && currentDay.items.length === 0) {
                        currentDay.items.push(trimmed);
                    }
                }
            });

            if (days.length === 0) {
                itineraryContainer.innerHTML = marked.parse(itineraryRaw || "No itinerary details available.");
                return;
            }

            // Render custom vertical timeline
            itineraryContainer.innerHTML = ''; // Clear

            days.forEach((day, dayIdx) => {
                const daySection = document.createElement('div');
                daySection.className = 'mb-10 last:mb-2';
                
                let itemsHTML = '';
                day.items.forEach((item, itemIdx) => {
                    const inlineHTML = marked.parseInline(item);
                    
                    // Escape single and double quotes for onclick parameters
                    const escapedItem = item.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                                       itemsHTML += `
                        <div class="relative pl-6 group">
                            <!-- Dot -->
                            <div class="absolute -left-[5px] top-2 w-2.5 h-2.5 rounded-full bg-indigo-500 border border-[var(--glass-bg)] shadow"></div>
                            
                            <!-- Card -->
                            <div class="glass-panel p-3.5 rounded-xl hover:border-brand-500/30 transition-all duration-300 flex items-start justify-between gap-4">
                                <div class="text-sm text-[var(--text-color)] leading-relaxed font-medium">
                                    ${inlineHTML}
                                </div>
                                <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                    <button onclick="app.showEditTimelineItem(${dayIdx}, ${itemIdx}, '${escapedItem}')" class="p-1 text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300">
                                        <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                                    </button>
                                    <button onclick="app.deleteTimelineItem(${dayIdx}, ${itemIdx})" class="p-1 text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300">
                                        <i data-lucide="trash" class="w-3.5 h-3.5"></i>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;
                });
  
                daySection.innerHTML = `
                    <div class="flex items-center justify-between mb-4">
                        <h4 class="font-extrabold text-lg text-[var(--text-header)] flex items-center gap-2">
                            <i data-lucide="calendar" class="text-brand-500 w-5 h-5"></i>
                            ${day.title}
                        </h4>
                        <button onclick="app.showAddTimelineItem(${dayIdx})" class="text-brand-500 hover:text-brand-600 dark:text-brand-400 dark:hover:text-brand-300 text-xs font-bold flex items-center gap-1">
                            <i data-lucide="plus-circle" class="w-4 h-4"></i> Add Activity
                        </button>
                    </div>
                    
                    <!-- Vertical Timeline Line wrapper -->
                    <div class="border-l-2 border-[var(--glass-border)] ml-2.5 space-y-4">
                        ${itemsHTML}
                    </div>
                `;
                
                itineraryContainer.appendChild(daySection);
            });

            lucide.createIcons();

            // Bind helpers to state for trigger actions
            state.itineraryDays = days;
            state.saveItineraryFunc = saveItinerary;
        },

        renderWeather() {
            document.getElementById('weather-location-val').innerText = `${state.activeTrip.destination}`;
            
            const packingContainer = document.getElementById('packing-md-content');
            const packingListRaw = state.activeTrip.packing_list || "";
            packingContainer.innerHTML = marked.parse(packingListRaw || "Checklist not available.");

            // Helper to save packing list back to server database
            const savePackingList = async (newMarkdown) => {
                try {
                    const response = await fetch(`/api/trips/${state.activeTrip.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ packing_list: newMarkdown })
                    });
                    if (response.ok) {
                        state.activeTrip.packing_list = newMarkdown;
                        this.renderWeather(); // Re-render immediately
                    } else {
                        console.error("Failed to save packing list updates to server");
                    }
                } catch (err) {
                    console.error("Error patching packing list:", err);
                }
            };

            // 1. Process all task list items (Checkboxes and Delete buttons)
            packingContainer.querySelectorAll('li').forEach(li => {
                let html = li.innerHTML.trim();
                let isTask = false;
                let isChecked = false;
                let cleanHTML = html;

                if (html.startsWith('[ ]') || html.startsWith('[x]')) {
                    isTask = true;
                    isChecked = html.startsWith('[x]');
                    cleanHTML = html.substring(3).trim();
                } else if (li.querySelector('input[type="checkbox"]')) {
                    isTask = true;
                    const cb = li.querySelector('input[type="checkbox"]');
                    isChecked = cb.checked;
                    cb.remove();
                    cleanHTML = li.innerHTML.trim();
                }

                if (isTask) {
                    li.className = 'task-list-item flex items-center justify-between group py-1.5 border-b border-[var(--glass-border)] last:border-0';
                    
                    const tempDiv = document.createElement('div');
                    tempDiv.innerHTML = cleanHTML;
                    const itemText = tempDiv.textContent.trim();

                    li.innerHTML = `
                        <label class="flex items-center gap-2 cursor-pointer select-none">
                            <input type="checkbox" class="task-checkbox" ${isChecked ? 'checked' : ''}>
                            <span class="text-sm text-[var(--text-color)] ${isChecked ? 'line-through opacity-50' : ''}">${cleanHTML}</span>
                        </label>
                        <button class="delete-item-btn opacity-0 group-hover:opacity-100 p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 transition-all shrink-0">
                            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                        </button>
                    `;

                    // Handle Checkbox Toggles
                    const cb = li.querySelector('input[type="checkbox"]');
                    cb.addEventListener('change', () => {
                        const updated = toggleChecklistItemInMarkdown(packingListRaw, itemText, cb.checked);
                        savePackingList(updated);
                    });

                    // Handle Deletes
                    const delBtn = li.querySelector('.delete-item-btn');
                    delBtn.addEventListener('click', () => {
                        if (confirm(`Remove "${itemText}" from checklist?`)) {
                            const updated = removeChecklistItemFromMarkdown(packingListRaw, itemText);
                            savePackingList(updated);
                        }
                    });
                }
            });

            // 2. Add custom item forms at the bottom of each <ul>
            packingContainer.querySelectorAll('ul').forEach(ul => {
                // Determine the category name from preceding heading
                let category = "General";
                let sibling = ul.previousElementSibling;
                while (sibling) {
                    if (sibling.tagName.match(/^H[1-6]$/i)) {
                        category = sibling.textContent.trim();
                        break;
                    }
                    sibling = sibling.previousElementSibling;
                }

                const addLi = document.createElement('li');
                addLi.className = 'pt-2 border-t border-[var(--glass-border)] mt-1';
                addLi.innerHTML = `
                    <form class="flex items-center gap-2 w-full custom-item-form">
                        <input type="text" placeholder="Add custom item to ${category}..." required
                               class="flex-1 bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--input-text)] rounded-lg px-2.5 py-1 text-xs focus:outline-none focus:border-brand-500">
                        <button type="submit" class="p-1.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 hover:bg-brand-500/20 text-xs flex items-center justify-center shrink-0">
                            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
                        </button>
                    </form>
                `;

                ul.appendChild(addLi);

                // Handle Form Submissions (Add Custom Item)
                const form = addLi.querySelector('form');
                form.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const input = form.querySelector('input');
                    const text = input.value.trim();
                    if (text) {
                        const updated = addChecklistItemToMarkdown(packingListRaw, category, text);
                        savePackingList(updated);
                    }
                });
            });

            // Refresh icons inside packing checklist
            lucide.createIcons();

            const weatherList = document.getElementById('weather-list-val');
            weatherList.innerHTML = '';
            
            const lines = (state.activeTrip.weather_forecast || "").split('\n');
            if (lines.length === 0 || !state.activeTrip.weather_forecast) {
                weatherList.innerHTML = '<div class="text-slate-500 py-4 text-center">No forecast details available.</div>';
                return;
            }
            
            lines.forEach(line => {
                if (!line.trim()) return;
                const parts = line.split(':');
                const dateStr = parts[0] ? parts[0].trim() : 'Date';
                const descStr = parts[1] ? parts[1].trim() : 'Conditions';
                
                const weatherRow = document.createElement('div');
                weatherRow.className = 'py-2.5 flex items-center justify-between gap-4';
                weatherRow.innerHTML = `
                    <span class="font-medium text-slate-300 text-xs">${dateStr}</span>
                    <span class="text-slate-400 text-xs text-right truncate max-w-[180px]">${descStr}</span>
                `;
                weatherList.appendChild(weatherRow);
            });
        },

        renderBudget() {
            const planned = state.activeTrip.budget;
            let actual = 0;
            
            const categories = {
                transport: 0,
                accommodation: 0,
                food: 0,
                activities: 0,
                local_transport: 0,
                misc: 0
            };

            const body = document.getElementById('expense-table-body');
            body.innerHTML = '';

            const expenses = state.activeTrip.expenses || [];
            expenses.forEach(exp => {
                actual += exp.amount;
                categories[exp.category] = (categories[exp.category] || 0) + exp.amount;

                const tr = document.createElement('tr');
                tr.className = 'border-b border-[var(--glass-border)] hover:bg-slate-100/30 dark:hover:bg-slate-800/10 text-[var(--text-color)]';
                
                // Safe title string escape
                const escapedTitle = exp.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                
                tr.innerHTML = `
                    <td class="py-3 px-2 text-xs">${exp.date}</td>
                    <td class="py-3 px-2 font-medium text-[var(--text-header)]">${exp.title}</td>
                    <td class="py-3 px-2"><span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--input-bg)] border border-[var(--glass-border)] text-slate-600 dark:text-slate-400">${exp.category.replace('_', ' ')}</span></td>
                    <td class="py-3 px-2 text-right font-semibold text-[var(--text-header)]">₹${exp.amount.toLocaleString()}</td>
                    <td class="py-3 px-2 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="app.showEditExpenseModal(${exp.id}, '${escapedTitle}', ${exp.amount}, '${exp.category}', '${exp.date}')" class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 p-1">
                                <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                            </button>
                            <button onclick="app.deleteExpense(${exp.id})" class="text-rose-600 dark:text-rose-400 hover:text-rose-500 dark:hover:text-rose-300 p-1">
                                <i data-lucide="trash" class="w-3.5 h-3.5"></i>
                            </button>
                        </div>
                    </td>
                `;
                body.appendChild(tr);
            });

            if (expenses.length === 0) {
                body.innerHTML = `
                    <tr>
                        <td colspan="5" class="py-8 text-center text-slate-500 text-sm">
                            No expenses logged yet.
                        </td>
                    </tr>
                `;
            }

            lucide.createIcons();

            const remaining = planned - actual;
            document.getElementById('budget-planned-val').innerText = `₹${planned.toLocaleString()}`;
            document.getElementById('budget-spent-val').innerText = `₹${actual.toLocaleString()}`;
            document.getElementById('budget-rem-val').innerText = `₹${remaining.toLocaleString()}`;
            
            const remText = document.getElementById('budget-rem-val');
            if (remaining < 0) {
                remText.className = 'font-extrabold text-2xl block text-rose-500';
            } else {
                remText.className = 'font-extrabold text-2xl block text-emerald-500 dark:text-emerald-400';
            }

            const percent = Math.min(Math.round((actual / planned) * 100), 100);
            document.getElementById('budget-percent-text').innerText = `${percent}%`;
            document.getElementById('budget-progress-bar').style.width = `${percent}%`;
            
            const progBar = document.getElementById('budget-progress-bar');
            if (percent >= 100) {
                progBar.className = 'h-full bg-rose-500';
            } else if (percent > 85) {
                progBar.className = 'h-full bg-amber-500';
            } else {
                progBar.className = 'h-full bg-gradient-to-r from-brand-500 to-accent-500';
            }

            this.updateChart(categories);
            this.updateTimelineChart();
        },

        updateChart(categories) {
            const ctx = document.getElementById('category-chart').getContext('2d');
            const isLight = document.documentElement.classList.contains('light');
            const borderColor = isLight ? '#ffffff' : '#0b0f19';
            
            const data = {
                labels: ['Transport', 'Accom.', 'Food', 'Activities', 'Commute', 'Misc'],
                datasets: [{
                    data: [
                        categories.transport,
                        categories.accommodation,
                        categories.food,
                        categories.activities,
                        categories.local_transport,
                        categories.misc
                    ],
                    backgroundColor: ['#6366f1', '#a855f7', '#ec4899', '#10b981', '#f59e0b', '#64748b'],
                    borderWidth: 1.5,
                    borderColor: borderColor
                }]
            };

            if (state.chartInstance) {
                state.chartInstance.destroy();
            }

            state.chartInstance = new Chart(ctx, {
                type: 'doughnut',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    cutout: '70%'
                }
            });
        },

        updateTimelineChart() {
            const ctx = document.getElementById('timeline-chart').getContext('2d');
            
            const startDate = new Date(state.activeTrip.start_date);
            const days = state.activeTrip.days;
            const budget = state.activeTrip.budget;
            
            const labels = [];
            const plannedCumulative = [];
            const actualCumulative = [];
            
            const dailyPlanned = budget / days;
            for (let i = 1; i <= days; i++) {
                labels.push(`Day ${i}`);
                plannedCumulative.push(Math.round(dailyPlanned * i));
            }
            
            // Sort expenses by date
            const expenses = [...(state.activeTrip.expenses || [])].sort((a, b) => new Date(a.date) - new Date(b.date));
            
            // Map actual spends to days
            const daySpends = Array(days).fill(0);
            expenses.forEach(exp => {
                const expDate = new Date(exp.date);
                const diffTime = expDate - startDate;
                const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays >= 0 && diffDays < days) {
                    daySpends[diffDays] += exp.amount;
                } else if (diffDays < 0) {
                    daySpends[0] += exp.amount; // pre-trip
                } else {
                    daySpends[days - 1] += exp.amount; // post-trip
                }
            });
            
            let runningSum = 0;
            for (let i = 0; i < days; i++) {
                runningSum += daySpends[i];
                actualCumulative.push(runningSum);
            }
            
            if (state.timelineChartInstance) {
                state.timelineChartInstance.destroy();
            }
            
            const isLight = document.documentElement.classList.contains('light');
            const gridColor = isLight ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.05)';
            const textColor = isLight ? '#475569' : '#94a3b8';
            
            state.timelineChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'Actual Spent',
                            data: actualCumulative,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.08)',
                            borderWidth: 2,
                            fill: true,
                            tension: 0.1
                        },
                        {
                            label: 'Budget Limit',
                            data: plannedCumulative,
                            borderColor: '#6366f1',
                            borderDash: [5, 5],
                            borderWidth: 1.5,
                            fill: false,
                            tension: 0
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: {
                                color: textColor,
                                font: { size: 10 }
                            }
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { size: 9 } }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { color: textColor, font: { size: 9 } }
                        }
                    }
                }
            });
        },

        initMap() {
            const lat = state.activeTrip.latitude || 15.3;
            const lon = state.activeTrip.longitude || 74.0;
            console.log("Initializing map at:", lat, lon);

            state.mapInstance = L.map('map').setView([lat, lon], 12);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(state.mapInstance);

            // Hotel Icon (Custom red marker)
            const hotelIcon = L.divIcon({
                html: '<div class="w-8 h-8 rounded-full bg-brand-500 border-2 border-white flex items-center justify-center text-white shadow-lg"><i data-lucide="hotel" class="w-4 h-4"></i></div>',
                className: 'custom-div-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // Attraction Icon (Custom green marker)
            const attractionIcon = L.divIcon({
                html: '<div class="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center text-white shadow-lg"><i data-lucide="compass" class="w-4 h-4"></i></div>',
                className: 'custom-div-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // Restaurant Icon (Custom amber marker)
            const foodIcon = L.divIcon({
                html: '<div class="w-8 h-8 rounded-full bg-amber-500 border-2 border-white flex items-center justify-center text-white shadow-lg"><i data-lucide="utensils" class="w-4 h-4"></i></div>',
                className: 'custom-div-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // 1. Hotel Marker
            const hotelNameMatch = state.activeTrip.selected_hotel.match(/Hotel Name:\s*(.*)/i);
            const hotelName = hotelNameMatch ? hotelNameMatch[1] : "Your Hotel";
            L.marker([lat, lon], { icon: hotelIcon })
                .addTo(state.mapInstance)
                .bindPopup(`<b>${hotelName}</b><br>Your selected accommodation.`)
                .openPopup();

            // 2. Plot mock attractions slightly offset to look realistic without hitting api limits
            const attractionLines = (state.activeTrip.attractions || "").split('\n');
            let offsetIndex = 1;
            const routeCoordinates = [[lat, lon]]; // Start at hotel
            
            attractionLines.forEach(line => {
                if (line.trim().startsWith('- ')) {
                    const name = line.replace('- ', '').trim();
                    const offsetLat = lat + (Math.sin(offsetIndex) * 0.015);
                    const offsetLon = lon + (Math.cos(offsetIndex) * 0.02);
                    
                    L.marker([offsetLat, offsetLon], { icon: attractionIcon })
                        .addTo(state.mapInstance)
                        .bindPopup(`<b>${name}</b><br>Sightseeing Destination`);
                    
                    routeCoordinates.push([offsetLat, offsetLon]);
                    offsetIndex++;
                }
            });

            // 3. Plot restaurants offset
            const restaurantLines = (state.activeTrip.restaurants || "").split('\n');
            restaurantLines.forEach(line => {
                if (line.trim().startsWith('- ')) {
                    const name = line.replace('- ', '').trim();
                    const offsetLat = lat + (Math.sin(offsetIndex) * 0.02);
                    const offsetLon = lon + (Math.cos(offsetIndex) * 0.015);
                    
                    L.marker([offsetLat, offsetLon], { icon: foodIcon })
                        .addTo(state.mapInstance)
                        .bindPopup(`<b>${name}</b><br>Recommended Restaurant`);
                    
                    routeCoordinates.push([offsetLat, offsetLon]);
                    offsetIndex++;
                }
            });

            // Draw connecting route path line
            if (routeCoordinates.length > 1) {
                L.polyline(routeCoordinates, {
                    color: '#6366f1',
                    weight: 3,
                    opacity: 0.6,
                    dashArray: '6, 12'
                }).addTo(state.mapInstance);
            }

            lucide.createIcons();
        },

        showAddExpenseModal(show) {
            const modal = document.getElementById('expense-modal');
            if (show) {
                state.editingExpenseId = null;
                document.getElementById('expense-modal-title').innerHTML = `<i data-lucide="receipt" class="text-indigo-400"></i> Add Expense`;
                document.getElementById('expense-submit-btn').innerText = "Submit Expense";
                document.getElementById('expense-date').value = new Date().toISOString().split('T')[0];
                modal.classList.remove('hidden');
                lucide.createIcons();
            } else {
                modal.classList.add('hidden');
                expenseForm.reset();
            }
        },

        showEditExpenseModal(id, title, amount, category, date) {
            state.editingExpenseId = id;
            document.getElementById('expense-modal-title').innerHTML = `<i data-lucide="receipt" class="text-indigo-400"></i> Edit Expense`;
            document.getElementById('expense-submit-btn').innerText = "Save Changes";
            
            document.getElementById('expense-title').value = title;
            document.getElementById('expense-amount').value = amount;
            document.getElementById('expense-category').value = category;
            document.getElementById('expense-date').value = date;
            
            document.getElementById('expense-modal').classList.remove('hidden');
            lucide.createIcons();
        },

        async addExpense(e) {
            e.preventDefault();
            const title = document.getElementById('expense-title').value;
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const date = document.getElementById('expense-date').value;
            const category = document.getElementById('expense-category').value;

            try {
                let response;
                if (state.editingExpenseId) {
                    response = await fetch(`/api/expenses/${state.editingExpenseId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, amount, category, date })
                    });
                } else {
                    response = await fetch(`/api/trips/${state.activeTrip.id}/expenses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, amount, category, date })
                    });
                }

                if (response.ok) {
                    this.showAddExpenseModal(false);
                    await this.refreshActiveTripDetails();
                }
            } catch (err) {
                alert("Failed to save expense: " + err.message);
            }
        },

        async deleteExpense(expenseId) {
            if (!confirm("Are you sure you want to delete this expense?")) return;
            try {
                const response = await fetch(`/api/expenses/${expenseId}`, { method: 'DELETE' });
                if (response.ok) {
                    await this.refreshActiveTripDetails();
                }
            } catch (err) {
                alert("Failed to delete expense: " + err.message);
            }
        },

        async refreshActiveTripDetails() {
            if (!state.activeTrip) return;
            const response = await fetch(`/api/trips/${state.activeTrip.id}`);
            if (response.ok) {
                state.activeTrip = await response.json();
                this.renderItinerary();
                this.renderBudget();
                this.renderWeather();
            }
        },

        async deleteActiveTrip() {
            if (!state.activeTrip) return;
            if (!confirm(`Are you sure you want to delete the trip to ${state.activeTrip.destination}?`)) return;
            
            try {
                const response = await fetch(`/api/trips/${state.activeTrip.id}`, { method: 'DELETE' });
                if (response.ok) {
                    state.activeTrip = null;
                    await this.loadSavedTrips();
                    this.switchView('landing');
                }
            } catch (err) {
                alert("Failed to delete trip: " + err.message);
            }
        },

        showTimelineModal(show) {
            const modal = document.getElementById('timeline-modal');
            if (show) {
                modal.classList.remove('hidden');
            } else {
                modal.classList.add('hidden');
                document.getElementById('timeline-form').reset();
            }
        },

        showEditTimelineItem(dayIdx, itemIdx, text) {
            state.editingTimeline = { dayIdx, itemIdx };
            
            document.getElementById('timeline-modal-title').innerHTML = `<i data-lucide="pencil" class="text-indigo-400"></i> Edit Activity`;
            document.getElementById('timeline-item-text').value = text;
            
            this.showTimelineModal(true);
            lucide.createIcons();
        },

        showAddTimelineItem(dayIdx) {
            state.editingTimeline = { dayIdx, itemIdx: -1 };
            
            document.getElementById('timeline-modal-title').innerHTML = `<i data-lucide="plus-circle" class="text-indigo-400"></i> Add Activity`;
            document.getElementById('timeline-item-text').value = '';
            
            this.showTimelineModal(true);
            lucide.createIcons();
        },

        async deleteTimelineItem(dayIdx, itemIdx) {
            if (!confirm("Remove this activity from the itinerary?")) return;
            
            const days = state.itineraryDays;
            days[dayIdx].items.splice(itemIdx, 1);
            
            const compiledMarkdown = days.map(day => {
                const header = `### ${day.title}`;
                const list = day.items.map(item => `- ${item}`).join('\n');
                return `${header}\n${list}`;
            }).join('\n\n');
            
            await state.saveItineraryFunc(compiledMarkdown);
        },

        async submitTimelineForm(e) {
            e.preventDefault();
            const text = document.getElementById('timeline-item-text').value.trim();
            if (!text) return;
            
            const days = state.itineraryDays;
            const { dayIdx, itemIdx } = state.editingTimeline;
            
            if (itemIdx === -1) {
                days[dayIdx].items.push(text);
            } else {
                days[dayIdx].items[itemIdx] = text;
            }
            
            const compiledMarkdown = days.map(day => {
                const header = `### ${day.title}`;
                const list = day.items.map(item => `- ${item}`).join('\n');
                return `${header}\n${list}`;
            }).join('\n\n');
            
            this.showTimelineModal(false);
            await state.saveItineraryFunc(compiledMarkdown);
        },

        async submitTripForm(e) {
            e.preventDefault();
            
            const origin = document.getElementById('origin-input').value;
            const destination = document.getElementById('destination-input').value;
            const startDateStr = document.getElementById('start-date-input').value;
            const endDateStr = document.getElementById('end-date-input').value;
            const travelers = parseInt(document.getElementById('travelers-input').value);
            const style = document.getElementById('style-input').value;
            const budget = parseInt(document.getElementById('budget-input').value);
            
            const interestsChecked = document.querySelectorAll('input[name="interest"]:checked');
            const interests = Array.from(interestsChecked).map(cb => cb.value).join(', ');

            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);

            if (endDate < startDate) {
                alert("End Date must be on or after Start Date.");
                return;
            }

            const diffTime = Math.abs(endDate - startDate);
            const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

            // Show Loading State with progressive text
            this.switchView('loading');
            
            const titleElem = document.getElementById('loader-title');
            const descElem = document.getElementById('loader-desc');
            
            const steps = [
                { title: "Locating coordinates...", desc: "Consulting geocoding registry for destination." },
                { title: "Analyzing weather patterns...", desc: "Downloading 5-day forecasts from meteorological servers." },
                { title: "Querying accommodations...", desc: "Geoapify places search locating hotels within 30km." },
                { title: "Searching Booking.com & MakeMyTrip...", desc: "Web search compiling live prices and ratings." },
                { title: "Formulating traveler profile...", desc: "Calibrating AI logic with budget limits and style preferences." },
                { title: "Optimizing itinerary schedules...", desc: "Generating day-by-day routing with meal recommendations." }
            ];

            let stepIdx = 0;
            const stepInterval = setInterval(() => {
                if (stepIdx < steps.length) {
                    titleElem.innerText = steps[stepIdx].title;
                    descElem.innerText = steps[stepIdx].desc;
                    stepIdx++;
                }
            }, 3000);

            try {
                const response = await fetch('/api/plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ origin, destination, start_date: startDateStr, end_date: endDateStr, days, budget, travelers, style, interests })
                });

                clearInterval(stepInterval);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || 'Failed to generate travel plan');
                }

                // Add to state and select
                await this.loadSavedTrips();
                await this.selectTrip(data.id);

            } catch (err) {
                clearInterval(stepInterval);
                alert("Planning failed: " + err.message);
                this.switchView('wizard');
            }
        },

        async loadChatHistory() {
            const chatMessages = document.getElementById('chat-messages');
            chatMessages.innerHTML = ''; // Clear
            
            // Re-append Welcome message
            chatMessages.innerHTML = `
                <div class="flex items-start gap-3">
                    <div class="w-8 h-8 rounded-lg bg-purple-500/10 shrink-0 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-semibold">
                        A
                    </div>
                    <div class="glass-panel px-4 py-3 rounded-2xl rounded-tl-none max-w-[80%] text-sm leading-relaxed text-[var(--text-color)]">
                        Hello! I'm your AI Travel Assistant. I have the entire saved itinerary, budget limits, and hotels in context. You can ask me to:
                        <ul class="list-disc pl-4 mt-2 space-y-1 text-slate-500 dark:text-slate-400">
                            <li>"Reduce the overall budget by 10%"</li>
                            <li>"Suggest restaurant options for vegans in Goa"</li>
                            <li>"Replan Day 2 to add adventure sports"</li>
                        </ul>
                    </div>
                </div>
            `;

            try {
                const response = await fetch(`/api/trips/${state.activeTrip.id}/chat`);
                if (response.ok) {
                    const messages = await response.json();
                    messages.forEach(msg => {
                        this.appendMessage(msg.role, msg.content);
                    });
                }
            } catch (err) {
                console.error("Failed to load chat history:", err);
            }
        },

        appendMessage(role, content) {
            const chatMessages = document.getElementById('chat-messages');
            const msgDiv = document.createElement('div');
            
            const isUser = role === 'user';
            msgDiv.className = `flex items-start gap-3${isUser ? ' justify-end' : ''}`;
            
            const initials = isUser ? 'U' : 'A';
            const bgClass = isUser ? 'bg-brand-500/15 text-brand-600 dark:text-brand-400' : 'bg-purple-500/10 text-purple-600 dark:text-purple-400';
            const bubbleClass = isUser 
                ? 'bg-brand-500 text-white rounded-tr-none border-transparent shadow-md' 
                : 'glass-panel rounded-tl-none text-[var(--text-color)]';
            
            msgDiv.innerHTML = `
                ${!isUser ? `<div class="w-8 h-8 rounded-lg ${bgClass} shrink-0 flex items-center justify-center text-sm font-semibold">${initials}</div>` : ''}
                <div class="${bubbleClass} px-4 py-3 rounded-2xl max-w-[85%] text-sm leading-relaxed markdown-body">
                    ${marked.parse(content)}
                </div>
                ${isUser ? `<div class="w-8 h-8 rounded-lg ${bgClass} shrink-0 flex items-center justify-center text-sm font-semibold">${initials}</div>` : ''}
            `;
            chatMessages.appendChild(msgDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        },

        async sendChatMessage(e) {
            e.preventDefault();
            const input = document.getElementById('chat-input');
            const message = input.value.trim();
            if (!message) return;

            input.value = '';
            this.appendMessage('user', message);

            // Add typing indicator
            const chatMessages = document.getElementById('chat-messages');
            const typingDiv = document.createElement('div');
            typingDiv.id = 'chat-typing-indicator';
            typingDiv.className = 'flex items-start gap-3';
            typingDiv.innerHTML = `
                <div class="w-8 h-8 rounded-lg bg-purple-500/10 shrink-0 flex items-center justify-center text-purple-600 dark:text-purple-400 text-sm font-semibold">A</div>
                <div class="glass-panel px-4 py-3 rounded-2xl rounded-tl-none text-slate-500 dark:text-slate-400 text-sm flex items-center gap-1.5">
                    <span class="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-pulse"></span>
                    <span class="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-pulse delay-75"></span>
                    <span class="w-2 h-2 bg-slate-400 dark:bg-slate-500 rounded-full animate-pulse delay-150"></span>
                </div>
            `;
            chatMessages.appendChild(typingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;

            try {
                const response = await fetch(`/api/trips/${state.activeTrip.id}/chat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message })
                });

                // Remove typing indicator
                const indicator = document.getElementById('chat-typing-indicator');
                if (indicator) indicator.remove();

                if (response.ok) {
                    const data = await response.json();
                    this.appendMessage('assistant', data.message);
                    
                    // If changes were made, refresh
                    if (data.updated_itinerary || data.updated_budget || data.updated_selected_hotel) {
                        console.log("AI dynamically updated trip itinerary or fields. Refreshing views.");
                        await this.refreshActiveTripDetails();
                    }
                }
            } catch (err) {
                const indicator = document.getElementById('chat-typing-indicator');
                if (indicator) indicator.remove();
                this.appendMessage('assistant', "I apologize, but I failed to communicate with my core modules. Details: " + err.message);
            }
        },

        showDemo() {
            if (state.savedTrips.length > 0) {
                this.selectTrip(state.savedTrips[0].id);
            } else {
                alert("You don't have any saved trips yet. Try planning a new trip!");
                this.switchView('wizard');
            }
        }
    };

    // Event Listeners
    wizardForm.addEventListener('submit', (e) => app.submitTripForm(e));
    expenseForm.addEventListener('submit', (e) => app.addExpense(e));
    chatForm.addEventListener('submit', (e) => app.sendChatMessage(e));
    document.getElementById('timeline-form').addEventListener('submit', (e) => app.submitTimelineForm(e));

    // Theme Switcher
    themeToggleBtn.addEventListener('click', () => {
        const html = document.documentElement;
        if (html.classList.contains('dark')) {
            html.classList.remove('dark');
            html.classList.add('light');
            localStorage.setItem('theme', 'light');
        } else {
            html.classList.remove('light');
            html.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        }
    });

    // Initialize Theme
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
    } else {
        document.documentElement.classList.remove('light');
        document.documentElement.classList.add('dark');
    }

    // ==========================================
    // MARKDOWN CHECKLIST UTILITY HELPERS
    // ==========================================
    function escapeRegExp(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function addChecklistItemToMarkdown(markdown, category, newItemText) {
        const lines = markdown.split('\n');
        let targetIndex = -1;
        
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith('#') && line.toLowerCase().includes(category.toLowerCase())) {
                targetIndex = i;
                break;
            }
        }
        
        if (targetIndex !== -1) {
            let insertIndex = lines.length;
            for (let i = targetIndex + 1; i < lines.length; i++) {
                if (lines[i].trim().startsWith('#')) {
                    insertIndex = i;
                    break;
                }
            }
            while (insertIndex > targetIndex + 1 && !lines[insertIndex - 1].trim()) {
                insertIndex--;
            }
            lines.splice(insertIndex, 0, `- [ ] ${newItemText}`);
            return lines.join('\n');
        } else {
            return markdown + `\n\n### ${category}\n- [ ] ${newItemText}`;
        }
    }

    function removeChecklistItemFromMarkdown(markdown, itemText) {
        const lines = markdown.split('\n');
        const escapedText = escapeRegExp(itemText);
        const regex = new RegExp(`^\\s*-\\s*\\[[ x]]\\s*${escapedText}\\s*$`, 'i');
        
        const newLines = lines.filter(line => !regex.test(line.trim()));
        return newLines.join('\n');
    }

    function toggleChecklistItemInMarkdown(markdown, itemText, isChecked) {
        const lines = markdown.split('\n');
        const escapedText = escapeRegExp(itemText);
        const regex = new RegExp(`^\\s*-\\s*\\[[ x]]\\s*${escapedText}\\s*$`, 'i');
        
        const newLines = lines.map(line => {
            if (regex.test(line.trim())) {
                return line.replace(/\[[ x]]/, isChecked ? '[x]' : '[ ]');
            }
            return line;
        });
        return newLines.join('\n');
    }

    // Startup
    app.loadSavedTrips();
});
