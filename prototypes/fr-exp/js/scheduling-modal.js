/**
 * Scheduling Modal Component
 * Handles date/time selection and recurring ride configuration
 */

class SchedulingModal {
    constructor(app) {
        this.app = app;
        this.currentDate = null;
        this.currentTime = null;
        this.isRecurring = false;
        this.selectedDays = [];
        this.hasEndDate = false;
        this.endDate = null;
        this.departArrive = 'depart'; // 'depart' or 'arrive'
        
        this.modal = null;
    }
    
    /**
     * Open the scheduling modal
     */
    open(currentDatetime = 'now') {
        console.log('[SchedulingModal] Opening with datetime:', currentDatetime);
        
        // Parse current datetime
        this.parseCurrentDatetime(currentDatetime);
        
        // Create modal
        this.createModal();
        
        // Show modal
        setTimeout(() => {
            this.modal.classList.add('active');
        }, 10);
    }
    
    /**
     * Parse current datetime string into date and time
     */
    parseCurrentDatetime(datetime) {
        if (datetime === 'now' || datetime === 'Now') {
            this.currentDate = new Date();
            this.currentTime = { hour: this.currentDate.getHours(), minute: this.currentDate.getMinutes() };
        } else if (datetime.toLowerCase().includes('tomorrow')) {
            this.currentDate = new Date();
            this.currentDate.setDate(this.currentDate.getDate() + 1);
            
            // Extract time if present
            const timeMatch = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
            if (timeMatch) {
                let hour = parseInt(timeMatch[1]);
                const minute = parseInt(timeMatch[2]);
                const ampm = timeMatch[3]?.toLowerCase();
                
                if (ampm === 'pm' && hour < 12) hour += 12;
                if (ampm === 'am' && hour === 12) hour = 0;
                
                this.currentTime = { hour, minute };
            } else {
                this.currentTime = { hour: 12, minute: 0 };
            }
        } else {
            // Try to parse date from month names
            const monthMatch = datetime.match(/(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\s+(\d{1,2})/i);
            if (monthMatch) {
                const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
                const monthIndex = monthNames.findIndex(m => m.startsWith(monthMatch[1].toLowerCase()));
                const day = parseInt(monthMatch[2]);
                
                this.currentDate = new Date();
                this.currentDate.setMonth(monthIndex);
                this.currentDate.setDate(day);
                
                // Extract time
                const timeMatch = datetime.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
                if (timeMatch) {
                    let hour = parseInt(timeMatch[1]);
                    const minute = parseInt(timeMatch[2]);
                    const ampm = timeMatch[3]?.toLowerCase();
                    
                    if (ampm === 'pm' && hour < 12) hour += 12;
                    if (ampm === 'am' && hour === 12) hour = 0;
                    
                    this.currentTime = { hour, minute };
                } else {
                    this.currentTime = { hour: 12, minute: 0 };
                }
            } else {
                // Default to now
                this.currentDate = new Date();
                this.currentTime = { hour: this.currentDate.getHours(), minute: this.currentDate.getMinutes() };
            }
        }
    }
    
    /**
     * Create modal HTML
     */
    createModal() {
        // Remove existing modal if any
        const existing = document.getElementById('scheduling-modal');
        if (existing) {
            existing.remove();
        }
        
        // Create modal structure
        const modal = document.createElement('div');
        modal.id = 'scheduling-modal';
        modal.className = 'scheduling-modal';
        
        modal.innerHTML = `
            <div class="scheduling-modal-backdrop"></div>
            <div class="scheduling-modal-content">
                <div class="scheduling-modal-header">
                    <h2>Set date & time</h2>
                    <button class="scheduling-modal-close" id="scheduling-close-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                
                <div class="scheduling-modal-body" id="scheduling-modal-body">
                    <!-- Content will be dynamically rendered -->
                </div>
                
                <div class="scheduling-modal-footer">
                    <button class="scheduling-next-btn" id="scheduling-next-btn">Next</button>
                </div>
            </div>
        `;
        
        // Append to app container to keep modal within the UI
        const appContainer = document.getElementById('app');
        appContainer.appendChild(modal);
        this.modal = modal;
        
        // Add event listeners
        document.getElementById('scheduling-close-btn').addEventListener('click', () => this.close());
        modal.querySelector('.scheduling-modal-backdrop').addEventListener('click', () => this.close());
        document.getElementById('scheduling-next-btn').addEventListener('click', () => this.handleNext());
        
        // Render initial content
        this.renderInitialState();
    }
    
    /**
     * Render initial state
     */
    renderInitialState() {
        const body = document.getElementById('scheduling-modal-body');
        
        const dateStr = this.formatDate(this.currentDate);
        const timeStr = this.formatTime(this.currentTime);
        
        body.innerHTML = `
            <div class="scheduling-tabs">
                <button class="scheduling-tab ${this.departArrive === 'depart' ? 'active' : ''}" data-tab="depart">Depart at</button>
                <button class="scheduling-tab ${this.departArrive === 'arrive' ? 'active' : ''}" data-tab="arrive">Arrive by</button>
            </div>
            
            <div class="scheduling-field" id="ride-date-field">
                <div class="scheduling-field-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <rect x="3" y="4" width="14" height="14" rx="2" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M3 8h14M7 2v4M13 2v4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="scheduling-field-content">
                    <div class="scheduling-field-label">Ride date</div>
                    <div class="scheduling-field-value" id="ride-date-value">${dateStr}</div>
                </div>
            </div>
            
            <div class="scheduling-field" id="pickup-time-field">
                <div class="scheduling-field-icon">
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                        <circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.5"/>
                        <path d="M10 6v4l3 2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>
                </div>
                <div class="scheduling-field-content">
                    <div class="scheduling-field-label">Pickup time</div>
                    <div class="scheduling-field-value" id="pickup-time-value">${timeStr}</div>
                </div>
            </div>
            
            <div class="scheduling-toggle-field">
                <div class="scheduling-toggle-label">Recurring ride</div>
                <label class="scheduling-toggle">
                    <input type="checkbox" id="recurring-toggle" ${this.isRecurring ? 'checked' : ''}>
                    <span class="scheduling-toggle-slider"></span>
                </label>
            </div>
            
            <div id="recurring-options" style="display: ${this.isRecurring ? 'block' : 'none'};">
                <!-- Recurring options will be rendered here -->
            </div>
            
            <div id="error-message" class="scheduling-error" style="display: none;"></div>
        `;
        
        // Add event listeners
        body.querySelectorAll('.scheduling-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.departArrive = e.target.dataset.tab;
                body.querySelectorAll('.scheduling-tab').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
            });
        });
        
        document.getElementById('ride-date-field').addEventListener('click', () => this.showDatePicker());
        document.getElementById('pickup-time-field').addEventListener('click', () => this.showTimePicker());
        document.getElementById('recurring-toggle').addEventListener('change', (e) => {
            this.isRecurring = e.target.checked;
            document.getElementById('recurring-options').style.display = this.isRecurring ? 'block' : 'none';
            if (this.isRecurring) {
                this.renderRecurringOptions();
            }
        });
        
        if (this.isRecurring) {
            this.renderRecurringOptions();
        }
    }
    
    /**
     * Render recurring ride options
     */
    renderRecurringOptions() {
        const container = document.getElementById('recurring-options');
        
        container.innerHTML = `
            <div class="scheduling-days-selector">
                <button class="scheduling-day-btn ${this.selectedDays.includes(0) ? 'active' : ''}" data-day="0">Su</button>
                <button class="scheduling-day-btn ${this.selectedDays.includes(1) ? 'active' : ''}" data-day="1">M</button>
                <button class="scheduling-day-btn ${this.selectedDays.includes(2) ? 'active' : ''}" data-day="2">T</button>
                <button class="scheduling-day-btn ${this.selectedDays.includes(3) ? 'active' : ''}" data-day="3">W</button>
                <button class="scheduling-day-btn ${this.selectedDays.includes(4) ? 'active' : ''}" data-day="4">Th</button>
                <button class="scheduling-day-btn ${this.selectedDays.includes(5) ? 'active' : ''}" data-day="5">F</button>
                <button class="scheduling-day-btn ${this.selectedDays.includes(6) ? 'active' : ''}" data-day="6">S</button>
            </div>
            
            <div class="scheduling-toggle-field">
                <div class="scheduling-toggle-content">
                    <div class="scheduling-toggle-label">End repeat</div>
                    <div class="scheduling-toggle-sublabel">Select last ride date</div>
                </div>
                <label class="scheduling-toggle">
                    <input type="checkbox" id="end-repeat-toggle" ${this.hasEndDate ? 'checked' : ''}>
                    <span class="scheduling-toggle-slider"></span>
                </label>
            </div>
            
            <div id="end-date-picker" style="display: ${this.hasEndDate ? 'block' : 'none'};">
                <!-- End date calendar will be rendered here -->
            </div>
        `;
        
        // Add day selection listeners
        container.querySelectorAll('.scheduling-day-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const day = parseInt(e.target.dataset.day);
                if (this.selectedDays.includes(day)) {
                    this.selectedDays = this.selectedDays.filter(d => d !== day);
                    e.target.classList.remove('active');
                } else {
                    this.selectedDays.push(day);
                    e.target.classList.add('active');
                }
            });
        });
        
        // End repeat toggle
        document.getElementById('end-repeat-toggle').addEventListener('change', (e) => {
            this.hasEndDate = e.target.checked;
            const picker = document.getElementById('end-date-picker');
            if (this.hasEndDate) {
                picker.style.display = 'block';
                this.renderEndDateCalendar();
            } else {
                picker.style.display = 'none';
                this.endDate = null;
            }
        });
        
        if (this.hasEndDate) {
            this.renderEndDateCalendar();
        }
    }
    
    /**
     * Format date as "Saturday, April 24" or "Today, 4/23/24"
     */
    formatDate(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const checkDate = new Date(date);
        checkDate.setHours(0, 0, 0, 0);
        
        if (checkDate.getTime() === today.getTime()) {
            return `Today, ${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
        }
        
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        
        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
    }
    
    /**
     * Format time as "7:00 AM"
     */
    formatTime(time) {
        let hour = time.hour;
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        const minute = String(time.minute).padStart(2, '0');
        return `${hour}:${minute} ${ampm}`;
    }
    
    /**
     * Show date picker
     */
    showDatePicker() {
        console.log('[SchedulingModal] Show date picker');
        
        const body = document.getElementById('scheduling-modal-body');
        
        body.innerHTML = `
            <div class="scheduling-date-picker">
                <div class="scheduling-calendar-header">
                    <button class="scheduling-calendar-nav" id="prev-month">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <div class="scheduling-calendar-title" id="calendar-title">
                        ${this.getMonthYearString(this.currentDate)}
                    </div>
                    <button class="scheduling-calendar-nav" id="next-month">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                
                <div class="scheduling-calendar-weekdays">
                    <div class="scheduling-calendar-weekday">SUN</div>
                    <div class="scheduling-calendar-weekday">MON</div>
                    <div class="scheduling-calendar-weekday">TUE</div>
                    <div class="scheduling-calendar-weekday">WED</div>
                    <div class="scheduling-calendar-weekday">THU</div>
                    <div class="scheduling-calendar-weekday">FRI</div>
                    <div class="scheduling-calendar-weekday">SAT</div>
                </div>
                
                <div class="scheduling-calendar-days" id="calendar-days">
                    <!-- Calendar days will be rendered here -->
                </div>
            </div>
        `;
        
        // Render calendar days
        this.renderCalendarDays();
        
        // Add event listeners
        document.getElementById('prev-month').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() - 1);
            document.getElementById('calendar-title').textContent = this.getMonthYearString(this.currentDate);
            this.renderCalendarDays();
        });
        
        document.getElementById('next-month').addEventListener('click', () => {
            this.currentDate.setMonth(this.currentDate.getMonth() + 1);
            document.getElementById('calendar-title').textContent = this.getMonthYearString(this.currentDate);
            this.renderCalendarDays();
        });
    }
    
    /**
     * Render calendar days
     */
    renderCalendarDays() {
        const container = document.getElementById('calendar-days');
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        
        // Get first day of month and number of days
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let html = '';
        
        // Empty cells for days before month starts
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="scheduling-calendar-day empty"></div>';
        }
        
        // Days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            date.setHours(0, 0, 0, 0);
            
            const isToday = date.getTime() === today.getTime();
            const isSelected = date.getTime() === new Date(this.currentDate.getFullYear(), this.currentDate.getMonth(), this.currentDate.getDate()).setHours(0, 0, 0, 0);
            const isPast = date < today;
            
            let classes = 'scheduling-calendar-day';
            if (isToday) classes += ' today';
            if (isSelected) classes += ' selected';
            if (isPast) classes += ' past';
            
            html += `<div class="${classes}" data-date="${year}-${month}-${day}">${day}</div>`;
        }
        
        container.innerHTML = html;
        
        // Add click handlers to day cells
        container.querySelectorAll('.scheduling-calendar-day:not(.empty):not(.past)').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const [year, month, day] = dayEl.dataset.date.split('-').map(Number);
                this.currentDate = new Date(year, month, day);
                this.currentDate.setHours(this.currentTime.hour, this.currentTime.minute);
                
                // Update selected state
                container.querySelectorAll('.scheduling-calendar-day').forEach(el => el.classList.remove('selected'));
                dayEl.classList.add('selected');
            });
        });
    }
    
    /**
     * Get month and year string (e.g., "April 2024")
     */
    getMonthYearString(date) {
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${months[date.getMonth()]} ${date.getFullYear()}`;
    }
    
    /**
     * Show time picker
     */
    showTimePicker() {
        console.log('[SchedulingModal] Show time picker');
        
        const body = document.getElementById('scheduling-modal-body');
        
        // Store original time for potential cancellation
        const originalTime = { ...this.currentTime };
        
        // Convert 24-hour to 12-hour format
        let hour12 = this.currentTime.hour % 12 || 12;
        const ampm = this.currentTime.hour >= 12 ? 'PM' : 'AM';
        
        body.innerHTML = `
            <div class="scheduling-time-picker">
                <div class="scheduling-time-display">
                    ${this.formatTime(this.currentTime)}
                </div>
                
                <div class="scheduling-time-scrollers">
                    <div class="scheduling-time-scroller">
                        <div class="scheduling-scroller-content" id="hour-scroller">
                            ${this.generateHourOptions(hour12)}
                        </div>
                    </div>
                    
                    <div class="scheduling-time-separator">:</div>
                    
                    <div class="scheduling-time-scroller">
                        <div class="scheduling-scroller-content" id="minute-scroller">
                            ${this.generateMinuteOptions(this.currentTime.minute)}
                        </div>
                    </div>
                    
                    <div class="scheduling-time-scroller ampm">
                        <div class="scheduling-scroller-content" id="ampm-scroller">
                            ${this.generateAMPMOptions(ampm)}
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Setup scroll listeners for time selection
        this.setupTimeScrollers();
    }
    
    /**
     * Generate hour options HTML
     */
    generateHourOptions(selectedHour) {
        let html = '';
        for (let i = 1; i <= 12; i++) {
            const selected = i === selectedHour ? 'selected' : '';
            html += `<div class="scheduling-time-option ${selected}" data-value="${i}">${i}</div>`;
        }
        return html;
    }
    
    /**
     * Generate minute options HTML
     */
    generateMinuteOptions(selectedMinute) {
        let html = '';
        for (let i = 0; i < 60; i++) {
            const selected = i === selectedMinute ? 'selected' : '';
            const minute = String(i).padStart(2, '0');
            html += `<div class="scheduling-time-option ${selected}" data-value="${i}">${minute}</div>`;
        }
        return html;
    }
    
    /**
     * Generate AM/PM options HTML
     */
    generateAMPMOptions(selectedAMPM) {
        return `
            <div class="scheduling-time-option ${selectedAMPM === 'AM' ? 'selected' : ''}" data-value="AM">AM</div>
            <div class="scheduling-time-option ${selectedAMPM === 'PM' ? 'selected' : ''}" data-value="PM">PM</div>
        `;
    }
    
    /**
     * Setup time scroller interactions
     */
    setupTimeScrollers() {
        const hourScroller = document.getElementById('hour-scroller');
        const minuteScroller = document.getElementById('minute-scroller');
        const ampmScroller = document.getElementById('ampm-scroller');
        
        // Add click handlers
        hourScroller.querySelectorAll('.scheduling-time-option').forEach(option => {
            option.addEventListener('click', () => {
                hourScroller.querySelectorAll('.scheduling-time-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                
                // Update time
                const hour12 = parseInt(option.dataset.value);
                const currentAMPM = ampmScroller.querySelector('.selected').dataset.value;
                let hour24 = hour12;
                if (currentAMPM === 'PM' && hour12 !== 12) hour24 += 12;
                if (currentAMPM === 'AM' && hour12 === 12) hour24 = 0;
                
                this.currentTime.hour = hour24;
                this.updateTimeDisplay();
            });
        });
        
        minuteScroller.querySelectorAll('.scheduling-time-option').forEach(option => {
            option.addEventListener('click', () => {
                minuteScroller.querySelectorAll('.scheduling-time-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                
                this.currentTime.minute = parseInt(option.dataset.value);
                this.updateTimeDisplay();
            });
        });
        
        ampmScroller.querySelectorAll('.scheduling-time-option').forEach(option => {
            option.addEventListener('click', () => {
                ampmScroller.querySelectorAll('.scheduling-time-option').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                
                // Update time
                const hour12 = parseInt(hourScroller.querySelector('.selected').dataset.value);
                const newAMPM = option.dataset.value;
                let hour24 = hour12;
                if (newAMPM === 'PM' && hour12 !== 12) hour24 += 12;
                if (newAMPM === 'AM' && hour12 === 12) hour24 = 0;
                
                this.currentTime.hour = hour24;
                this.updateTimeDisplay();
            });
        });
        
        // Scroll selected items into view
        setTimeout(() => {
            hourScroller.querySelector('.selected')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            minuteScroller.querySelector('.selected')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
    }
    
    /**
     * Update time display
     */
    updateTimeDisplay() {
        const display = document.querySelector('.scheduling-time-display');
        if (display) {
            display.textContent = this.formatTime(this.currentTime);
        }
    }
    
    /**
     * Validate service hours using CONFIG.serviceHours
     */
    validateServiceHours() {
        const dayOfWeek = this.currentDate.getDay();
        const hour = this.currentTime.hour;
        const minute = this.currentTime.minute;
        
        // Get service hours from config
        const serviceHours = CONFIG.serviceHours;
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[dayOfWeek];
        const dayHours = serviceHours.regular[dayName];
        
        // Check for special dates
        const dateStr = this.currentDate.toISOString().split('T')[0];
        const specialDate = serviceHours.specialDates.find(sd => sd.date === dateStr);
        
        // Format time helper
        const formatServiceTime = (time) => {
            if (!time) return null;
            const [h, m] = time.split(':');
            const hour = parseInt(h);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const hour12 = hour % 12 || 12;
            return `${hour12}:${m} ${ampm}`;
        };
        
        // Build service hours info for error message
        const buildServiceHoursInfo = () => {
            let info = '<div class="service-hours-info">';
            info += '<strong>Service Hours:</strong><br>';
            info += `Mon - Fri: ${formatServiceTime(serviceHours.regular.monday.open)} - ${formatServiceTime(serviceHours.regular.monday.close)}<br>`;
            info += 'Sat - Sun: Closed';
            if (specialDate) {
                if (specialDate.closed) {
                    info += `<br><em>${specialDate.name}: Closed</em>`;
                } else {
                    info += `<br><em>${specialDate.name}: ${formatServiceTime(specialDate.open)} - ${formatServiceTime(specialDate.close)}</em>`;
                }
            }
            info += '</div>';
            return info;
        };
        
        // Check if it's a special date
        if (specialDate) {
            if (specialDate.closed) {
                this.showError(`Service is closed on ${specialDate.name}.${buildServiceHoursInfo()}`);
                return false;
            }
            // Check modified hours for special date
            const [openH, openM] = specialDate.open.split(':').map(Number);
            const [closeH, closeM] = specialDate.close.split(':').map(Number);
            const openTime = openH + (openM / 60);
            const closeTime = closeH + (closeM / 60);
            const selectedTime = hour + (minute / 60);
            
            if (selectedTime < openTime || selectedTime > closeTime) {
                this.showError(`${specialDate.name} hours: ${formatServiceTime(specialDate.open)} - ${formatServiceTime(specialDate.close)}.${buildServiceHoursInfo()}`);
                return false;
            }
        } else {
            // Check regular schedule
            if (dayHours.closed) {
                this.showError(`Service is closed on ${dayHours.label}s.${buildServiceHoursInfo()}`);
                return false;
            }
            
            // Check hours
            const [openH, openM] = dayHours.open.split(':').map(Number);
            const [closeH, closeM] = dayHours.close.split(':').map(Number);
            const openTime = openH + (openM / 60);
            const closeTime = closeH + (closeM / 60);
            const selectedTime = hour + (minute / 60);
            
            if (selectedTime < openTime || selectedTime > closeTime) {
                this.showError(`Service operates from ${formatServiceTime(dayHours.open)} to ${formatServiceTime(dayHours.close)} on ${dayHours.label}s.${buildServiceHoursInfo()}`);
                return false;
            }
        }
        
        // Also check if date is not in the past
        const selectedDateTime = new Date(this.currentDate);
        selectedDateTime.setHours(hour, minute, 0, 0);
        const now = new Date();
        
        if (selectedDateTime < now) {
            this.showError(`Cannot schedule a ride in the past. Please select a future date and time.${buildServiceHoursInfo()}`);
            return false;
        }
        
        this.hideError();
        return true;
    }
    
    /**
     * Show error message (supports HTML)
     */
    showError(message) {
        const body = document.getElementById('scheduling-modal-body');
        let errorDiv = body.querySelector('.scheduling-error');
        
        if (!errorDiv) {
            errorDiv = document.createElement('div');
            errorDiv.className = 'scheduling-error';
            body.appendChild(errorDiv);
        }
        
        errorDiv.innerHTML = message;
        errorDiv.style.display = 'block';
        
        // Scroll error into view
        errorDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    /**
     * Hide error message
     */
    hideError() {
        const body = document.getElementById('scheduling-modal-body');
        const errorDiv = body.querySelector('.scheduling-error');
        if (errorDiv) {
            errorDiv.style.display = 'none';
        }
    }
    
    /**
     * Render end date calendar
     */
    renderEndDateCalendar() {
        const container = document.getElementById('end-date-picker');
        
        // Initialize end date if not set (default to 1 month from current date)
        if (!this.endDate) {
            this.endDate = new Date(this.currentDate);
            this.endDate.setMonth(this.endDate.getMonth() + 1);
        }
        
        const year = this.endDate.getFullYear();
        const month = this.endDate.getMonth();
        
        container.innerHTML = `
            <div class="scheduling-calendar-header">
                <button class="scheduling-calendar-nav" id="prev-end-month">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M15 18l-6-6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
                <div class="scheduling-calendar-title" id="end-calendar-title">
                    ${this.getMonthYearString(this.endDate)}
                </div>
                <button class="scheduling-calendar-nav" id="next-end-month">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <path d="M9 18l6-6-6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                    </svg>
                </button>
            </div>
            
            <div class="scheduling-calendar-weekdays">
                <div class="scheduling-calendar-weekday">SUN</div>
                <div class="scheduling-calendar-weekday">MON</div>
                <div class="scheduling-calendar-weekday">TUE</div>
                <div class="scheduling-calendar-weekday">WED</div>
                <div class="scheduling-calendar-weekday">THU</div>
                <div class="scheduling-calendar-weekday">FRI</div>
                <div class="scheduling-calendar-weekday">SAT</div>
            </div>
            
            <div class="scheduling-calendar-days" id="end-calendar-days">
                <!-- Calendar days will be rendered here -->
            </div>
        `;
        
        this.renderEndCalendarDays();
        
        // Add navigation listeners
        document.getElementById('prev-end-month').addEventListener('click', () => {
            this.endDate.setMonth(this.endDate.getMonth() - 1);
            document.getElementById('end-calendar-title').textContent = this.getMonthYearString(this.endDate);
            this.renderEndCalendarDays();
        });
        
        document.getElementById('next-end-month').addEventListener('click', () => {
            this.endDate.setMonth(this.endDate.getMonth() + 1);
            document.getElementById('end-calendar-title').textContent = this.getMonthYearString(this.endDate);
            this.renderEndCalendarDays();
        });
    }
    
    /**
     * Render end date calendar days
     */
    renderEndCalendarDays() {
        const container = document.getElementById('end-calendar-days');
        const year = this.endDate.getFullYear();
        const month = this.endDate.getMonth();
        
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const startDate = new Date(this.currentDate);
        startDate.setHours(0, 0, 0, 0);
        
        let html = '';
        
        // Empty cells
        for (let i = 0; i < firstDay; i++) {
            html += '<div class="scheduling-calendar-day empty"></div>';
        }
        
        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            date.setHours(0, 0, 0, 0);
            
            const isSelected = date.getTime() === new Date(this.endDate.getFullYear(), this.endDate.getMonth(), this.endDate.getDate()).setHours(0, 0, 0, 0);
            const isBeforeStart = date < startDate;
            
            let classes = 'scheduling-calendar-day';
            if (isSelected) classes += ' selected';
            if (isBeforeStart) classes += ' past';
            
            html += `<div class="${classes}" data-date="${year}-${month}-${day}">${day}</div>`;
        }
        
        container.innerHTML = html;
        
        // Add click handlers
        container.querySelectorAll('.scheduling-calendar-day:not(.empty):not(.past)').forEach(dayEl => {
            dayEl.addEventListener('click', () => {
                const [year, month, day] = dayEl.dataset.date.split('-').map(Number);
                this.endDate = new Date(year, month, day);
                
                container.querySelectorAll('.scheduling-calendar-day').forEach(el => el.classList.remove('selected'));
                dayEl.classList.add('selected');
            });
        });
    }
    
    /**
     * Handle Next button
     */
    handleNext() {
        console.log('[SchedulingModal] Handling next');
        
        // Validate service hours before saving
        if (!this.validateServiceHours()) {
            return; // Error will be shown
        }
        
        // Check if recurring is enabled but no days selected
        if (this.isRecurring && this.selectedDays.length === 0) {
            this.showError('Please select at least one day for recurring rides.');
            return;
        }
        
        // Check if end repeat is enabled but no end date
        if (this.isRecurring && this.hasEndDate && !this.endDate) {
            this.showError('Please select an end date for recurring rides.');
            return;
        }
        
        // All validations passed, save
        this.save();
    }
    
    /**
     * Save scheduling changes
     */
    save() {
        // Build datetime string based on the selected date and time
        let datetimeStr;
        
        if (this.isToday(this.currentDate)) {
            datetimeStr = `today at ${this.formatTime(this.currentTime)}`;
        } else if (this.isTomorrow(this.currentDate)) {
            datetimeStr = `tomorrow at ${this.formatTime(this.currentTime)}`;
        } else {
            const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
            datetimeStr = `${months[this.currentDate.getMonth()]} ${this.currentDate.getDate()} at ${this.formatTime(this.currentTime)}`;
        }
        
        console.log('[SchedulingModal] Saving datetime:', datetimeStr);
        console.log('[SchedulingModal] Is recurring:', this.isRecurring);
        console.log('[SchedulingModal] Selected days:', this.selectedDays);
        console.log('[SchedulingModal] Has end date:', this.hasEndDate);
        console.log('[SchedulingModal] End date:', this.endDate);
        
        // Build the message to send to AI agent
        let message = `change to ${datetimeStr}`;
        
        // TODO: In a full implementation, we would store recurring ride information
        // and pass it to the booking service. For now, we just update the datetime.
        if (this.isRecurring) {
            console.log('[SchedulingModal] Note: Recurring ride preferences saved (not yet sent to AI)');
            // Store recurring preferences for future use
            this.app.recurringRidePreferences = {
                days: this.selectedDays,
                hasEndDate: this.hasEndDate,
                endDate: this.endDate
            };
        }
        
        // Send message to update the datetime
        this.app.handleUserMessage(message);
        
        // Close modal
        this.close();
    }
    
    /**
     * Check if date is today
     */
    isToday(date) {
        const today = new Date();
        return date.getDate() === today.getDate() &&
               date.getMonth() === today.getMonth() &&
               date.getFullYear() === today.getFullYear();
    }
    
    /**
     * Check if date is tomorrow
     */
    isTomorrow(date) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return date.getDate() === tomorrow.getDate() &&
               date.getMonth() === tomorrow.getMonth() &&
               date.getFullYear() === tomorrow.getFullYear();
    }
    
    /**
     * Close modal
     */
    close() {
        if (this.modal) {
            this.modal.classList.remove('active');
            setTimeout(() => {
                this.modal.remove();
                this.modal = null;
            }, 300);
        }
    }
}
