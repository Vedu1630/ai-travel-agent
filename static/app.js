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
        editingExpenseId: null,
        simulatedFlights: null,
        simulatedLodging: null,
        userEmail: 'you',
        userName: 'Traveler Genius'
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
        chat: document.getElementById('tab-chat'),
        flights: document.getElementById('tab-flights'),
        lodging: document.getElementById('tab-lodging'),
        community: document.getElementById('tab-community'),
        profile: document.getElementById('tab-profile'),
        admin: document.getElementById('tab-admin')
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
            if (tabName === 'admin' && state.userEmail !== 'admin@tripgenius.ai') {
                console.log("Access to admin tab denied");
                return;
            }
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
            } else if (tabName === 'flights') {
                this.renderFlights();
            } else if (tabName === 'lodging') {
                this.renderLodging();
            } else if (tabName === 'community') {
                this.renderStories();
            } else if (tabName === 'profile') {
                this.renderProfile();
            } else if (tabName === 'admin') {
                this.renderAdmin();
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

                state.simulatedFlights = null;
                state.simulatedLodging = null;

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
                
                // Show split indicator if split with group
                const splitBadge = exp.split_details === 'equal' 
                    ? `<span class="ml-1.5 text-[8px] bg-teal-500/10 text-teal-400 px-1 py-0.5 rounded font-extrabold uppercase">Split</span>` 
                    : '';
                
                tr.innerHTML = `
                    <td class="py-3 px-2 text-xs">${exp.date}</td>
                    <td class="py-3 px-2 font-medium text-[var(--text-header)] flex items-center">${exp.title}${splitBadge}</td>
                    <td class="py-3 px-2"><span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-[var(--input-bg)] border border-[var(--glass-border)] text-slate-600 dark:text-slate-400">${exp.category.replace('_', ' ')}</span></td>
                    <td class="py-3 px-2 text-right font-semibold text-[var(--text-header)]">₹${exp.amount.toLocaleString()}</td>
                    <td class="py-3 px-2 text-center">
                        <div class="flex items-center justify-center gap-1">
                            <button onclick="app.showEditExpenseModal(${exp.id}, '${escapedTitle}', ${exp.amount}, '${exp.category}', '${exp.date}', '${exp.paid_by || 'you'}', '${exp.split_details || 'none'}')" class="text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 dark:hover:text-indigo-300 p-1">
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

            // Calculate Group Split Balances
            const splitsPanel = document.getElementById('group-splits-panel');
            const splitsList = document.getElementById('group-splits-list');
            
            if (state.activeTrip.collaborators && state.activeTrip.collaborators.length > 0) {
                splitsPanel.classList.remove('hidden');
                
                const currentUserEmail = state.userEmail || 'you';
                const members = [currentUserEmail, ...state.activeTrip.collaborators.map(c => c.email)];
                const M = members.length;
                
                const balances = {};
                members.forEach(m => balances[m] = 0);
                
                expenses.forEach(exp => {
                    if (exp.split_details === 'equal') {
                        let payer = exp.paid_by || currentUserEmail;
                        if (payer === 'you') payer = currentUserEmail;
                        
                        const amount = exp.amount;
                        const share = amount / M;
                        
                        if (balances[payer] !== undefined) {
                            balances[payer] += amount * (1 - 1/M);
                        }
                        members.forEach(m => {
                            if (m !== payer && balances[m] !== undefined) {
                                balances[m] -= share;
                            }
                        });
                    }
                });
                
                splitsList.innerHTML = '';
                members.forEach(m => {
                    const bal = balances[m];
                    const item = document.createElement('div');
                    item.className = 'flex items-center justify-between py-1.5 border-b border-[var(--glass-border)] last:border-0';
                    
                    let textClass = 'text-slate-400';
                    let label = m === currentUserEmail ? 'You' : m;
                    let prefix = '';
                    if (bal > 0.01) {
                        textClass = 'text-emerald-500 font-bold';
                        prefix = 'owes you: +';
                    } else if (bal < -0.01) {
                        textClass = 'text-rose-500 font-bold';
                        prefix = 'you owe: ';
                    } else {
                        prefix = 'Settled';
                    }
                    
                    item.innerHTML = `
                        <span class="truncate max-w-[200px]">${label}</span>
                        <span class="${textClass}">${bal !== 0 ? prefix + '₹' + Math.abs(Math.round(bal)).toLocaleString() : 'Settled'}</span>
                    `;
                    splitsList.appendChild(item);
                });
            } else {
                splitsPanel.classList.add('hidden');
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
            if (!state.activeTrip) return;
            
            // Ensure simulated lodgings are initialized
            this.initLodgingsData();

            // Find selected hotel if any
            const bookedHotel = state.simulatedLodging.find(l => l.selected);
            
            // Centering coordinate: use booked hotel coords if selected, otherwise fallback to destination coords
            const lat = bookedHotel ? bookedHotel.latitude : (state.activeTrip.latitude || 15.3);
            const lon = bookedHotel ? bookedHotel.longitude : (state.activeTrip.longitude || 74.0);
            
            console.log("Initializing map at:", lat, lon);

            state.mapInstance = L.map('map').setView([lat, lon], 13);
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(state.mapInstance);

            // Hotel Icon Selected (Custom red marker)
            const hotelIconSelected = L.divIcon({
                html: '<div class="w-8 h-8 rounded-full bg-rose-600 border-2 border-white flex items-center justify-center text-white shadow-lg"><i data-lucide="hotel" class="w-4 h-4"></i></div>',
                className: 'custom-div-icon',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            // Hotel Icon Unselected (Custom slate/gray marker)
            const hotelIconUnselected = L.divIcon({
                html: '<div class="w-8 h-8 rounded-full bg-slate-500 border-2 border-white flex items-center justify-center text-white shadow-lg"><i data-lucide="hotel" class="w-4 h-4"></i></div>',
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

            // 1. Plot all hotel markers from the simulated list
            state.simulatedLodging.forEach(stay => {
                const isSelected = stay.selected;
                const icon = isSelected ? hotelIconSelected : hotelIconUnselected;
                const btnLabel = isSelected ? 'Remove stay' : 'Book stay';
                const btnClass = isSelected ? 'bg-rose-600 hover:bg-rose-700' : 'bg-blue-600 hover:bg-blue-700';
                
                L.marker([stay.latitude, stay.longitude], { icon: icon })
                    .addTo(state.mapInstance)
                    .bindPopup(`
                        <div class="p-1 space-y-1 text-slate-800">
                            <span class="font-bold text-xs block">${stay.name}</span>
                            <span class="text-[10px] text-slate-500 block">${stay.category.toUpperCase()} • Rating: ⭐ ${stay.rating}/5</span>
                            <span class="text-[10px] font-bold block">₹${stay.pricePerNight.toLocaleString()} / night</span>
                            <button onclick="app.bookLodgingFromMap(${stay.id})" class="mt-1.5 px-2 py-1 ${btnClass} text-white font-bold text-[9px] rounded transition-all w-full text-center">${btnLabel}</button>
                        </div>
                    `);
            });

            // 2. Plot mock attractions slightly offset to look realistic without hitting api limits
            const attractionLines = (state.activeTrip.attractions || "").split('\n');
            let offsetIndex = 1;
            const routeCoordinates = [[lat, lon]]; // Start at the active hotel center
            
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
                
                // Populate paid by dropdown
                const paidBySelect = document.getElementById('expense-paid-by');
                paidBySelect.innerHTML = '<option value="you" selected>You</option>';
                if (state.activeTrip && state.activeTrip.collaborators) {
                    state.activeTrip.collaborators.forEach(c => {
                        paidBySelect.innerHTML += `<option value="${c.email}">${c.email}</option>`;
                    });
                }
                
                document.getElementById('expense-split-type').value = "none";
                
                modal.classList.remove('hidden');
                lucide.createIcons();
            } else {
                modal.classList.add('hidden');
                expenseForm.reset();
            }
        },

        showEditExpenseModal(id, title, amount, category, date, paidBy = 'you', splitType = 'none') {
            state.editingExpenseId = id;
            document.getElementById('expense-modal-title').innerHTML = `<i data-lucide="receipt" class="text-indigo-400"></i> Edit Expense`;
            document.getElementById('expense-submit-btn').innerText = "Save Changes";
            
            document.getElementById('expense-title').value = title;
            document.getElementById('expense-amount').value = amount;
            document.getElementById('expense-category').value = category;
            document.getElementById('expense-date').value = date;
            
            // Populate paid by dropdown
            const paidBySelect = document.getElementById('expense-paid-by');
            paidBySelect.innerHTML = '<option value="you">You</option>';
            if (state.activeTrip && state.activeTrip.collaborators) {
                state.activeTrip.collaborators.forEach(c => {
                    paidBySelect.innerHTML += `<option value="${c.email}">${c.email}</option>`;
                });
            }
            paidBySelect.value = paidBy || 'you';
            document.getElementById('expense-split-type').value = splitType || 'none';
            
            document.getElementById('expense-modal').classList.remove('hidden');
            lucide.createIcons();
        },

        async addExpense(e) {
            e.preventDefault();
            const title = document.getElementById('expense-title').value;
            const amount = parseFloat(document.getElementById('expense-amount').value);
            const date = document.getElementById('expense-date').value;
            const category = document.getElementById('expense-category').value;
            const paid_by = document.getElementById('expense-paid-by').value;
            const split_details = document.getElementById('expense-split-type').value;

            try {
                let response;
                if (state.editingExpenseId) {
                    response = await fetch(`/api/expenses/${state.editingExpenseId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, amount, category, date, paid_by, split_details })
                    });
                } else {
                    response = await fetch(`/api/trips/${state.activeTrip.id}/expenses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, amount, category, date, paid_by, split_details })
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

        renderFlights() {
            const container = document.getElementById('flights-list-container');
            container.innerHTML = '';
            
            if (!state.activeTrip) {
                container.innerHTML = `
                    <div class="col-span-full glass-panel p-8 text-center text-slate-500 rounded-2xl">
                        Please select or plan a trip first to search for flights matching your itinerary.
                    </div>
                `;
                return;
            }
            
            const origin = state.activeTrip.origin || 'Mumbai';
            const destination = state.activeTrip.destination || 'Goa';
            const travelers = state.activeTrip.travelers || 1;
            const style = state.activeTrip.style || 'comfort';
            
            if (!state.simulatedFlights) {
                const airlines = [
                    { name: 'IndiGo', code: '6E', icon: 'plane' },
                    { name: 'Air India', code: 'AI', icon: 'plane' },
                    { name: 'Vistara', code: 'UK', icon: 'plane' },
                    { name: 'Akasa Air', code: 'QP', icon: 'plane' },
                    { name: 'SpiceJet', code: 'SG', icon: 'plane' }
                ];
                
                const list = [];
                for (let i = 0; i < 20; i++) {
                    const airline = airlines[i % airlines.length];
                    const stops = i % 3 === 0 ? 0 : (i % 3 === 1 ? 1 : 2);
                    
                    let basePrice = 4000;
                    if (style === 'luxury') basePrice = 8500 + (i * 300);
                    else if (style === 'budget') basePrice = 2800 + (i * 120);
                    else basePrice = 4000 + (i * 180);
                    
                    const pricePerPerson = Math.round(basePrice + (Math.random() * 1500) - (stops * 300));
                    const totalCost = pricePerPerson * travelers;
                    
                    let duration = '2h 10m';
                    if (stops === 1) duration = i % 2 === 0 ? '5h 45m' : '4h 30m';
                    else if (stops === 2) duration = i % 2 === 0 ? '8h 20m' : '9h 50m';
                    else duration = i % 2 === 0 ? '2h 10m' : '1h 50m';
                    
                    const hourDep = Math.floor(5 + (i * 0.9)) % 24;
                    const minDep = (i * 15) % 60;
                    const depTime = `${String(hourDep).padStart(2, '0')}:${String(minDep).padStart(2, '0')}`;
                    
                    const durationHrs = stops === 0 ? 2 : (stops === 1 ? 5 : 9);
                    const durationMins = stops === 0 ? 10 : (stops === 1 ? 45 : 30);
                    let hourArr = (hourDep + durationHrs) % 24;
                    let minArr = (minDep + durationMins) % 60;
                    const arrTime = `${String(hourArr).padStart(2, '0')}:${String(minArr).padStart(2, '0')}`;
                    
                    const valueScore = Math.max(1, Math.min(10, Math.round(10 - (pricePerPerson / 1800) - (stops * 1.5))));
                    
                    list.push({
                        id: i + 1,
                        airline: airline.name,
                        code: `${airline.code}-${100 + i * 41}`,
                        stops: stops,
                        duration: duration,
                        depTime: depTime,
                        arrTime: arrTime,
                        pricePerPerson: pricePerPerson,
                        totalCost: totalCost,
                        valueScore: valueScore,
                        selected: false
                    });
                }
                state.simulatedFlights = list;
            }
            
            const filterStops = document.getElementById('flight-filter-stops').value;
            const filterSort = document.getElementById('flight-filter-sort').value;
            
            let filtered = [...state.simulatedFlights];
            
            if (filterStops !== 'all') {
                const maxStops = parseInt(filterStops);
                filtered = filtered.filter(f => f.stops <= maxStops);
            }
            
            if (filterSort === 'price') {
                filtered.sort((a, b) => a.totalCost - b.totalCost);
            } else if (filterSort === 'duration') {
                filtered.sort((a, b) => {
                    const aMinutes = a.stops === 0 ? 130 : (a.stops === 1 ? 345 : 500);
                    const bMinutes = b.stops === 0 ? 130 : (b.stops === 1 ? 345 : 500);
                    return aMinutes - bMinutes;
                });
            } else if (filterSort === 'value') {
                filtered.sort((a, b) => b.valueScore - a.valueScore);
            }
            
            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="col-span-full glass-panel p-8 text-center text-slate-500 rounded-2xl">
                        No flights found matching the filters.
                    </div>
                `;
                return;
            }
            
            filtered.forEach(flight => {
                const card = document.createElement('div');
                card.className = `glass-panel p-5 rounded-2xl flex flex-col justify-between space-y-4 hover:border-blue-500/30 transition-all duration-300 ${flight.selected ? 'border-blue-500/50 bg-blue-500/5' : ''}`;
                
                let stopsLabel = flight.stops === 0 ? 'Non-stop' : `${flight.stops} Stop${flight.stops > 1 ? 's' : ''}`;
                let badgeHTML = '';
                if (flight.valueScore >= 8) {
                    badgeHTML = `<span class="bg-blue-500/10 text-blue-500 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Best Value</span>`;
                } else if (flight.pricePerPerson < 4500) {
                    badgeHTML = `<span class="bg-emerald-500/10 text-emerald-500 dark:text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full">Cheapest</span>`;
                }
                
                card.innerHTML = `
                    <div class="flex items-center justify-between border-b border-glass pb-3">
                        <div class="flex items-center gap-2.5">
                            <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-500">
                                <i data-lucide="plane" class="w-4 h-4"></i>
                            </div>
                            <div>
                                <span class="font-bold text-sm text-header block text-[var(--text-header)]">${flight.airline}</span>
                                <span class="text-[10px] text-slate-500 block">${flight.code}</span>
                            </div>
                        </div>
                        ${badgeHTML}
                    </div>
                    
                    <div class="flex items-center justify-between text-center py-2">
                        <div class="text-left">
                            <span class="font-extrabold text-lg text-[var(--text-header)] block">${flight.depTime}</span>
                            <span class="text-[10px] text-slate-500 block uppercase font-bold">${origin.split(',')[0]}</span>
                        </div>
                        <div class="flex-1 px-4 relative flex flex-col items-center">
                            <span class="text-[10px] text-slate-400 block">${flight.duration}</span>
                            <div class="w-full h-[1px] bg-slate-300 dark:bg-slate-700 my-1 relative">
                                <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                            </div>
                            <span class="text-[10px] font-semibold text-slate-500 block">${stopsLabel}</span>
                        </div>
                        <div class="text-right">
                            <span class="font-extrabold text-lg text-[var(--text-header)] block">${flight.arrTime}</span>
                            <span class="text-[10px] text-slate-500 block uppercase font-bold">${destination.split(',')[0]}</span>
                        </div>
                    </div>
                    
                    <div class="flex items-center justify-between border-t border-glass pt-3 mt-2">
                        <div>
                            <span class="text-[10px] text-slate-500 block">Total for ${travelers} pax</span>
                            <span class="font-extrabold text-lg text-[var(--text-header)] block">₹${flight.totalCost.toLocaleString()}</span>
                            <span class="text-[9px] text-slate-400 block">₹${flight.pricePerPerson.toLocaleString()} / person</span>
                        </div>
                        <div class="flex gap-1.5">
                            <button onclick="app.showBookingModal('flight', ${flight.id})" class="px-3 py-1.5 ${flight.selected ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/30' : 'bg-blue-600 hover:bg-blue-700 text-white'} font-bold text-[10px] rounded-lg transition-all shadow-md shrink-0 flex items-center gap-1">
                                <i data-lucide="${flight.selected ? 'check-circle' : 'shopping-bag'}" class="w-3 h-3"></i>
                                ${flight.selected ? 'Booked (Options)' : 'Book / Redirect'}
                            </button>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
            lucide.createIcons();
        },
        
        filterFlights() {
            this.renderFlights();
        },
        
        async bookFlight(flightId) {
            if (!state.activeTrip) return;
            const flight = state.simulatedFlights.find(f => f.id === flightId);
            if (!flight) return;
            
            flight.selected = !flight.selected;
            
            if (flight.selected) {
                const title = `Flight: ${flight.airline} (${flight.code})`;
                const amount = flight.totalCost;
                const date = state.activeTrip.start_date;
                const category = 'transport';
                
                try {
                    const response = await fetch(`/api/trips/${state.activeTrip.id}/expenses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, amount, category, date, paid_by: 'you', split_details: 'none' })
                    });
                    if (response.ok) {
                        alert(`Successfully added flight ticket cost (₹${amount.toLocaleString()}) to Expense Log!`);
                        await this.refreshActiveTripDetails();
                    }
                } catch (e) {
                    console.error("Error logging flight booking expense:", e);
                }
            }
            this.renderFlights();
        },
        
        redirectFlight(flightId) {
            if (!state.activeTrip) return;
            const flight = state.simulatedFlights.find(f => f.id === flightId);
            if (!flight) return;
            
            const origin = state.activeTrip.origin || 'Mumbai';
            const destination = state.activeTrip.destination || 'Goa';
            const date = state.activeTrip.start_date || '';
            
            const getIataOrName = (str) => {
                const match = str.match(/\((.*?)\)/);
                return match ? match[1].trim() : str.trim();
            };

            const queryStr = `Flights from ${getIataOrName(origin)} to ${getIataOrName(destination)} on ${date} with ${flight.airline}`;
            const bookingUrl = `https://www.google.com/travel/flights?q=${encodeURIComponent(queryStr)}`;
            
            window.open(bookingUrl, '_blank');
        },

        initLodgingsData() {
            if (!state.activeTrip) return;
            if (state.simulatedLodging) return;

            const destination = state.activeTrip.destination || 'Goa';
            const days = state.activeTrip.days || 3;
            const baseLat = state.activeTrip.latitude || 15.3;
            const baseLon = state.activeTrip.longitude || 74.0;
            
            const baseLodgings = [
                { name: 'Heritage Resort & Spa', category: 'resort', price: 9500, rating: 4.8, distance: '1.5 km', amenities: ['Pool', 'Spa', 'Beach Access', 'Free Breakfast', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80' },
                { name: 'Urban Center Hotel', category: 'hotel', price: 4200, rating: 4.5, distance: '0.4 km', amenities: ['Gym', 'Wi-Fi', 'Restaurant', 'Bar'], img: 'https://images.unsplash.com/photo-1540541338287-41700207dee6?auto=format&fit=crop&w=400&q=80' },
                { name: 'Backpackers Paradise Hostel', category: 'hostel', price: 950, rating: 4.3, distance: '2.1 km', amenities: ['Shared Kitchen', 'Social Lounge', 'Wi-Fi', 'Bicycle Rental'], img: 'https://images.unsplash.com/photo-1555854877-bab0e564b8d5?auto=format&fit=crop&w=400&q=80' },
                { name: 'Vista Hermosa Villa', category: 'villa', price: 14000, rating: 4.9, distance: '4.8 km', amenities: ['Private Pool', 'Kitchen', 'Garden', 'Wi-Fi', 'Parking'], img: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=400&q=80' },
                { name: 'Seaside Boutique Hotel', category: 'hotel', price: 6800, rating: 4.6, distance: '0.1 km', amenities: ['Ocean View', 'Restaurant', 'Wi-Fi', 'Free Breakfast'], img: 'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&w=400&q=80' },
                { name: 'Riverside Eco-Resort', category: 'resort', price: 8200, rating: 4.7, distance: '8.5 km', amenities: ['Kayaking', 'Organic Food', 'Yoga deck', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1584132967334-10e028bd69f7?auto=format&fit=crop&w=400&q=80' },
                { name: 'Sunset Beach Cabanas', category: 'resort', price: 5200, rating: 4.4, distance: '3.2 km', amenities: ['Cabanas', 'Bar', 'Beach Front', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1439066615861-d1af74d74000?auto=format&fit=crop&w=400&q=80' },
                { name: 'Grand Palace Hotel', category: 'hotel', price: 11000, rating: 4.8, distance: '0.8 km', amenities: ['Valet', 'Indoor Pool', 'Spa', 'Fine Dining', 'Bar'], img: 'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=400&q=80' },
                { name: 'Nomad’s Cozy Dorms', category: 'hostel', price: 800, rating: 4.1, distance: '2.5 km', amenities: ['Free Wi-Fi', 'Bunk Beds', 'Shared Baths', 'Lockers'], img: 'https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=400&q=80' },
                { name: 'Cliffside Sanctuary Villa', category: 'villa', price: 17500, rating: 4.9, distance: '6.2 km', amenities: ['Infinity Pool', 'Butler Service', 'Chef', 'Cinema Room'], img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=400&q=80' },
                { name: 'Royal Orchid Suites', category: 'hotel', price: 7500, rating: 4.5, distance: '1.2 km', amenities: ['Balcony', 'Kitchenette', 'Room Service', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1596394516093-501ba68a0ba6?auto=format&fit=crop&w=400&q=80' },
                { name: 'Palms Eco-Lodge', category: 'resort', price: 6400, rating: 4.6, distance: '5.1 km', amenities: ['Solar Power', 'Eco Tours', 'Hammocks', 'Restaurant'], img: 'https://images.unsplash.com/photo-1506929562872-bb421503ef21?auto=format&fit=crop&w=400&q=80' },
                { name: 'City Center Nest Hostel', category: 'hostel', price: 1100, rating: 4.2, distance: '0.2 km', amenities: ['Co-working Space', 'Coffee Shop', 'Pod Beds', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1520277739336-7bf77919cd6c?auto=format&fit=crop&w=400&q=80' },
                { name: 'Oceanfront Luxury Estate', category: 'villa', price: 22000, rating: 5.0, distance: '7.8 km', amenities: ['Helipad', 'Private Dock', 'Jacuzzi', 'Tennis Court', 'Wine Cellar'], img: 'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=400&q=80' },
                { name: 'Marine View Inn', category: 'hotel', price: 3800, rating: 4.3, distance: '1.9 km', amenities: ['Ocean Breezes', 'Terrace', 'Wi-Fi', 'Breakfast'], img: 'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=400&q=80' },
                { name: 'Coconut Grove Retreat', category: 'resort', price: 8900, rating: 4.7, distance: '4.3 km', amenities: ['Outdoor Gym', 'Hammock Zone', 'Swim-up Bar', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1571003123894-1f0594d2b5d9?auto=format&fit=crop&w=400&q=80' },
                { name: 'Pineapple Hostel', category: 'hostel', price: 900, rating: 4.0, distance: '3.0 km', amenities: ['Roof Bar', 'BBQ Area', 'Weekly Socials', 'Wi-Fi'], img: 'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=400&q=80' },
                { name: 'Whispering Pines Villa', category: 'villa', price: 12500, rating: 4.8, distance: '8.0 km', amenities: ['Pine Forest View', 'Hot Tub', 'Fire Pit', 'BBQ Grill'], img: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=400&q=80' },
                { name: 'Serene Valley Hotel', category: 'hotel', price: 4900, rating: 4.4, distance: '3.5 km', amenities: ['Mountain View', 'Hiking Trails', 'Restaurant', 'Free Wi-Fi'], img: 'https://images.unsplash.com/photo-1498503182468-3b51cbb6cb24?auto=format&fit=crop&w=400&q=80' },
                { name: 'Azure Sky Resort', category: 'resort', price: 10200, rating: 4.8, distance: '2.8 km', amenities: ['Infinity Pool', 'Private Beach', 'Cocktail Lounge', 'Yoga Class'], img: 'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=400&q=80' }
            ];

            state.simulatedLodging = baseLodgings.map((l, idx) => {
                const hotelName = `${destination.split(',')[0]} ${l.name}`;
                let isBooked = false;
                if (state.activeTrip.selected_hotel) {
                    isBooked = state.activeTrip.selected_hotel.toLowerCase().includes(l.name.toLowerCase());
                }
                const offsetLat = baseLat + (Math.sin(idx + 1.2) * 0.015);
                const offsetLon = baseLon + (Math.cos(idx + 1.2) * 0.018);
                return {
                    id: idx + 1,
                    name: hotelName,
                    category: l.category,
                    pricePerNight: l.price,
                    totalCost: l.price * days,
                    rating: l.rating,
                    distance: l.distance,
                    amenities: l.amenities,
                    image: l.img,
                    selected: isBooked,
                    latitude: offsetLat,
                    longitude: offsetLon
                };
            });
        },

        renderLodging() {
            const container = document.getElementById('lodgings-list-container');
            container.innerHTML = '';
            
            if (!state.activeTrip) {
                container.innerHTML = `
                    <div class="col-span-full glass-panel p-8 text-center text-slate-500 rounded-2xl">
                        Please select or plan a trip first to view lodging recommendations.
                    </div>
                `;
                return;
            }
            
            this.initLodgingsData();
            
            const days = state.activeTrip.days || 3;
            const categoryFilter = document.getElementById('lodging-filter-category').value;
            let filtered = [...state.simulatedLodging];
            
            if (categoryFilter !== 'all') {
                filtered = filtered.filter(l => l.category === categoryFilter);
            }
            
            filtered.forEach(stay => {
                const card = document.createElement('div');
                card.className = `glass-panel overflow-hidden rounded-2xl flex flex-col justify-between hover:border-rose-500/30 transition-all duration-300 ${stay.selected ? 'border-rose-500/50 bg-rose-500/5' : ''}`;
                
                const amenitiesHTML = stay.amenities.map(a => `<span class="bg-slate-500/10 text-slate-400 text-[9px] font-semibold px-2 py-0.5 rounded-full">${a}</span>`).join(' ');
                
                card.innerHTML = `
                    <div class="relative h-44 w-full">
                        <img src="${stay.image}" class="w-full h-full object-cover">
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
                        <div class="absolute bottom-3 left-4 right-4 flex items-center justify-between">
                            <span class="text-[10px] uppercase font-bold text-white bg-rose-500 px-2 py-0.5 rounded">${stay.category}</span>
                            <div class="flex items-center gap-1 text-amber-400 bg-black/40 backdrop-blur-sm px-2 py-0.5 rounded text-xs font-semibold">
                                <i data-lucide="star" class="w-3 h-3 fill-amber-400 text-transparent"></i> ${stay.rating}
                            </div>
                        </div>
                    </div>
                    
                    <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div class="space-y-1.5">
                            <span class="font-bold text-base text-[var(--text-header)] block leading-snug">${stay.name}</span>
                            <span class="text-[10px] text-slate-500 block"><i data-lucide="map-pin" class="w-3 h-3 inline mr-0.5"></i> ${stay.distance} from city center</span>
                            <div class="flex flex-wrap gap-1.5 pt-2">
                                ${amenitiesHTML}
                            </div>
                        </div>
                        
                        <div class="flex items-center justify-between border-t border-glass pt-3 mt-4">
                            <div>
                                <span class="text-[10px] text-slate-500 block">Total for ${days} nights</span>
                                <span class="font-extrabold text-lg text-[var(--text-header)] block">₹${stay.totalCost.toLocaleString()}</span>
                                <span class="text-[9px] text-slate-400 block">₹${stay.pricePerNight.toLocaleString()} / night</span>
                            </div>
                            <div class="flex gap-1.5">
                                <button onclick="app.showBookingModal('lodging', ${stay.id})" class="px-3 py-1.5 ${stay.selected ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/30' : 'bg-rose-600 hover:bg-rose-700 text-white'} font-bold text-[10px] rounded-lg transition-all shadow-md shrink-0 flex items-center gap-1">
                                    <i data-lucide="${stay.selected ? 'check-circle' : 'shopping-bag'}" class="w-3 h-3"></i>
                                    ${stay.selected ? 'Booked (Options)' : 'Book / Redirect'}
                                </button>
                            </div>
                        </div>
                    </div>
                `;
                container.appendChild(card);
            });
            lucide.createIcons();
        },
        
        filterLodging() {
            this.renderLodging();
        },
        
        async bookLodging(stayId) {
            if (!state.activeTrip) return;
            const stay = state.simulatedLodging.find(l => l.id === stayId);
            if (!stay) return;
            
            stay.selected = !stay.selected;
            
            if (stay.selected) {
                // Deselect all other hotels in the simulated list
                state.simulatedLodging.forEach(l => {
                    if (l.id !== stayId) l.selected = false;
                });
                
                const title = `Stay: ${stay.name}`;
                const amount = stay.totalCost;
                const date = state.activeTrip.start_date;
                const category = 'accommodation';
                
                try {
                    const response = await fetch(`/api/trips/${state.activeTrip.id}/expenses`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ title, amount, category, date, paid_by: 'you', split_details: 'none' })
                    });
                    if (response.ok) {
                        alert(`Successfully added stay costs (₹${amount.toLocaleString()}) to Expense Log!`);
                        
                        // Patch selected hotel and its specific coordinates directly to the database
                        const hotelMarkdown = `**Hotel Name**: ${stay.name}\n- Category: ${stay.category}\n- Distance: ${stay.distance} from center\n- Rating: ${stay.rating}/5 ⭐\n- Amenities: ${stay.amenities.join(', ')}`;
                        await fetch(`/api/trips/${state.activeTrip.id}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                selected_hotel: hotelMarkdown,
                                latitude: stay.latitude,
                                longitude: stay.longitude
                            })
                        });

                        // Inform chat agent
                        await fetch(`/api/trips/${state.activeTrip.id}/chat`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: `I have booked the hotel ${stay.name}.` })
                        });
                        
                        await this.refreshActiveTripDetails();
                        
                        // Dynamically update the map to center on new hotel coordinates
                        if (state.mapInstance) {
                            state.mapInstance.remove();
                            state.mapInstance = null;
                            this.initMap();
                        }
                    }
                } catch (e) {
                    console.error("Error logging lodging booking expense:", e);
                }
            } else {
                try {
                    // Reset selected hotel
                    await fetch(`/api/trips/${state.activeTrip.id}`, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            selected_hotel: ""
                        })
                    });
                    await this.refreshActiveTripDetails();
                    
                    // Reset map
                    if (state.mapInstance) {
                        state.mapInstance.remove();
                        state.mapInstance = null;
                        this.initMap();
                    }
                } catch (e) {
                    console.error("Error resetting lodging selection:", e);
                }
            }
            this.renderLodging();
        },
        
        redirectLodging(stayId) {
            if (!state.activeTrip) return;
            const stay = state.simulatedLodging.find(l => l.id === stayId);
            if (!stay) return;
            
            const checkin = state.activeTrip.start_date || '';
            const checkout = state.activeTrip.end_date || '';
            const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(stay.name)}&checkin=${checkin}&checkout=${checkout}`;
            
            window.open(bookingUrl, '_blank');
        },

        bookLodgingFromMap(stayId) {
            this.bookLodging(stayId);
        },

        async renderStories() {
            const grid = document.getElementById('stories-feed-grid');
            grid.innerHTML = '';
            
            try {
                const response = await fetch('/api/stories');
                if (response.ok) {
                    const stories = await response.json();
                    
                    if (stories.length === 0) {
                        grid.innerHTML = `
                            <div class="col-span-full glass-panel p-8 text-center text-slate-500 rounded-2xl">
                                No travel stories published yet. Be the first to share your journey!
                            </div>
                        `;
                        return;
                    }
                    
                    stories.forEach(story => {
                        const card = document.createElement('div');
                        card.className = 'glass-panel rounded-2xl overflow-hidden flex flex-col justify-between hover:border-teal-500/30 transition-all duration-300';
                        
                        let cloneBtnHTML = '';
                        if (story.trip_id) {
                            cloneBtnHTML = `
                                <button onclick="app.cloneStoryTrip(${story.trip_id})" class="text-xs font-bold bg-teal-600/10 hover:bg-teal-600 hover:text-white text-teal-500 dark:text-teal-400 px-3 py-1.5 rounded-lg border border-teal-500/20 transition-all flex items-center gap-1">
                                    <i data-lucide="copy" class="w-3.5 h-3.5"></i> Clone Trip
                                </button>
                            `;
                        }
                        
                        card.innerHTML = `
                            <div class="h-48 w-full relative">
                                <img src="${story.image_url}" class="w-full h-full object-cover">
                                <div class="absolute inset-0 bg-gradient-to-t from-slate-950/80 to-transparent"></div>
                                <div class="absolute bottom-3 left-4">
                                    <span class="text-xs text-teal-400 font-semibold block">Story By ${story.author_name}</span>
                                    <span class="text-[10px] text-slate-400 block">${new Date(story.created_at || Date.now()).toLocaleDateString()}</span>
                                </div>
                            </div>
                            <div class="p-6 flex-1 flex flex-col justify-between space-y-4">
                                <div class="space-y-2">
                                    <h4 class="font-extrabold text-base text-[var(--text-header)] leading-snug">${story.title}</h4>
                                    <p class="text-xs text-slate-400 leading-relaxed line-clamp-3">${story.content}</p>
                                </div>
                                
                                <div class="flex items-center justify-between border-t border-glass pt-3 mt-4">
                                    <button onclick="app.likeStory(${story.id})" class="flex items-center gap-1.5 text-xs text-slate-400 hover:text-teal-500 font-bold transition-all">
                                        <i data-lucide="thumbs-up" class="w-4 h-4 text-teal-500"></i>
                                        <span>${story.likes} Likes</span>
                                    </button>
                                    ${cloneBtnHTML}
                                </div>
                            </div>
                        `;
                        grid.appendChild(card);
                    });
                    lucide.createIcons();
                }
            } catch (err) {
                console.error("Failed to render community stories:", err);
            }
        },
        
        showAddStoryModal(show) {
            const modal = document.getElementById('story-modal');
            if (show) {
                modal.classList.remove('hidden');
                if (state.activeTrip) {
                    document.getElementById('story-title').value = `My Adventure in ${state.activeTrip.destination}`;
                    document.getElementById('story-image').value = 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=800&q=80';
                }
            } else {
                modal.classList.add('hidden');
                document.getElementById('story-form').reset();
            }
        },
        
        async submitStoryForm(e) {
            e.preventDefault();
            const title = document.getElementById('story-title').value;
            const content = document.getElementById('story-content').value;
            const image_url = document.getElementById('story-image').value;
            const author_name = state.userName || 'Guest Traveler';
            const trip_id = state.activeTrip ? state.activeTrip.id : null;
            
            try {
                const response = await fetch('/api/stories', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, content, author_name, image_url, trip_id })
                });
                
                if (response.ok) {
                    this.showAddStoryModal(false);
                    this.renderStories();
                }
            } catch (err) {
                alert("Failed to publish story: " + err.message);
            }
        },
        
        async likeStory(storyId) {
            try {
                const response = await fetch(`/api/stories/${storyId}/like`, { method: 'POST' });
                if (response.ok) {
                    this.renderStories();
                }
            } catch (err) {
                console.error("Failed to like story:", err);
            }
        },
        
        async cloneStoryTrip(tripId) {
            if (!confirm("Would you like to clone this entire itinerary into your active trips?")) return;
            try {
                const response = await fetch(`/api/trips/${tripId}/clone`, { method: 'POST' });
                if (response.ok) {
                    const result = await response.json();
                    alert("Itinerary cloned successfully! Loading cloned trip...");
                    await this.loadSavedTrips();
                    await this.selectTrip(result.id);
                } else {
                    alert("Failed to clone trip itinerary");
                }
            } catch (err) {
                alert("Cloning failed: " + err.message);
            }
        },

        showBookingModal(type, itemId) {
            const modal = document.getElementById('booking-options-modal');
            if (type) {
                state.pendingBookingType = type;
                state.pendingBookingId = itemId;

                const detailsContainer = document.getElementById('booking-modal-details');
                const titleEl = document.getElementById('booking-modal-title');
                const iconEl = document.getElementById('booking-modal-icon');
                const internalTitleEl = document.getElementById('booking-modal-btn-internal-title');
                const internalDescEl = document.getElementById('booking-modal-btn-internal-desc');

                let detailsHtml = '';
                let titleText = 'Booking Options';
                let iconName = 'plane';
                let isSelected = false;

                if (type === 'flight') {
                    const flight = state.simulatedFlights.find(f => f.id === itemId);
                    if (flight) {
                        isSelected = flight.selected;
                        titleText = 'Book Flight';
                        iconName = 'plane-takeoff';
                        detailsHtml = `
                            <div class="flex items-center justify-between font-bold text-sm text-[var(--text-header)] mb-2">
                                <span>${flight.airline} (${flight.code})</span>
                                <span class="text-blue-400">₹${flight.totalCost.toLocaleString()}</span>
                            </div>
                            <div class="grid grid-cols-3 text-[10px] text-slate-400 gap-2">
                                <div><strong>Dep:</strong> ${flight.depTime}</div>
                                <div><strong>Arr:</strong> ${flight.arrTime}</div>
                                <div><strong>Duration:</strong> ${flight.duration}</div>
                            </div>
                        `;
                    }
                } else if (type === 'lodging') {
                    const stay = state.simulatedLodging.find(l => l.id === itemId);
                    if (stay) {
                        isSelected = stay.selected;
                        titleText = 'Book Stay';
                        iconName = 'hotel';
                        detailsHtml = `
                            <div class="flex items-center justify-between font-bold text-sm text-[var(--text-header)] mb-2">
                                <span>${stay.name}</span>
                                <span class="text-rose-400">₹${stay.totalCost.toLocaleString()}</span>
                            </div>
                            <div class="grid grid-cols-2 text-[10px] text-slate-400 gap-2">
                                <div><strong>Rating:</strong> ⭐ ${stay.rating}/5</div>
                                <div><strong>Distance:</strong> ${stay.distance}</div>
                            </div>
                        `;
                    }
                }

                detailsContainer.innerHTML = detailsHtml;
                titleEl.innerText = titleText;
                iconEl.setAttribute('data-lucide', iconName);
                
                if (isSelected) {
                    internalTitleEl.innerText = "Remove from Budget";
                    internalDescEl.innerText = "Remove this booking expense from your TripGenius budget log.";
                } else {
                    internalTitleEl.innerText = "Book & Add to Budget";
                    internalDescEl.innerText = "Save this choice to your TripGenius expenses and update your budget split.";
                }

                modal.classList.remove('hidden');
                lucide.createIcons();
            } else {
                modal.classList.add('hidden');
                state.pendingBookingType = null;
                state.pendingBookingId = null;
            }
        },

        async confirmBookInternal() {
            const type = state.pendingBookingType;
            const id = state.pendingBookingId;
            if (!type || !id) return;

            this.showBookingModal(false);
            if (type === 'flight') {
                await this.bookFlight(id);
            } else if (type === 'lodging') {
                await this.bookLodging(id);
            }
        },

        confirmBookExternal() {
            const type = state.pendingBookingType;
            const id = state.pendingBookingId;
            if (!type || !id) return;

            this.showBookingModal(false);
            if (type === 'flight') {
                this.redirectFlight(id);
            } else if (type === 'lodging') {
                this.redirectLodging(id);
            }
        },

        showCollaboratorModal(show) {
            const modal = document.getElementById('collaborator-modal');
            if (show) {
                if (!state.activeTrip) {
                    alert("Please select a trip first before sharing.");
                    return;
                }
                modal.classList.remove('hidden');
                this.renderCollaborators();
            } else {
                modal.classList.add('hidden');
                document.getElementById('collaborator-form').reset();
            }
        },
        
        async renderCollaborators() {
            const list = document.getElementById('collaborators-list');
            list.innerHTML = '';
            
            if (!state.activeTrip) return;
            
            try {
                const response = await fetch(`/api/trips/${state.activeTrip.id}/collaborators`);
                if (response.ok) {
                    const collaborators = await response.json();
                    state.activeTrip.collaborators = collaborators;
                    
                    if (collaborators.length === 0) {
                        list.innerHTML = `<li class="py-4 text-center text-slate-500">No collaborators added yet.</li>`;
                        return;
                    }
                    
                    collaborators.forEach(c => {
                        const li = document.createElement('li');
                        li.className = 'py-2.5 flex items-center justify-between gap-4 text-slate-300 border-b border-glass last:border-0';
                        li.innerHTML = `
                            <span class="truncate">${c.email}</span>
                            <button onclick="app.deleteCollaborator('${c.email}')" class="text-rose-500 hover:text-rose-600 transition-all">
                                <i data-lucide="user-minus" class="w-4 h-4"></i>
                            </button>
                        `;
                        list.appendChild(li);
                    });
                    lucide.createIcons();
                }
            } catch (err) {
                console.error("Failed to render collaborators:", err);
            }
        },
        
        async addCollaborator(e) {
            e.preventDefault();
            const emailInput = document.getElementById('collaborator-email');
            const email = emailInput.value.trim();
            if (!email || !state.activeTrip) return;
            
            try {
                const response = await fetch(`/api/trips/${state.activeTrip.id}/collaborators`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                
                if (response.ok) {
                    emailInput.value = '';
                    await this.renderCollaborators();
                    await this.refreshActiveTripDetails();
                }
            } catch (err) {
                alert("Failed to add collaborator: " + err.message);
            }
        },
        
        async deleteCollaborator(email) {
            if (!confirm(`Remove collaborator ${email}?`)) return;
            try {
                const response = await fetch(`/api/trips/${state.activeTrip.id}/collaborators/${email}`, {
                    method: 'DELETE'
                });
                if (response.ok) {
                    await this.renderCollaborators();
                    await this.refreshActiveTripDetails();
                }
            } catch (err) {
                alert("Failed to remove collaborator: " + err.message);
            }
        },

        async renderProfile() {
            try {
                const response = await fetch('/api/profile');
                if (response.ok) {
                    const profile = await response.json();
                    state.profile = profile;
                    state.userName = profile.name;
                    state.userEmail = profile.email;
                    this.updateAdminTabVisibility();
                    
                    document.getElementById('profile-input-name').value = profile.name;
                    document.getElementById('profile-input-email').value = profile.email;
                    document.getElementById('profile-input-airport').value = profile.home_airport;
                    document.getElementById('profile-input-avatar').value = profile.avatar;
                    
                    if (profile.avatar) {
                        document.getElementById('profile-details-avatar').src = profile.avatar;
                        const headerAvatar = document.querySelector('header img');
                        if (headerAvatar) headerAvatar.src = profile.avatar;
                    }
                    
                    document.getElementById('profile-stat-trips').innerText = state.savedTrips.length;
                    
                    let activeSpent = 0;
                    if (state.activeTrip && state.activeTrip.expenses) {
                        state.activeTrip.expenses.forEach(e => activeSpent += e.amount);
                    }
                    document.getElementById('profile-stat-spent').innerText = `₹${activeSpent.toLocaleString()}`;
                }
            } catch (err) {
                console.error("Failed to load profile details:", err);
            }
        },
        
        async submitProfileForm(e) {
            e.preventDefault();
            const name = document.getElementById('profile-input-name').value;
            const email = document.getElementById('profile-input-email').value;
            const home_airport = document.getElementById('profile-input-airport').value;
            const avatar = document.getElementById('profile-input-avatar').value;
            
            try {
                const response = await fetch('/api/profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, home_airport, avatar })
                });
                
                if (response.ok) {
                    alert("Profile updated successfully!");
                    state.userName = name;
                    state.userEmail = email;
                    this.renderProfile();
                }
            } catch (err) {
                alert("Failed to update profile settings: " + err.message);
            }
        },
        
        initCurrencyConverter() {
            const amountInput = document.getElementById('currency-amount');
            const fromSelect = document.getElementById('currency-from');
            const toSelect = document.getElementById('currency-to');
            
            const calculate = () => {
                const amount = parseFloat(amountInput.value) || 0;
                const from = fromSelect.value;
                const to = toSelect.value;
                
                const rates = {
                    USD: 1,
                    INR: 83.5,
                    EUR: 0.92,
                    GBP: 0.79
                };
                
                const converted = (amount / rates[from]) * rates[to];
                document.getElementById('currency-result-val').innerText = `${converted.toFixed(2)} ${to}`;
            };
            
            amountInput.addEventListener('input', calculate);
            fromSelect.addEventListener('change', calculate);
            toSelect.addEventListener('change', calculate);
            
            calculate();
        },

        async renderAdmin() {
            const statUsers = document.getElementById('admin-stat-users');
            const statTrips = document.getElementById('admin-stat-trips');
            const routesList = document.getElementById('admin-routes-list');
            const usersTable = document.getElementById('admin-users-table-body');
            
            try {
                const response = await fetch('/api/admin/metrics');
                if (response.ok) {
                    const metrics = await response.json();
                    
                    statUsers.innerText = metrics.users_count || 1;
                    statTrips.innerText = metrics.trips_count || 0;
                    document.getElementById('admin-stat-status').innerText = metrics.system_status || 'Healthy';
                    
                    const revenueEstimate = Math.round(metrics.expenses_sum / 83.5);
                    const kpiCards = document.querySelectorAll('#tab-admin .glass-panel');
                    if (kpiCards.length >= 3) {
                        const span = kpiCards[2].querySelector('span:nth-child(2)');
                        if (span) span.innerText = `$${revenueEstimate.toLocaleString()}`;
                    }
                    
                    routesList.innerHTML = '';
                    if (metrics.popular_destinations && metrics.popular_destinations.length > 0) {
                        metrics.popular_destinations.forEach(r => {
                            const li = document.createElement('li');
                            li.className = 'py-2.5 flex items-center justify-between text-slate-300 border-b border-glass last:border-0';
                            li.innerHTML = `
                                <span>${r.destination}</span>
                                <span class="bg-red-500/10 text-red-500 font-bold px-2 py-0.5 rounded text-[10px]">${r.count} Trip${r.count > 1 ? 's' : ''}</span>
                            `;
                            routesList.appendChild(li);
                        });
                    } else {
                        routesList.innerHTML = `<li class="py-4 text-center text-slate-500 text-xs">No destinations planned yet.</li>`;
                    }
                    
                    usersTable.innerHTML = '';
                    const mockUsers = [
                        { id: 1, name: state.userName || 'Traveler Genius', email: state.userEmail || 'traveler@tripgenius.ai', status: 'Active' },
                        { id: 2, name: 'Sarah Jenkins', email: 'sarah.j@gmail.com', status: 'Active' },
                        { id: 3, name: 'Michael Chang', email: 'mchang@yahoo.com', status: 'Banned' },
                        { id: 4, name: 'Emma Watson', email: 'emma@watson.co.uk', status: 'Active' }
                    ];
                    
                    if (!state.userStatusList) {
                        state.userStatusList = {};
                    }
                    
                    mockUsers.forEach(u => {
                        const status = state.userStatusList[u.id] || u.status;
                        const isBanned = status === 'Banned';
                        
                        const tr = document.createElement('tr');
                        tr.className = `border-b border-glass text-slate-300 ${isBanned ? 'opacity-50' : ''}`;
                        tr.innerHTML = `
                            <td class="py-3 font-semibold text-[var(--text-header)]">${u.name}</td>
                            <td class="py-3">${u.email}</td>
                            <td class="py-3">
                                <span class="px-2 py-0.5 text-[9px] font-bold rounded-full ${isBanned ? 'bg-red-500/10 text-red-500' : 'bg-emerald-500/10 text-emerald-500'}">
                                    ${status}
                                </span>
                            </td>
                            <td class="py-3 text-right">
                                <button onclick="app.toggleUserStatus(${u.id}, '${status}')" class="text-[10px] font-bold ${isBanned ? 'text-emerald-500 hover:text-emerald-400' : 'text-red-500 hover:text-red-400'} transition-all">
                                    ${isBanned ? 'Unban' : 'Ban'}
                                </button>
                            </td>
                        `;
                        usersTable.appendChild(tr);
                    });
                }
            } catch (err) {
                console.error("Failed to load admin metrics:", err);
            }
        },
        
        toggleUserStatus(userId, currentStatus) {
            if (!state.userStatusList) state.userStatusList = {};
            const nextStatus = currentStatus === 'Active' ? 'Banned' : 'Active';
            if (confirm(`Are you sure you want to change user status to ${nextStatus}?`)) {
                state.userStatusList[userId] = nextStatus;
                this.renderAdmin();
            }
        },

        updateAdminTabVisibility() {
            const adminTabBtn = document.getElementById('admin-tab-btn');
            if (adminTabBtn) {
                if (state.userEmail === 'admin@tripgenius.ai') {
                    adminTabBtn.classList.remove('hidden');
                } else {
                    adminTabBtn.classList.add('hidden');
                    if (state.activeTab === 'admin') {
                        this.switchTab('itinerary');
                    }
                }
            }
        },

        showDemo() {
            if (state.savedTrips.length > 0) {
                this.selectTrip(state.savedTrips[0].id);
            } else {
                alert("You don't have any saved trips yet. Try planning a new trip!");
                this.switchView('wizard');
            }
        },

        async checkAuth() {
            try {
                const res = await fetch('/api/auth/me');
                if (res.ok) {
                    const authData = await res.json();
                    if (authData.authenticated) {
                        state.userEmail = authData.email;
                        state.userName = authData.name || 'Traveler Genius';
                        
                        document.getElementById('view-auth').classList.add('hidden');
                        document.getElementById('main-header').classList.remove('hidden');
                        document.getElementById('main-app-container').classList.remove('hidden');
                        
                        // Update header avatar / name
                        const nameSpan = document.getElementById('header-profile-name');
                        if (nameSpan) nameSpan.innerText = state.userName.split(' ')[0] || 'Traveler';
                        
                        this.updateAdminTabVisibility();
                        this.loadSavedTrips();
                        this.initCurrencyConverter();
                    } else {
                        document.getElementById('view-auth').classList.remove('hidden');
                        document.getElementById('main-header').classList.add('hidden');
                        document.getElementById('main-app-container').classList.add('hidden');
                    }
                } else {
                    document.getElementById('view-auth').classList.remove('hidden');
                    document.getElementById('main-header').classList.add('hidden');
                    document.getElementById('main-app-container').classList.add('hidden');
                }
            } catch (err) {
                console.error("Auth check failed:", err);
                document.getElementById('view-auth').classList.remove('hidden');
                document.getElementById('main-header').classList.add('hidden');
                document.getElementById('main-app-container').classList.add('hidden');
            }
        },

        async login(email, password) {
            try {
                const res = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await res.json();
                if (res.ok) {
                    await this.checkAuth();
                } else {
                    alert(data.detail || "Login failed");
                }
            } catch (err) {
                console.error("Login request failed:", err);
                alert("An error occurred during login. Please try again.");
            }
        },

        async register(name, email, password) {
            try {
                const res = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password })
                });
                const data = await res.json();
                if (res.ok) {
                    await this.checkAuth();
                } else {
                    alert(data.detail || "Registration failed");
                }
            } catch (err) {
                console.error("Registration request failed:", err);
                alert("An error occurred during registration. Please try again.");
            }
        },

        async logout() {
            try {
                const res = await fetch('/api/auth/logout', { method: 'POST' });
                if (res.ok) {
                    window.location.reload();
                }
            } catch (err) {
                console.error("Logout request failed:", err);
            }
        }
    };

    // Event Listeners
    wizardForm.addEventListener('submit', (e) => app.submitTripForm(e));
    expenseForm.addEventListener('submit', (e) => app.addExpense(e));
    chatForm.addEventListener('submit', (e) => app.sendChatMessage(e));
    document.getElementById('timeline-form').addEventListener('submit', (e) => app.submitTimelineForm(e));
    document.getElementById('profile-edit-form').addEventListener('submit', (e) => app.submitProfileForm(e));
    document.getElementById('story-form').addEventListener('submit', (e) => app.submitStoryForm(e));
    document.getElementById('collaborator-form').addEventListener('submit', (e) => app.addCollaborator(e));

    // Auth Forms Toggles
    const toggleToRegister = document.getElementById('toggle-to-register');
    const toggleToLogin = document.getElementById('toggle-to-login');
    const loginForm = document.getElementById('auth-login-form');
    const registerForm = document.getElementById('auth-register-form');

    if (toggleToRegister) {
        toggleToRegister.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        });
    }

    if (toggleToLogin) {
        toggleToLogin.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const email = document.getElementById('login-email').value;
            const password = document.getElementById('login-password').value;
            app.login(email, password);
        });
    }

    if (registerForm) {
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('register-name').value;
            const email = document.getElementById('register-email').value;
            const password = document.getElementById('register-password').value;
            app.register(name, email, password);
        });
    }

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
    (() => {
        app.checkAuth();
    })();
});
