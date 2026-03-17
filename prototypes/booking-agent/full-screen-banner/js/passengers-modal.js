/**
 * Passengers Modal Component
 * Handles passenger count selection from chip click
 */

class PassengersModal {
    constructor(app) {
        this.app = app;
        this.modal = null;
        this.passengerCounts = {
            adult: 1,
            child: 0,
            pca: 0
        };
    }
    
    /**
     * Open the passengers modal
     */
    open(currentPassengers = 1) {
        console.log('[PassengersModal] Opening with current passengers:', currentPassengers);
        
        // Initialize counts - distribute current passengers to adults by default
        this.passengerCounts = {
            adult: currentPassengers || 1,
            child: 0,
            pca: 0
        };
        
        // Create modal
        this.createModal();
        
        // Show modal
        setTimeout(() => {
            this.modal.classList.add('active');
        }, 10);
    }
    
    /**
     * Create modal HTML
     */
    createModal() {
        // Remove existing modal if any
        const existing = document.getElementById('passengers-modal');
        if (existing) {
            existing.remove();
        }
        
        // Create modal structure
        const modal = document.createElement('div');
        modal.id = 'passengers-modal';
        modal.className = 'passengers-modal';
        
        modal.innerHTML = `
            <div class="passengers-modal-backdrop"></div>
            <div class="passengers-modal-content">
                <div class="passengers-modal-header">
                    <h2>Passengers</h2>
                    <button class="passengers-modal-close" id="passengers-close-btn">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
                
                <div class="passengers-modal-body">
                    <div class="passengers-options">
                        ${this.createPassengerRow('adult', 'Adult', this.passengerCounts.adult)}
                        ${this.createPassengerRow('child', 'Child', this.passengerCounts.child)}
                        ${this.createPassengerRow('pca', 'PCA', this.passengerCounts.pca)}
                    </div>
                </div>
                
                <div class="passengers-modal-footer">
                    <button class="passengers-update-btn" id="passengers-update-btn">Update count</button>
                </div>
            </div>
        `;
        
        // Append to app container to keep modal within the UI
        const appContainer = document.getElementById('app');
        appContainer.appendChild(modal);
        this.modal = modal;
        
        // Add event listeners
        document.getElementById('passengers-close-btn').addEventListener('click', () => this.close());
        modal.querySelector('.passengers-modal-backdrop').addEventListener('click', () => this.close());
        document.getElementById('passengers-update-btn').addEventListener('click', () => this.confirm());
        
        // Add counter button listeners
        this.setupCounterListeners();
    }
    
    /**
     * Create a passenger type row HTML
     */
    createPassengerRow(type, label, count) {
        return `
            <div class="passenger-row" data-type="${type}">
                <span class="passenger-label">${label}</span>
                <div class="passenger-counter">
                    <button class="counter-btn minus" data-type="${type}" data-action="decrease">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M5 10H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                    <span class="counter-value ${count > 0 ? 'active' : ''}" id="count-${type}">${count}</span>
                    <button class="counter-btn plus" data-type="${type}" data-action="increase">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 5V15M5 10H15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    /**
     * Setup counter button listeners
     */
    setupCounterListeners() {
        this.modal.querySelectorAll('.counter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const type = btn.dataset.type;
                const action = btn.dataset.action;
                this.updateCount(type, action);
            });
        });
    }
    
    /**
     * Update passenger count
     */
    updateCount(type, action) {
        if (action === 'increase') {
            this.passengerCounts[type]++;
        } else if (action === 'decrease' && this.passengerCounts[type] > 0) {
            // Don't allow adult to go below 1
            if (type === 'adult' && this.passengerCounts[type] <= 1) {
                return;
            }
            this.passengerCounts[type]--;
        }
        
        // Update display
        const countEl = document.getElementById(`count-${type}`);
        if (countEl) {
            countEl.textContent = this.passengerCounts[type];
            countEl.classList.toggle('active', this.passengerCounts[type] > 0);
        }
    }
    
    /**
     * Get total passenger count
     */
    getTotalCount() {
        return this.passengerCounts.adult + this.passengerCounts.child + this.passengerCounts.pca;
    }
    
    /**
     * Confirm selection
     */
    async confirm() {
        const total = this.getTotalCount();
        
        if (total === 0) {
            console.warn('[PassengersModal] Cannot have 0 passengers');
            return;
        }
        
        console.log('[PassengersModal] Confirming selection:', this.passengerCounts, 'Total:', total);
        
        // Update booking context
        this.app.aiAgent.bookingContext.passengers = total;
        this.app.aiAgent.bookingContext.passengerTypes = { ...this.passengerCounts };
        
        // Update all passenger chips
        this.updatePassengerChips(total);
        
        // Close modal
        this.close();
        
        // Generate confirmation message
        const breakdown = this.getBreakdownText();
        const message = `Passengers updated to ${total} (${breakdown}).`;
        
        this.app.aiAgent.speak(message);
        
        // Trigger proposal regeneration if we have proposals (only if in PRESENTING_OPTIONS state)
        if (this.app.aiAgent.currentProposals && this.app.aiAgent.currentState === 'PRESENTING_OPTIONS') {
            const response = await this.app.aiAgent.handleParamModification('passengers', total);
            this.app.handleAIResponse(response);
        }
    }
    
    /**
     * Update all passenger chips displayed
     */
    updatePassengerChips(total) {
        // Update chips in message-chips containers
        const passengersChips = document.querySelectorAll('.message-chips .chip');
        passengersChips.forEach(chip => {
            const img = chip.querySelector('img[src*="passengers"]');
            if (img) {
                const label = chip.querySelector('span:not(.icon)');
                if (label) {
                    label.textContent = total;
                }
            }
        });
        
        // Update chip in active ride card (microtransit footer)
        const ridePassengersChip = document.getElementById('ride-passengers-chip');
        if (ridePassengersChip) {
            const label = ridePassengersChip.querySelector('span:not(.icon)');
            if (label) {
                label.textContent = total;
            }
        }
        
        // Update chip in trip details footer
        const tripPassengersChip = document.getElementById('trip-passengers-chip');
        if (tripPassengersChip) {
            const label = tripPassengersChip.querySelector('span:not(.icon)');
            if (label) {
                label.textContent = total;
            }
        }
    }
    
    /**
     * Get breakdown text for speech
     */
    getBreakdownText() {
        const parts = [];
        if (this.passengerCounts.adult > 0) {
            parts.push(`${this.passengerCounts.adult} adult${this.passengerCounts.adult > 1 ? 's' : ''}`);
        }
        if (this.passengerCounts.child > 0) {
            parts.push(`${this.passengerCounts.child} child${this.passengerCounts.child > 1 ? 'ren' : ''}`);
        }
        if (this.passengerCounts.pca > 0) {
            parts.push(`${this.passengerCounts.pca} PCA`);
        }
        return parts.join(', ');
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
